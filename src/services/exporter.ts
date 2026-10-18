// ============================================================================
// 渲染进程导出驱动：离屏 Canvas 逐帧渲染 → PNG → 主进程 FFmpeg
// 与预览共用 sceneRenderer.drawScene，保证所见即所得
// ============================================================================
import { collectImageUrls, drawScene, preloadImages } from './sceneRenderer'
import type { AudioTrackItem, Material, SubtitleStyle, Track } from '@shared/types'

export interface ExportProgressInfo {
  phase: 'render' | 'encode'
  current: number
  total: number
}

export interface RunExportOptions {
  tracks: Track[]
  materials: Material[]
  width: number
  height: number
  fps: number
  totalSeconds: number
  projectName: string
  subtitleStyle?: SubtitleStyle
  /** H.264 CRF 质量 */
  crf?: number
  onProgress?: (p: ExportProgressInfo) => void
  /** 返回 false 表示用户取消 */
  shouldContinue?: () => boolean
}

export interface RunExportResult {
  ok: boolean
  cancelled?: boolean
  outputPath?: string
  message?: string
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/** 从轨道收集需要混入的音频（配音 + 音效） */
export function collectAudioTracks(tracks: Track[], materials: Material[]): AudioTrackItem[] {
  const out: AudioTrackItem[] = []
  for (const track of tracks) {
    if (track.type !== 'voice' && track.type !== 'sfx') continue
    for (const clip of track.clips) {
      const file =
        track.type === 'voice'
          ? clip.voiceFile
          : materials.find((m) => m.id === clip.materialId)?.file_path
      if (!file) continue
      out.push({
        type: track.type === 'voice' ? 'voice' : 'asset',
        file,
        startMs: Math.round(clip.start * 1000),
        durationMs: Math.round(clip.duration * 1000),
        volume: Math.min(1, Math.max(0, clip.volume ?? 1)),
      })
    }
  }
  return out
}

/**
 * 执行导出。步骤：选路径 → 启动 FFmpeg → 预热图片 → 逐帧渲染写入 → 收尾。
 * 任何异常都会调用 cancelExport 清理半成品。
 */
export async function runExport(opts: RunExportOptions): Promise<RunExportResult> {
  const { tracks, materials, width, height, fps, totalSeconds, projectName, onProgress, subtitleStyle, crf } = opts

  if (totalSeconds <= 0) {
    return { ok: false, message: '时间轴为空，没有可导出的内容' }
  }

  const outputPath = await window.api.pickExportPath(projectName || '未命名')
  if (!outputPath) return { ok: false, cancelled: true, message: '已取消' }

  const audio = collectAudioTracks(tracks, materials)

  const started = await window.api.startExport({
    outputPath,
    width,
    height,
    fps,
    audio,
    totalSeconds,
    crf,
  })
  if (!started.ok) {
    return { ok: false, message: started.message || '无法启动导出' }
  }

  try {
    // ---- 离屏画布（不碰 DOM）----
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('无法创建离屏 Canvas 上下文')

    // ---- 预热图片，避免逐帧等待 ----
    await preloadImages(collectImageUrls(tracks, materials, window.api.assetUrl))

    const totalFrames = Math.max(1, Math.ceil(totalSeconds * fps))
    onProgress?.({ phase: 'render', current: 0, total: totalFrames })

    for (let f = 0; f < totalFrames; f++) {
      if (opts.shouldContinue && !opts.shouldContinue()) {
        await window.api.cancelExport()
        return { ok: false, cancelled: true, message: '已取消导出' }
      }
      const t = f / fps
      drawScene({
        ctx,
        tracks,
        materials,
        currentTime: t,
        width,
        height,
        assetUrl: window.api.assetUrl,
        subtitleStyle,
      })

      const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'))
      if (!blob) throw new Error(`第 ${f + 1} 帧编码 PNG 失败`)
      await window.api.writeFrame(new Uint8Array(await blob.arrayBuffer()))

      if (f % 3 === 0 || f === totalFrames - 1) {
        onProgress?.({ phase: 'render', current: f + 1, total: totalFrames })
      }
      // 每 10 帧让出主线程，避免界面卡死
      if (f % 10 === 9) await sleep(0)
    }

    return { ...(await window.api.finishExport()) }
  } catch (e) {
    await window.api.cancelExport()
    return { ok: false, message: e instanceof Error ? e.message : String(e) }
  }
}
