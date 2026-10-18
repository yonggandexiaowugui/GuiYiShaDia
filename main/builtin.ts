// ============================================================================
// 内置素材包播种：首次启动把 assets-builtin/（manifest.json 驱动）复制进
// 数据目录并入库。固定 id（builtin-*）幂等：已存在则跳过，用户可删、重启不回填
// ============================================================================
import { app } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import { addMaterial, getDb, getDataDir, resolveAsset } from './database'
import { generateThumbnail } from './media'
import type { MaterialCategory } from '../shared/types'

interface BuiltinEntry {
  id: string
  name: string
  category: MaterialCategory
  tags?: string[]
  file: string
  minDuration?: number
  maxDuration?: number
  allowHardCut?: boolean
  emotionWeight?: number
  loopFlag?: boolean
  /** 追加写入素材 meta JSON 的扩展字段（如绑骨角色标记） */
  metaExtra?: Record<string, unknown>
}

interface BuiltinManifest {
  version: number
  materials: BuiltinEntry[]
}

/** 定位 assets-builtin 目录（打包后走 extraResources，开发期走项目根） */
function findBuiltinDir(): string | null {
  const candidates = [
    process.resourcesPath ? path.join(process.resourcesPath, 'assets-builtin') : '',
    path.join(app.getAppPath(), 'assets-builtin'),
  ]
  for (const dir of candidates) {
    if (dir && fs.existsSync(path.join(dir, 'manifest.json'))) return dir
  }
  return null
}

export async function seedBuiltinAssets(log: (m: string) => void): Promise<void> {
  const dir = findBuiltinDir()
  if (!dir) {
    log('builtin assets: manifest.json not found, skip')
    return
  }
  let manifest: BuiltinManifest
  try {
    manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'))
  } catch (e) {
    log(`builtin assets: manifest parse failed: ${e}`)
    return
  }

  // 清理旧版内置素材（如已移除的火柴人），保证 manifest 与数据库一致
  getDb().prepare("DELETE FROM materials WHERE id LIKE 'builtin-%'").run()

  const exists = getDb().prepare('SELECT 1 FROM materials WHERE id = ?')
  let seeded = 0
  for (const m of manifest.materials) {
    if (exists.get(m.id)) continue
    const src = path.join(dir, m.file)
    if (!fs.existsSync(src)) {
      log(`builtin assets: missing file ${m.file}, skip`)
      continue
    }
    try {
      const ext = path.extname(m.file)
      const relFile = path.join('assets', m.category, `${m.id}${ext}`).replace(/\\/g, '/')
      fs.mkdirSync(path.dirname(resolveAsset(relFile)), { recursive: true })
      fs.copyFileSync(src, resolveAsset(relFile))
      const isAudio = m.category === '音效' || m.category === '音乐'
      const thumbRel = isAudio ? null : await generateThumbnail(resolveAsset(relFile), m.id)
      addMaterial({
        id: m.id,
        name: m.name,
        category: m.category,
        tags: m.tags ?? ['内置'],
        file_path: relFile,
        thumbnail_path: thumbRel,
        meta: JSON.stringify({ source: 'builtin', ...(m.metaExtra ?? {}) }),
      })
      // 平滑元数据走 update（addMaterial 仅落基础列）
      if (
        m.minDuration !== undefined ||
        m.maxDuration !== undefined ||
        m.allowHardCut !== undefined ||
        m.emotionWeight !== undefined ||
        m.loopFlag !== undefined
      ) {
        getDb()
          .prepare(
            'UPDATE materials SET min_duration=?, max_duration=?, allow_hard_cut=?, emotion_weight=?, loop_flag=? WHERE id=?',
          )
          .run(
            m.minDuration ?? null,
            m.maxDuration ?? null,
            m.allowHardCut === undefined ? null : m.allowHardCut ? 1 : 0,
            m.emotionWeight ?? null,
            m.loopFlag === undefined ? null : m.loopFlag ? 1 : 0,
            m.id,
          )
      }
      seeded++
    } catch (e) {
      log(`builtin assets: seed ${m.id} failed: ${e}`)
    }
  }
  log(`builtin assets: seeded ${seeded} / ${manifest.materials.length} (dataDir=${getDataDir()})`)
}
