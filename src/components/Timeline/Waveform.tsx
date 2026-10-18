import React, { useEffect, useRef } from 'react'
import { getPeaks } from '../../services/waveform'

interface Props {
  url: string
  width: number
  height: number
  /** 只画音频的前 fraction 比例（片段被裁短时与播放一致） */
  fraction?: number
  color?: string
}

/**
 * 片段内的音频波形。离屏解码取峰值，用 canvas 画成对称波形。
 * 解码失败时静默不画（片段底色仍然可见），不影响时间轴使用。
 */
const Waveform: React.FC<Props> = ({
  url,
  width,
  height,
  fraction = 1,
  color = 'rgba(255,255,255,0.55)',
}) => {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    let alive = true
    void getPeaks(url).then((peaks) => {
      if (!alive) return
      const cv = ref.current
      if (!cv) return
      const ctx = cv.getContext('2d')
      if (!ctx) return

      const dpr = window.devicePixelRatio || 1
      const w = Math.max(1, Math.floor(width))
      const h = Math.max(1, Math.floor(height))
      cv.width = Math.floor(w * dpr)
      cv.height = Math.floor(h * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)

      if (!peaks || peaks.length === 0) return

      // 只展示前 fraction 段（与 currentTime 从片段起点开始播放一致）
      const usable = Math.max(1, Math.floor(peaks.length * Math.min(1, Math.max(0.01, fraction))))
      // 一列一个采样，避免过采样造成的锯齿
      const cols = Math.max(1, Math.min(w, usable))
      const mid = h / 2
      ctx.fillStyle = color
      for (let x = 0; x < cols; x++) {
        const idx = Math.min(peaks.length - 1, Math.floor((x / cols) * usable))
        const amp = peaks[idx] || 0
        const barH = Math.max(1, amp * h * 0.9)
        ctx.fillRect(x, mid - barH / 2, 1, barH)
      }
    })
    return () => {
      alive = false
    }
  }, [url, width, height, fraction, color])

  return <canvas ref={ref} className="tl-wave" style={{ width, height }} />
}

export default Waveform
