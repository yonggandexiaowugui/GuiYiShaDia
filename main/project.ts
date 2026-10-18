// ============================================================================
// 工程文件读写（.guiyi，JSON）
// - 保存 / 打开均走系统对话框
// - 开发期可用 GUIYI_AUTO_PROJECT 指定固定路径，跳过对话框以便自动化验证
// ============================================================================
import { app, dialog, type BrowserWindow } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { getDataDir } from './database'
import { log } from './log'
import { PROJECT_EXT, PROJECT_VERSION } from '../shared/types'
import type { AutosaveResult, OpenProjectResult, ProjectFile } from '../shared/types'

/** 开发期自动化：返回固定路径（未打包且设置了环境变量时） */
function autoPath(): string | undefined {
  return !app.isPackaged ? process.env.GUIYI_AUTO_PROJECT : undefined
}

function safeName(name: string): string {
  return (name || '未命名').replace(/[\\/:*?"<>|]/g, '_')
}

/** 保存工程，返回最终写入的绝对路径；用户取消返回 null */
export async function saveProjectFile(
  win: BrowserWindow | null,
  defaultName: string,
  data: ProjectFile,
): Promise<string | null> {
  let filePath = autoPath()
  if (!filePath) {
    const options: Electron.SaveDialogOptions = {
      title: '保存工程',
      defaultPath: `${safeName(defaultName)}.${PROJECT_EXT}`,
      filters: [{ name: '诡异沙雕工程', extensions: [PROJECT_EXT] }],
    }
    const res = win
      ? await dialog.showSaveDialog(win, options)
      : await dialog.showSaveDialog(options)
    if (res.canceled || !res.filePath) return null
    filePath = res.filePath.toLowerCase().endsWith(`.${PROJECT_EXT}`)
      ? res.filePath
      : `${res.filePath}.${PROJECT_EXT}`
  }

  const payload: ProjectFile = {
    ...data,
    version: PROJECT_VERSION,
    updatedAt: Date.now(),
  }
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf8')
    log(`project: saved ${filePath} (tracks=${payload.tracks?.length ?? 0})`)
    return filePath
  } catch (e) {
    log(`project: save failed ${e instanceof Error ? e.message : String(e)}`)
    throw e
  }
}

/** 打开工程，返回解析结果 */
export async function openProjectFile(win: BrowserWindow | null): Promise<OpenProjectResult> {
  let filePath = autoPath()
  if (!filePath) {
    const options: Electron.OpenDialogOptions = {
      title: '打开工程',
      properties: ['openFile'],
      filters: [
        { name: '诡异沙雕工程', extensions: [PROJECT_EXT] },
        { name: '所有文件', extensions: ['*'] },
      ],
    }
    const res = win
      ? await dialog.showOpenDialog(win, options)
      : await dialog.showOpenDialog(options)
    if (res.canceled || !res.filePaths[0]) return { ok: false, message: '已取消' }
    filePath = res.filePaths[0]
  }

  try {
    const text = fs.readFileSync(filePath, 'utf8')
    const data = JSON.parse(text) as ProjectFile
    if (!data || typeof data !== 'object' || !Array.isArray(data.tracks)) {
      return { ok: false, message: '工程文件格式不正确（缺少 tracks 字段）' }
    }
    if (typeof data.version === 'number' && data.version > PROJECT_VERSION) {
      return {
        ok: false,
        message: `工程版本（v${data.version}）高于当前应用支持的 v${PROJECT_VERSION}，请升级应用后再打开`,
      }
    }
    log(`project: opened ${filePath} (tracks=${data.tracks.length})`)
    return { ok: true, path: filePath, data }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    log(`project: open failed ${msg}`)
    return { ok: false, message: `读取失败：${msg}` }
  }
}

// ---------------------------------------------------------------------------
// 自动保存 / 崩溃恢复
// ---------------------------------------------------------------------------
/** 自动保存文件路径：数据目录下 autosave.guiyi（不占用用户的工程文件） */
function autosavePath(): string {
  return path.join(getDataDir(), `autosave.${PROJECT_EXT}`)
}

/** 写入自动保存（静默、失败不抛给界面） */
export function autosaveProject(data: ProjectFile): void {
  try {
    const payload: ProjectFile = { ...data, version: PROJECT_VERSION, updatedAt: Date.now() }
    fs.mkdirSync(path.dirname(autosavePath()), { recursive: true })
    fs.writeFileSync(autosavePath(), JSON.stringify(payload), 'utf8')
  } catch (e) {
    log(`autosave: failed ${e instanceof Error ? e.message : String(e)}`)
  }
}

/** 读取自动保存（供启动时提示恢复） */
export function readAutosave(): AutosaveResult {
  const p = autosavePath()
  try {
    if (!fs.existsSync(p)) return { ok: false, message: '没有自动保存' }
    const stat = fs.statSync(p)
    const text = fs.readFileSync(p, 'utf8')
    const data = JSON.parse(text) as ProjectFile
    if (!data || !Array.isArray(data.tracks)) return { ok: false, message: '自动保存内容已损坏' }
    return { ok: true, data, savedAt: stat.mtimeMs }
  } catch (e) {
    return { ok: false, message: `读取自动保存失败：${e instanceof Error ? e.message : String(e)}` }
  }
}

/** 清除自动保存（用户显式保存 / 主动丢弃后调用，避免下次启动重复提示） */
export function clearAutosave(): void {
  try {
    fs.unlinkSync(autosavePath())
  } catch {
    /* 不存在则忽略 */
  }
}
