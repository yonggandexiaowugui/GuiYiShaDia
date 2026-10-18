// ============================================================================
// 场景渲染：预览与导出共用的同一套纯函数渲染逻辑（drawScene）
// - drawScene 为同步函数，只使用已缓存的图片；缺图时跳过该层
// - 调用前用 preloadImages(collectImageUrls(...)) 预热，保证图片就位
// - 绑骨角色（素材 meta.rigged）走骨骼渲染分支，整图素材路径保持不变
// ============================================================================
import { DEFAULT_SUBTITLE_STYLE, TRACK_RENDER_ORDER } from '@shared/types'
import type { Material, MotionTemplateId, SubtitleStyle, Track } from '@shared/types'
import { BUILTIN_CLIPS, BUILTIN_RIG, getAnimClip } from '@shared/rig'
import { expressionForEmotion, parseRiggedMeta, resolveCharacterRig } from '@shared/characterRig'
import type { CharacterRig } from '@shared/characterRig'
import { buildWorldPose, samplePose } from './rigEvaluator'
import { partUrl, rigPartFiles, rigPartUrls, RIG_DRAW_ORDER } from './rigParts'

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

/** 收集轨道上所有视觉素材的图片 URL（绑骨角色收集其全部部件图） */
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
      if (!mat) continue
      if (track.type === 'character') {
        const rigged = parseRiggedMeta(mat.meta)
        const charRig = rigged ? resolveCharacterRig(rigged) : undefined
        if (charRig) {
          for (const u of rigPartUrls(charRig, assetUrl)) urls.add(u)
          continue
        }
      }
      urls.add(assetUrl(mat.file_path))
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

/**
 * 绑骨角色渲染：求值骨骼姿态 → 部件按 pivot 对齐绘制 → 表情贴图叠 head 局部空间
 * 与整图路径共用 layerGeom / motion 模板；返回 false 表示部件图未就绪（调用方回退整图）
 */
function drawRiggedCharacter(
  ctx: CanvasRenderingContext2D,
  charRig: CharacterRig,
  clip: Track['clips'][number],
  currentTime: number,
  w: number,
  h: number,
  assetUrl: (p: string) => string,
): boolean {
  // 全部部件图必须已在缓存（预热阶段保证）；任一缺失则回退整图缩略图
  const partImgs = new Map<string, HTMLImageElement>()
  for (const f of rigPartFiles(charRig)) {
    const img = getCachedImage(partUrl(f, assetUrl))
    if (!img) return false
    partImgs.set(f, img)
  }

  const anim = getAnimClip(BUILTIN_CLIPS, clip.rigClipId ?? 'idle')
  if (!anim) return false
  // 骨骼时间：片段内相对时间；循环动作按源时长取模，非循环动作定格在结束姿态
  const sampled = samplePose(BUILTIN_RIG, anim, currentTime - clip.start)
  const world = buildWorldPose(BUILTIN_RIG, sampled)

  const progress = (currentTime - clip.start) / clip.duration
  const offset = getMotionOffset(clip.motion, progress, clip.duration, w)
  const { baseY, scaleMul } = layerGeom('character')
  // 角色空间（rig.height 单位高）→ 画布：与整图角色同档位（半屏高）
  const rigScale = ((h * 0.5) / BUILTIN_RIG.height) * scaleMul * offset.scale

  ctx.save()
  ctx.globalAlpha = offset.opacity
  // 锚点 = 角色脚底中心，与整图角色的"底部居中"对齐
  ctx.translate(w / 2 + offset.x, h - baseY + offset.y)
  ctx.rotate((offset.rotation * Math.PI) / 180)
  ctx.scale(rigScale, rigScale)

  for (const boneId of RIG_DRAW_ORDER) {
    const part = charRig.parts.find((p) => p.boneId === boneId)
    if (!part) continue
    const wb = world.get(boneId)
    const img = partImgs.get(part.image)
    if (!wb || !img) continue
    ctx.save()
    ctx.translate(wb.x, wb.y)
    ctx.rotate((wb.angle * Math.PI) / 180)
    ctx.drawImage(
      img,
      -part.pivotX * part.width,
      -part.pivotY * part.height,
      part.width,
      part.height,
    )
    ctx.restore()
  }

  // 表情贴图：随 head 骨变换，由片段情绪驱动；脸不挂骨永不拉伸
  const hw = world.get('head')
  const exprImg = partImgs.get(expressionForEmotion(charRig, clip.emotion))
  if (hw && exprImg) {
    const f = charRig.face
    ctx.save()
    ctx.translate(hw.x, hw.y)
    ctx.rotate((hw.angle * Math.PI) / 180)
    ctx.drawImage(
      exprImg,
      f.offsetX - f.width / 2,
      f.offsetY - f.height / 2,
      f.width,
      f.height,
    )
    ctx.restore()
  }

  ctx.restore()
  return true
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

    // 绑骨角色：骨骼渲染分支（部件图就绪时直接接管，否则回退整图缩略图）
    if (track.type === 'character') {
      const rigged = parseRiggedMeta(mat.meta)
      const charRig = rigged ? resolveCharacterRig(rigged) : undefined
      if (charRig && drawRiggedCharacter(ctx, charRig, clip, currentTime, w, h, assetUrl)) continue
    }

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

  // 字幕：取第一条激活的配音片段；字幕文本独立于配音台词（未设置则跟随，空串则不显示）
  const voiceClip = active.find((a) => a.track.type === 'voice')
  if (voiceClip) {
    const text = voiceClip.clip.subtitle ?? voiceClip.clip.text ?? ''
    if (text.trim()) drawSubtitle(ctx, text, w, h, subtitleStyle)
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
