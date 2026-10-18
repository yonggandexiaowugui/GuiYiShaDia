// ============================================================================
// 主进程：图片 / 音频导入与缩略图生成（sharp）
// ============================================================================
import path from 'node:path'
import fs from 'node:fs'
import crypto from 'node:crypto'
import sharp from 'sharp'
import { addMaterial, getDataDir, resolveAsset } from './database'
import type { Material, MaterialCategory } from '../shared/types'

const THUMB_MAX = 240 // 缩略图最长边

function rel(p: string): string {
  return p.replace(/\\/g, '/')
}

function copyImageAsset(srcAbs: string, category: MaterialCategory, id: string): string {
  const ext = path.extname(srcAbs).toLowerCase() || '.png'
  const dir = path.join('assets', category)
  fs.mkdirSync(path.join(getDataDir(), dir), { recursive: true })
  const relPath = rel(path.join(dir, `${id}${ext}`))
  fs.copyFileSync(srcAbs, resolveAsset(relPath))
  return relPath
}

function copyAudioAsset(srcAbs: string, id: string): string {
  const ext = path.extname(srcAbs).toLowerCase() || '.mp3'
  const dir = path.join('assets', '音效')
  fs.mkdirSync(path.join(getDataDir(), dir), { recursive: true })
  const relPath = rel(path.join(dir, `${id}${ext}`))
  fs.copyFileSync(srcAbs, resolveAsset(relPath))
  return relPath
}

export async function generateThumbnail(srcAbs: string, id: string): Promise<string> {
  const dir = 'thumbnails'
  fs.mkdirSync(path.join(getDataDir(), dir), { recursive: true })
  const relPath = rel(path.join(dir, `${id}.webp`))
  await sharp(srcAbs)
    .resize(THUMB_MAX, THUMB_MAX, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 80 })
    .toFile(resolveAsset(relPath))
  return relPath
}

export async function writeRgbaPng(
  data: Uint8Array,
  width: number,
  height: number,
  category: MaterialCategory,
  id: string,
): Promise<string> {
  const dir = path.join('assets', category)
  fs.mkdirSync(path.join(getDataDir(), dir), { recursive: true })
  const relPath = rel(path.join(dir, `${id}.png`))
  await sharp(Buffer.from(data), {
    raw: { width, height, channels: 4 },
  })
    .png()
    .toFile(resolveAsset(relPath))
  return relPath
}

export async function rgbaToPngDataUrl(
  data: Uint8Array,
  width: number,
  height: number,
  max = 120,
): Promise<string> {
  const buf = await sharp(Buffer.from(data), {
    raw: { width, height, channels: 4 },
  })
    .resize(max, max, { fit: 'inside', withoutEnlargement: true })
    .png()
    .toBuffer()
  return `data:image/png;base64,${buf.toString('base64')}`
}

const DEFAULT_IMAGE_CATEGORY: MaterialCategory = '角色'

export async function importImage(filePath: string): Promise<Material> {
  const id = crypto.randomUUID()
  const name = path.basename(filePath, path.extname(filePath))
  const category = DEFAULT_IMAGE_CATEGORY
  const fileRel = copyImageAsset(filePath, category, id)
  const thumbRel = await generateThumbnail(resolveAsset(fileRel), id)
  return addMaterial({
    id,
    name,
    category,
    file_path: fileRel,
    thumbnail_path: thumbRel,
    meta: JSON.stringify({ source: 'image', origin: path.basename(filePath) }),
  })
}

export async function importAudio(filePath: string): Promise<Material> {
  const id = crypto.randomUUID()
  const name = path.basename(filePath, path.extname(filePath))
  const category: MaterialCategory = '音效'
  const fileRel = copyAudioAsset(filePath, id)
  return addMaterial({
    id,
    name,
    category,
    file_path: fileRel,
    thumbnail_path: null,
    meta: JSON.stringify({ source: 'audio', origin: path.basename(filePath) }),
  })
}
