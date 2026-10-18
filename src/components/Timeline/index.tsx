// ============================================================================
// 时间轴（轨道驱动，类剪映交互）：
//  - 多轨道纵向排列，同类型可叠加多层（多条素材叠加）
//  - Clip 拖动 / 拉伸 / 裁剪 / 跨轨道移动 / 复制 / 删除
//  - 标尺与空白处点击可拖动播放头（scrub）
//  - 吸附到播放头与相邻片段边缘
//  - 撤销 / 重做
// ============================================================================
import React, { useEffect, useRef, useState } from 'react'
import type {
  DragEvent as ReactDragEvent,
  PointerEvent as ReactPointerEvent,
  MouseEvent as ReactMouseEvent,
  WheelEvent as ReactWheelEvent,
} from 'react'
import { useStore } from '../../services/store'
import { totalDuration } from '../../services/timelineUtils'
import { CATEGORY_TO_TRACK_TYPE, TRACK_COLORS } from '@shared/types'
import type { Clip, Track, TrackType } from '@shared/types'
import Ruler from './Ruler'
import Playhead from './Playhead'
import Waveform from './Waveform'

/** 轨道垂直顺序（上层在上） */
const TRACK_ORDER: TrackType[] = ['effect', 'expression', 'character', 'scene', 'voice', 'sfx']

/** 允许拖入的素材分类 */
const DROP_ALLOWED: Record<TrackType, string[]> = {
  scene: ['场景'],
  character: ['角色'],
  expression: ['表情'],
  effect: ['特效'],
  voice: [],
  sfx: ['音效', '音乐'],
}

const CLIP_ICON: Record<TrackType, string> = {
  scene: '🖼',
  character: '🧍',
  expression: '😀',
  effect: '✨',
  voice: '🎙',
  sfx: '🔊',
}

const TYPE_LABEL: Record<TrackType, string> = {
  scene: '场景',
  character: '角色',
  expression: '表情',
  effect: '特效',
  voice: '配音',
  sfx: '音效',
}

const SNAP_PX = 8

/** 左侧轨道标签列宽度：所有时间轴内容整体右移这么多，避免被粘性标签遮住 */
const LABEL_W = 64

type DragMode =
  | { mode: 'move'; trackId: string; clipId: string; grabX: number; duration: number }
  | {
      /** 群组拖动：锚点片段为光标抓取的那个，origins 为拖动前各选中片段的起点 */
      mode: 'group'
      anchorTrackId: string
      anchorClipId: string
      anchorStart: number
      anchorDur: number
      grabX: number
      origins: Array<{ clipId: string; start: number }>
    }
  | { mode: 'resize'; trackId: string; clipId: string; edge: 'l' | 'r'; origStart: number; origDur: number }
  | { mode: 'marquee'; startX: number; startY: number; baseIds: string[] }
  | { mode: 'scrub' }

/** 判定为「拖动」而不是「点击」的最小位移（px） */
const DRAG_THRESHOLD = 4

/** 吸附：把 value 吸附到最近的候选点上（阈值内） */
function snapValue(value: number, candidates: number[], threshold: number): number {
  let best = value
  let bestDist = threshold
  for (const c of candidates) {
    const d = Math.abs(value - c)
    if (d < bestDist) {
      bestDist = d
      best = c
    }
  }
  return best
}

const Timeline: React.FC = () => {
  const tracks = useStore((s) => s.tracks)
  const materials = useStore((s) => s.materials)
  const selectedIds = useStore((s) => s.selectedIds)
  const selectClip = useStore((s) => s.selectClip)
  const addClip = useStore((s) => s.addClip)
  const deleteClip = useStore((s) => s.deleteClip)
  const duplicateClip = useStore((s) => s.duplicateClip)
  const moveClip = useStore((s) => s.moveClip)
  const moveClipToTrack = useStore((s) => s.moveClipToTrack)
  const resizeClip = useStore((s) => s.resizeClip)
  const addTrack = useStore((s) => s.addTrack)
  const deleteTrack = useStore((s) => s.deleteTrack)
  const beginInteraction = useStore((s) => s.beginInteraction)
  const moveClipsAsGroup = useStore((s) => s.moveClipsAsGroup)
  const setSelection = useStore((s) => s.setSelection)
  const undo = useStore((s) => s.undo)
  const redo = useStore((s) => s.redo)
  const snapEnabled = useStore((s) => s.snapEnabled)
  const setSnapEnabled = useStore((s) => s.setSnapEnabled)
  const px = useStore((s) => s.pxPerSec)
  const setPxPerSec = useStore((s) => s.setPxPerSec)
  const zoomBy = useStore((s) => s.zoomBy)
  const pushToast = useStore((s) => s.pushToast)

  const scrollRef = useRef<HTMLDivElement>(null)
  const areaRef = useRef<HTMLDivElement>(null)
  const dragState = useRef<DragMode | null>(null)
  const justDragged = useRef(false)
  const [dragging, setDragging] = useState<string | null>(null)
  const [dropHint, setDropHint] = useState<string | null>(null)
  const [marquee, setMarquee] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  const [addMenu, setAddMenu] = useState(false)
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; trackId: string; clipId: string } | null>(null)

  const total = totalDuration(tracks)
  const trackWidth = Math.max(LABEL_W + total * px + 200, 400)

  // 按类型顺序稳定排序（同类型内保持插入顺序，支持多层叠加）
  const orderedTracks = React.useMemo(
    () => [...tracks].sort((a, b) => TRACK_ORDER.indexOf(a.type) - TRACK_ORDER.indexOf(b.type)),
    [tracks],
  )

  // 全局指针处理
  useEffect(() => {
    const onMove = (e: PointerEvent): void => {
      const ds = dragState.current
      if (!ds || !areaRef.current) return
      const rect = areaRef.current.getBoundingClientRect()
      const x = e.clientX - rect.left - LABEL_W
      const st = useStore.getState()
      const p = st.pxPerSec
      const t = Math.max(0, x / p)

      if (ds.mode === 'scrub') {
        st.setCurrentTime(t)
        return
      }

      if (ds.mode === 'marquee') {
        const x1 = ds.startX - rect.left
        const y1 = ds.startY - rect.top
        const x2 = e.clientX - rect.left
        const y2 = e.clientY - rect.top
        if (Math.abs(x2 - x1) > DRAG_THRESHOLD || Math.abs(y2 - y1) > DRAG_THRESHOLD) {
          justDragged.current = true
        }
        setMarquee({
          x: Math.min(x1, x2),
          y: Math.min(y1, y2),
          w: Math.abs(x2 - x1),
          h: Math.abs(y2 - y1),
        })
        // 命中测试用片段的实际 DOM 矩形，可跨轨道一并框选
        const sel = {
          left: Math.min(ds.startX, e.clientX),
          top: Math.min(ds.startY, e.clientY),
          right: Math.max(ds.startX, e.clientX),
          bottom: Math.max(ds.startY, e.clientY),
        }
        const hits: string[] = []
        areaRef.current.querySelectorAll<HTMLElement>('[data-clip-id]').forEach((el) => {
          const r = el.getBoundingClientRect()
          if (r.left < sel.right && r.right > sel.left && r.top < sel.bottom && r.bottom > sel.top) {
            hits.push(el.dataset.clipId!)
          }
        })
        setSelection(ds.baseIds.length > 0 ? [...new Set([...ds.baseIds, ...hits])] : hits)
        return
      }

      if (ds.mode === 'group') {
        // 群组平移：只做时间轴方向移动，保持组内相对位置
        const cands: number[] = [0, st.currentTime]
        st.tracks.forEach((tr) =>
          tr.clips.forEach((c) => {
            if (!st.selectedIds.includes(c.id)) {
              cands.push(c.start)
              cands.push(c.start + c.duration)
            }
          }),
        )
        const th = SNAP_PX / p
        let targetDelta = t - ds.grabX - ds.anchorStart
        if (st.snapEnabled) {
          const anchorTarget = ds.anchorStart + targetDelta
          const snappedStart = snapValue(anchorTarget, cands, th)
          const snappedEnd = snapValue(anchorTarget + ds.anchorDur, cands, th)
          let snapped = anchorTarget
          if (snappedStart !== anchorTarget) snapped = snappedStart
          else if (snappedEnd !== anchorTarget + ds.anchorDur) snapped = snappedEnd - ds.anchorDur
          targetDelta = snapped - ds.anchorStart
        }
        moveClipsAsGroup(ds.origins, targetDelta)
        justDragged.current = true
        return
      }

      if (ds.mode === 'move') {
        let newStart = Math.max(0, t - ds.grabX)
        // 目标轨道：光标下的 lane
        const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null
        const laneEl = el?.closest('[data-track-id]') as HTMLElement | null
        const toTrackId = laneEl?.dataset.trackId ?? ds.trackId

        if (st.snapEnabled) {
          const cands: number[] = [0, st.currentTime]
          st.tracks
            .find((x) => x.id === toTrackId)
            ?.clips.forEach((c) => {
              if (c.id !== ds.clipId) {
                cands.push(c.start)
                cands.push(c.start + c.duration)
              }
            })
          const th = SNAP_PX / p
          const snappedStart = snapValue(newStart, cands, th)
          const snappedEnd = snapValue(newStart + ds.duration, cands, th)
          if (snappedStart !== newStart) newStart = snappedStart
          else if (snappedEnd !== newStart + ds.duration) newStart = snappedEnd - ds.duration
        }
        newStart = Math.max(0, newStart)

        if (toTrackId !== ds.trackId) {
          moveClipToTrack(ds.clipId, ds.trackId, toTrackId, newStart)
          ds.trackId = toTrackId
        } else {
          moveClip(ds.trackId, ds.clipId, newStart)
        }
        justDragged.current = true
      } else if (ds.mode === 'resize') {
        const st2 = useStore.getState()
        const cands: number[] = [0, st2.currentTime]
        st2.tracks
          .find((x) => x.id === ds.trackId)
          ?.clips.forEach((c) => {
            if (c.id !== ds.clipId) {
              cands.push(c.start)
              cands.push(c.start + c.duration)
            }
          })
        const th = SNAP_PX / p
        if (ds.edge === 'r') {
          const edge = snapValue(t, cands, th)
          const dur = Math.max(0.2, edge - ds.origStart)
          resizeClip(ds.trackId, ds.clipId, 'r', ds.origStart + dur)
        } else {
          const right = ds.origStart + ds.origDur
          const newStart = Math.max(0, Math.min(snapValue(t, cands, th), right - 0.2))
          resizeClip(ds.trackId, ds.clipId, 'l', newStart)
        }
        justDragged.current = true
      }
    }
    const onUp = (e: PointerEvent): void => {
      const ds = dragState.current
      dragState.current = null
      setDragging(null)
      setMarquee(null)
      document.body.style.cursor = ''
      if (ds?.mode === 'marquee' && !justDragged.current && ds.baseIds.length === 0) {
        // 未拖动 → 视为点击空白：移动播放头并清空选择
        const rect = areaRef.current?.getBoundingClientRect()
        if (rect) {
          const st = useStore.getState()
          st.setCurrentTime(Math.max(0, (e.clientX - rect.left - LABEL_W) / st.pxPerSec))
        }
        setSelection([])
      } else if (ds?.mode === 'group' && !justDragged.current) {
        // 群组内点击（未拖动）→ 收敛为单选
        setSelection([ds.anchorClipId])
      }
      setTimeout(() => {
        justDragged.current = false
      }, 0)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [moveClip, moveClipToTrack, resizeClip, moveClipsAsGroup, setSelection])

  // 关闭菜单
  useEffect(() => {
    const close = (): void => {
      setCtxMenu(null)
      setAddMenu(false)
    }
    if (ctxMenu || addMenu) {
      window.addEventListener('click', close)
      return () => window.removeEventListener('click', close)
    }
  }, [ctxMenu, addMenu])

  const onWheel = (e: ReactWheelEvent): void => {
    if (!scrollRef.current) return
    if (e.ctrlKey) {
      zoomBy(e.deltaY < 0 ? 1.1 : 1 / 1.1)
    } else {
      scrollRef.current.scrollLeft += e.deltaY || e.deltaX || 0
    }
  }

  // 空白 / 标尺：拖动播放头
  const scrubTo = (clientX: number): void => {
    if (!areaRef.current) return
    const rect = areaRef.current.getBoundingClientRect()
    const t = Math.max(0, (clientX - rect.left - LABEL_W) / px)
    useStore.getState().setCurrentTime(t)
  }

  const startScrub = (e: { clientX: number }): void => {
    scrubTo(e.clientX)
    dragState.current = { mode: 'scrub' }
    selectClip(null)
  }

  // 纯 click（无 pointer 事件的环境，如自动化点击）也能移动播放头
  const startScrubClick = (e: ReactMouseEvent): void => {
    if (justDragged.current) return
    scrubTo(e.clientX)
    selectClip(null)
  }

  // 轨道空白处按下：开始框选；若未拖动则视为点击空白（移动播放头并清空选择）
  const onLaneDown = (e: ReactPointerEvent): void => {
    if (e.button !== 0) return
    if ((e.target as HTMLElement).closest('.lane-label')) return
    const additive = e.ctrlKey || e.metaKey || e.shiftKey
    dragState.current = {
      mode: 'marquee',
      startX: e.clientX,
      startY: e.clientY,
      baseIds: additive ? useStore.getState().selectedIds : [],
    }
    document.body.style.cursor = 'crosshair'
    if (!additive) setSelection([])
  }

  // 轨道拖放
  const makeTrackDrop = (track: Track) => (e: ReactDragEvent): void => {
    e.preventDefault()
    setDropHint(null)
    const raw = e.dataTransfer.getData('text/guiyi-material')
    if (!raw || !areaRef.current) return
    try {
      const data = JSON.parse(raw) as { materialId: string; category: string }
      const allowed = DROP_ALLOWED[track.type]
      if (allowed.length > 0 && !allowed.includes(data.category)) {
        pushToast(`「${track.name}」轨道只能接收${allowed.join('/')}素材`)
        return
      }
      if (track.type === 'voice') {
        pushToast('配音轨道请用「AI 剧本」或属性面板添加')
        return
      }
      const rect = areaRef.current.getBoundingClientRect()
      let start = Math.max(0, (e.clientX - rect.left - LABEL_W) / px)
      const st = useStore.getState()
      if (st.snapEnabled) start = snapValue(start, [0, st.currentTime], SNAP_PX / px)
      addClip(track.id, data.materialId, start)
      pushToast(`已添加到「${track.name}」`)
    } catch {
      pushToast('拖拽数据格式错误')
    }
  }

  const onClipDown = (e: ReactPointerEvent, trackId: string, clipId: string, duration: number): void => {
    e.stopPropagation()
    e.preventDefault()
    // Ctrl/Cmd 多选、Shift 区间选：只改选中状态，不进入拖动
    if (e.ctrlKey || e.metaKey) {
      selectClip({ trackId, clipId }, 'toggle')
      return
    }
    if (e.shiftKey) {
      selectClip({ trackId, clipId }, 'range')
      return
    }
    if (!areaRef.current) return
    const rect = areaRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left - LABEL_W
    const st = useStore.getState()
    const c = st.tracks.find((t) => t.id === trackId)?.clips.find((k) => k.id === clipId)
    if (!c) return

    // 已在多选集合内 → 直接进入群组拖动（不改变选择，整体平移）
    const inMulti = st.selectedIds.length > 1 && st.selectedIds.includes(clipId)
    if (!inMulti) selectClip({ trackId, clipId })
    beginInteraction()

    if (inMulti) {
      const origins = st.tracks
        .flatMap((t) => t.clips)
        .filter((k) => st.selectedIds.includes(k.id))
        .map((k) => ({ clipId: k.id, start: k.start }))
      dragState.current = {
        mode: 'group',
        anchorTrackId: trackId,
        anchorClipId: clipId,
        anchorStart: c.start,
        anchorDur: c.duration,
        grabX: x - c.start * st.pxPerSec,
        origins,
      }
    } else {
      dragState.current = { mode: 'move', trackId, clipId, grabX: x - c.start * st.pxPerSec, duration }
    }
    setDragging(clipId)
    document.body.style.cursor = 'grabbing'
  }

  /** 按住播放头开始拖动 */
  const onPlayheadDown = (e: ReactPointerEvent): void => {
    e.stopPropagation()
    dragState.current = { mode: 'scrub' }
    document.body.style.cursor = 'ew-resize'
  }

  const onHandleDown = (e: ReactPointerEvent, edge: 'l' | 'r', trackId: string, clipId: string): void => {
    e.stopPropagation()
    e.preventDefault()
    const st = useStore.getState()
    const c = st.tracks.find((t) => t.id === trackId)?.clips.find((k) => k.id === clipId)
    if (!c) return
    beginInteraction()
    dragState.current = { mode: 'resize', trackId, clipId, edge, origStart: c.start, origDur: c.duration }
    setDragging(clipId)
    document.body.style.cursor = 'ew-resize'
  }

  return (
    <footer className="timeline timeline-editor">
      <div className="tl-toolbar">
        <span className="tl-title">🎞 时间轴</span>
        <span className="tl-meta">共 {total.toFixed(1)}s</span>
        <button className="btn" onClick={undo} title="撤销 (Ctrl+Z)">↶ 撤销</button>
        <button className="btn" onClick={redo} title="重做 (Ctrl+Shift+Z)">↷ 重做</button>
        <button
          className={`btn${snapEnabled ? ' active' : ''}`}
          onClick={() => setSnapEnabled(!snapEnabled)}
          title="吸附到播放头 / 相邻片段"
        >
          🧲 吸附{snapEnabled ? '开' : '关'}
        </button>
        <div className="tl-add-wrap">
          <button className="btn" onClick={(e) => { e.stopPropagation(); setAddMenu((v) => !v) }}>
            ＋ 新增轨道
          </button>
          {addMenu && (
            <div className="tl-add-menu" onClick={(e) => e.stopPropagation()}>
              {TRACK_ORDER.map((type) => (
                <button
                  key={type}
                  onClick={() => {
                    addTrack(type)
                    setAddMenu(false)
                  }}
                >
                  ＋ {TYPE_LABEL[type]}层
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="tl-spacer" />
        <div className="tl-zoom">
          <button className="btn icon" onClick={() => zoomBy(1 / 1.3)} title="缩小">－</button>
          <span className="tl-zoom-val">{Math.round(px)}px/s</span>
          <button className="btn icon" onClick={() => zoomBy(1.3)} title="放大">＋</button>
          <button className="btn icon" onClick={() => setPxPerSec(80)} title="重置缩放">⊙</button>
        </div>
      </div>

      <div className="tl-scroll" ref={scrollRef} onWheel={onWheel}>
        <div className="tl-track-area" ref={areaRef} style={{ width: trackWidth }}>
          <div onPointerDown={startScrub} onClick={startScrubClick}>
            <Ruler total={total} px={px} offset={LABEL_W} />
          </div>

          {orderedTracks.map((track) => {
            const sameType = orderedTracks.filter((t) => t.type === track.type)
            const ordinal = sameType.findIndex((t) => t.id === track.id) + 1
            const label = sameType.length > 1 ? `${track.name}` : track.name
            return (
              <div
                key={track.id}
                className={`tl-lane${dropHint === track.id ? ' drop-hint' : ''}`}
                data-track-id={track.id}
                style={{ borderLeftColor: TRACK_COLORS[track.type] }}
                onDragOver={(e) => {
                  e.preventDefault()
                  setDropHint(track.id)
                }}
                onDragLeave={() => setDropHint(null)}
                onDrop={makeTrackDrop(track)}
                onPointerDown={onLaneDown}
                onClick={startScrubClick}
              >
                <span className="lane-label" style={{ color: TRACK_COLORS[track.type] }}>
                  {label}
                  {sameType.length > 1 && <span className="lane-ord">{ordinal}</span>}
                  <span
                    className="lane-add"
                    title="新增同类型轨道"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation()
                      addTrack(track.type)
                    }}
                  >
                    ＋
                  </span>
                  <span
                    className="lane-del"
                    title="删除该轨道"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation()
                      deleteTrack(track.id)
                    }}
                  >
                    ×
                  </span>
                </span>

                {track.clips.map((c) => {
                  const left = LABEL_W + c.start * px
                  const width = Math.max(12, c.duration * px)
                  const isSelected = selectedIds.includes(c.id)
                  const isDragging = dragging === c.id
                  // 音频片段：取到音频 URL 用于画波形
                  let waveUrl: string | null = null
                  if (track.type === 'voice' && c.voiceFile) {
                    waveUrl = window.api.assetUrl(c.voiceFile)
                  } else if (track.type === 'sfx' && c.materialId) {
                    const mat = materials.find((m) => m.id === c.materialId)
                    if (mat) waveUrl = window.api.assetUrl(mat.file_path)
                  }
                  const waveFraction =
                    c.sourceDuration && c.sourceDuration > 0
                      ? Math.min(1, c.duration / c.sourceDuration)
                      : 1
                  // 配音片段：提示字幕是否被独立修改/关闭
                  const subtitleNote =
                    track.type === 'voice' && c.subtitle !== undefined
                      ? c.subtitle.trim() === ''
                        ? '\n字幕：已关闭'
                        : `\n字幕：${c.subtitle}`
                      : ''
                  return (
                    <div
                      key={c.id}
                      data-clip-id={c.id}
                      className={`tl-clip${isSelected ? ' selected' : ''}${isDragging ? ' dragging' : ''}`}
                      style={{ left, width, background: TRACK_COLORS[track.type] }}
                      title={`${CLIP_ICON[track.type]} ${c.name}\n${c.duration.toFixed(1)}s · 起点 ${c.start.toFixed(1)}s${subtitleNote}\n拖动移动 · 边缘拉伸 · 可跨轨道 · 右键菜单`}
                      onPointerDown={(e) => onClipDown(e, track.id, c.id, c.duration)}
                      onClick={(e) => {
                        e.stopPropagation()
                        if (justDragged.current) return
                        if (e.ctrlKey || e.metaKey) {
                          selectClip({ trackId: track.id, clipId: c.id }, 'toggle')
                          return
                        }
                        if (e.shiftKey) {
                          selectClip({ trackId: track.id, clipId: c.id }, 'range')
                          return
                        }
                        selectClip({ trackId: track.id, clipId: c.id }, 'replace')
                      }}
                      onContextMenu={(e: ReactMouseEvent) => {
                        e.preventDefault()
                        e.stopPropagation()
                        setCtxMenu({ x: e.clientX, y: e.clientY, trackId: track.id, clipId: c.id })
                      }}
                    >
                      {waveUrl && (
                        <Waveform
                          url={waveUrl}
                          width={Math.max(1, width - 2)}
                          height={26}
                          fraction={waveFraction}
                        />
                      )}
                      <span className="tl-clip-text">
                        {CLIP_ICON[track.type]} {c.name}
                      </span>
                      <span className="tl-handle tl-handle-l" onPointerDown={(e) => onHandleDown(e, 'l', track.id, c.id)} />
                      <span className="tl-handle tl-handle-r" onPointerDown={(e) => onHandleDown(e, 'r', track.id, c.id)} />
                    </div>
                  )
                })}

                {track.clips.length === 0 && (
                  <span className="lane-hint">
                    {track.type === 'voice'
                      ? '由「AI 剧本」自动生成'
                      : `拖入「${label}」素材，或从其它轨道拖入片段`}
                  </span>
                )}
              </div>
            )
          })}

          {/* 框选选择框 */}
          {marquee && (
            <div
              className="tl-marquee"
              style={{ left: marquee.x, top: marquee.y, width: marquee.w, height: marquee.h }}
            />
          )}

          {/* 播放头（独立组件，避免整条时间轴每帧重渲染） */}
          <Playhead labelWidth={LABEL_W} onScrubStart={onPlayheadDown} />
        </div>
      </div>

      {ctxMenu && (
        <div className="ctx-menu" style={{ left: ctxMenu.x, top: ctxMenu.y }} onClick={(e) => e.stopPropagation()}>
          <div
            className="ctx-item"
            onClick={() => {
              duplicateClip(ctxMenu.trackId, ctxMenu.clipId)
              setCtxMenu(null)
            }}
          >
            复制片段
          </div>
          <div
            className="ctx-item danger"
            onClick={() => {
              deleteClip(ctxMenu.trackId, ctxMenu.clipId)
              setCtxMenu(null)
            }}
          >
            删除片段
          </div>
        </div>
      )}
    </footer>
  )
}

export default Timeline
