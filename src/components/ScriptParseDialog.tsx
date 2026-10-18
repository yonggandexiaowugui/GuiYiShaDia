import React, { useState } from 'react'
import { useStore } from '../services/store'

const ScriptParseDialog: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [script, setScript] = useState('')
  const [parsing, setParsing] = useState(false)
  const parseScript = useStore((s) => s.parseScript)
  const pushToast = useStore((s) => s.pushToast)

  const handleParse = async (): Promise<void> => {
    const text = script.trim()
    if (!text) {
      pushToast('请粘贴剧本内容')
      return
    }
    setParsing(true)
    try {
      await parseScript(text)
      onClose()
    } finally {
      setParsing(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal script-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span>AI 剧本解析</span>
          <button className="ghost" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ color: '#888', fontSize: 12 }}>
            粘贴剧本文字，AI 将自动拆分为分镜（含三段动作 / 情绪梯度 / 转场策略）
          </div>
          <textarea
            value={script}
            onChange={(e) => setScript(e.target.value)}
            placeholder={`示例：\n\n深夜，小明独自走在回家的路上。突然，他听到身后传来奇怪的脚步声。\n小明（紧张）："谁...谁在那里？"\n没有回应。他加快脚步，脚步声也跟着加快。\n小明（害怕）："别过来！我有武器！"\n他猛地转身，却发现只是一只黑猫。`}
            style={{
              flex: 1,
              minHeight: 200,
              background: '#1a1a1a',
              border: '1px solid #3f3f3f',
              borderRadius: 4,
              color: '#e0e0e0',
              padding: 10,
              fontSize: 13,
              lineHeight: 1.6,
              resize: 'none',
              fontFamily: 'inherit',
            }}
          />
        </div>
        <div className="modal-foot">
          <span className="hint">解析后可在时间轴和属性面板中精修</span>
          <div>
            <button onClick={onClose}>取消</button>
            <button className="primary" onClick={() => void handleParse()} disabled={parsing}>
              {parsing ? '解析中…' : '开始解析'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ScriptParseDialog
