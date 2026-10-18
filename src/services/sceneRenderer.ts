// ============================================================================
// 场景渲染：预览与导出共用的同一套纯函数渲染逻辑（drawScene）
// - drawScene 为同步函数，只使用已缓存的图片；缺图时跳过该层
// - 调用前用 preloadImages(collectImageUrls(...)) 预热，保证图片就位
// ============================================================================
import { DEFAULT_SUBTITLE_STYLE, TRACK_RENDER_ORDER } from '@shared/types'
import type { Material, MotionTemplateId, SubtitleStyle, Track } from '@shared/types'

// ---------------------------------------------------------------------------
// 演出模板：程序化动效
// ---------------------------------------------------------------------------
export function getMotionOffset(
  motion: MotionTemplateId | undefined,
  progress: number,
  duration: number,
  canvasW: number,
): { x: number; y: number; scale: number; opacity: number; rotation: number } {
  const p = Math.min(1, Math.max(0, progress))
  switch (motion) {
    case 'zoom':
      return { x: 0, y: 0, scale: 1 + p * 0.15, opacity: 1, rotation: 0 }
    case 'slideL':
      return { x: (1 - p) * -canvasW * 0.3, y: 0, scale: 1, opacity: p, rotation: 0 }
    case 'slideR':
      return { x: (1 - p) * canvasW * 0.3, y: 0, scale: 1, opacity: p, rotation: 0 }
    case 'shake':
      return {
        x: Math.sin(p * Math.PI * 20) * 8 * (1 - p),
        y: Math.cos(p * Math.PI * 16) * 6 * (1 - p),
        scale: 1,
        opacity: 1,
        rotation: Math.sin(p * Math.PI * 18) * 2 * (1 - p),
      }
    case 'sway':
      return {
        x: Math.sin(p * Math.PI * 2) * 10,
        y: 0,
        scale: 1,
        opacity: 1,
        rotation: Math.sin(p * Math.PI * 2) * 3,
      }
    case 'bounce':
      return {
        x: 0,
        y: -Math.abs(Math.sin(p * Math.PI * 4)) * 30 * (1 - p),
        scale: 1,
        opacity: 1,
        rotation: 0,
      }
    case 'title':
      return { x: 0, y: (1 - p) * 40, scale: 1, opacity: p, rotation: 0 }
    case 'blackout':
      return { x: 0, y: 0, scale: 1, opacity: 1 - p, rotation: 0 }
    case 'idle':
    default: {
      const breath = Math.sin(p * Math.PI * 2 * (duration / 3.2)) * 4
      return { x: 0, y: breath, scale: 1, opacity: 1, rotation: 0 }
    }
  }
}

// ---------------------------------------------------------------------------
// 图片缓存
// ---------------------------------------------------------------------------
const imgCache = new Map<string, HTMLImageElement | 'loading' | 'error'>()

export function getCachedImage(url: string): HTMLImageElement | null {
  const v = imgCache.get(url)
  return v instanceof HTMLImageElement ? v : null
}

export function loadImage(url: string): Promise<HTMLImageElement | null> {
  const cached = imgCache.get(url)
  if (cached === 'loading') return Promise.resolve(null)
  if (cached === 'error') return Promise.resolve(null)
  if (cached) return Promise.resolve(cached)
  imgCache.set(url, 'loading')
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      imgCache.set(url, img)
      resolve(img)
    }
    img.onerror = () => {
      imgCache.set(url, 'error')
      resolve(null)
    }
    img.src = url
  })
}

/** 收集轨道上所有视觉素材的图片 URL */
export function collectImageUrls(
  tracks: Track[],
  materials: Material[],
  assetUrl: (p: string) => string,
): string[] {
  const urls = new Set<string>()
  for (const track of tracks) {
    if (track.type === 'voice' || track.type === 'sfx') continue
    for (const clip of track.clips) {
      if (!clip.materialId) continue
      const mat = materials.find((m) => m.id === clip.materialId)
      if (mat) urls.add(assetUrl(mat.file_path))
    }
  }
  return [...urls]
}

/** 预热全部图片；全部就绪或失败后 resolve */
export async function preloadImages(urls: string[]): Promise<void> {
  await Promise.all(urls.map((u) => loadImage(u)))
}

// ---------------------------------------------------------------------------
// 纹理绘制参数（各层的位置/缩放，预览与导出一致）
// ---------------------------------------------------------------------------
interface LayerGeom {
  baseY: number
  scaleMul: number
}

function layerGeom(trackType: Track['type']): LayerGeom {
  switch (trackType) {
    case 'expression':
      return { baseY: 120, scaleMul: 0.9 }
    case 'effect':
      return { baseY: 100, scaleMul: 0.7 }
    case 'character':
    default:
      return { baseY: 100, scaleMul: 1 }
  }
}

export interface DrawOptions {
  ctx: CanvasRenderingContext2D
  tracks: Track[]
  materials: Material[]
  currentTime: number
  width: number
  height: number
  assetUrl: (p: string) => string
  subtitleStyle?: SubtitleStyle
}

/** 渲染某一时刻的画面（同步；图片需已预热） */
export function drawScene(opts: DrawOptions): void {
  const { ctx, tracks, materials, currentTime, width: w, height: h, assetUrl, subtitleStyle } = opts
  ctx.clearRect(0, 0, w, h)
  ctx.fillStyle = '#111'
  ctx.fillRect(0, 0, w, h)

  // 收集当前激活的 clips，按渲染顺序排序
  const active: Array<{ clip: Track['clips'][number]; track: Track }> = []
  for (const track of tracks) {
    for (const clip of track.clips) {
      if (currentTime >= clip.start && currentTime < clip.start + clip.duration) {
        active.push({ clip, track })
      }
    }
  }
  active.sort((a, b) => TRACK_RENDER_ORDER[a.track.type] - TRACK_RENDER_ORDER[b.track.type])

  for (const { clip, track } of active) {
    if (!clip.materialId) continue
    const mat = materials.find((m) => m.id === clip.materialId)
    if (!mat) continue
    const img = getCachedImage(assetUrl(mat.file_path))
    if (!img) continue

    const progress = (currentTime - clip.start) / clip.duration
    const offset = getMotionOffset(clip.motion, progress, clip.duration, w)

    ctx.save()
    ctx.globalAlpha = offset.opacity

    if (track.type === 'scene') {
      // 场景层：缩放 / 旋转 / 透明度生效，但不做平移
      // （场景是满屏底图，平移会露出空白边缘，所以忽略 offset.x / offset.y）
      if (offset.scale !== 1 || offset.rotation !== 0) {
        const sw = w * offset.scale
        const sh = h * offset.scale
        ctx.translate(w / 2, h / 2)
        ctx.rotate((offset.rotation * Math.PI) / 180)
        ctx.drawImage(img, -sw / 2, -sh / 2, sw, sh)
      } else {
        ctx.drawImage(img, 0, 0, w, h)
      }
    } else {
      const { baseY, scaleMul } = layerGeom(track.type)
      const scale = Math.min((w * 0.55) / img.width, (h * 0.5) / img.height) * scaleMul * offset.scale
      const iw = img.width * scale
      const ih = img.height * scale
      const x = (w - iw) / 2 + offset.x
      const y = h - ih - baseY + offset.y
      ctx.translate(x + iw / 2, y + ih / 2)
      ctx.rotate((offset.rotation * Math.PI) / 180)
      ctx.drawImage(img, -iw / 2, -ih / 2, iw, ih)
    }

    ctx.restore()
  }

  // 字幕：显示当前激活的 voice clip 的 text
  const voiceClip = active.find((a) => a.track.type === 'voice' && a.clip.text)
  if (voiceClip?.clip.text) {
    drawSubtitle(ctx, voiceClip.clip.text, w, h, subtitleStyle)
  }
}

/** 底部/中部/顶部字幕（白字黑描边 + 可选半透明底条），样式由 SubtitleStyle 控制 */
export function drawSubtitle(
  ctx: CanvasRenderingContext2D,
  text: string,
  w: number,
  h: number,
  style: SubtitleStyle = DEFAULT_SUBTITLE_STYLE,
): void {
  const scale = w / 1080 // 以 1080 宽为基准，保证不同分辨率下观感一致
  const fontSize = Math.max(10, Math.round(w * style.fontScale))
  const padding = Math.round(fontSize * 0.3)
  const stroke = Math.max(0, style.strokeWidth) * scale

  let textY: number
  if (style.position === 'top') textY = Math.round(h * 0.12)
  else if (style.position === 'center') textY = Math.round(h * 0.5)
  else textY = h - Math.round(h * 0.08)

  ctx.font = `bold ${fontSize}px "Microsoft YaHei", sans-serif`
  ctx.textAlign = 'center'

  if (style.background) {
    const textW = ctx.measureText(text).width + padding * 2
    const textH = fontSize + padding * 2
    ctx.fillStyle = 'rgba(0,0,0,0.6)'
    ctx.beginPath()
    ctx.roundRect((w - textW) / 2, textY - textH / 2, textW, textH, 8)
    ctx.fill()
  }

  if (stroke > 0) {
    ctx.strokeStyle = '#000'
    ctx.lineWidth = stroke
    ctx.strokeText(text, w / 2, textY + fontSize / 3)
  }
  ctx.fillStyle = style.textColor
  ctx.fillText(text, w / 2, textY + fontSize / 3)
}
