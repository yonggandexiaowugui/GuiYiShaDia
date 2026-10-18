// ============================================================================
// AI 绑骨角色生成（P4）：用户输入角色名 + 风格描述 → 逐部件 AI 生成 → 入库
// 管线：11 个部件（左右共用图）同 seed 逐张生成 → 白底边缘泛洪抠图 → trim
//      → 拉伸进 manifest 固定画布（3px/单位，含 3 单位出血边）→ 落盘 → 入库
// 硬约束：
// - AI 永不自动绑骨/标 pivot：几何完全复用 BUILTIN_RIGGED_CHARACTER 的 manifest
// - 抠图用「边缘泛洪」（白底平面卡通），不用 @imgly 显著性模型（会误判主体）
// - 表情贴图复用内置 expr-*.png（bundled 文件名，渲染侧 glob 可解析）
// ============================================================================
import crypto from 'node:crypto'
import path from 'node:path'
import fs from 'node:fs'
import sharp from 'sharp'
import { addMaterial, resolveAsset } from './database'
import { generateThumbnail } from './media'
import { generateBytes, getImageGenConfig } from './imagegen'
import { log } from './log'
import { BUILTIN_RIGGED_CHARACTER, RIG_PART_LABELS, RIG_PART_ORDER } from '../shared/characterRig'
import type { CharacterRig } from '../shared/characterRig'
import type { ImageGenResult, RigCharacterProgress } from '../shared/types'

/** 生成尺寸：最高部件画布 354×738（后发 118×246 单位），512 源拉伸可接受（平涂卡通） */
const GEN_SIZE = 512
/** 出血边：3 角色单位 × 3px */
const BLEED = 9

/**
 * 部件单体描述：「2D 木偶部件」框架（经三轮实测，此措辞在免费档上出图最平、描边最稳）。
 * 头要求空白脸（五官由表情贴图叠加；AI 若不听话还有 blankFace 几何擦除兜底）。
 */
const PART_PROMPTS: Record<string, string> = {
  'head.png':
    '2D puppet part: one blank cartoon head only, rounded egg shape, completely empty face, no eyes, no eyebrows, no nose, no mouth, no facial features at all',
  'back-hair.png':
    '2D puppet part: one long straight ponytail hairstyle seen from behind only, rounded hair cap on top with a single long flowing ponytail hanging down, no face, no skin, no head, no body, not a full character',
  'front-hair.png':
    '2D puppet part: one cartoon bangs fringe hair piece only, wide flat shape with center parting, one small gold tassel hair ornament on the side, no face, no head, no body, not a full character',
  'torso.png':
    '2D puppet part: one cartoon torso clothing piece only (chest and belly), rounded rectangle shape, no head, no face, no arms, no hands, no legs, not a full character',
  'hip.png':
    '2D puppet part: one cartoon pelvis shorts piece only, rounded shape, no legs, no torso, no head, not a full character',
  'neck.png':
    '2D puppet part: one short cartoon neck only, small vertical rounded cylinder, no head, no body',
  'upper-arm.png':
    '2D puppet part: one single upper arm sleeve segment only, vertical capsule with rounded ends, no hand, no shoulder, no body, not a full character',
  'forearm.png':
    '2D puppet part: one single forearm segment only, vertical capsule with rounded ends, no hand, no body, not a full character',
  'hand.png':
    '2D puppet part: one single chubby mitten hand only, fingers together, vertical orientation, no arm, no body',
  'thigh.png':
    '2D puppet part: one single thigh pants segment only, vertical capsule with rounded ends, no body, no full leg, not a full character',
  'shin.png':
    '2D puppet part: one single lower leg pants segment with one simple shoe at the bottom only, vertical capsule, no body, not a full character',
}

/** 固定风格后缀：平涂 + 粗描边 + 纯色背景（描边硬边同时是抠图泛洪的天然屏障） */
const PROMPT_SUFFIX =
  'flat 2D cartoon vector sticker style, thick dark outline, solid flat colors, no shading, no gradients, ' +
  'single isolated object, centered, plain solid white background, no shadow, no text, no watermark'

interface RawImage {
  data: Buffer
  width: number
  height: number
}

/**
 * 白底抠图：从四周边缘泛洪（BFS），与边缘平均色相近的像素 → 透明。
 * 显著性模型对平面卡通会误判主体，这里利用「背景是连通的纯色区域」这一事实；
 * 以边缘平均色为基准而非写死白色，兼容模型给出任意纯色背景的情况。
 * 若泛洪几乎没抠到像素（背景不是纯色），保留原图并在日志告警。
 */
async function cutoutWhite(buf: Buffer): Promise<RawImage> {
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const w = info.width
  const h = info.height
  const total = w * h

  // 边缘平均色 = 背景色基准
  let br = 0
  let bg = 0
  let bb = 0
  let bn = 0
  const sample = (i: number): void => {
    const o = i * 4
    br += data[o]
    bg += data[o + 1]
    bb += data[o + 2]
    bn++
  }
  for (let x = 0; x < w; x++) {
    sample(x)
    sample((h - 1) * w + x)
  }
  for (let y = 1; y < h - 1; y++) {
    sample(y * w)
    sample(y * w + w - 1)
  }
  br = Math.round(br / bn)
  bg = Math.round(bg / bn)
  bb = Math.round(bb / bn)

  const TOL_BG = 48 // 与边缘均色的最大距离（过宽会沿高光渐变漏进主体，实测 48 兼顾 JPEG 毛边）
  const TOL_STEP = 18 // 与已接纳邻居的单步最大差：遇描边硬边即停，防止漏进主体
  const isBg = (i: number): boolean => {
    const o = i * 4
    return (
      Math.abs(data[o] - br) <= TOL_BG &&
      Math.abs(data[o + 1] - bg) <= TOL_BG &&
      Math.abs(data[o + 2] - bb) <= TOL_BG
    )
  }
  const nearNeighbor = (i: number, j: number): boolean => {
    const a = i * 4
    const b = j * 4
    return (
      Math.abs(data[a] - data[b]) <= TOL_STEP &&
      Math.abs(data[a + 1] - data[b + 1]) <= TOL_STEP &&
      Math.abs(data[a + 2] - data[b + 2]) <= TOL_STEP
    )
  }

  const visited = new Uint8Array(total)
  const stack = new Int32Array(total)
  let sp = 0
  // 区域生长：接纳 = 在全局背景色窗内 且 与来源邻居颜色连续（边缘种子无条件接纳）
  const pushSeed = (i: number): void => {
    if (!visited[i] && isBg(i)) {
      visited[i] = 1
      stack[sp++] = i
    }
  }
  const pushFrom = (i: number, from: number): void => {
    if (!visited[i] && isBg(i) && nearNeighbor(i, from)) {
      visited[i] = 1
      stack[sp++] = i
    }
  }
  for (let x = 0; x < w; x++) {
    pushSeed(x)
    pushSeed((h - 1) * w + x)
  }
  for (let y = 0; y < h; y++) {
    pushSeed(y * w)
    pushSeed(y * w + w - 1)
  }
  while (sp > 0) {
    const i = stack[--sp]
    const x = i % w
    const y = (i / w) | 0
    if (x > 0) pushFrom(i - 1, i)
    if (x < w - 1) pushFrom(i + 1, i)
    if (y > 0) pushFrom(i - w, i)
    if (y < h - 1) pushFrom(i + w, i)
  }

  let removed = 0
  for (let i = 0; i < total; i++) {
    if (visited[i]) {
      data[i * 4 + 3] = 0
      removed++
    }
  }
  if (removed < total * 0.02) {
    log(`riggen: warn 抠图几乎无效（bg=${br},${bg},${bb} removed=${removed}/${total}），保留原图`)
  }
  return { data, width: w, height: h }
}

/** 透明像素包围盒；全透明返回 null */
function alphaBBox(img: RawImage): { left: number; top: number; width: number; height: number } | null {
  const { data, width: w, height: h } = img
  let minX = w
  let minY = h
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] > 8) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  if (maxX < 0) return null
  return { left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 }
}

/**
 * 裁进 manifest 固定画布：trim → 拉伸填进内容区（画布 − 两侧出血）。
 * 画布尺寸 = manifest 宽高 × 3px；pivot 比例已含出血，无需额外换算。
 */
async function fitToCanvas(img: RawImage, canvasW: number, canvasH: number): Promise<Buffer> {
  const contentW = canvasW - BLEED * 2
  const contentH = canvasH - BLEED * 2
  const bbox = alphaBBox(img)
  let pipeline = sharp(img.data, {
    raw: { width: img.width, height: img.height, channels: 4 },
  })
  if (bbox && bbox.width > 4 && bbox.height > 4) {
    pipeline = pipeline.extract(bbox)
  }
  const content = await pipeline.resize(contentW, contentH, { fit: 'fill' }).png().toBuffer()
  return sharp({
    create: {
      width: canvasW,
      height: canvasH,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: content, left: BLEED, top: BLEED }])
    .png()
    .toBuffer()
}

/**
 * 面部几何擦除（硬约束「脸不挂骨、表情独立叠 head」的兜底）：
 * AI 常在头部画出五官，会与表情贴图双重叠影。face 锚点是固定几何，
 * 直接把锚点区域（外扩并上移吃掉眉毛）用周围肤色盖掉，保证面部空白。
 */
async function blankFace(
  buf: Buffer,
  spec: { width: number; height: number; pivotX: number; pivotY: number },
): Promise<Buffer> {
  const f = BUILTIN_RIGGED_CHARACTER.face
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const S = 3 // px/角色空间单位（与 fitToCanvas 一致）
  const W = info.width // 应与 spec.width*S 一致（fitToCanvas 产物）
  const H = info.height

  // face 锚点（角色空间，相对 head 骨 pivot）→ 画布像素矩形
  const cx = spec.pivotX * W + f.offsetX * S
  const cy = spec.pivotY * H + f.offsetY * S
  const rw = (f.width + 16) * S
  const rh = (f.height + 30) * S
  const left = Math.max(0, Math.round(cx - rw / 2))
  const top = Math.max(0, Math.round(cy - rh * 0.65)) // 上方多扩，覆盖眉毛区
  const right = Math.min(W - 1, Math.round(cx + rw / 2))
  const bottom = Math.min(H - 1, Math.round(cy + rh * 0.35))

  // 从矩形外圈 6px 环带采样不透明肤色（取中位数，抗毛发/描边干扰）
  const RING = 6
  const samples: number[] = []
  const take = (x: number, y: number): void => {
    if (x < 0 || y < 0 || x >= W || y >= H) return
    const o = (y * W + x) * 4
    if (data[o + 3] > 128) samples.push(o)
  }
  for (let x = left - RING; x <= right + RING; x++) {
    for (let d = 1; d <= RING; d++) {
      take(x, top - d)
      take(x, bottom + d)
    }
  }
  for (let y = top; y <= bottom; y++) {
    for (let d = 1; d <= RING; d++) {
      take(left - d, y)
      take(right + d, y)
    }
  }
  if (samples.length < 20) return buf // 采不到肤色（头部生成异常），保持原样
  const median = (ch: number): number => {
    const vs = samples.map((o) => data[o + ch]).sort((a, b) => a - b)
    return vs[vs.length >> 1]
  }
  const fr = median(0)
  const fg = median(1)
  const fb = median(2)

  for (let y = top; y <= bottom; y++) {
    for (let x = left; x <= right; x++) {
      const o = (y * W + x) * 4
      if (data[o + 3] > 0) {
        data[o] = fr
        data[o + 1] = fg
        data[o + 2] = fb
        data[o + 3] = 255
      }
    }
  }
  return sharp(data, { raw: { width: W, height: H, channels: 4 } }).png().toBuffer()
}

/** 生成绑骨角色全套部件并入库；onProgress 逐部件回报（IPC 侧转发到渲染进程） */
export async function generateRigCharacter(
  name: string,
  style: string,
  onProgress?: (p: RigCharacterProgress) => void,
): Promise<ImageGenResult> {
  const charName = name.trim()
  const styleText = style.trim()
  if (!charName) return { ok: false, message: '请给角色起个名字' }
  if (!styleText) return { ok: false, message: '请描述角色风格（如：僵尸，青绿皮肤，破衣服，沙雕表情）' }

  const cfg = getImageGenConfig()
  const provider = cfg.provider ?? 'pollinations'
  const id = crypto.randomUUID()
  const dir = `assets/rig-characters/${id}`
  const absDir = resolveAsset(dir)
  // 全套部件同 seed，尽量保持配色/笔触一致
  const seed = Math.floor(Math.random() * 1_000_000)
  const t0 = Date.now()

  fs.mkdirSync(absDir, { recursive: true })
  try {
    const total = RIG_PART_ORDER.length
    // pollinations 免费档 45 秒/张：逐部件节流，间隔 50 秒（首张不等）；
    // generateBytes 内部的 402 等待作为兜底，实测仅靠它会撞窗口边界
    let lastGenAt = 0
    const pace = async (): Promise<void> => {
      const since = Date.now() - lastGenAt
      if (lastGenAt > 0 && since < 50_000) {
        await new Promise((r) => setTimeout(r, 50_000 - since))
      }
      lastGenAt = Date.now()
    }
    for (let i = 0; i < total; i++) {
      const file = RIG_PART_ORDER[i]
      const label = RIG_PART_LABELS[file] ?? file
      onProgress?.({ step: i + 1, total, part: file, label })
      const spec = BUILTIN_RIGGED_CHARACTER.parts.find((p) => p.image === file)
      if (!spec) throw new Error(`manifest 缺少部件 ${file}`)
      const prompt = `${PART_PROMPTS[file]}, ${styleText}, ${PROMPT_SUFFIX}`
      await pace()
      const generated = await generateBytes(cfg, prompt, GEN_SIZE, seed)
      const cut = await cutoutWhite(generated)
      let fitted = await fitToCanvas(cut, spec.width * 3, spec.height * 3)
      if (file === 'head.png') {
        fitted = await blankFace(fitted, spec)
      }
      fs.writeFileSync(path.join(absDir, file), fitted)
      log(`riggen: part ${i + 1}/${total} ${file} ok (${Math.round(fitted.length / 1024)}KB)`)
    }

    // 内联 manifest：几何与内置角色严格一致，部件图指向 AI 产物（相对资源路径）
    const rig: CharacterRig = {
      ...BUILTIN_RIGGED_CHARACTER,
      id: `ai-${id.slice(0, 8)}`,
      name: charName,
      parts: BUILTIN_RIGGED_CHARACTER.parts.map((p) => ({ ...p, image: `${dir}/${p.image}` })),
    }
    const thumbRel = await generateThumbnail(path.join(absDir, 'head.png'), id)
    const material = await addMaterial({
      id,
      name: charName,
      category: '角色',
      tags: ['AI生成', '绑骨', '角色'],
      file_path: `${dir}/head.png`,
      thumbnail_path: thumbRel,
      meta: JSON.stringify({
        source: 'ai-rig',
        provider,
        prompt: styleText,
        rigged: true,
        characterRigId: rig.id,
        rig,
      }),
    })
    const seconds = Math.round((Date.now() - t0) / 100) / 10
    log(`riggen: ok 「${charName}」 ${seconds}s (${provider}, seed=${seed})`)
    return { ok: true, material, seconds }
  } catch (e) {
    // 失败清理半成品目录，避免留下缺部件的脏角色
    fs.rmSync(absDir, { recursive: true, force: true })
    const msg = e instanceof Error ? e.message : String(e)
    log(`riggen: failed ${msg}`)
    return { ok: false, message: msg }
  }
}
