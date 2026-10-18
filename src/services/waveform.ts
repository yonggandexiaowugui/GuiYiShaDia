// ============================================================================
// 音频波形：解码音频 → 提取每段峰值 → 供时间轴画波形图
// - 单个解码用 AudioContext 复用，避免反复创建
// - 结果按 URL 缓存（Promise 缓存，避免并发重复解码）
// - 解码失败缓存 null，不再重试
// ============================================================================

/** 每个波形默认的峰值桶数（足够不同缩放下下采样） */
const DEFAULT_BUCKETS = 400

const peakCache = new Map<string, Promise<Float32Array | null>>()

let sharedCtx: AudioContext | null = null

function audioContext(): AudioContext | null {
  if (sharedCtx) return sharedCtx
  try {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return null
    sharedCtx = new Ctor()
  } catch {
    sharedCtx = null
  }
  return sharedCtx
}

async function computePeaks(url: string, buckets: number): Promise<Float32Array | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const buf = await res.arrayBuffer()
    const ac = audioContext()
    if (!ac) return null
    const decoded = await ac.decodeAudioData(buf)
    const ch = decoded.getChannelData(0)
    if (!ch || ch.length === 0) return null

    const n = Math.max(1, Math.min(buckets, ch.length))
    const step = Math.floor(ch.length / n) || 1
    const peaks = new Float32Array(n)
    for (let i = 0; i < n; i++) {
      const start = i * step
      const end = Math.min(ch.length, start + step)
      let max = 0
      for (let j = start; j < end; j++) {
        const v = Math.abs(ch[j])
        if (v > max) max = v
      }
      peaks[i] = max
    }
    return peaks
  } catch {
    return null
  }
}

/** 取某音频的波形峰值（缓存；失败返回 null） */
export function getPeaks(url: string, buckets = DEFAULT_BUCKETS): Promise<Float32Array | null> {
  if (!url) return Promise.resolve(null)
  const key = `${url}|${buckets}`
  let p = peakCache.get(key)
  if (!p) {
    p = computePeaks(url, buckets)
    peakCache.set(key, p)
  }
  return p
}

/** 解码是否已成功（供 UI 决定是否画波形） */
export function hasWaveform(url: string): boolean {
  return peakCache.has(`${url}|${DEFAULT_BUCKETS}`)
}
