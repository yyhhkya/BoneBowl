import { Texture } from 'pixi.js'
import bowlFontUrl from '../assets/fonts/zhi-mang-xing.ttf?url'

/** 碗壁字：拉丁字形走 Ink Free，中文按字体回退落到志莽行书 */
const BOWL_FONT_STACK =
  '"Ink Free", "ZhiMangXing", "Comic Sans MS", "Arial Rounded MT Bold", "Segoe UI", sans-serif'

let bowlFontPromise: Promise<void> | null = null

/** 碗壁中文字体只在画字前加载一次，失败时静默回退到系统字体 */
export function ensureBowlFont(): Promise<void> {
  if (!bowlFontPromise) {
    bowlFontPromise = (async () => {
      try {
        const face = new FontFace('ZhiMangXing', `url(${bowlFontUrl})`)
        await face.load()
        document.fonts.add(face)
      } catch (error) {
        console.warn('[overlay] 碗壁字体加载失败，使用系统字体回退', error)
      }
    })()
  }
  return bowlFontPromise
}

function makeCanvas(width: number, height: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D 不可用')
  return { canvas, ctx }
}

/** 骨头精灵：用系统 🦴 字形绘制，转正并裁剪到内容边界 */
export function createBoneTexture(): Texture {
  const SIZE = 768
  const { canvas, ctx } = makeCanvas(SIZE, SIZE)
  ctx.font = '520px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  // Segoe UI Emoji 的骨形约倾斜 44.8°，转正后长轴水平
  ctx.translate(SIZE / 2, SIZE / 2)
  ctx.rotate((44.78 * Math.PI) / 180)
  ctx.fillText('🦴', 0, 0)

  const data = ctx.getImageData(0, 0, SIZE, SIZE).data
  let minX = SIZE
  let minY = SIZE
  let maxX = -1
  let maxY = -1
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] > 8) {
      const pixel = (i - 3) / 4
      const x = pixel % SIZE
      const y = (pixel / SIZE) | 0
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
  }
  if (maxX < 0) {
    // 系统没有 emoji 字形时退化为矢量骨形，避免叠加层直接报错
    const fallback = makeCanvas(240, 120)
    const g = fallback.ctx
    g.lineJoin = 'round'
    const bone = new Path2D()
    bone.roundRect(52, 38, 136, 44, 22)
    for (const [cx, cy] of [
      [52, 38],
      [52, 82],
      [188, 38],
      [188, 82]
    ]) {
      bone.moveTo(cx + 18, cy)
      bone.arc(cx, cy, 18, 0, Math.PI * 2)
    }
    g.strokeStyle = 'rgba(126, 112, 148, 0.65)'
    g.lineWidth = 4
    g.stroke(bone)
    const fill = g.createLinearGradient(0, 30, 0, 90)
    fill.addColorStop(0, '#faf8ff')
    fill.addColorStop(1, '#ded6ee')
    g.fillStyle = fill
    g.fill(bone)
    return Texture.from(fallback.canvas)
  }

  const width = maxX - minX + 1
  const height = maxY - minY + 1
  const out = makeCanvas(width, height)
  out.ctx.drawImage(canvas, minX, minY, width, height, 0, 0, width, height)
  return Texture.from(out.canvas)
}

export interface BowlTextures {
  back: Texture
  front: Texture
}

/** 碗纹理画布倍率：绘制坐标 × 该倍率 = 纹理像素，碰撞体换算设计坐标时也要算上 */
export const BOWL_PIXEL_RATIO = 2

/** 碗壁字标最大宽度（绘制坐标），超出的长文字按比例缩小字号；两端还要留出碗沿余量 */
const BOWL_TEXT_MAX_WIDTH = 420

function drawBowlLabel(f: CanvasRenderingContext2D, text: string): void {
  if (!text) return
  const baseSize = 130
  // 两套字体都只有常规字重，写 700 会让浏览器合成加粗、笔画变粗
  f.font = `400 ${baseSize}px ${BOWL_FONT_STACK}`
  const measured = f.measureText(text).width
  const size =
    measured > BOWL_TEXT_MAX_WIDTH
      ? Math.max(36, Math.floor((baseSize * BOWL_TEXT_MAX_WIDTH) / measured))
      : baseSize
  f.font = `400 ${size}px ${BOWL_FONT_STACK}`
  f.globalAlpha = 0.85
  f.fillStyle = '#5a4a26'
  f.textAlign = 'center'
  f.textBaseline = 'middle'
  f.save()
  f.translate(360, 230)
  f.rotate(-0.05)
  f.fillText(text, 0, 0)
  f.restore()
  f.globalAlpha = 1
}

/** 碗：剖视风格，主体与碗口分两层，中间夹骨头 */
export function createBowlTextures(bowlText = ''): BowlTextures {
  const width = 720
  const height = 380
  const pixelRatio = BOWL_PIXEL_RATIO

  const back = makeCanvas(width * pixelRatio, height * pixelRatio)
  const b = back.ctx
  b.scale(pixelRatio, pixelRatio)

  b.save()
  b.filter = 'blur(28px)'
  b.fillStyle = 'rgba(28, 20, 10, 0.26)'
  b.beginPath()
  b.ellipse(360, 348, 276, 20, 0, 0, Math.PI * 2)
  b.fill()
  b.restore()

  const bodyPath = new Path2D()
  bodyPath.moveTo(56, 78)
  bodyPath.bezierCurveTo(64, 286, 178, 356, 360, 356)
  bodyPath.bezierCurveTo(542, 356, 656, 286, 664, 78)
  bodyPath.closePath()
  const bodyGradient = b.createLinearGradient(0, 70, 0, 356)
  bodyGradient.addColorStop(0, '#fff6d8')
  bodyGradient.addColorStop(0.55, '#ffe7a6')
  bodyGradient.addColorStop(1, '#f0cd70')
  b.fillStyle = bodyGradient
  b.fill(bodyPath)
  b.strokeStyle = 'rgba(190, 150, 60, 0.85)'
  b.lineWidth = 3
  b.stroke(bodyPath)

  b.save()
  b.clip(bodyPath)
  const sideShade = b.createLinearGradient(56, 0, 664, 0)
  sideShade.addColorStop(0, 'rgba(190, 150, 60, 0.2)')
  sideShade.addColorStop(0.2, 'rgba(140, 100, 30, 0)')
  sideShade.addColorStop(0.78, 'rgba(140, 100, 30, 0)')
  sideShade.addColorStop(1, 'rgba(190, 150, 60, 0.22)')
  b.fillStyle = sideShade
  b.fillRect(40, 60, 640, 310)

  const gloss = b.createRadialGradient(270, 230, 8, 270, 230, 220)
  gloss.addColorStop(0, 'rgba(255, 252, 232, 0.42)')
  gloss.addColorStop(1, 'rgba(255, 252, 232, 0)')
  b.fillStyle = gloss
  b.fillRect(100, 100, 400, 260)
  b.restore()

  const cavityPath = new Path2D()
  cavityPath.moveTo(104, 88)
  cavityPath.bezierCurveTo(110, 258, 196, 322, 360, 322)
  cavityPath.bezierCurveTo(524, 322, 610, 258, 616, 88)
  cavityPath.closePath()
  const cavityGradient = b.createLinearGradient(0, 86, 0, 322)
  cavityGradient.addColorStop(0, '#e2bb62')
  cavityGradient.addColorStop(0.45, '#cfa345')
  cavityGradient.addColorStop(1, '#a97d28')
  b.fillStyle = cavityGradient
  b.fill(cavityPath)
  b.strokeStyle = 'rgba(140, 100, 30, 0.5)'
  b.lineWidth = 2
  b.stroke(cavityPath)

  b.save()
  b.clip(cavityPath)
  const innerShade = b.createLinearGradient(0, 86, 0, 200)
  innerShade.addColorStop(0, 'rgba(140, 100, 20, 0.15)')
  innerShade.addColorStop(1, 'rgba(90, 60, 10, 0)')
  b.fillStyle = innerShade
  b.fillRect(90, 80, 540, 140)
  b.restore()

  const rimGradient = b.createLinearGradient(56, 0, 664, 0)
  rimGradient.addColorStop(0, '#f6e3ae')
  rimGradient.addColorStop(0.28, '#fffbef')
  rimGradient.addColorStop(0.55, '#fbeec6')
  rimGradient.addColorStop(1, '#ecd189')
  b.strokeStyle = rimGradient
  b.lineWidth = 24
  b.beginPath()
  b.ellipse(360, 82, 304, 34, 0, 0, Math.PI * 2)
  b.stroke()

  b.strokeStyle = 'rgba(190, 150, 60, 0.7)'
  b.lineWidth = 3
  b.beginPath()
  b.ellipse(360, 82, 316, 40, 0, 0, Math.PI * 2)
  b.stroke()

  b.fillStyle = '#e5c871'
  b.beginPath()
  b.ellipse(360, 82, 256, 22, 0, 0, Math.PI * 2)
  b.fill()

  const front = makeCanvas(width * pixelRatio, height * pixelRatio)
  const f = front.ctx
  f.scale(pixelRatio, pixelRatio)

  // 整个碗前壁：挡住碗口以下的骨头，只留碗口和前缘可见
  const wall = new Path2D()
  wall.moveTo(56, 78)
  wall.bezierCurveTo(64, 286, 178, 356, 360, 356)
  wall.bezierCurveTo(542, 356, 656, 286, 664, 78)
  wall.ellipse(360, 82, 304, 34, 0, 0, Math.PI)
  wall.closePath()
  const wallGradient = f.createLinearGradient(0, 78, 0, 356)
  wallGradient.addColorStop(0, '#fff8de')
  wallGradient.addColorStop(0.55, '#ffe7a6')
  wallGradient.addColorStop(1, '#f0cd70')
  f.globalAlpha = 0.58
  f.fillStyle = wallGradient
  f.fill(wall)
  f.strokeStyle = 'rgba(190, 150, 60, 0.85)'
  f.lineWidth = 3
  f.stroke(wall)

  f.save()
  f.clip(wall)
  const wallSide = f.createLinearGradient(56, 0, 664, 0)
  wallSide.addColorStop(0, 'rgba(190, 150, 60, 0.22)')
  wallSide.addColorStop(0.2, 'rgba(140, 100, 30, 0)')
  wallSide.addColorStop(0.78, 'rgba(140, 100, 30, 0)')
  wallSide.addColorStop(1, 'rgba(140, 100, 30, 0.3)')
  f.fillStyle = wallSide
  f.fillRect(40, 60, 640, 310)
  f.restore()
  f.globalAlpha = 1

  // 碗壁字标
  drawBowlLabel(f, bowlText)

  f.lineCap = 'round'

  f.strokeStyle = 'rgba(150, 110, 30, 0.07)'
  f.lineWidth = 8
  f.beginPath()
  f.ellipse(360, 92, 258, 22, 0, -0.02, Math.PI + 0.02)
  f.stroke()

  // 前缘和背景碗沿用同一组颜色，圆头端点略微越界，避免半圈收尾处出现断色
  const frontRim = f.createLinearGradient(56, 0, 664, 0)
  frontRim.addColorStop(0, '#f6e3ae')
  frontRim.addColorStop(0.28, '#fffbef')
  frontRim.addColorStop(0.55, '#fbeec6')
  frontRim.addColorStop(1, '#ecd189')
  f.strokeStyle = frontRim
  f.lineWidth = 24
  f.beginPath()
  f.ellipse(360, 82, 304, 34, 0, -0.03, Math.PI + 0.03)
  f.stroke()

  f.strokeStyle = 'rgba(190, 150, 60, 0.5)'
  f.lineWidth = 3.5
  f.beginPath()
  f.ellipse(360, 95, 300, 32, 0, -0.02, Math.PI + 0.02)
  f.stroke()
  f.lineCap = 'butt'

  return { back: Texture.from(back.canvas), front: Texture.from(front.canvas) }
}
