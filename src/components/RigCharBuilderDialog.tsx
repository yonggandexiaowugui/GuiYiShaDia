// ============================================================================
// 组装绑骨角色（P5 用户侧轻编辑）：先选槽位 → 点素材图填入 → 实时预览 → 保存
// 几何/骨骼/pivot 全部沿用内置 manifest，用户只换"皮"，零绑骨知识
// 未选槽位回退内置小方部件，随时可看当前组合的动画效果
// ============================================================================
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../services/store'
import { BUILTIN_CLIPS, BUILTIN_RIG } from '@shared/rig'
import { BUILTIN_RIGGED_CHARACTER } from '@shared/characterRig'
import type { CharacterRig } from '@shared/characterRig'
import { buildWorldPose, samplePose } from '../services/rigEvaluator'
import { partUrl, rigPartFiles } from '../services/rigParts'
import { drawRiggedCharacterPreview } from '../services/rigDraw'

const CANVAS_W = 340
const CANVAS_H = 440
const SCALE = 0.9
const ORIGIN_X = CANVAS_W / 2
const ORIGIN_Y = 400

/** 可作部件皮的图片素材分类 */
const IMG_CATEGORIES = ['场景', '角色', '表情', '特效']

const PART_LABELS: Record<string, string> = {
  'head.png': '头部',
  'torso.png': '躯干',
  'hip.png': '胯部',
  'neck.png': '脖子',
  'upper-arm.png': '大臂（左右共用）',
  'forearm.png': '小臂（左右共用）',
  'hand.png': '手掌（左右共用）',
  'thigh.png': '大腿（左右共用）',
  'shin.png': '小腿（左右共用）',
}

type SlotKind = 'part' | 'expr'

function drawBackground(ctx: CanvasRenderingContext2D): void {
  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H)
  ctx.fillStyle = '#0e1013' // 与 RigLab 预览底色一致（canvas 不支持 CSS 变量）
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H)
  ctx.strokeStyle = '#2b3038'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(20, ORIGIN_Y + 0.5)
  ctx.lineTo(CANVAS_W - 20, ORIGIN_Y + 0.5)
  ctx.stroke()
}

const RigCharBuilderDialog: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const materials = useStore((s) => s.materials)
  const loadMaterials = useStore((s) => s.loadMaterials)
  const pushToast = useStore((s) => s.pushToast)

  const [name, setName] = useState('')
  const [slots, setSlots] = useState<Record<string, string | undefined>>({})
  const [exprSlots, setExprSlots] = useState<Record<string, string | undefined>>({})
  const [sel, setSel] = useState<{ kind: SlotKind; key: string }>({ kind: 'part', key: 'head.png' })
  const [clipId, setClipId] = useState(BUILTIN_CLIPS[0].id)
  const [exprId, setExprId] = useState(BUILTIN_RIGGED_CHARACTER.expressions[0].id)
  const [playing, setPlaying] = useState(true)
  const [time, setTime] = useState(0)
  const [images, setImages] = useState<Map<string, HTMLImageElement>>(new Map())
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef(0)
  const lastRef = useRef(0)
  const timeRef = useRef(0)

  const clip = BUILTIN_CLIPS.find((c) => c.id === clipId) ?? BUILTIN_CLIPS[0]
  const imgMaterials = useMemo(
    () => materials.filter((m) => (IMG_CATEGORIES as string[]).includes(m.category) && m.file_path),
    [materials],
  )

  // 预览 manifest：已选槽替换皮图，未选回退内置小方
  const previewRig: CharacterRig = useMemo(
    () => ({
      ...BUILTIN_RIGGED_CHARACTER,
      parts: BUILTIN_RIGGED_CHARACTER.parts.map((p) => ({ ...p, image: slots[p.image] ?? p.image })),
      expressions: BUILTIN_RIGGED_CHARACTER.expressions.map((e) => ({
        ...e,
        image: exprSlots[e.id] ?? e.image,
      })),
    }),
    [slots, exprSlots],
  )

  // 加载预览需要的全部图（含已选素材图，去重增量加载）
  const needed = useMemo(() => rigPartFiles(previewRig), [previewRig])
  useEffect(() => {
    let alive = true
    const missing = needed.filter((f) => !images.has(f) && partUrl(f) !== '')
    if (missing.length === 0) return
    Promise.all(
      missing.map(
        (f) =>
          new Promise<[string, HTMLImageElement | null]>((resolve) => {
            const img = new Image()
            img.onload = () => resolve([f, img])
            img.onerror = () => resolve([f, null])
            img.src = partUrl(f)
          }),
      ),
    ).then((list) => {
      if (!alive) return
      setImages((prev) => {
        const next = new Map(prev)
        for (const [k, v] of list) if (v) next.set(k, v)
        return next
      })
    })
    return () => {
      alive = false
    }
  }, [needed, images])

  // rAF 播放循环
  useEffect(() => {
    if (!playing) return
    lastRef.current = performance.now()
    const tick = (now: number): void => {
      const dt = (now - lastRef.current) / 1000
      lastRef.current = now
      let nt = timeRef.current + dt
      if (nt >= clip.duration) nt = nt % clip.duration
      timeRef.current = nt
      setTime(nt)
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [playing, clip])
  useEffect(() => () => cancelAnimationFrame(rafRef.current), [])

  // 画布绘制
  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    drawBackground(ctx)
    const sampled = samplePose(BUILTIN_RIG, clip, time)
    const world = buildWorldPose(BUILTIN_RIG, sampled)
    const exprImg = previewRig.expressions.find((e) => e.id === exprId)
    drawRiggedCharacterPreview(ctx, previewRig, world, images, exprImg ? images.get(exprImg.image) : undefined, {
      scale: SCALE,
      originX: ORIGIN_X,
      originY: ORIGIN_Y,
    })
  }, [time, clip, previewRig, images, exprId])

  const filledCount = Object.values(slots).filter(Boolean).length
  const allFilled = Object.keys(PART_LABELS).every((f) => !!slots[f])

  const assign = (src: string): void => {
    if (sel.kind === 'part') setSlots((s) => ({ ...s, [sel.key]: src }))
    else setExprSlots((s) => ({ ...s, [sel.key]: src }))
  }
  const clearSel = (): void => {
    if (sel.kind === 'part') setSlots((s) => ({ ...s, [sel.key]: undefined }))
    else setExprSlots((s) => ({ ...s, [sel.key]: undefined }))
  }

  const save = async (): Promise<void> => {
    if (busy || !allFilled) return
    setBusy(true)
    setMsg(null)
    try {
      const parts = Object.fromEntries(Object.entries(slots).filter(([, v]) => !!v)) as Record<string, string>
      const exprs = Object.fromEntries(Object.entries(exprSlots).filter(([, v]) => !!v)) as Record<string, string>
      const res = await window.api.buildRigCharacter(name, parts, exprs)
      if (res.ok && res.material) {
        setMsg({ kind: 'ok', text: `已生成「${res.material.name}」并加入角色分类。拖入角色轨道即可播放骨骼动作。` })
        await loadMaterials()
      } else {
        setMsg({ kind: 'err', text: res.message || '保存失败' })
      }
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : String(e) })
    } finally {
      setBusy(false)
    }
  }

  const slotChip = (kind: SlotKind, key: string, label: string, value: string | undefined): React.ReactNode => {
    const active = sel.kind === kind && sel.key === key
    const nameOf = value ? (imgMaterials.find((m) => m.file_path === value)?.name ?? '已选素材') : kind === 'expr' ? '内置' : '内置小方'
    return (
      <button
        key={`${kind}-${key}`}
        className={active ? 'active' : ''}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '4px 8px',
          borderRadius: 'var(--radius-md)',
          border: `1px solid ${active ? 'var(--primary)' : 'var(--border)'}`,
          background: active ? 'var(--primary-weak, var(--bg-hover))' : 'transparent',
          cursor: 'pointer',
          fontSize: 12,
        }}
        onClick={() => setSel({ kind, key })}
      >
        {label}
        <span className="text-dim" style={{ maxWidth: 90, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {nameOf}
        </span>
        {active && value && (
          <span
            role="button"
            title="恢复内置"
            onClick={(e) => {
              e.stopPropagation()
              clearSel()
            }}
          >
            ✕
          </span>
        )}
      </button>
    )
  }

  return (
    <div className="modal-overlay" onClick={() => !busy && onClose()}>
      <div className="modal" style={{ width: 860 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span>组装绑骨角色</span>
          <button className="ghost" onClick={onClose} disabled={busy}>✕</button>
        </div>
        <div className="modal-body" style={{ display: 'flex', gap: 14, alignItems: 'stretch' }}>
          {/* 左：实时预览 */}
          <div style={{ flexShrink: 0 }}>
            <canvas ref={canvasRef} width={CANVAS_W} height={CANVAS_H} style={{ borderRadius: 'var(--radius-md)' }} />
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 8 }}>
              {BUILTIN_CLIPS.map((c) => (
                <button
                  key={c.id}
                  className={c.id === clipId ? 'active' : ''}
                  style={{ fontSize: 12, padding: '3px 8px' }}
                  onClick={() => {
                    setClipId(c.id)
                    timeRef.current = 0
                    setTime(0)
                    setPlaying(true)
                  }}
                >
                  {c.name}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
              <button style={{ fontSize: 12 }} onClick={() => setPlaying((v) => !v)}>
                {playing ? '⏸ 暂停' : '▶ 播放'}
              </button>
              {previewRig.expressions.map((e) => (
                <button
                  key={e.id}
                  className={e.id === exprId ? 'active' : ''}
                  style={{ fontSize: 12, padding: '3px 8px' }}
                  onClick={() => setExprId(e.id)}
                >
                  {e.name}
                </button>
              ))}
            </div>
          </div>
          {/* 右：槽位 + 素材库 */}
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div className="form-row">
              <label>角色名</label>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="如：小绿" disabled={busy} />
            </div>
            <div>
              <div className="form-hint" style={{ marginBottom: 6 }}>
                第 1 步：点选一个槽位（已选 {filledCount}/9 个部件）
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {Object.entries(PART_LABELS).map(([f, label]) => slotChip('part', f, label, slots[f]))}
              </div>
              <div className="form-hint" style={{ margin: '8px 0 6px' }}>
                表情贴图（默认内置五官，随片段情绪切换）
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {BUILTIN_RIGGED_CHARACTER.expressions.map((e) => slotChip('expr', e.id, e.name, exprSlots[e.id]))}
              </div>
            </div>
            <div style={{ flex: 1, minHeight: 0 }}>
              <div className="form-hint" style={{ marginBottom: 6 }}>
                第 2 步：从素材库点一张图，填入当前选中的「
                {sel.kind === 'part' ? PART_LABELS[sel.key] : BUILTIN_RIGGED_CHARACTER.expressions.find((e) => e.id === sel.key)?.name}」槽
              </div>
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 6,
                  maxHeight: 168,
                  overflowY: 'auto',
                  padding: 2,
                }}
              >
                {imgMaterials.map((m) => (
                  <img
                    key={m.id}
                    src={window.api.assetUrl(m.file_path)}
                    title={m.name}
                    alt={m.name}
                    loading="lazy"
                    style={{
                      width: 52,
                      height: 52,
                      objectFit: 'cover',
                      borderRadius: 'var(--radius-sm)',
                      border: `2px solid ${slots[sel.key] === m.file_path || exprSlots[sel.key] === m.file_path ? 'var(--primary)' : 'var(--border)'}`,
                      cursor: 'pointer',
                      background: 'var(--bg-hover)',
                    }}
                    onClick={() => assign(m.file_path)}
                  />
                ))}
                {imgMaterials.length === 0 && <span className="text-dim">素材库还没有图片素材，先去「AI 生成」或导入几张</span>}
              </div>
            </div>
            <button className="primary" style={{ width: '100%' }} onClick={() => void save()} disabled={busy || !allFilled || !name.trim()}>
              {busy ? '⏳ 保存中…' : allFilled ? '💾 保存为绑骨角色素材' : '9 个部件槽全部选图后可保存'}
            </button>
            {msg && (
              <div className={`preview-msg ${msg.kind}`}>
                {msg.kind === 'ok' ? '✓ ' : '⚠ '}
                {msg.text}
              </div>
            )}
            <div className="settings-hint">
              骨骼、动作与表情位置全部自动对齐（沿用内置骨架），只需选图换皮；不满意可随时回「骨骼实验室」查看效果或重新组装。
            </div>
          </div>
        </div>
        <div className="modal-foot">
          <span className="hint">未选的槽位预览时显示内置小方部件，不影响试验</span>
          <div>
            <button onClick={onClose} disabled={busy}>关闭</button>
            <button
              className="primary"
              onClick={() => {
                pushToast('已关闭（保存过的角色保留在库中）')
                onClose()
              }}
              disabled={busy}
            >
              完成
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default RigCharBuilderDialog
