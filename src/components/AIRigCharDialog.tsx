// ============================================================================
// AI 绑骨角色弹窗（P4）：角色名 + 风格描述 → 主进程逐部件生成 → 入库
// 生成产物自带内联 manifest，上轨即走骨骼渲染（动作/情绪由片段控制）
// ============================================================================
import React, { useEffect, useState } from 'react'
import { useStore } from '../services/store'
import type { RigCharacterProgress } from '@shared/types'

const STYLE_PLACEHOLDER = '如：僵尸，青绿色皮肤，破烂西装，沙雕漫画风格'

const AIRigCharDialog: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const loadMaterials = useStore((s) => s.loadMaterials)
  const pushToast = useStore((s) => s.pushToast)

  const [name, setName] = useState('')
  const [style, setStyle] = useState('')
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<RigCharacterProgress | null>(null)
  const [msg, setMsg] = useState<{ kind: 'busy' | 'ok' | 'err'; text: string } | null>(null)

  useEffect(() => {
    const off = window.api.onRigCharacterProgress((p) => setProgress(p))
    return off
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && !busy) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, onClose])

  const generate = async (): Promise<void> => {
    if (busy) return
    setBusy(true)
    setProgress(null)
    setMsg({ kind: 'busy', text: '准备生成…（共 9 个部件，公共源约 8~10 分钟，请勿关闭）' })
    try {
      const res = await window.api.generateRigCharacter(name, style)
      if (res.ok && res.material) {
        setMsg({
          kind: 'ok',
          text: `已生成绑骨角色「${res.material.name}」${res.seconds ? `（${res.seconds}s）` : ''}。拖入角色轨道即可播放骨骼动作。`,
        })
        await loadMaterials()
      } else {
        setMsg({ kind: 'err', text: res.message || '生成失败' })
      }
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : String(e) })
    } finally {
      setBusy(false)
      setProgress(null)
    }
  }

  const pct = progress ? Math.round(((progress.step - 1) / progress.total) * 100) : 0

  return (
    <div className="modal-overlay" onClick={() => !busy && onClose()}>
      <div className="modal" style={{ width: 420 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span>AI 绑骨角色</span>
          <button className="ghost" onClick={onClose} disabled={busy}>✕</button>
        </div>
        <div className="modal-body">
          <div className="form-row">
            <label>角色名</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="如：小僵"
              disabled={busy}
            />
          </div>
          <div className="form-row">
            <label>风格描述</label>
            <textarea
              value={style}
              onChange={(e) => setStyle(e.target.value)}
              rows={3}
              style={{ resize: 'vertical' }}
              placeholder={STYLE_PLACEHOLDER}
              disabled={busy}
            />
            <div className="form-hint">
              会按同一风格逐部件生成 9 张部件图（头/躯干/四肢），自动抠图并对齐骨骼，无需任何手工标定。
            </div>
          </div>
          <button
            className="primary"
            style={{ width: '100%' }}
            onClick={() => void generate()}
            disabled={busy || !name.trim() || !style.trim()}
          >
            {busy ? '⏳ 生成中…' : '🦴 生成绑骨角色'}
          </button>
          {busy && progress && (
            <div style={{ marginTop: 10 }}>
              <div className="form-hint" style={{ marginBottom: 6 }}>
                第 {progress.step}/{progress.total} 步：{progress.label}
              </div>
              <div className="progress-track" style={{ cursor: 'default' }}>
                <div className="progress-fill" style={{ width: `${pct}%` }} />
              </div>
            </div>
          )}
          {msg && (
            <div className={`preview-msg ${msg.kind}`} style={{ marginTop: 10 }}>
              {msg.kind === 'busy' ? '⏳ ' : msg.kind === 'ok' ? '✓ ' : '⚠ '}
              {msg.text}
            </div>
          )}
          <div className="settings-hint" style={{ marginTop: 10 }}>
            免费公共源每张约需 45 秒额度，全套 9 张约 8~10 分钟；自定义 API 可到「设置 → AI 绘图」配置。生成失败会自动清理半成品。
          </div>
        </div>
        <div className="modal-foot">
          <span className="hint">表情贴图复用内置五官，由片段情绪驱动</span>
          <div>
            <button onClick={onClose} disabled={busy}>关闭</button>
            <button
              className="primary"
              onClick={() => {
                pushToast('已关闭（生成的角色保留在库中）')
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

export default AIRigCharDialog
