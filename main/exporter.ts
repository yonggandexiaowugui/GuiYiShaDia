// ============================================================================
// 主进程：导出 MP4（M5）
// - FFmpeg 二进制解析顺序：打包资源 → ffmpeg-static → 系统 PATH 上的 ffmpeg
// - 渲染进程逐帧把 PNG 写进 stdin（image2pipe），不在磁盘落几千张图
// - 音频（配音 / 音效）用 atrim + adelay + amix 混成一条音轨
// - 进度：编码阶段解析 stderr 的 time= 推送给渲染进程；可随时取消
// 移植自 SandAnim（MIT），适配本项目轨道模型
// ============================================================================
import { spawn, type ChildProcessByStdio } from 'node:child_process'
import type { Writable, Readable } from 'node:stream'
import path from 'node:path'
import fs from 'node:fs'
import { app, dialog, type BrowserWindow, type SaveDialogOptions } from 'electron'
import ffmpegStatic from 'ffmpeg-static'
import { resolveAsset } from './database'
import { log } from './log'
import type { ExportResult, ExportStartOptions } from '../shared/types'

type FFmpegProc = ChildProcessByStdio<Writable, null, Readable>

let cachedFfmpeg: string | null = null

/** 解析 FFmpeg 可执行文件路径（带缓存）
 *  优先级：显式环境变量 → 打包内置 → ffmpeg-static → 系统 PATH */
export function ffmpegPath(): string {
  if (cachedFfmpeg) return cachedFfmpeg

  const override = process.env.GUIYI_FFMPEG
  if (override && fs.existsSync(override)) {
    cachedFfmpeg = override
    return cachedFfmpeg
  }

  if (app.isPackaged) {
    const exe = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'
    const bundled = path.join(process.resourcesPath, 'ffmpeg', exe)
    // 打包时若未把 ffmpeg 打进包（见 scripts/prepare-ffmpeg.mjs），仍回退到系统 PATH
    cachedFfmpeg = fs.existsSync(bundled) ? bundled : 'ffmpeg'
    return cachedFfmpeg
  }

  // 开发环境：优先用 ffmpeg-static 自带的二进制，没有则回退到系统 PATH
  const staticBin = ffmpegStatic as unknown as string | null
  if (staticBin && fs.existsSync(staticBin)) {
    cachedFfmpeg = staticBin
    return cachedFfmpeg
  }
  cachedFfmpeg = 'ffmpeg'
  return cachedFfmpeg
}

interface ActiveExport {
  proc: FFmpegProc
  cancelled: boolean
  outputPath: string
  stderrTail: string[]
  onProgress?: (p: { current: number; total: number }) => void
  totalFrames: number
  fps: number
  finished: Promise<ExportResult>
}

let active: ActiveExport | null = null

export function isExporting(): boolean {
  return active !== null
}

/** 弹导出保存对话框，返回绝对路径（用户取消 null） */
export async function pickExportPath(
  win: BrowserWindow | null,
  defaultName: string,
): Promise<string | null> {
  const safeName = (defaultName || '未命名').replace(/[\\/:*?"<>|]/g, '_')
  const options: SaveDialogOptions = {
    title: '导出视频',
    defaultPath: `${safeName}.mp4`,
    filters: [{ name: 'MP4 视频', extensions: ['mp4'] }],
  }
  const res = win
    ? await dialog.showSaveDialog(win, options)
    : await dialog.showSaveDialog(options)
  if (res.canceled || !res.filePath) return null
  return res.filePath.toLowerCase().endsWith('.mp4') ? res.filePath : res.filePath + '.mp4'
}

/** 毫秒延时 → adelay 参数 */
function delayMs(ms: number): string {
  return `${Math.max(0, Math.round(ms))}:all=1`
}

/** 组装并启动 FFmpeg。失败返回 { ok:false, message } */
export async function startExport(
  opts: ExportStartOptions,
  hooks: { onProgress?: ActiveExport['onProgress'] } = {},
): Promise<{ ok: boolean; message?: string }> {
  if (active) return { ok: false, message: '已有导出任务在进行中' }
  const bin = ffmpegPath()
  if (bin !== 'ffmpeg' && !fs.existsSync(bin)) {
    return { ok: false, message: `未找到 FFmpeg：${bin}` }
  }
  try {
    fs.mkdirSync(path.dirname(opts.outputPath), { recursive: true })
  } catch (e) {
    return { ok: false, message: `无法创建输出目录（${String(e)}）` }
  }

  const args: string[] = ['-y']
  // 视频：PNG 帧序列从 stdin 读入
  args.push('-f', 'image2pipe', '-framerate', String(opts.fps), '-i', '-')

  // 音频输入（配音 / 音效），只计入真实存在的文件
  const labels: string[] = []
  let inputIdx = 0
  for (const a of opts.audio) {
    const abs = resolveAsset(a.file)
    if (!fs.existsSync(abs)) {
      log(`export: 跳过缺失音频 ${abs}`)
      continue
    }
    inputIdx += 1
    args.push('-i', abs)
    const chain =
      'aformat=sample_rates=44100:channel_layouts=stereo' +
      `,atrim=0:${Math.max(0.01, a.durationMs / 1000).toFixed(3)}` +
      `,adelay=${delayMs(a.startMs)}` +
      `,volume=${Math.max(0, Math.min(1, a.volume)).toFixed(3)}`
    labels.push(`[${inputIdx}:a]${chain}[a${inputIdx}]`)
  }

  const filter: string[] = []
  let hasAudio = false
  if (labels.length > 0) {
    hasAudio = true
    filter.push(...labels)
    const mixInputs = labels
      .map((l) => l.match(/\[a(\d+)\]$/)?.[1])
      .filter(Boolean)
      .map((n) => `[a${n}]`)
      .join('')
    filter.push(`${mixInputs}amix=inputs=${labels.length}:normalize=0:duration=longest[mixout]`)
  }
  if (filter.length > 0) args.push('-filter_complex', filter.join(';'))

  // 输出：H.264 + yuv420p（Windows 播放器兼容）+ faststart
  args.push(
    '-map', '0:v',
    ...(hasAudio ? ['-map', '[mixout]'] : ['-an']),
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-crf', String(Math.min(51, Math.max(0, opts.crf ?? 20))),
    '-pix_fmt', 'yuv420p',
    '-r', String(opts.fps),
    ...(hasAudio ? ['-c:a', 'aac', '-b:a', '192k'] : []),
    '-t', opts.totalSeconds.toFixed(3),
    '-movflags', '+faststart',
    opts.outputPath,
  )

  log(`export: spawn ${bin} ${args.join(' ')}`)

  let proc: FFmpegProc
  try {
    proc = spawn(bin, args, { stdio: ['pipe', 'ignore', 'pipe'] })
  } catch (e) {
    return { ok: false, message: `FFmpeg 启动失败：${String(e)}` }
  }

  const totalFrames = Math.max(1, Math.ceil(opts.totalSeconds * opts.fps))
  const state: ActiveExport = {
    proc,
    cancelled: false,
    outputPath: opts.outputPath,
    stderrTail: [],
    onProgress: hooks.onProgress,
    totalFrames,
    fps: opts.fps,
    finished: undefined as unknown as Promise<ExportResult>,
  }
  active = state

  state.finished = new Promise<ExportResult>((resolve) => {
    proc.stderr?.on('data', (chunk: Buffer) => {
      const text = chunk.toString()
      state.stderrTail.push(text)
      if (state.stderrTail.length > 40) state.stderrTail.shift()
      const m = text.match(/time=(\d+):(\d+):(\d+(?:\.\d+)?)/)
      if (m && state.onProgress) {
        const sec = Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3])
        state.onProgress({
          current: Math.min(state.totalFrames, Math.floor(sec * state.fps)),
          total: state.totalFrames,
        })
      }
    })

    proc.on('error', (err) => {
      log(`export: spawn error ${err.message}`)
      if (active === state) active = null
      resolve({ ok: false, message: `FFmpeg 启动失败：${err.message}` })
    })

    proc.on('close', (code) => {
      if (active === state) active = null
      if (state.cancelled) {
        try {
          fs.unlinkSync(opts.outputPath)
        } catch {
          /* ignore */
        }
        resolve({ ok: false, cancelled: true, message: '已取消导出', outputPath: opts.outputPath })
      } else if (code === 0) {
        log(`export: done ${opts.outputPath}`)
        resolve({ ok: true, outputPath: opts.outputPath })
      } else {
        const tail = state.stderrTail.join('').slice(-900)
        log(`export: ffmpeg exit ${code} stderr: ${tail}`)
        resolve({
          ok: false,
          message: `FFmpeg 退出码 ${code}：${tail || '（无错误输出）'}`,
          outputPath: opts.outputPath,
        })
      }
    })

    proc.stdin.on('error', (err) => {
      // 取消 / 进程退出时写 stdin 会触发 EPIPE，忽略
      log(`export: stdin error ${err.message}`)
    })
  })

  return { ok: true }
}

/** 写入一帧 PNG。等待写完（背压），防止内存堆积 */
export async function writeFrame(png: Uint8Array): Promise<void> {
  const st = active
  if (!st || st.cancelled) return
  await new Promise<void>((resolve) => {
    st.proc.stdin.write(Buffer.from(png), () => resolve())
  })
}

/** 结束写帧，等待编码完成 */
export async function finishExport(): Promise<ExportResult> {
  const st = active
  if (!st) return { ok: false, message: '没有进行中的导出任务' }
  st.proc.stdin.end()
  return st.finished
}

/** 取消导出 */
export async function cancelExport(): Promise<void> {
  const st = active
  if (!st) return
  st.cancelled = true
  try {
    st.proc.stdin.destroy()
  } catch {
    /* ignore */
  }
  try {
    st.proc.kill()
  } catch {
    /* ignore */
  }
}
