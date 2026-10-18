// ============================================================================
// 一键去背景：@imgly/background-removal-node（本地 ONNX 推理，完全离线）。
// 模型文件随 npm 包 dist/ 分发，publicPath 指向本地目录，无任何网络依赖。
// 输入为素材库已有图片素材，产出一个新的「无背景」副本素材（原图保留）。
// 说明：显著性分割模型对真实照片效果最好；大面积纯色平面卡通可能误判。
// ============================================================================
import path from 'node:path'
import fs from 'node:fs'
import { app } from 'electron'
import { pathToFileURL } from 'node:url'
import { addMaterial, getDb, getDataDir, resolveAsset } from './database'
import { generateThumbnail } from './media'
import { log } from './log'
import type { Material } from '../shared/types'

/** 定位模型资源目录（打包后走 extraResources/bg-removal，开发期走 node_modules） */
function findModelDir(): string | null {
  const candidates = [
    process.resourcesPath ? path.join(process.resourcesPath, 'bg-removal') : '',
    path.join(app.getAppPath(), 'node_modules', '@imgly', 'background-removal-node', 'dist'),
  ]
  for (const dir of candidates) {
    if (dir && fs.existsSync(path.join(dir, 'resources.json'))) return dir
  }
  return null
}

let cachedFn: ((input: string, config?: unknown) => Promise<Blob>) | null = null

async function getRemover(): Promise<(input: string, config?: unknown) => Promise<Blob>> {
  if (cachedFn) return cachedFn
  const dir = findModelDir()
  if (!dir) throw new Error('未找到去背景模型资源（resources.json），请确认安装完整')
  const mod = (await import('@imgly/background-removal-node')) as {
    removeBackground: (input: string, config?: unknown) => Promise<Blob>
  }
  const publicPath = pathToFileURL(path.join(dir, path.sep)).href
  cachedFn = (input, config) =>
    mod.removeBackground(input, {
      device: 'cpu',
      output: { format: 'image/png' },
      publicPath,
      ...((config as object) ?? {}),
    })
  return cachedFn
}

/** 对素材库图片执行去背景，成功返回新素材；失败抛错（IPC 层转 message） */
export async function removeMaterialBackground(materialId: string): Promise<Material> {
  const row = getDb().prepare('SELECT * FROM materials WHERE id = ?').get(materialId) as
    | {
        id: string
        name: string
        category: string
        tags: string | null
        file_path: string
        meta: string | null
      }
    | undefined
  if (!row) throw new Error('素材不存在')
  if (!/\.(png|jpe?g|webp)$/i.test(row.file_path)) throw new Error('仅支持图片素材去背景')

  const srcAbs = resolveAsset(row.file_path)
  if (!fs.existsSync(srcAbs)) throw new Error('素材文件缺失')

  log(`bgremove: start ${row.name} (${row.id})`)
  const t0 = Date.now()
  const remove = await getRemover()
  const blob = await remove(pathToFileURL(srcAbs).href)
  const buf = Buffer.from(await blob.arrayBuffer())
  if (buf.length < 100) throw new Error('去背景输出为空')

  // 新素材：原名 +（无背景），保持原分类；写 PNG + 缩略图 + 入库
  const crypto = await import('node:crypto')
  const newId = crypto.randomUUID()
  const dir = path.join('assets', row.category)
  fs.mkdirSync(path.join(getDataDir(), dir), { recursive: true })
  const relPath = path.join(dir, `${newId}.png`).replace(/\\/g, '/')
  fs.writeFileSync(resolveAsset(relPath), buf)
  const thumbRel = await generateThumbnail(resolveAsset(relPath), newId)

  let tags: string[] = []
  try {
    tags = row.tags ? (JSON.parse(row.tags) as string[]) : []
  } catch {
    tags = []
  }

  const material = await addMaterial({
    id: newId,
    name: `${row.name}·无背景`,
    category: row.category as Material['category'],
    tags: [...tags, '无背景'],
    file_path: relPath,
    thumbnail_path: thumbRel,
    meta: JSON.stringify({ source: 'bgremove', origin: row.id }),
  })
  log(`bgremove: done ${row.name} → ${material.name} (${((Date.now() - t0) / 1000).toFixed(1)}s)`)
  return material
}
