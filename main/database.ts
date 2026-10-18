// ============================================================================
// 本地数据库：better-sqlite3（同步 API，仅主进程使用）
// 两张表：materials（素材）+ ai_config（LLM/TTS 配置）
// 数据目录：userData/guiyishadiao/（assets / thumbnails / audio / guiyi.db）
// ============================================================================
import { app } from 'electron'
import Database from 'better-sqlite3'
import path from 'node:path'
import fs from 'node:fs'
import type {
  AddMaterialInput,
  Material,
  MaterialCategory,
  UpdateMaterialInput,
} from '../shared/types'
import { CATEGORIES } from '../shared/types'

export interface DataPaths {
  dataDir: string
  dbFile: string
  assetsDir: string
  thumbnailsDir: string
  audioDir: string
}

let paths: DataPaths | null = null
let db: Database.Database | null = null

/** 初始化并返回数据目录结构（幂等） */
export function getPaths(): DataPaths {
  if (paths) return paths
  const dataDir = path.join(app.getPath('userData'), 'guiyishadiao')
  const assetsDir = path.join(dataDir, 'assets')
  for (const dir of [dataDir, assetsDir, path.join(dataDir, 'thumbnails'), path.join(dataDir, 'audio')]) {
    fs.mkdirSync(dir, { recursive: true })
  }
  for (const cat of CATEGORIES) {
    fs.mkdirSync(path.join(assetsDir, cat), { recursive: true })
  }
  paths = {
    dataDir,
    dbFile: path.join(dataDir, 'guiyi.db'),
    assetsDir,
    thumbnailsDir: path.join(dataDir, 'thumbnails'),
    audioDir: path.join(dataDir, 'audio'),
  }
  return paths
}

export function getDataDir(): string {
  return getPaths().dataDir
}

/** 相对路径（assets/... thumbnails/...）→ 数据目录下的绝对路径 */
export function resolveAsset(relPath: string): string {
  return path.join(getDataDir(), relPath)
}

/** 打开数据库并初始化 schema（幂等） */
export function getDb(): Database.Database {
  if (db) return db
  const p = getPaths()
  db = new Database(p.dbFile)
  db.pragma('journal_mode = WAL')
  initSchema(db)
  return db
}

function initSchema(d: Database.Database): void {
  d.exec(`
    CREATE TABLE IF NOT EXISTS materials (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      tags TEXT NOT NULL DEFAULT '[]',
      file_path TEXT NOT NULL,
      thumbnail_path TEXT,
      meta TEXT,
      created_at INTEGER NOT NULL,
      asset_type TEXT,
      min_duration REAL,
      max_duration REAL,
      allow_hard_cut INTEGER,
      transition_ids TEXT,
      emotion_weight REAL,
      loop_flag INTEGER
    );
    CREATE TABLE IF NOT EXISTS ai_config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `)
  // 旧库兼容：逐列补加（已存在会报错，忽略即可）
  const alters = [
    `ALTER TABLE materials ADD COLUMN asset_type TEXT`,
    `ALTER TABLE materials ADD COLUMN min_duration REAL`,
    `ALTER TABLE materials ADD COLUMN max_duration REAL`,
    `ALTER TABLE materials ADD COLUMN allow_hard_cut INTEGER`,
    `ALTER TABLE materials ADD COLUMN transition_ids TEXT`,
    `ALTER TABLE materials ADD COLUMN emotion_weight REAL`,
    `ALTER TABLE materials ADD COLUMN loop_flag INTEGER`,
  ]
  for (const sql of alters) {
    try {
      d.exec(sql)
    } catch {
      /* 列已存在 */
    }
  }
}

// ---------------------------------------------------------------------------
// 行 ↔ 对象 映射
// ---------------------------------------------------------------------------
interface MaterialRow {
  id: string
  name: string
  category: string
  tags: string
  file_path: string
  thumbnail_path: string | null
  meta: string | null
  created_at: number
  asset_type: string | null
  min_duration: number | null
  max_duration: number | null
  allow_hard_cut: number | null
  transition_ids: string | null
  emotion_weight: number | null
  loop_flag: number | null
}

function rowToMaterial(r: MaterialRow): Material {
  return {
    id: r.id,
    name: r.name,
    category: r.category as MaterialCategory,
    tags: JSON.parse(r.tags || '[]'),
    file_path: r.file_path,
    thumbnail_path: r.thumbnail_path,
    meta: r.meta,
    created_at: r.created_at,
    assetType: r.asset_type ?? undefined,
    minDuration: r.min_duration ?? undefined,
    maxDuration: r.max_duration ?? undefined,
    allowHardCut: r.allow_hard_cut === null ? undefined : r.allow_hard_cut !== 0,
    transitionIds: r.transition_ids ? JSON.parse(r.transition_ids) : undefined,
    emotionWeight: r.emotion_weight ?? undefined,
    loopFlag: r.loop_flag === null ? undefined : r.loop_flag !== 0,
  }
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export function listMaterials(category?: MaterialCategory | '全部'): Material[] {
  const d = getDb()
  const rows =
    !category || category === '全部'
      ? (d.prepare('SELECT * FROM materials ORDER BY created_at DESC').all() as MaterialRow[])
      : (d
          .prepare('SELECT * FROM materials WHERE category = ? ORDER BY created_at DESC')
          .all(category) as MaterialRow[])
  return rows.map(rowToMaterial)
}

export function addMaterial(input: AddMaterialInput): Material {
  const d = getDb()
  const id = input.id ?? crypto.randomUUID()
  const createdAt = input.created_at ?? Date.now()
  d.prepare(
    `INSERT INTO materials (id, name, category, tags, file_path, thumbnail_path, meta, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    input.name,
    input.category,
    JSON.stringify(input.tags ?? []),
    input.file_path,
    input.thumbnail_path ?? null,
    input.meta ?? null,
    createdAt,
  )
  const row = d.prepare('SELECT * FROM materials WHERE id = ?').get(id) as MaterialRow
  return rowToMaterial(row)
}

export function updateMaterial(id: string, input: UpdateMaterialInput): Material | null {
  const d = getDb()
  const existing = d.prepare('SELECT * FROM materials WHERE id = ?').get(id) as MaterialRow | undefined
  if (!existing) return null

  const sets: string[] = []
  const vals: unknown[] = []
  const push = (col: string, v: unknown): void => {
    sets.push(`${col} = ?`)
    vals.push(v)
  }
  if (input.name !== undefined) push('name', input.name)
  if (input.category !== undefined) push('category', input.category)
  if (input.tags !== undefined) push('tags', JSON.stringify(input.tags))
  if (input.assetType !== undefined) push('asset_type', input.assetType)
  if (input.minDuration !== undefined) push('min_duration', input.minDuration)
  if (input.maxDuration !== undefined) push('max_duration', input.maxDuration)
  if (input.allowHardCut !== undefined) push('allow_hard_cut', input.allowHardCut ? 1 : 0)
  if (input.transitionIds !== undefined) push('transition_ids', JSON.stringify(input.transitionIds))
  if (input.emotionWeight !== undefined) push('emotion_weight', input.emotionWeight)
  if (input.loopFlag !== undefined) push('loop_flag', input.loopFlag ? 1 : 0)
  if (sets.length > 0) {
    vals.push(id)
    d.prepare(`UPDATE materials SET ${sets.join(', ')} WHERE id = ?`).run(...vals)
  }
  const row = d.prepare('SELECT * FROM materials WHERE id = ?').get(id) as MaterialRow
  return rowToMaterial(row)
}

export function deleteMaterial(id: string): boolean {
  const d = getDb()
  const row = d.prepare('SELECT file_path, thumbnail_path, meta FROM materials WHERE id = ?').get(id) as
    | { file_path: string; thumbnail_path: string | null; meta: string | null }
    | undefined
  if (!row) return false
  // 绑骨角色（组装 / AI 生成）：部件目录在 assets/rig-characters/<x>/，整目录连带删除
  try {
    const meta = row.meta ? (JSON.parse(row.meta) as { rigged?: boolean }) : null
    const dir = path.posix.dirname(row.file_path.replace(/\\/g, '/'))
    if (meta?.rigged && /^assets\/rig-characters\/[^/]+$/.test(dir)) {
      fs.rmSync(path.join(getDataDir(), dir), { recursive: true, force: true })
    }
  } catch {
    /* 目录可能已不存在 */
  }
  // 先删磁盘文件（相对 dataDir），再删记录
  for (const rel of [row.file_path, row.thumbnail_path]) {
    if (!rel) continue
    try {
      fs.unlinkSync(path.join(getDataDir(), rel))
    } catch {
      /* 文件可能已不存在 */
    }
  }
  d.prepare('DELETE FROM materials WHERE id = ?').run(id)
  return true
}

// ---------------------------------------------------------------------------
// AI 配置（key/value JSON）
// ---------------------------------------------------------------------------

export function getAIConfigValue(key: 'llm' | 'tts' | 'image'): unknown | null {
  const d = getDb()
  const row = d.prepare('SELECT value FROM ai_config WHERE key = ?').get(key) as
    | { value: string }
    | undefined
  return row ? JSON.parse(row.value) : null
}

export function saveAIConfigValue(key: 'llm' | 'tts' | 'image', value: unknown): void {
  const d = getDb()
  d.prepare('INSERT INTO ai_config (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(
    key,
    JSON.stringify(value),
  )
}
