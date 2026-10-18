import React from 'react'
import { useStore } from '../services/store'
import { EMOTIONS, TRACK_COLORS } from '@shared/types'
import type { MotionTemplateId } from '@shared/types'
import { BUILTIN_CLIPS } from '@shared/rig'
import { parseRiggedMeta } from '@shared/characterRig'

const MOTION_OPTIONS: { value: MotionTemplateId; label: string }[] = [
  { value: 'idle', label: '呼吸/待机' },
  { value: 'zoom', label: '推近' },
  { value: 'slideL', label: '左滑入' },
  { value: 'slideR', label: '右滑入' },
  { value: 'shake', label: '颤抖' },
  { value: 'sway', label: '摇摆' },
  { value: 'bounce', label: '弹跳' },
  { value: 'title', label: '出字' },
  { value: 'blackout', label: '黑场' },
]

const PropertyPanel: React.FC = () => {
  const tracks = useStore((s) => s.tracks)
  const selectedClip = useStore((s) => s.selectedClip)
  const selectedIds = useStore((s) => s.selectedIds)
  const updateClip = useStore((s) => s.updateClip)
  const deleteClip = useStore((s) => s.deleteClip)
  const deleteSelectedClips = useStore((s) => s.deleteSelectedClips)
  const addVoiceClip = useStore((s) => s.addVoiceClip)
  const generateVoiceovers = useStore((s) => s.generateVoiceovers)
  const pushToast = useStore((s) => s.pushToast)
  const currentTime = useStore((s) => s.currentTime)

  const track = selectedClip ? tracks.find((t) => t.id === selectedClip.trackId) : null
  const clip = track ? track.clips.find((c) => c.id === selectedClip?.clipId) : null
  const materials = useStore((s) => s.materials)
  const material = clip?.materialId ? materials.find((m) => m.id === clip.materialId) : null
  const isRiggedMaterial = !!parseRiggedMeta(material?.meta ?? null)

  const [voiceText, setVoiceText] = React.useState('')
  const [voiceDur, setVoiceDur] = React.useState(3)

  const addVoiceAtCurrent = (): void => {
    if (!voiceText.trim()) {
      pushToast('请输入配音文字')
      return
    }
    const c = addVoiceClip(voiceText, currentTime, Math.max(0.5, voiceDur))
    if (c) {
      useStore.getState().selectClip({ trackId: c.trackId, clipId: c.id })
      pushToast('已在当前时间插入配音片段')
    }
  }

  if (!clip || !track) {
    return (
      <div className="property-panel">
        <div className="panel-title">属性面板</div>
        <div className="empty-hint">点击时间轴上的片段进行编辑</div>

        <div style={{ marginTop: 16, padding: '0 4px' }}>
          <div className="panel-title" style={{ fontSize: 12, marginBottom: 8 }}>
            快速插入配音
          </div>
          <div className="form-row">
            <label>配音文字</label>
            <textarea
              value={voiceText}
              onChange={(e) => setVoiceText(e.target.value)}
              rows={3}
              style={{ resize: 'vertical' }}
              placeholder="输入要配音的文字…"
            />
          </div>
          <div className="form-row">
            <label>时长（秒）</label>
            <input
              type="number"
              min={0.5}
              step={0.5}
              value={voiceDur}
              onChange={(e) => setVoiceDur(Number(e.target.value))}
            />
          </div>
          <button className="primary" onClick={addVoiceAtCurrent} style={{ width: '100%' }}>
            在当前时间插入配音
          </button>
        </div>
      </div>
    )
  }

  const update = (patch: Partial<typeof clip>): void => {
    updateClip(track.id, clip.id, patch)
  }

  return (
    <div className="property-panel">
      {selectedIds.length > 1 && (
        <div className="multi-select-bar">
          <span>已选中 {selectedIds.length} 个片段</span>
          <button className="danger" onClick={deleteSelectedClips}>批量删除</button>
        </div>
      )}
      <div className="panel-title">
        <span
          style={{
            display: 'inline-block',
            width: 12,
            height: 12,
            borderRadius: 2,
            background: TRACK_COLORS[track.type],
            marginRight: 8,
            verticalAlign: 'middle',
          }}
        />
        {track.name}片段
      </div>

      <div className="form-row">
        <label>名称</label>
        <input value={clip.name} onChange={(e) => update({ name: e.target.value })} />
      </div>

      <div className="form-row">
        <label>开始时间（秒）</label>
        <input
          type="number"
          min={0}
          step={0.1}
          value={clip.start}
          onChange={(e) => update({ start: Math.max(0, Number(e.target.value)) })}
        />
      </div>

      <div className="form-row">
        <label>时长（秒）</label>
        <input
          type="number"
          min={0.2}
          step={0.1}
          value={clip.duration}
          onChange={(e) => update({ duration: Math.max(0.2, Number(e.target.value)) })}
        />
      </div>

      {/* 视觉类：动效 + 情绪 */}
      {['scene', 'character', 'expression', 'effect'].includes(track.type) && (
        <>
          <div className="form-row">
            <label>动效模板</label>
            <select
              value={clip.motion ?? 'idle'}
              onChange={(e) => update({ motion: e.target.value as MotionTemplateId })}
            >
              {MOTION_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div className="form-row">
            <label>情绪</label>
            <select
              value={clip.emotion ?? '平静'}
              onChange={(e) => update({ emotion: e.target.value as typeof clip.emotion })}
            >
              {EMOTIONS.map((e) => (
                <option key={e} value={e}>
                  {e}
                </option>
              ))}
            </select>
          </div>
        </>
      )}

      {/* 绑骨角色：骨骼动作选择（整图素材不显示） */}
      {track.type === 'character' && isRiggedMaterial && (
        <div className="form-row">
          <label>骨骼动作</label>
          <select
            value={clip.rigClipId ?? 'idle'}
            onChange={(e) => update({ rigClipId: e.target.value })}
          >
            {BUILTIN_CLIPS.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}（{c.id}）
              </option>
            ))}
          </select>
        </div>
      )}

      {/* 配音：台词 + 独立字幕 + 重新生成 */}
      {track.type === 'voice' && (
        <>
          <div className="form-row">
            <label>配音台词</label>
            <textarea
              value={clip.text ?? ''}
              onChange={(e) => update({ text: e.target.value })}
              rows={3}
              style={{ resize: 'vertical' }}
              placeholder="生成 TTS 的内容…"
            />
          </div>
          <div className="form-row">
            <label>字幕文本</label>
            <textarea
              value={clip.subtitle ?? clip.text ?? ''}
              onChange={(e) => update({ subtitle: e.target.value })}
              rows={2}
              style={{ resize: 'vertical' }}
              placeholder="留空则不显示字幕"
            />
            <div className="form-hint">
              {clip.subtitle === undefined
                ? '跟随配音台词'
                : clip.subtitle.trim() === ''
                  ? '已关闭字幕（画面不显示）'
                  : '使用自定义字幕（与配音独立）'}
            </div>
            {clip.subtitle !== undefined && (
              <button className="btn" style={{ width: '100%', marginTop: 4 }} onClick={() => update({ subtitle: undefined })}>
                恢复为跟随配音台词
              </button>
            )}
          </div>
          <div className="form-row">
            <label>状态</label>
            <div className={clip.voiceFile ? 'status-ok' : 'status-pending'}>
              {clip.voiceFile ? `✓ 已生成：${clip.voiceFile.split('/').pop()}` : '待生成'}
            </div>
          </div>
        </>
      )}

      {/* 音频类：音量 */}
      {(track.type === 'sfx' || track.type === 'voice') && (
        <div className="form-row">
          <label>音量（{Math.round((clip.volume ?? 1) * 100)}%）</label>
          <input
            type="range"
            min={0}
            max={2}
            step={0.05}
            value={clip.volume ?? 1}
            onChange={(e) => update({ volume: Number(e.target.value) })}
            style={{ width: '100%' }}
          />
        </div>
      )}

      {/* 音频类：循环铺满（BGM 拖长后自动重复，不受音频源长度限制） */}
      {(track.type === 'sfx' || track.type === 'voice') && (
        <div className="form-row">
          <label className="radio" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input
              type="checkbox"
              checked={clip.loop === true}
              onChange={(e) => update({ loop: e.target.checked || undefined })}
            />
            🔁 循环铺满
          </label>
          <div className="form-hint">
            {clip.loop
              ? `可任意拉长；超过音频源（${(clip.sourceDuration ?? 0).toFixed(1)}s）后自动重复`
              : `开启后可拖到超过音频源长度（当前 ${(clip.sourceDuration ?? 0).toFixed(1)}s）`}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 16, flexDirection: 'column' }}>
        {track.type === 'voice' && !clip.voiceFile && (
          <button
            className="primary"
            onClick={() => void generateVoiceovers()}
          >
            生成配音
          </button>
        )}
        <button className="danger" onClick={() => deleteClip(track.id, clip.id)}>
          删除片段
        </button>
      </div>
    </div>
  )
}

export default PropertyPanel
