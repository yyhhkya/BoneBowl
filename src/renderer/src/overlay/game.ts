import { Application, Container, Sprite, type Ticker } from 'pixi.js'
import RAPIER from '@dimforge/rapier2d-compat'
import type { GiftEvent } from '../../../shared/types'
import { createBoneTexture, createBowlTextures, BOWL_PIXEL_RATIO } from './sprites'

const DESIGN_W = 1920
const DESIGN_H = 1080
const BOWL = { x: 960, y: 840 }
/** 碗宽固定为画布宽度的 1/4 */
const BOWL_DESIGN_WIDTH = DESIGN_W / 4
/** 碗沿外径（绘制坐标）：椭圆半径 316 加 24px 描边的一半 */
const BOWL_RIM_DRAW_WIDTH = 656
/** 绘制坐标 → 设计坐标；贴图按 BOWL_PIXEL_RATIO 倍绘制，碰撞体必须用这个比例 */
const BOWL_WORLD_SCALE = BOWL_DESIGN_WIDTH / BOWL_RIM_DRAW_WIDTH
/** 精灵缩放：纹理像素 → 设计坐标 */
const BOWL_SPRITE_SCALE = BOWL_WORLD_SCALE / BOWL_PIXEL_RATIO
const BOWL_LOCAL_CENTER = { x: 360, y: 190 }
/** 画面底部的地面，接住溢出碗外的骨头，不让它们直接掉出画面 */
const GROUND_Y = DESIGN_H - 40
const MAX_BONES = 100

interface Bone {
  body: RAPIER.RigidBody
  sprite: Sprite
  shadow: Sprite
  born: number
}

interface PendingBone {
  at: number
  x: number
  scale: number
}

function toWorld(lx: number, ly: number): { x: number; y: number } {
  return {
    x: BOWL.x + (lx - BOWL_LOCAL_CENTER.x) * BOWL_WORLD_SCALE,
    y: BOWL.y + (ly - BOWL_LOCAL_CENTER.y) * BOWL_WORLD_SCALE
  }
}

const CAVITY_POINTS: [number, number][] = [
  [104, 88],
  [112, 190],
  [140, 265],
  [200, 312],
  [290, 330],
  [430, 330],
  [520, 312],
  [580, 265],
  [608, 190],
  [616, 88]
]

/** 碗的完整截面：外壁 + 碗口 + 内壁，闭合碰撞环，骨头撞到碗沿、外壁都有效 */
const OUTER_PATH: [number, number][] = [
  [56, 78],
  [70, 200],
  [120, 290],
  [210, 338],
  [300, 354],
  [360, 356],
  [420, 354],
  [510, 338],
  [600, 290],
  [650, 200],
  [664, 78]
]

const COLLIDER_POINTS: [number, number][] = [
  ...OUTER_PATH,
  ...CAVITY_POINTS.slice().reverse(),
  OUTER_PATH[0]
]

export class BoneScene {
  private app = new Application()
  private world!: RAPIER.World
  private root = new Container()
  private boneLayer = new Container()
  private bones: Bone[] = []
  private pending: PendingBone[] = []
  private accumulator = 0
  private lifetimeMs = 0
  private lastWidth = 0
  private lastHeight = 0
  private disposed = false

  async init(container: HTMLElement): Promise<void> {
    await this.app.init({
      resizeTo: window,
      backgroundAlpha: 0,
      antialias: true,
      resolution: Math.min(2, window.devicePixelRatio || 1),
      autoDensity: true
    })
    if (this.disposed) {
      this.app.destroy(true, { children: true, texture: true })
      return
    }
    container.appendChild(this.app.canvas)

    await RAPIER.init()
    this.world = new RAPIER.World({ x: 0, y: 1500 })
    this.world.timestep = 1 / 60

    this.app.stage.addChild(this.root)

    const bowlTextures = createBowlTextures()
    const boneTexture = createBoneTexture()

    const bowlBack = new Sprite(bowlTextures.back)
    bowlBack.anchor.set(0.5)
    bowlBack.scale.set(BOWL_SPRITE_SCALE)
    bowlBack.position.set(BOWL.x, BOWL.y)
    this.root.addChild(bowlBack)

    this.root.addChild(this.boneLayer)

    const bowlFront = new Sprite(bowlTextures.front)
    bowlFront.anchor.set(0.5)
    bowlFront.scale.set(BOWL_SPRITE_SCALE)
    bowlFront.position.set(BOWL.x, BOWL.y)
    this.root.addChild(bowlFront)

    const cavityWorld = new Float32Array(COLLIDER_POINTS.length * 2)
    COLLIDER_POINTS.forEach(([lx, ly], index) => {
      const point = toWorld(lx, ly)
      cavityWorld[index * 2] = point.x
      cavityWorld[index * 2 + 1] = point.y
    })
    const bowlBody = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed())
    this.world.createCollider(RAPIER.ColliderDesc.polyline(cavityWorld).setFriction(0.8), bowlBody)

    const groundBody = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed())
    this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(DESIGN_W, 24)
        .setTranslation(DESIGN_W / 2, GROUND_Y + 24)
        .setFriction(0.9),
      groundBody
    )

    this.boneTexture = boneTexture
    this.layout()
    this.app.ticker.add(this.tick)
  }

  private boneTexture!: import('pixi.js').Texture

  /** 0 表示一直保留，直到达到骨头数量上限 */
  setBoneLifetime(seconds: number): void {
    this.lifetimeMs = Math.max(0, seconds * 1000)
  }

  drop(event: GiftEvent): void {
    if (!this.world) return
    const now = performance.now()
    const scale = Math.min(5, Math.max(0.5, event.scale || 1))
    for (let i = 0; i < event.bones; i += 1) {
      const x = BOWL.x + (Math.random() * 2 - 1) * 200 * BOWL_WORLD_SCALE
      this.pending.push({ at: now + i * 95, x, scale })
    }
  }

  private spawnBone(x: number, scale: number, now: number): void {
    const radius = 23 * scale
    const halfHeight = 42 * scale

    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(x, 80)
        .setLinvel((Math.random() * 2 - 1) * 150, 0)
        .setAngvel((Math.random() * 2 - 1) * 4)
        .setCcdEnabled(true)
    )
    this.world.createCollider(
      RAPIER.ColliderDesc.capsule(halfHeight, radius).setFriction(0.5).setRestitution(0.12).setDensity(0.9),
      body
    )

    const sprite = new Sprite(this.boneTexture)
    sprite.anchor.set(0.5)
    const visibleLength = (halfHeight + radius) * 2
    sprite.scale.set(visibleLength / this.boneTexture.width)
    sprite.position.set(x, 80)
    sprite.rotation = Math.random() * Math.PI

    const shadow = new Sprite(this.boneTexture)
    shadow.anchor.set(0.5)
    shadow.scale.copyFrom(sprite.scale)
    shadow.tint = 0x2a2118
    shadow.alpha = 0.14
    shadow.position.set(x + 5, 88)
    shadow.rotation = sprite.rotation

    this.boneLayer.addChild(shadow)
    this.boneLayer.addChild(sprite)
    this.bones.push({ body, sprite, shadow, born: now })

    if (this.bones.length > MAX_BONES) {
      this.removeBoneAt(0)
    }
    void now
  }

  private removeBoneAt(index: number): void {
    const bone = this.bones[index]
    if (!bone) return
    this.boneLayer.removeChild(bone.shadow, bone.sprite)
    bone.shadow.destroy()
    bone.sprite.destroy()
    this.world.removeRigidBody(bone.body)
    this.bones.splice(index, 1)
  }

  private tick = (ticker: Ticker): void => {
    if (!this.world) return
    const now = performance.now()
    const dt = Math.min(0.05, ticker.deltaMS / 1000)

    while (this.pending.length > 0 && this.pending[0].at <= now) {
      const next = this.pending.shift()
      if (next) this.spawnBone(next.x, next.scale, now)
    }

    this.accumulator += dt
    let steps = 0
    while (this.accumulator >= 1 / 60 && steps < 3) {
      this.world.step()
      this.accumulator -= 1 / 60
      steps += 1
    }

    for (let i = this.bones.length - 1; i >= 0; i -= 1) {
      const bone = this.bones[i]
      const position = bone.body.translation()
      const rotation = bone.body.rotation()

      if (this.lifetimeMs > 0) {
        const remaining = this.lifetimeMs - (now - bone.born)
        if (remaining <= 0) {
          this.removeBoneAt(i)
          continue
        }
        const fade = Math.min(1, remaining / 600)
        bone.sprite.alpha = fade
        bone.shadow.alpha = 0.14 * fade
      } else {
        if (bone.sprite.alpha !== 1) bone.sprite.alpha = 1
        if (bone.shadow.alpha !== 0.14) bone.shadow.alpha = 0.14
      }

      if (position.y > DESIGN_H + 260 || Math.abs(position.x) > DESIGN_W * 1.4) {
        this.removeBoneAt(i)
        continue
      }

      bone.sprite.position.set(position.x, position.y)
      bone.sprite.rotation = rotation + Math.PI / 2
      bone.shadow.position.set(position.x + 5, position.y + 7)
      bone.shadow.rotation = bone.sprite.rotation
    }

    this.layout()
  }

  private layout(): void {
    const width = this.app.screen.width
    const height = this.app.screen.height
    if (width === this.lastWidth && height === this.lastHeight) return
    this.lastWidth = width
    this.lastHeight = height
    const scale = Math.min(width / DESIGN_W, height / DESIGN_H)
    this.root.scale.set(scale)
    this.root.position.set((width - DESIGN_W * scale) / 2, (height - DESIGN_H * scale) / 2)
  }

  getBoneCount(): number {
    return this.bones.length
  }

  destroy(): void {
    if (this.disposed) {
      // init() 可能仍在等待，真实销毁交给它结束后的分支
      try {
        this.app.ticker?.remove(this.tick)
      } catch {
        // 尚未初始化
      }
      return
    }
    this.disposed = true
    try {
      this.app.ticker?.remove(this.tick)
    } catch {
      // 尚未初始化
    }
    try {
      if (this.world) this.world.free()
    } catch {
      // 尚未初始化
    }
    try {
      this.app.destroy(true, { children: true, texture: true })
    } catch {
      // 尚未初始化
    }
  }
}
