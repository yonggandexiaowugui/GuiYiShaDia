import React, { useEffect, useRef, useState, useCallback } from 'react'
import { useStore, totalDuration } from '../services/store'
import { audioEngine } from '../services/audioEngine'
import { collectImageUrls, drawScene, preloadImages } from '../services/sceneRenderer'
import { CATEGORY_TO_TRACK_TYPE } from '@shared/types'
import type { MaterialCategory, Track } from '@shared/types'

const CANVAS_W = 1080
const CANVAS_H = 1920
const LANDSCAPE_W = 1920
const LANDSCAPE_H = 1080

interface DragData {
  materialId: string
  category: MaterialCategory
}

/**
 * 预览专用装饰层（导出时不会出现）：底部信息条 + 空状态提示。
 * 视频画面本身由共用的 sceneRenderer.drawScene 渲染，保证所见即所得。
 */
function drawPreviewOverlay(
  ctx: CanvasRenderingContext2D,
  tracks: Track[],
  currentTime: number,
  total: number,
  w: number,
  h: number,
): void {
  const hasClips = tracks.some((t) => t.clips.length > 0)
  if (!hasClips) {
    ctx.fillStyle = '#333'
    ctx.fillRect(20, 80, w - 40, h - 160)
    ctx.strokeStyle = '#444'
    ctx.lineWidth = 2
    ctx.strokeRect(20, 80, w - 40, h - 160)
    ctx.fillStyle = '#e0e0e0'
    ctx.font = `bold ${Math.round(w / 15)}px "Microsoft YaHei", sans-serif`
    ctx.textAlign = 'center'
    ctx.fillText('🎬 预览区域', w / 2, h / 2 - 80)
    ctx.font = `${Math.round(w / 33)}px "Microsoft YaHei", sans-serif`
    ctx.fillStyle = '#888'
    ctx.fillText(`${w} × ${h}`, w / 2, h / 2 + 20)
    ctx.fillText('拖入素材到时间轴轨道开始制作', w / 2, h / 2 + 80)
    return
  }

  const names: string[] = []
  for (const t of tracks) {
    if (t.type === 'voice' || t.type === 'sfx') continue
    for (const c of t.clips) {
      if (currentTime >= c.start && currentTime < c.start + c.duration) names.push(c.name)
    }
  }
  ctx.fillStyle = 'rgba(0,0,0,0.5)'
  ctx.fillRect(0, h - 36, w, 36)
  ctx.fillStyle = '#aaa'
  ctx.font = `${Math.round(w / 50)}px "Microsoft YaHei", sans-serif`
  ctx.textAlign = 'left'
  ctx.fillText(names.join(' + ') || '无激活片段', 12, h - 10)
  ctx.textAlign = 'right'
  ctx.fillText(`${currentTime.toFixed(1)}s / ${total.toFixed(1)}s`, w - 12, h - 10)
}

// ---------------------------------------------------------------------------
// PreviewArea 组件
// ---------------------------------------------------------------------------
const PreviewArea: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const lastTimeRef = useRef<number>(0)
  const [dropHint, setDropHint] = useState(false)
  const [imgTick, setImgTick] = useState(0)
  const tracks = useStore((s) => s.tracks)
  const materials = useStore((s) => s.materials)
  const pushToast = useStore((s) => s.pushToast)
  const orientation = useStore((s) => s.orientation)
  const isPlaying = useStore((s) => s.isPlaying)
  const currentTime = useStore((s) => s.currentTime)
  const playbackRate = useStore((s) => s.playbackRate)
  const togglePlay = useStore((s) => s.togglePlay)
  const setCurrentTime = useStore((s) => s.setCurrentTime)
  const setPlaybackRate = useStore((s) => s.setPlaybackRate)
  const addClip = useStore((s) => s.addClip)
  const subtitleStyle = useStore((s) => s.subtitleStyle)

  const w = orientation === 'portrait' ? CANVAS_W : LANDSCAPE_W
  const h = orientation === 'portrait' ? CANVAS_H : LANDSCAPE_H
  const total = totalDuration(tracks)

  // 音频引擎：配置资源 URL，并在非播放状态（暂停 / 拖动播放头）下把音频对齐/静音
  useEffect(() => {
    audioEngine.setAssetUrl(window.api.assetUrl)
    if (!isPlaying) audioEngine.sync(tracks, materials, currentTime, false)
  }, [tracks, materials, currentTime, isPlaying])

  // 卸载时释放音频
  useEffect(() => () => audioEngine.dispose(), [])

  // 图片预热：轨道或素材变化时把用到的图都加载进缓存，加载完重绘一次
  useEffect(() => {
    let alive = true
    void preloadImages(collectImageUrls(tracks, materials, window.api.assetUrl)).then(() => {
      if (alive) setImgTick((v) => v + 1)
    })
    return () => {
      alive = false
    }
  }, [tracks, materials])

  // rAF 播放循环
  useEffect(() => {
    if (!isPlaying) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      return
    }

    lastTimeRef.current = performance.now()

    const loop = (now: number): void => {
      const dt = (now - lastTimeRef.current) / 1000
      lastTimeRef.current = now
      const st = useStore.getState()
      let t = st.currentTime + dt * st.playbackRate
      const total = totalDuration(st.tracks)
      if (t >= total) {
        t = 0
      }
      st.setCurrentTime(t)
      // 让配音 / 音效跟随播放头出声
      audioEngine.sync(st.tracks, st.materials, t, true)
      rafRef.current = requestAnimationFrame(loop)
    }

    rafRef.current = requestAnimationFrame(loop)
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [isPlaying, playbackRate])

  // 渲染画面（同步；图片已预热）
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    drawScene({
      ctx,
      tracks,
      materials,
      currentTime,
      width: w,
      height: h,
      assetUrl: window.api.assetUrl,
      subtitleStyle,
    })
    drawPreviewOverlay(ctx, tracks, currentTime, total, w, h)
  }, [tracks, materials, currentTime, w, h, total, imgTick, subtitleStyle])

  // 拖入素材到预览区：在当前时间插入到对应轨道
  const onDrop = (e: React.DragEvent): void => {
    e.preventDefault()
    setDropHint(false)
    const raw = e.dataTransfer.getData('text/guiyi-material')
    if (!raw) return
    let data: DragData
    try {
      data = JSON.parse(raw)
    } catch {
      pushToast('拖拽数据格式错误')
      return
    }
    const trackType = CATEGORY_TO_TRACK_TYPE[data.category]
    if (!trackType) {
      pushToast('该素材类型不支持拖入预览区')
      return
    }
    // 若该类型有多个图层，落到最后一条（最上层）
    const sameType = tracks.filter((t) => t.type === trackType)
    const track = sameType[sameType.length - 1]
    if (!track) {
      pushToast('找不到对应轨道')
      return
    }
    const clip = addClip(track.id, data.materialId, currentTime)
    if (clip) {
      pushToast(`已添加到「${track.name}」：${clip.name}`)
    }
  }

  const handleSeek = useCallback(
    (e: React.MouseEvent<HTMLDivElement>): void => {
      const rect = e.currentTarget.getBoundingClientRect()
      const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
      setCurrentTime(ratio * total)
    },
    [total, setCurrentTime],
  )

  return (
    <div
      className={`preview-area${dropHint ? ' drop-hint' : ''}`}
      onDragOver={(e) => {
        e.preventDefault()
        setDropHint(true)
      }}
      onDragLeave={() => setDropHint(false)}
      onDrop={onDrop}
    >
      <div className="canvas-frame" style={{ height: 'calc(100% - 80px)' }}>
        <canvas
          ref={canvasRef}
          width={w}
          height={h}
          style={{ width: 'auto', height: '100%', display: 'block' }}
        />
      </div>

      <div className="playback-bar">
        <button className="play-btn" onClick={togglePlay} title={isPlaying ? '暂停' : '播放'}>
          {isPlaying ? '⏸' : '▶'}
        </button>
        <div className="progress-track" onClick={handleSeek}>
          <div
            className="progress-fill"
            style={{ width: total > 0 ? `${(currentTime / total) * 100}%` : '0%' }}
          />
        </div>
        <span className="time-display">
          {currentTime.toFixed(1)}s / {total.toFixed(1)}s
        </span>
        {isPlaying && audioEngine.activeCount > 0 && (
          <span className="audio-badge" title="配音 / 音效正在播放">
            🔊 出声中 ×{audioEngine.activeCount}
          </span>
        )}
        <select
          className="rate-select"
          value={playbackRate}
          onChange={(e) => setPlaybackRate(Number(e.target.value))}
          title="播放速度"
        >
          <option value={0.5}>0.5x</option>
          <option value={1}>1x</option>
          <option value={1.5}>1.5x</option>
          <option value={2}>2x</option>
        </select>
      </div>

      {dropHint && <div className="drop-overlay">松开以在当前时间插入素材</div>}
    </div>
  )
}

export default PreviewArea
