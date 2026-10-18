// ============================================================================
// 主进程日志：GUI 模式下没有控制台，关键日志写到 userData/guiyi-main.log
// ============================================================================
import { app } from 'electron'
import path from 'node:path'
import fs from 'node:fs'

let logFile = ''

/** 清空已缓存的日志路径（切换 userData 后调用） */
export function resetLogFile(): void {
  logFile = ''
}

export function log(message: string): void {
  try {
    if (!logFile) {
      const dir = app.getPath('userData')
      try {
        fs.mkdirSync(dir, { recursive: true })
      } catch {
        /* ignore */
      }
      logFile = path.join(dir, 'guiyi-main.log')
    }
    fs.appendFileSync(logFile, `[${new Date().toISOString()}] ${message}\n`)
  } catch {
    /* ignore */
  }
}
