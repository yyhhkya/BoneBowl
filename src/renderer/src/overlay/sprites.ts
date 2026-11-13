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
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('Canvas 2D 不可用')
  return { canvas, ctx }
}

/** 按不透明像素裁剪画布并转成贴图；整张全透明时返回 null */
function trimCanvas(canvas: HTMLCanvasElement): Texture | null {
  const w = canvas.width
  const h = canvas.height
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  const data = ctx.getImageData(0, 0, w, h).data
  let minX = w
  let minY = h
  let maxX = -1
  let maxY = -1
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] > 8) {
      const pixel = (i - 3) / 4
      const x = pixel % w
      const y = (pixel / w) | 0
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
  }
  if (maxX < 0) return null

  const width = maxX - minX + 1
  const height = maxY - minY + 1
  const out = makeCanvas(width, height)
  out.ctx.drawImage(canvas, minX, minY, width, height, 0, 0, width, height)
  return Texture.from(out.canvas)
}

/** 把 emoji 字形画成贴图，再按不透明像素裁剪到内容边界 */
function createEmojiTexture(emoji: string, rotateRad: number, fallback: () => Texture): Texture {
  const SIZE = 768
  const { canvas, ctx } = makeCanvas(SIZE, SIZE)
  ctx.font = '520px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.translate(SIZE / 2, SIZE / 2)
  if (rotateRad) ctx.rotate(rotateRad)
  ctx.fillText(emoji, 0, 0)
  return trimCanvas(canvas) ?? fallback()
}

/** 系统没有 emoji 字形时退化为矢量骨形，避免叠加层直接报错 */
function createFallbackBone(): Texture {
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

/** 骨头精灵：用系统 🦴 字形绘制，转正并裁剪到内容边界 */
export function createBoneTexture(): Texture {
  // Segoe UI Emoji 的骨形约倾斜 44.8°，转正后长轴水平
  return createEmojiTexture('🦴', (44.78 * Math.PI) / 180, createFallbackBone)
}

/** 无 emoji 字形时的备用粑粑：三层棕色椭圆堆叠 + 顶部尖 */
function createFallbackPoop(): Texture {
  const fallback = makeCanvas(240, 232)
  const g = fallback.ctx
  const body = g.createLinearGradient(0, 30, 0, 216)
  body.addColorStop(0, '#ab7440')
  body.addColorStop(0.55, '#8a5a2b')
  body.addColorStop(1, '#6b4423')
  g.fillStyle = body
  g.lineJoin = 'round'
  g.strokeStyle = 'rgba(80, 48, 18, 0.5)'
  g.lineWidth = 4
  for (const [cy, rx, ry] of [
    [180, 100, 38],
    [140, 82, 32],
    [104, 58, 27]
  ]) {
    g.beginPath()
    g.ellipse(120, cy, rx, ry, 0, 0, Math.PI * 2)
    g.fill()
    g.stroke()
  }
  g.beginPath()
  g.moveTo(120, 108)
  g.bezierCurveTo(100, 84, 96, 54, 120, 32)
  g.bezierCurveTo(144, 54, 140, 84, 120, 108)
  g.closePath()
  g.fill()
  g.stroke()
  return Texture.from(fallback.canvas)
}

/**
 * 抹掉 💩 字形的表情：按眼白和品红找两颗眼睛与嘴的包围盒，
 * 用包围盒上下边缘的颜色纵向填充，再对补丁区域做高斯平滑。
 * 返回 false 表示没找到眼睛（系统缺 emoji 字形）。
 */
function erasePoopFace(canvas: HTMLCanvasElement): boolean {
  const ctx = canvas.getContext('2d')
  if (!ctx) return false
  const width = canvas.width
  const height = canvas.height
  const img = ctx.getImageData(0, 0, width, height)
  const d = img.data
  const total = width * height

  const white = new Uint8Array(total)
  const mouthPx = new Uint8Array(total)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const p = y * width + x
      const i = p * 4
      if (d[i + 3] < 200) continue
      const r = d[i]
      const g = d[i + 1]
      const b = d[i + 2]
      if (Math.min(r, g, b) > 185) white[p] = 1
      if (g < 48 && r > 110 && b > 85) mouthPx[p] = 1
    }
  }

  const PAD = 9
  const FEATHER = 10
  const rects: [number, number, number, number][] = []
  const seen = new Uint8Array(total)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const start = y * width + x
      if (!white[start] || seen[start]) continue
      const stack = [start]
      seen[start] = 1
      let minX = x
      let maxX = x
      let minY = y
      let maxY = y
      let area = 0
      while (stack.length) {
        const p = stack.pop() as number
        area += 1
        const px = p % width
        const py = (p / width) | 0
        if (px < minX) minX = px
        if (px > maxX) maxX = px
        if (py < minY) minY = py
        if (py > maxY) maxY = py
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1]
        ]) {
          const nx = px + dx
          const ny = py + dy
          if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue
          const q = ny * width + nx
          if (white[q] && !seen[q]) {
            seen[q] = 1
            stack.push(q)
          }
        }
      }
      if (area > 60) rects.push([minX - PAD, minY - PAD, maxX + PAD, maxY + PAD])
    }
  }

  let mMinX = width
  let mMinY = height
  let mMaxX = -1
  let mMaxY = -1
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!mouthPx[y * width + x]) continue
      if (x < mMinX) mMinX = x
      if (x > mMaxX) mMaxX = x
      if (y < mMinY) mMinY = y
      if (y > mMaxY) mMaxY = y
    }
  }
  if (mMaxX >= 0) rects.push([mMinX - PAD, mMinY - PAD, mMaxX + PAD, mMaxY + PAD])
  if (rects.length < 2) return false

  const mask = new Uint8Array(total)
  for (const [x0, y0, x1, y1] of rects) {
    for (let x = Math.max(0, x0 - FEATHER); x <= Math.min(width - 1, x1 + FEATHER); x += 1) {
      const iTop = (Math.max(0, y0 - PAD) * width + x) * 4
      const iBottom = (Math.min(height - 1, y1 + PAD) * width + x) * 4
      for (let y = Math.max(0, y0 - FEATHER); y <= Math.min(height - 1, y1 + FEATHER); y += 1) {
        const dist = Math.max(Math.max(x0 - x, 0, x - x1), Math.max(y0 - y, 0, y - y1))
        if (dist > FEATHER) continue
        const wgt = Math.min(1, ((FEATHER - dist) / FEATHER) * 1.5)
        const t = Math.min(1, Math.max(0, (y - y0) / Math.max(1, y1 - y0)))
        const i = (y * width + x) * 4
        mask[y * width + x] = Math.max(mask[y * width + x], Math.round(wgt * 255))
        for (let k = 0; k < 3; k += 1) {
          const fill = d[iTop + k] * (1 - t) + d[iBottom + k] * t
          d[i + k] = Math.round(d[i + k] * (1 - wgt) + fill * wgt)
        }
      }
    }
  }

  // 补丁区域高斯平滑，抹平矩形接缝
  for (let round = 0; round < 8; round += 1) {
    const prev = new Uint8ClampedArray(d)
    for (let y = 1; y < height - 1; y += 1) {
      for (let x = 1; x < width - 1; x += 1) {
        const m = mask[y * width + x]
        if (!m) continue
        const wgt = m / 255
        let r = 0
        let g = 0
        let b = 0
        for (let dy = -2; dy <= 2; dy += 1) {
          for (let dx = -2; dx <= 2; dx += 1) {
            const i = ((y + dy) * width + (x + dx)) * 4
            r += prev[i]
            g += prev[i + 1]
            b += prev[i + 2]
          }
        }
        const i = (y * width + x) * 4
        d[i] = Math.round(d[i] * (1 - wgt) + (r / 25) * wgt)
        d[i + 1] = Math.round(d[i + 1] * (1 - wgt) + (g / 25) * wgt)
        d[i + 2] = Math.round(d[i + 2] * (1 - wgt) + (b / 25) * wgt)
      }
    }
  }

  ctx.putImageData(img, 0, 0)
  return true
}

/** 粑粑精灵：用系统 💩 字形绘制，再抹掉眼睛和嘴 */
export function createPoopTexture(): Texture {
  const SIZE = 768
  const { canvas, ctx } = makeCanvas(SIZE, SIZE)
  ctx.font = '520px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('💩', SIZE / 2, SIZE / 2)
  return (erasePoopFace(canvas) ? trimCanvas(canvas) : null) ?? createFallbackPoop()
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
