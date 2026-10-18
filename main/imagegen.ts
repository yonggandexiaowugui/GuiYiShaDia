// ============================================================================
// AI 生成图片素材（F1）：双通道
//  - pollinations：免配置公共源（免费、无 Key），默认
//  - custom：OpenAI 兼容 /images/generations 接口（用户在设置里填地址/Key/模型）
// 产物统一走 sharp 生成缩略图并入素材库，与手动导入一致。
// ============================================================================
import crypto from 'node:crypto'
import path from 'node:path'
import fs from 'node:fs'
import { addMaterial, getAIConfigValue, getDataDir, resolveAsset, saveAIConfigValue } from './database'
import { generateThumbnail } from './media'
import { log } from './log'
import type { ImageGenConfig, ImageGenResult, MaterialCategory } from '../shared/types'

const IMAGE_CATEGORIES: MaterialCategory[] = ['场景', '角色', '表情', '特效']
const GEN_SIZE = 1024
const TIMEOUT_MS = 180_000

export function getImageGenConfig(): ImageGenConfig {
  const cfg = getAIConfigValue('image') as ImageGenConfig | null
  return { provider: 'pollinations', apiBase: '', apiKey: '', model: '', ...cfg }
}

export function saveImageGenConfig(config: ImageGenConfig): ImageGenConfig {
  saveAIConfigValue('image', config)
  return getImageGenConfig()
}

/** fetch 带超时 */
async function fetchWithTimeout(url: string, init: RequestInit = {}): Promise<Response> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    return await fetch(url, { ...init, signal: ctrl.signal })
  } finally {
    clearTimeout(timer)
  }
}

/**
 * pollinations 公共源：GET 即得图片。
 * 免费额度限制：匿名每 45 秒 1 张；超限返回 402 + 占位图（非真图，按状态码识别）。
 * 402 → 等 46 秒重试（只等一次）；其余 5xx/429 → 短退避快速重试。
 * fixedSeed：绑骨角色（P4）要求全套部件同 seed 保持风格一致；缺省每次随机。
 */
async function genViaPollinations(prompt: string, size = GEN_SIZE, fixedSeed?: number): Promise<Buffer> {
  const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))
  let waitedForQuota = false
  let lastBusy = ''
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const seed = fixedSeed ?? Math.floor(Math.random() * 1_000_000)
      const url =
        `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}` +
        `?width=${size}&height=${size}&nologo=true&seed=${seed}`
      const resp = await fetchWithTimeout(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 GuiYiShaDiao/0.1', Accept: 'image/*' },
      })
      if (resp.ok) {
        const buf = Buffer.from(await resp.arrayBuffer())
        if (buf.length < 1000) throw new Error('公共源返回内容异常（过小）')
        return buf
      }
      if (resp.status === 402) {
        if (!waitedForQuota) {
          waitedForQuota = true
          await sleep(46_000) // 等免费额度窗口（每 45 秒 1 张）
          continue
        }
        throw new Error('公共源免费额度已用完（每 45 秒 1 张）：请约 1 分钟后重试，或在「设置 → AI 绘图」改用自定义 API')
      }
      if (resp.status === 429 || resp.status >= 500) {
        lastBusy = `公共源繁忙（${resp.status}）`
        await sleep(3000 * (attempt + 1))
        continue
      }
      throw new Error(`公共源返回 ${resp.status}，请稍后重试或改用自定义 API`)
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') throw new Error('生成超时，请重试或改用自定义 API')
      if (e instanceof Error && /额度|繁忙|超时|自定义 API/.test(e.message)) throw e
      lastBusy = e instanceof Error ? e.message : String(e)
      await sleep(2000)
    }
  }
  throw new Error(lastBusy || '公共源不可用，请稍后重试或改用自定义 API')
}

/** 自定义 OpenAI 兼容接口：/images/generations，兼容 b64_json 与 url 两种返回 */
async function genViaCustom(cfg: ImageGenConfig, prompt: string, size = GEN_SIZE): Promise<Buffer> {
  if (!cfg.apiBase) throw new Error('未配置自定义接口地址')
  if (!cfg.model) throw new Error('未配置模型名')
  const base = cfg.apiBase.replace(/\/+$/, '')
  const resp = await fetchWithTimeout(`${base}/images/generations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : {}),
    },
    body: JSON.stringify({
      model: cfg.model,
      prompt,
      n: 1,
      size: `${size}x${size}`,
      response_format: 'b64_json',
    }),
  })
  const text = await resp.text()
  if (!resp.ok) throw new Error(`接口返回 ${resp.status}: ${text.slice(0, 200)}`)
  let payload: { data?: Array<{ b64_json?: string; url?: string }> }
  try {
    payload = JSON.parse(text)
  } catch {
    throw new Error('接口返回不是 JSON')
  }
  const item = payload.data?.[0]
  if (item?.b64_json) return Buffer.from(item.b64_json, 'base64')
  if (item?.url) {
    const img = await fetchWithTimeout(item.url)
    if (!img.ok) throw new Error(`下载生成图失败：${img.status}`)
    return Buffer.from(await img.arrayBuffer())
  }
  throw new Error('接口返回中没有图片数据')
}

/** 按配置通道生成图片字节；seed 仅对 pollinations 生效（custom 通道忽略） */
export async function generateBytes(
  cfg: ImageGenConfig,
  prompt: string,
  size: number,
  seed?: number,
): Promise<Buffer> {
  return (cfg.provider ?? 'pollinations') === 'custom'
    ? genViaCustom(cfg, prompt, size)
    : genViaPollinations(prompt, size, seed)
}

/** 生成图片素材并入库（真正落盘 + 缩略图 + 数据库） */
export async function generateImageMaterial(
  prompt: string,
  category: MaterialCategory,
): Promise<ImageGenResult> {
  const text = prompt.trim()
  if (!text) return { ok: false, message: '请先描述想生成的素材' }
  if (!IMAGE_CATEGORIES.includes(category)) {
    return { ok: false, message: '图片素材只支持 场景/角色/表情/特效 分类' }
  }
  const cfg = getImageGenConfig()
  const t0 = Date.now()
  try {
    const buf = await generateBytes(cfg, text, GEN_SIZE)
    const id = crypto.randomUUID()
    const dir = `assets/${category}`
    fs.mkdirSync(path.join(getDataDir(), dir), { recursive: true })
    // pollinations 常回 JPEG；用 magic bytes 判扩展名
    const ext = buf[0] === 0x89 && buf[1] === 0x50 ? '.png' : '.jpg'
    const relPath = `${dir}/${id}${ext}`
    fs.writeFileSync(resolveAsset(relPath), buf)
    const thumbRel = await generateThumbnail(resolveAsset(relPath), id)
    const name = text.length > 16 ? `${text.slice(0, 16)}…` : text
    const material = await addMaterial({
      id,
      name,
      category,
      tags: ['AI生成', category],
      file_path: relPath,
      thumbnail_path: thumbRel,
      meta: JSON.stringify({ source: 'ai', provider: cfg.provider ?? 'pollinations', prompt: text }),
    })
    const seconds = Math.round((Date.now() - t0) / 100) / 10
    log(`imagegen: ok 「${name}」 ${category} ${ext} ${Math.round(buf.length / 1024)}KB ${seconds}s (${cfg.provider ?? 'pollinations'})`)
    return { ok: true, material, seconds }
  } catch (e) {
    const msg = e instanceof Error ? (e.name === 'AbortError' ? '生成超时，请重试或改用自定义 API' : e.message) : String(e)
    log(`imagegen: failed ${msg}`)
    return { ok: false, message: msg }
  }
}

/** 测试连通性：生成小图但不入库 */
export async function testImageGen(cfg: ImageGenConfig): Promise<ImageGenResult> {
  const t0 = Date.now()
  try {
    const buf = await generateBytes(cfg, 'a simple red circle on white background', 256)
    const seconds = Math.round((Date.now() - t0) / 100) / 10
    return buf.length > 1000
      ? { ok: true, seconds, message: `连通正常，测试图 ${Math.round(buf.length / 1024)}KB / ${seconds}s` }
      : { ok: false, message: '返回内容异常' }
  } catch (e) {
    const msg = e instanceof Error ? (e.name === 'AbortError' ? '连接超时' : e.message) : String(e)
    return { ok: false, message: msg }
  }
}
