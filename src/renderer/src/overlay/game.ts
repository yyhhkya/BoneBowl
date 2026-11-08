import { Application, Container, Sprite, Text, type Ticker } from 'pixi.js'
import RAPIER from '@dimforge/rapier2d-compat'
import type { BoneSize, GiftEvent } from '../../../shared/types'
import { createBoneTexture, createBowlTextures } from './sprites'

const DESIGN_W = 1920
const DESIGN_H = 1080
const BOWL = { x: 960, y: 840 }
const MAX_BONES = 100

const SIZE_SCALE: Record<BoneSize, number> = {
  small: 0.76,
  medium: 1,
  large: 1.34
}

interface Bone {
  body: RAPIER.RigidBody
  sprite: Sprite
  shadow: Sprite
  born: number
}

interface PendingBone {
  at: number
  x: number
  size: BoneSize
}

interface FloatingLabel {
  view: Text
  age: number
  life: number
  baseY: number
}

function toWorld(lx: number, ly: number): { x: number; y: number } {
  return { x: BOWL.x + lx - 360, y: BOWL.y + ly - 190 }
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
  private labelLayer = new Container()
  private bones: Bone[] = []
  private pending: PendingBone[] = []
  private labels: FloatingLabel[] = []
  private accumulator = 0
  private scaleFactor = 1
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
    bowlBack.position.set(BOWL.x, BOWL.y)
    this.root.addChild(bowlBack)

    this.root.addChild(this.boneLayer)

    const bowlFront = new Sprite(bowlTextures.front)
    bowlFront.anchor.set(0.5)
    bowlFront.position.set(BOWL.x, BOWL.y)
    this.root.addChild(bowlFront)

    this.root.addChild(this.labelLayer)

    const cavityWorld = new Float32Array(COLLIDER_POINTS.length * 2)
    COLLIDER_POINTS.forEach(([lx, ly], index) => {
      const point = toWorld(lx, ly)
      cavityWorld[index * 2] = point.x
      cavityWorld[index * 2 + 1] = point.y
    })
    const bowlBody = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed())
    this.world.createCollider(RAPIER.ColliderDesc.polyline(cavityWorld).setFriction(0.8), bowlBody)

    this.boneTexture = boneTexture
    this.layout()
    this.app.ticker.add(this.tick)
  }

  private boneTexture!: import('pixi.js').Texture

  setOverlayScale(scale: number): void {
    this.scaleFactor = Math.min(1.8, Math.max(0.5, scale))
  }

  /** 0 表示一直保留，直到达到骨头数量上限 */
  setBoneLifetime(seconds: number): void {
    this.lifetimeMs = Math.max(0, seconds * 1000)
  }

  drop(event: GiftEvent): void {
    if (!this.world) return
    const now = performance.now()
    const label =
      event.uname && event.uname !== '观众'
        ? `${event.uname} 投喂 ${event.giftName}`
        : `投喂 ${event.giftName}`
    this.spawnLabel(label, event.size)
    for (let i = 0; i < event.bones; i += 1) {
      const x = BOWL.x + (Math.random() * 2 - 1) * 200
      this.pending.push({ at: now + i * 95, x, size: event.size })
    }
  }

  private spawnLabel(text: string, size: BoneSize): void {
    const view = new Text({
      text,
      style: {
        fontFamily: 'Geist Variable, Microsoft YaHei, sans-serif',
        fontSize: size === 'large' ? 32 : 27,
        fontWeight: '500',
        fill: '#fff7e6',
        stroke: { color: '#2c2418', width: 6 },
        dropShadow: { color: '#2c2418', alpha: 0.35, blur: 8, distance: 4, angle: Math.PI / 2 }
      }
    })
    view.anchor.set(0.5)
    const baseY = 470
    view.position.set(BOWL.x, baseY)
    this.labelLayer.addChild(view)
    this.labels.push({ view, age: 0, life: 1700, baseY })
  }

  private spawnBone(x: number, size: BoneSize, now: number): void {
    const scale = SIZE_SCALE[size] * this.scaleFactor
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
      if (next) this.spawnBone(next.x, next.size, now)
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

    for (let i = this.labels.length - 1; i >= 0; i -= 1) {
      const label = this.labels[i]
      label.age += ticker.deltaMS
      const progress = label.age / label.life
      if (progress >= 1) {
        this.labelLayer.removeChild(label.view)
        label.view.destroy()
        this.labels.splice(i, 1)
        continue
      }
      label.view.y = label.baseY - progress * 46
      label.view.alpha = progress < 0.12 ? progress / 0.12 : 1 - (progress - 0.12) / 0.88
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
