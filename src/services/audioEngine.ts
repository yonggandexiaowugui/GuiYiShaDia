// ============================================================================
// 音频播放引擎：让「配音 / 音效」轨道上的片段跟随播放头出声
// 每帧调用 sync()。按当前时间判断片段是否应播放：
//   - 应播放：确保 HTMLAudioElement 在播放，且与播放头偏差过大时纠偏
//   - 不应播放：暂停
// 这样拖动播放头 / 暂停 / 跳转都能自动对齐，无需手动管理播放生命周期
// ============================================================================
import type { Material, Track } from '@shared/types'

interface AudioItem {
  clipId: string
  src: string
  start: number
  duration: number
  volume: number
}

/** 收集轨道上所有需要出声的片段 */
function collectAudio(tracks: Track[], materials: Material[], assetUrl: (p: string) => string): AudioItem[] {
  const items: AudioItem[] = []
  for (const track of tracks) {
    if (track.type !== 'voice' && track.type !== 'sfx') continue
    for (const clip of track.clips) {
      // 配音：TTS 生成的文件
      if (track.type === 'voice') {
        if (!clip.voiceFile) continue
        items.push({
          clipId: clip.id,
          src: assetUrl(clip.voiceFile),
          start: clip.start,
          duration: clip.duration,
          volume: clip.volume ?? 1,
        })
        continue
      }
      // 音效：来自素材库
      if (!clip.materialId) continue
      const mat = materials.find((m) => m.id === clip.materialId)
      if (!mat) continue
      items.push({
        clipId: clip.id,
        src: assetUrl(mat.file_path),
        start: clip.start,
        duration: clip.duration,
        volume: clip.volume ?? 1,
      })
    }
  }
  return items
}

/** 允许的播放头偏差（秒），超过则纠正 */
const DRIFT_TOLERANCE = 0.28

class AudioEngine {
  private els = new Map<string, HTMLAudioElement>()
  private playingIds = new Set<string>()
  private assetUrl: (p: string) => string = (p) => p

  /** 当前真正在出声的片段数（供 UI 显示"播放中"指示灯） */
  get activeCount(): number {
    return this.playingIds.size
  }

  setAssetUrl(fn: (p: string) => string): void {
    this.assetUrl = fn
  }

  private ensure(clipId: string, src: string): HTMLAudioElement {
    let el = this.els.get(clipId)
    if (el && el.dataset.src === src) return el
    if (el) {
      el.pause()
      this.els.delete(clipId)
    }
    el = new Audio()
    el.preload = 'auto'
    el.dataset.src = src
    el.src = src
    this.els.set(clipId, el)
    return el
  }

  /**
   * 与播放头同步。每帧（播放时）或 seek 时调用。
   * @param playing 是否处于播放状态；false 时所有音频暂停
   */
  sync(tracks: Track[], materials: Material[], currentTime: number, playing: boolean): void {
    const items = collectAudio(tracks, materials, this.assetUrl)
    const alive = new Set<string>()

    for (const item of items) {
      alive.add(item.clipId)
      const el = this.ensure(item.clipId, item.src)
      const offset = currentTime - item.start
      const active = playing && offset >= 0 && offset < item.duration

      if (!active) {
        if (!el.paused) el.pause()
        this.playingIds.delete(item.clipId)
        continue
      }

      const vol = Math.min(1, Math.max(0, item.volume))
      if (el.volume !== vol) el.volume = vol

      const target = Math.min(offset, Math.max(0, (el.duration || item.duration) - 0.05))
      if (el.paused) {
        el.currentTime = target
        el.play().catch(() => undefined)
        this.playingIds.add(item.clipId)
      } else if (Math.abs(el.currentTime - target) > DRIFT_TOLERANCE) {
        el.currentTime = target
      }
    }

    // 清理已不存在的片段
    for (const [clipId, el] of this.els) {
      if (!alive.has(clipId)) {
        el.pause()
        this.els.delete(clipId)
        this.playingIds.delete(clipId)
      }
    }
  }

  /** 停止并释放全部音频（切换工程 / 卸载时调用） */
  dispose(): void {
    for (const el of this.els.values()) el.pause()
    this.els.clear()
    this.playingIds.clear()
  }
}

export const audioEngine = new AudioEngine()

/** 读取音频文件真实时长（秒）；失败返回 0 */
export function probeAudioDuration(url: string): Promise<number> {
  return new Promise((resolve) => {
    const el = new Audio()
    let done = false
    const finish = (d: number): void => {
      if (done) return
      done = true
      el.src = ''
      resolve(d)
    }
    el.preload = 'metadata'
    el.onloadedmetadata = () => finish(Number.isFinite(el.duration) ? el.duration : 0)
    el.onerror = () => finish(0)
    window.setTimeout(() => finish(0), 6000)
    el.src = url
  })
}
