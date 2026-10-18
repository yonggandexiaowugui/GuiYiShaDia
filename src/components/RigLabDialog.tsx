// ============================================================================
// 骨骼实验室（P1 占位验证 + P2 绑骨角色验证）
// - 占位模式：圆角色块验证骨树 / pivot / 插值
// - 绑骨模式：真实部件图按 manifest 对齐骨 pivot，表情贴图叠 head 局部空间
// 完全独立于主预览与时间轴，本地 state 驱动，不接入全局播放状态
// ============================================================================
import React, { useEffect, useRef, useState } from 'react'
import { BUILTIN_CLIPS, BUILTIN_RIG } from '@shared/rig'
import { BUILTIN_RIGGED_CHARACTER } from '@shared/characterRig'
import { buildWorldPose, samplePose } from '../services/rigEvaluator'
import type { SampledBone, WorldBone } from '../services/rigEvaluator'
import { partUrl, rigPartFiles, riggedAvailable } from '../services/rigParts'

const CANVAS_W = 460
const CANVAS_H = 560
/** 角色空间 → 画布：缩放与原点（脚底中心）位置 */
const SCALE = 1.15
const ORIGIN_X = CANVAS_W / 2
const ORIGIN_Y = 510

/** 部件绘制顺序：先四肢（下层），后躯干/头（上层） */
const DRAW_ORDER = [
  'thighL', 'shinL', 'thighR', 'shinR',
  'upperArmL', 'forearmL', 'handL', 'upperArmR', 'forearmR', 'handR',
  'root', 'hip', 'spine', 'neck', 'head',
]

const ALL_PART_FILES = rigPartFiles(BUILTIN_RIGGED_CHARACTER)
/** 生成脚本是否已跑过（缺图时引导用户执行脚本，不允许进入绑骨模式） */
const RIGGED_AVAILABLE = riggedAvailable(BUILTIN_RIGGED_CHARACTER)

type Mode = 'rigged' | 'placeholder'

function drawBackground(ctx: CanvasRenderingContext2D): void {
  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H)
  ctx.fillStyle = '#0e1013'
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H)
  // 地面参考线
  ctx.strokeStyle = '#2b3038'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(24, ORIGIN_Y + 0.5)
  ctx.lineTo(CANVAS_W - 24, ORIGIN_Y + 0.5)
  ctx.stroke()
}

/** 调试层：骨连接线 + pivot 圆点 + 骨名 */
function drawDebugOverlay(
  ctx: CanvasRenderingContext2D,
  world: Map<string, WorldBone>,
): void {
  ctx.strokeStyle = '#3a4048'
  ctx.lineWidth = 1
  for (const bone of BUILTIN_RIG.bones) {
    if (!bone.parentId) continue
    const w = world.get(bone.id)
    const pw = world.get(bone.parentId)
    if (!w || !pw) continue
    ctx.beginPath()
    ctx.moveTo(ORIGIN_X + pw.x * SCALE, ORIGIN_Y + pw.y * SCALE)
    ctx.lineTo(ORIGIN_X + w.x * SCALE, ORIGIN_Y + w.y * SCALE)
    ctx.stroke()
  }
  ctx.font = '10px "Microsoft YaHei", sans-serif'
  for (const bone of BUILTIN_RIG.bones) {
    const w = world.get(bone.id)
    if (!w) continue
    const px = ORIGIN_X + w.x * SCALE
    const py = ORIGIN_Y + w.y * SCALE
    ctx.fillStyle = '#e6a23c'
    ctx.beginPath()
    ctx.arc(px, py, 3, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#707986'
    ctx.textAlign = 'left'
    ctx.fillText(bone.name, px + 6, py + 3)
  }
}

/** 占位模式：圆角矩形部件 */
function drawPlaceholder(
  ctx: CanvasRenderingContext2D,
  world: Map<string, WorldBone>,
  showDebug: boolean,
): void {
  drawBackground(ctx)
  const boneById = new Map(BUILTIN_RIG.bones.map((b) => [b.id, b]))
  for (const id of DRAW_ORDER) {
    const bone = boneById.get(id)
    const w = world.get(id)
    if (!bone || !w) continue
    const px = ORIGIN_X + w.x * SCALE
    const py = ORIGIN_Y + w.y * SCALE
    const [pw, ph] = bone.partSize
    const [ox, oy] = bone.partOffset
    ctx.save()
    ctx.translate(px, py)
    ctx.rotate((w.angle * Math.PI) / 180)
    ctx.globalAlpha = 0.92
    ctx.fillStyle = bone.color
    ctx.beginPath()
    ctx.roundRect(
      (ox - pw / 2) * SCALE,
      (oy - ph / 2) * SCALE,
      pw * SCALE,
      ph * SCALE,
      6,
    )
    ctx.fill()
    ctx.restore()
  }
  if (showDebug) drawDebugOverlay(ctx, world)
}

/** 绑骨模式：真实部件图 + 表情叠加 */
function drawRigged(
  ctx: CanvasRenderingContext2D,
  world: Map<string, WorldBone>,
  images: Map<string, HTMLImageElement>,
  exprImage: HTMLImageElement | undefined,
  showDebug: boolean,
): void {
  drawBackground(ctx)

  // 脚下投影（静置，不随骨变换）
  ctx.fillStyle = 'rgba(0, 0, 0, 0.35)'
  ctx.beginPath()
  ctx.ellipse(ORIGIN_X, ORIGIN_Y - 2, 66 * SCALE, 10 * SCALE, 0, 0, Math.PI * 2)
  ctx.fill()

  const char = BUILTIN_RIGGED_CHARACTER
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'

  for (const boneId of DRAW_ORDER) {
    const part = char.parts.find((p) => p.boneId === boneId)
    if (!part) continue
    const w = world.get(boneId)
    const img = images.get(part.image)
    if (!w || !img) continue
    ctx.save()
    ctx.translate(ORIGIN_X + w.x * SCALE, ORIGIN_Y + w.y * SCALE)
    ctx.rotate((w.angle * Math.PI) / 180)
    ctx.drawImage(
      img,
      -part.pivotX * part.width * SCALE,
      -part.pivotY * part.height * SCALE,
      part.width * SCALE,
      part.height * SCALE,
    )
    ctx.restore()
  }

  // 表情贴图：叠在 head 层上方，跟随 head 骨世界变换（脸不挂骨，永不拉申变形）
  const hw = world.get('head')
  if (hw && exprImage) {
    const f = char.face
    ctx.save()
    ctx.translate(ORIGIN_X + hw.x * SCALE, ORIGIN_Y + hw.y * SCALE)
    ctx.rotate((hw.angle * Math.PI) / 180)
    ctx.drawImage(
      exprImage,
      (f.offsetX - f.width / 2) * SCALE,
      (f.offsetY - f.height / 2) * SCALE,
      f.width * SCALE,
      f.height * SCALE,
    )
    ctx.restore()
  }

  if (showDebug) drawDebugOverlay(ctx, world)
}

interface Props {
  onClose: () => void
}

const RigLabDialog: React.FC<Props> = ({ onClose }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef(0)
  const lastRef = useRef(0)
  const timeRef = useRef(0)
  const [mode, setMode] = useState<Mode>(RIGGED_AVAILABLE ? 'rigged' : 'placeholder')
  const [clipId, setClipId] = useState(BUILTIN_CLIPS[0].id)
  const [exprId, setExprId] = useState(BUILTIN_RIGGED_CHARACTER.expressions[0].id)
  const [showDebug, setShowDebug] = useState(true)
  const [playing, setPlaying] = useState(true)
  const [time, setTime] = useState(0)
  const [images, setImages] = useState<Map<string, HTMLImageElement> | null>(null)

  const clip = BUILTIN_CLIPS.find((c) => c.id === clipId) ?? BUILTIN_CLIPS[0]

  // 预载全部部件图 + 表情贴图（仅绑骨模式需要）
  useEffect(() => {
    if (!RIGGED_AVAILABLE) return
    let alive = true
    const files = [...new Set(ALL_PART_FILES)]
    Promise.all(
      files.map(
        (f) =>
          new Promise<[string, HTMLImageElement]>((resolve, reject) => {
            const img = new Image()
            img.onload = () => resolve([f, img])
            img.onerror = () => reject(new Error(`部件图加载失败: ${f}`))
            img.src = partUrl(f) as string
          }),
      ),
    )
      .then((list) => {
        if (alive) setImages(new Map(list))
      })
      .catch(() => {
        if (alive) setImages(null)
      })
    return () => {
      alive = false
    }
  }, [])

  // 采样 + 世界变换（14 骨成本可忽略，渲染帧与侧栏共用同一份结果）
  const sampled = samplePose(BUILTIN_RIG, clip, time)
  const world = buildWorldPose(BUILTIN_RIG, sampled)

  // rAF 播放循环（非循环 clip 播完自动停）
  useEffect(() => {
    if (!playing) return
    lastRef.current = performance.now()
    const tick = (now: number): void => {
      const dt = (now - lastRef.current) / 1000
      lastRef.current = now
      let nt = timeRef.current + dt
      if (!clip.loop && nt >= clip.duration) {
        nt = clip.duration
        setPlaying(false)
      }
      timeRef.current = nt
      setTime(nt)
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [playing, clip])

  // 卸载兜底
  useEffect(() => () => cancelAnimationFrame(rafRef.current), [])

  // 画布绘制
  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    if (mode === 'rigged' && images) {
      const expr = BUILTIN_RIGGED_CHARACTER.expressions.find((e) => e.id === exprId)
      drawRigged(ctx, world, images, expr ? images.get(expr.image) : undefined, showDebug)
    } else {
      drawPlaceholder(ctx, world, showDebug)
    }
    // world 每帧由 time 驱动重新计算，此处只需跟随状态重绘
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [time, clipId, mode, exprId, showDebug, images])

  const seek = (v: number): void => {
    timeRef.current = v
    setTime(v)
  }

  const switchClip = (id: string): void => {
    setClipId(id)
    seek(0)
    setPlaying(true)
  }

  const clampedCount = [...sampled.values()].filter((s) => s.clamped).length

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal rig-lab-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span>骨骼实验室 · {mode === 'rigged' ? 'P2 绑骨角色验证' : 'P1 骨架验证'}</span>
          <button className="ghost" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body rig-lab-body">
          <canvas ref={canvasRef} width={CANVAS_W} height={CANVAS_H} className="rig-lab-canvas" />
          <div className="rig-lab-side">
            <div className="rig-lab-clips">
              <button
                className={mode === 'rigged' ? 'active' : ''}
                disabled={!RIGGED_AVAILABLE}
                title={RIGGED_AVAILABLE ? '' : '部件图缺失：请先执行 node scripts/generate-rig-character.mjs'}
                onClick={() => setMode('rigged')}
              >
                真实部件
              </button>
              <button
                className={mode === 'placeholder' ? 'active' : ''}
                onClick={() => setMode('placeholder')}
              >
                占位块
              </button>
            </div>
            <div className="rig-lab-clips">
              {BUILTIN_CLIPS.map((c) => (
                <button
                  key={c.id}
                  className={c.id === clipId ? 'active' : ''}
                  onClick={() => switchClip(c.id)}
                >
                  {c.name}（{c.id}）
                </button>
              ))}
            </div>
            {mode === 'rigged' && (
              <div className="rig-lab-clips">
                {BUILTIN_RIGGED_CHARACTER.expressions.map((e) => (
                  <button
                    key={e.id}
                    className={e.id === exprId ? 'active' : ''}
                    onClick={() => setExprId(e.id)}
                  >
                    {e.name}
                  </button>
                ))}
              </div>
            )}
            <div className="rig-lab-controls">
              <button onClick={() => setPlaying((v) => !v)}>{playing ? '⏸ 暂停' : '▶ 播放'}</button>
              <input
                type="range"
                min={0}
                max={clip.duration}
                step={0.01}
                value={Math.min(time, clip.duration)}
                onChange={(e) => {
                  setPlaying(false)
                  seek(Number(e.target.value))
                }}
              />
              <span className="text-dim">
                {time.toFixed(2)} / {clip.duration.toFixed(1)}s
              </span>
            </div>
            <label className="rig-lab-debug">
              <input
                type="checkbox"
                checked={showDebug}
                onChange={(e) => setShowDebug(e.target.checked)}
              />
              骨架标注
            </label>
            <div className="rig-bone-list">
              {BUILTIN_RIG.bones.map((b) => {
                const s = sampled.get(b.id) as SampledBone
                return (
                  <div key={b.id} className={`rig-bone-row${s.clamped ? ' clamped' : ''}`}>
                    <span>{b.name}</span>
                    <span className="deg">
                      {s.angle.toFixed(1)}°{s.clamped ? ' ⚠ 限幅' : ''}
                    </span>
                  </div>
                )
              })}
            </div>
            <div className="rig-lab-hint">
              {mode === 'rigged'
                ? clampedCount > 0
                  ? `${clampedCount} 根骨被限幅截断（已标红）· 检查四肢接缝与表情对齐`
                  : '全部骨角度均在限幅区间内 · 检查四肢接缝与表情对齐'
                : clampedCount > 0
                  ? `${clampedCount} 根骨被限幅截断（原始值超出允许区间，已标红）`
                  : '全部骨角度均在限幅区间内 · 占位部件仅用于验证骨树 / pivot / 插值'}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default RigLabDialog
