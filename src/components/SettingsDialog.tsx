import React, { useEffect, useRef, useState } from 'react'
import { useStore } from '../services/store'
import type { AIConfig, ImageGenConfig, SubtitleStyle, TTSConfig, LLMConfig } from '@shared/types'

const EMPTY_TTS: TTSConfig = {
  provider: 'local',
  localVoice: '',
  apiBase: '',
  apiKey: '',
  voiceId: '',
  speed: 1,
  pitch: 1,
}

const EMPTY_IMAGE: ImageGenConfig = {
  provider: 'pollinations',
  apiBase: '',
  apiKey: '',
  model: '',
}

const SettingsDialog: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const pushToast = useStore((s) => s.pushToast)
  const subtitleStyle = useStore((s) => s.subtitleStyle)
  const setSubtitleStyle = useStore((s) => s.setSubtitleStyle)
  const exportSettings = useStore((s) => s.exportSettings)
  const setExportSettings = useStore((s) => s.setExportSettings)
  const [tts, setTts] = useState<TTSConfig>(EMPTY_TTS)
  const [llm, setLlm] = useState<LLMConfig>({ apiBase: '', apiKey: '', model: '' })
  const [imageCfg, setImageCfg] = useState<ImageGenConfig>(EMPTY_IMAGE)
  const [voices, setVoices] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [imgTesting, setImgTesting] = useState(false)
  const [imgTestMsg, setImgTestMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const [previewMsg, setPreviewMsg] = useState<{ kind: 'busy' | 'ok' | 'err'; text: string } | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    void (async () => {
      try {
        const cfg: AIConfig = await window.api.getAIConfig()
        setTts({ ...EMPTY_TTS, ...cfg.tts })
        setLlm(cfg.llm)
        setImageCfg({ ...EMPTY_IMAGE, ...cfg.image })
      } catch (e) {
        pushToast('读取设置失败：' + (e instanceof Error ? e.message : String(e)))
      }
      try {
        setVoices(await window.api.listTTSVoices())
      } catch {
        setVoices([])
      }
      setLoading(false)
    })()
  }, [pushToast])

  const save = async (): Promise<void> => {
    setSaving(true)
    try {
      await window.api.saveAIConfig({ tts, llm, image: imageCfg })
      pushToast('设置已保存')
    } catch (e) {
      pushToast('保存失败：' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setSaving(false)
    }
  }

  /** 测试绘图通道连通性（用界面上的配置，先保存再测） */
  const testImage = async (): Promise<void> => {
    if (imgTesting) return
    setImgTesting(true)
    setImgTestMsg(null)
    try {
      await window.api.saveAIConfig({ image: imageCfg })
      const res = await window.api.testImageGen(imageCfg)
      setImgTestMsg(
        res.ok
          ? { kind: 'ok', text: `✓ ${res.message ?? '连通正常'}` }
          : { kind: 'err', text: `⚠ ${res.message ?? '测试失败'}` },
      )
    } catch (e) {
      setImgTestMsg({ kind: 'err', text: '⚠ ' + (e instanceof Error ? e.message : String(e)) })
    } finally {
      setImgTesting(false)
    }
  }

  /** 试听：生成一段示例语音并立即播放。
   *  提示走弹窗内联状态（持久可见），不依赖 3.6 秒就消失的 toast。 */
  const preview = async (): Promise<void> => {
    if (testing) return // 防止连点重复触发
    setTesting(true)
    setPreviewMsg({ kind: 'busy', text: '正在生成试听语音…（本地引擎通常 1~3 秒）' })
    try {
      // 先保存当前配置，保证试听用的是界面上的设置
      await window.api.saveAIConfig({ tts })
      const res = await window.api.testTTS(tts)
      if (!res.ok || !res.dataUrl) {
        setPreviewMsg({ kind: 'err', text: '试听失败：' + (res.message || '未知错误') })
        return
      }
      const el = audioRef.current ?? new Audio()
      audioRef.current = el
      el.onended = () => setPreviewMsg({ kind: 'ok', text: '试听播放完毕。音色 / 语速满意后，回到主界面点「生成配音」即可批量出音。' })
      el.onerror = () => setPreviewMsg({ kind: 'err', text: '音频已生成，但播放失败（音频格式可能不被支持）' })
      el.src = res.dataUrl
      el.volume = 1
      try {
        await el.play()
        setPreviewMsg({ kind: 'ok', text: '正在播放试听音频…（若无声音请检查系统音量）' })
      } catch (err) {
        setPreviewMsg({
          kind: 'err',
          text: '音频已生成，但被浏览器阻止自动播放：' + (err instanceof Error ? err.message : String(err)),
        })
      }
    } catch (e) {
      setPreviewMsg({ kind: 'err', text: '试听失败：' + (e instanceof Error ? e.message : String(e)) })
    } finally {
      setTesting(false)
    }
  }

  const provider = tts.provider ?? 'local'
  const isLocal = provider === 'local'

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal settings-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span>设置</span>
          <button className="ghost" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body settings-body">
          <div className="settings-section">配音（TTS）</div>

          <div className="form-row">
            <label>语音来源</label>
            <div className="radio-row">
              <label className="radio">
                <input
                  type="radio"
                  checked={isLocal}
                  onChange={() => setTts({ ...tts, provider: 'local' })}
                />
                系统自带语音（免配置 · 离线可用）
              </label>
              <label className="radio">
                <input
                  type="radio"
                  checked={!isLocal}
                  onChange={() => setTts({ ...tts, provider: 'http' })}
                />
                在线接口（需 API 地址与 Key）
              </label>
            </div>
          </div>

          {isLocal && (
            <div className="form-row">
              <label>声库</label>
              {loading ? (
                <div className="settings-hint">读取系统声库中…</div>
              ) : voices.length === 0 ? (
                <div className="settings-hint warn">
                  未检测到系统语音包。请在「Windows 设置 → 时间和语言 → 语音」中安装中文语音，或改用在线接口。
                </div>
              ) : (
                <select
                  value={tts.localVoice ?? ''}
                  onChange={(e) => setTts({ ...tts, localVoice: e.target.value })}
                >
                  <option value="">（默认声库）</option>
                  {voices.map((v) => (
                    <option key={v} value={v}>{v}</option>
                  ))}
                </select>
              )}
            </div>
          )}

          {!isLocal && (
            <>
              <div className="form-row">
                <label>接口地址</label>
                <input
                  value={tts.apiBase}
                  onChange={(e) => setTts({ ...tts, apiBase: e.target.value })}
                  placeholder="https://your-tts-server/api/tts"
                />
              </div>
              <div className="form-row">
                <label>API Key</label>
                <input
                  type="password"
                  value={tts.apiKey}
                  onChange={(e) => setTts({ ...tts, apiKey: e.target.value })}
                  placeholder="Bearer Token"
                />
              </div>
              <div className="form-row">
                <label>音色 ID</label>
                <input
                  value={tts.voiceId}
                  onChange={(e) => setTts({ ...tts, voiceId: e.target.value })}
                  placeholder="voice_id"
                />
              </div>
            </>
          )}

          <div className="form-row">
            <label>语速（{tts.speed.toFixed(2)}×）</label>
            <input
              type="range"
              min={0.5}
              max={2}
              step={0.05}
              value={tts.speed}
              onChange={(e) => setTts({ ...tts, speed: Number(e.target.value) })}
            />
          </div>

          <button className="primary" onClick={() => void preview()} disabled={testing} style={{ width: '100%' }}>
            {testing ? '生成中…' : '🔊 试听这段语音'}
          </button>
          {previewMsg && (
            <div className={`preview-msg ${previewMsg.kind}`}>
              {previewMsg.kind === 'busy' ? '⏳ ' : previewMsg.kind === 'ok' ? '✓ ' : '⚠ '}
              {previewMsg.text}
            </div>
          )}

          <div className="settings-section" style={{ marginTop: 18 }}>字幕</div>
          <div className="form-row">
            <label>字号（{Math.round(subtitleStyle.fontScale * 1000) / 10}% 画面宽）</label>
            <input
              type="range"
              min={0.02}
              max={0.08}
              step={0.001}
              value={subtitleStyle.fontScale}
              onChange={(e) => setSubtitleStyle({ fontScale: Number(e.target.value) })}
            />
          </div>
          <div className="form-row">
            <label>位置</label>
            <select
              value={subtitleStyle.position}
              onChange={(e) =>
                setSubtitleStyle({ position: e.target.value as SubtitleStyle['position'] })
              }
            >
              <option value="bottom">底部</option>
              <option value="center">居中</option>
              <option value="top">顶部</option>
            </select>
          </div>
          <div className="form-row">
            <label>文字颜色</label>
            <input
              type="color"
              value={subtitleStyle.textColor}
              onChange={(e) => setSubtitleStyle({ textColor: e.target.value })}
              style={{ height: 32, padding: 2 }}
            />
          </div>
          <div className="form-row">
            <label>描边宽度（{subtitleStyle.strokeWidth}px）</label>
            <input
              type="range"
              min={0}
              max={10}
              step={1}
              value={subtitleStyle.strokeWidth}
              onChange={(e) => setSubtitleStyle({ strokeWidth: Number(e.target.value) })}
            />
          </div>
          <div className="form-row">
            <label className="radio" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input
                type="checkbox"
                checked={subtitleStyle.background}
                onChange={(e) => setSubtitleStyle({ background: e.target.checked })}
              />
              显示半透明底条（提高可读性）
            </label>
          </div>

          <div className="settings-section" style={{ marginTop: 18 }}>导出</div>
          <div className="form-row">
            <label>帧率</label>
            <select
              value={exportSettings.fps}
              onChange={(e) => setExportSettings({ fps: Number(e.target.value) })}
            >
              <option value={24}>24 fps（更省，导出更快）</option>
              <option value={30}>30 fps（推荐）</option>
              <option value={60}>60 fps（更顺滑，导出更慢）</option>
            </select>
          </div>
          <div className="form-row">
            <label>画质</label>
            <select
              value={exportSettings.crf}
              onChange={(e) => setExportSettings({ crf: Number(e.target.value) })}
            >
              <option value={28}>流畅（体积小）</option>
              <option value={23}>标准</option>
              <option value={20}>清晰（推荐）</option>
              <option value={16}>高画质（体积大）</option>
            </select>
          </div>
          <div className="settings-hint">
            分辨率跟随预览方向（横屏 1920×1080 / 竖屏 1080×1920）。导出参数会随工程一起保存。
          </div>

          <div className="settings-section" style={{ marginTop: 18 }}>AI 绘图（素材生成）</div>
          <div className="form-row">
            <label>图片来源</label>
            <div className="radio-row">
              <label className="radio">
                <input
                  type="radio"
                  checked={(imageCfg.provider ?? 'pollinations') === 'pollinations'}
                  onChange={() => setImageCfg({ ...imageCfg, provider: 'pollinations' })}
                />
                免配置公共源（免费 · 需联网）
              </label>
              <label className="radio">
                <input
                  type="radio"
                  checked={imageCfg.provider === 'custom'}
                  onChange={() => setImageCfg({ ...imageCfg, provider: 'custom' })}
                />
                自定义 API（OpenAI 兼容）
              </label>
            </div>
          </div>

          {imageCfg.provider === 'custom' && (
            <>
              <div className="form-row">
                <label>接口地址</label>
                <input
                  value={imageCfg.apiBase}
                  onChange={(e) => setImageCfg({ ...imageCfg, apiBase: e.target.value })}
                  placeholder="https://api.xxx.com/v1"
                />
              </div>
              <div className="form-row">
                <label>API Key</label>
                <input
                  type="password"
                  value={imageCfg.apiKey}
                  onChange={(e) => setImageCfg({ ...imageCfg, apiKey: e.target.value })}
                  placeholder="Bearer Token"
                />
              </div>
              <div className="form-row">
                <label>模型</label>
                <input
                  value={imageCfg.model}
                  onChange={(e) => setImageCfg({ ...imageCfg, model: e.target.value })}
                  placeholder="如 doubao-seedream-3-0-t2i / dall-e-3"
                />
              </div>
            </>
          )}

          <button
            className="btn"
            style={{ width: '100%' }}
            onClick={() => void testImage()}
            disabled={imgTesting}
          >
            {imgTesting ? '⏳ 测试中…' : '🔧 测试连通（生成一张小图，不入库）'}
          </button>
          {imgTestMsg && <div className={`preview-msg ${imgTestMsg.kind}`}>{imgTestMsg.text}</div>}
          <div className="settings-hint">
            公共源免费档：每 45 秒 1 张、右下角带来源水印，偶尔排队较慢；自定义 API 无水印无限制。生成的素材可在素材库右键重命名/打标签。
          </div>

          <div className="settings-section" style={{ marginTop: 18 }}>AI 剧本（大模型）</div>
          <div className="form-row">
            <label>接口地址</label>
            <input
              value={llm.apiBase}
              onChange={(e) => setLlm({ ...llm, apiBase: e.target.value })}
              placeholder="https://api.openai.com/v1"
            />
          </div>
          <div className="form-row">
            <label>API Key</label>
            <input
              type="password"
              value={llm.apiKey}
              onChange={(e) => setLlm({ ...llm, apiKey: e.target.value })}
            />
          </div>
          <div className="form-row">
            <label>模型</label>
            <input
              value={llm.model}
              onChange={(e) => setLlm({ ...llm, model: e.target.value })}
              placeholder="gpt-4o-mini"
            />
          </div>
          <div className="settings-hint">
            不填也能用：「AI 剧本」需要大模型；配音默认走系统自带语音，无需配置。
          </div>
        </div>

        <div className="modal-foot">
          <span className="hint">配音生成后会自动按音频真实长度对齐片段</span>
          <div>
            <button onClick={onClose}>关闭</button>
            <button className="primary" onClick={() => void save()} disabled={saving}>
              {saving ? '保存中…' : '保存'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default SettingsDialog
