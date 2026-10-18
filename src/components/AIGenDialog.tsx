// ============================================================================
// AI 生成素材弹窗：输入描述 → 选分类 → 调主进程生成（走设置的绘图通道）→ 入库
// ============================================================================
import React, { useEffect, useState } from 'react'
import { useStore } from '../services/store'
import type { MaterialCategory } from '@shared/types'

const GEN_CATEGORIES: MaterialCategory[] = ['场景', '角色', '表情', '特效']

const PLACEHOLDER: Record<string, string> = {
  场景: '如：深夜暴雨中的巷子，霓虹灯反光，卡通风格',
  角色: '如：戴墨镜的橘猫，正面站姿，沙雕表情包风格，纯色背景',
  表情: '如：震惊到瞪大眼睛的表情特写，夸张漫画风',
  特效: '如：黄色闪电爆炸贴纸，漫画速度线，白底',
}

const AIGenDialog: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const loadMaterials = useStore((s) => s.loadMaterials)
  const pushToast = useStore((s) => s.pushToast)

  const [prompt, setPrompt] = useState('')
  const [category, setCategory] = useState<MaterialCategory>('角色')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ kind: 'busy' | 'ok' | 'err'; text: string } | null>(null)

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
    setMsg({ kind: 'busy', text: '生成中…（公共源通常 5~30 秒；若遇额度限制会自动等待约 1 分钟，请勿关闭）' })
    try {
      const res = await window.api.generateImageMaterial(prompt, category)
      if (res.ok && res.material) {
        setMsg({
          kind: 'ok',
          text: `已生成「${res.material.name}」并加入${category}分类${res.seconds ? `（${res.seconds}s）` : ''}。可直接拖入时间轴。`,
        })
        await loadMaterials()
      } else {
        setMsg({ kind: 'err', text: res.message || '生成失败' })
      }
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : String(e) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={() => !busy && onClose()}>
      <div className="modal" style={{ width: 420 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span>AI 生成素材</span>
          <button className="ghost" onClick={onClose} disabled={busy}>✕</button>
        </div>
        <div className="modal-body">
          <div className="form-row">
            <label>分类</label>
            <select value={category} onChange={(e) => setCategory(e.target.value as MaterialCategory)} disabled={busy}>
              {GEN_CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div className="form-row">
            <label>素材描述</label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={3}
              style={{ resize: 'vertical' }}
              placeholder={PLACEHOLDER[category]}
              disabled={busy}
            />
            <div className="form-hint">提示：写清主体 + 风格（如"卡通""表情包风格""纯色背景"），生成效果更稳。照片级描述适合做真实素材。</div>
          </div>
          <button className="primary" style={{ width: '100%' }} onClick={() => void generate()} disabled={busy || !prompt.trim()}>
            {busy ? '⏳ 生成中…' : '✨ 生成并加入素材库'}
          </button>
          {msg && (
            <div className={`preview-msg ${msg.kind}`} style={{ marginTop: 10 }}>
              {msg.kind === 'busy' ? '⏳ ' : msg.kind === 'ok' ? '✓ ' : '⚠ '}
              {msg.text}
            </div>
          )}
          <div className="settings-hint" style={{ marginTop: 10 }}>
            默认使用免配置公共源（免费档右下角会带来源水印，可用「一键去背景」或裁剪处理）；无水印可到「设置 → AI 绘图」配置自定义 API。
          </div>
        </div>
        <div className="modal-foot">
          <span className="hint">生成结果自动入库，可重命名 / 打标签</span>
          <div>
            <button onClick={onClose} disabled={busy}>关闭</button>
            <button
              className="primary"
              onClick={() => {
                pushToast('已关闭（生成的素材保留在库中）')
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

export default AIGenDialog
