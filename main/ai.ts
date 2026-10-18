// ============================================================================
// AI 相关逻辑（大模型调用 / TTS 调用 / 剧本解析）
// 移植自 SandAnim（MIT），适配竖屏/演出模板扩展
// ============================================================================
import { getAIConfigValue, saveAIConfigValue } from './database'
import { synthesizeLocal } from './tts'
import { EMOTIONS } from '../shared/types'
import type {
  ActionPhase,
  AIConfig,
  AIResult,
  Emotion,
  ImageGenConfig,
  LLMConfig,
  ParseScriptResult,
  RegenShotResult,
  Shot,
  TransitionKind,
  TransitionPlan,
  TTSConfig,
  TTSResult,
} from '../shared/types'

function errMsg(e: unknown): string {
  if (e instanceof Error) {
    if (e.name === 'AbortError' || /aborted/i.test(e.message)) return '请求超时（30s）'
    return e.message
  }
  return String(e)
}

const DEFAULT_TIMEOUT = 30000

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs = DEFAULT_TIMEOUT,
): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

async function readError(res: Response): Promise<string> {
  const t = await res.text().catch(() => '')
  const body = t ? `: ${t.slice(0, 300)}` : ''
  return `HTTP ${res.status} ${res.statusText}${body}`
}

// ---------------------------------------------------------------------------
// 大模型（OpenAI 兼容 chat/completions）
// ---------------------------------------------------------------------------

interface ChatChoice {
  message?: { content?: string }
}
interface ChatResponse {
  choices?: ChatChoice[]
}

async function callLLM(
  config: LLMConfig,
  userText: string,
  systemPrompt: string,
  timeoutMs = DEFAULT_TIMEOUT,
): Promise<string> {
  const base = (config.apiBase || '').replace(/\/+$/, '')
  if (!base) throw new Error('API 地址为空')
  const url = `${base}/chat/completions`
  const res = await fetchWithTimeout(
    url,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userText },
        ],
        temperature: 0.7,
        stream: false,
      }),
    },
    timeoutMs,
  )
  if (!res.ok) throw new Error(await readError(res))
  const data = (await res.json()) as ChatResponse
  const content = data?.choices?.[0]?.message?.content
  if (typeof content !== 'string' || !content.trim()) {
    throw new Error('返回内容格式不正确')
  }
  return content
}

export async function testLLM(config: LLMConfig): Promise<AIResult> {
  if (!config.apiBase || !config.apiKey || !config.model) {
    return { ok: false, message: '请填写 API 地址、API Key 和模型名称' }
  }
  try {
    const reply = await callLLM(config, '你好', '你是一个助手，请用一句话简短回复。')
    const preview = reply.replace(/\s+/g, ' ').trim().slice(0, 40)
    return { ok: true, message: `连接成功${preview ? '：' + preview : ''}` }
  } catch (e) {
    return { ok: false, message: errMsg(e) }
  }
}

// ---------------------------------------------------------------------------
// TTS（通用 HTTP POST）
// ---------------------------------------------------------------------------

async function ttsAudioBuffer(
  config: TTSConfig,
  text: string,
  timeoutMs = DEFAULT_TIMEOUT,
): Promise<{ buf: Buffer; ext: string }> {
  if (!config.apiBase) throw new Error('接口地址为空')
  const res = await fetchWithTimeout(
    config.apiBase,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        text,
        voice_id: config.voiceId,
        speed: config.speed,
        pitch: config.pitch,
      }),
    },
    timeoutMs,
  )
  if (!res.ok) throw new Error(await readError(res))

  const contentType = res.headers.get('content-type') || ''
  if (contentType.includes('application/json')) {
    const data = (await res.json()) as Record<string, unknown>
    const audio = data.audio ?? data.data ?? data.audio_base64 ?? data.audioData
    if (typeof audio === 'string') {
      if (/^[A-Za-z0-9+/=\s]+$/.test(audio)) {
        const ext = typeof data.format === 'string' ? data.format : 'mp3'
        return { buf: Buffer.from(audio.replace(/\s/g, ''), 'base64'), ext }
      }
      if (/^https?:\/\//.test(audio)) {
        const r2 = await fetchWithTimeout(audio, { method: 'GET' }, timeoutMs)
        if (!r2.ok) throw new Error(`下载 TTS 音频失败：HTTP ${r2.status}`)
        return { buf: Buffer.from(await r2.arrayBuffer()), ext: 'mp3' }
      }
    }
    if (typeof data.url === 'string' && /^https?:\/\//.test(data.url)) {
      const r2 = await fetchWithTimeout(data.url, { method: 'GET' }, timeoutMs)
      if (!r2.ok) throw new Error(`下载 TTS 音频失败：HTTP ${r2.status}`)
      return { buf: Buffer.from(await r2.arrayBuffer()), ext: 'mp3' }
    }
    throw new Error('TTS 返回 JSON，但未识别到音频字段')
  }

  const buf = Buffer.from(await res.arrayBuffer())
  if (!buf.byteLength) throw new Error('TTS 返回空数据')
  let ext = 'mp3'
  if (contentType.includes('wav')) ext = 'wav'
  else if (contentType.includes('ogg')) ext = 'ogg'
  else if (contentType.includes('aac')) ext = 'aac'
  else if (contentType.includes('webm')) ext = 'webm'
  return { buf, ext }
}

export async function testTTS(config: TTSConfig): Promise<TTSResult> {
  try {
    if (ttsProviderOf(config) === 'local') {
      const dir = join(getDataDir(), 'tmp')
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
      const base = join(dir, `tts-test-${Date.now()}`)
      const { filePath, ext } = await synthesizeLocal('这是一段测试语音，配音功能正常。', {
        voiceName: config.localVoice,
        speed: config.speed || 1,
        volume: 1,
      }, base)
      const buf = readFileSync(filePath)
      unlinkSync(filePath)
      return {
        ok: true,
        message: '本地语音引擎可用，已生成试听音频',
        dataUrl: `data:audio/${ext === 'm4a' ? 'mp4' : ext};base64,${buf.toString('base64')}`,
      }
    }
    if (!config.apiBase || !config.apiKey) {
      return { ok: false, message: '请填写接口地址和 API Key' }
    }
    const { buf, ext } = await ttsAudioBuffer(config, '这是一段测试语音')
    return { ok: true, message: '已生成测试语音，即将播放', dataUrl: `data:audio/${ext};base64,${buf.toString('base64')}` }
  } catch (e) {
    return { ok: false, message: errMsg(e) }
  }
}

// ---------------------------------------------------------------------------
// AI 配置存取
// ---------------------------------------------------------------------------

export function getAIConfig(): AIConfig {
  const llm = getAIConfigValue('llm') as LLMConfig | null
  const tts = getAIConfigValue('tts') as TTSConfig | null
  const image = getAIConfigValue('image') as ImageGenConfig | null
  return {
    llm: llm ?? { apiBase: '', apiKey: '', model: '' },
    tts: tts ?? { provider: 'local', apiBase: '', apiKey: '', voiceId: '', speed: 1, pitch: 1 },
    image: image ?? { provider: 'pollinations', apiBase: '', apiKey: '', model: '' },
  }
}

export function saveAIConfig(config: Partial<AIConfig>): AIConfig {
  if (config.llm) saveAIConfigValue('llm', config.llm)
  if (config.tts) saveAIConfigValue('tts', config.tts)
  if (config.image) saveAIConfigValue('image', config.image)
  return getAIConfig()
}

// ---------------------------------------------------------------------------
// 剧本解析（分镜）
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `你是专业的沙雕动画分镜师，擅长把剧本拆成动作连贯、情绪自然的镜头序列。把用户提供的剧本拆分成独立镜头，严格返回 JSON 数组，不要返回任何其他文字或 markdown。

每个镜头格式：
{
  "index": 序号,
  "scene": "场景描述",
  "character": "角色名",
  "expression": "表情描述（具体，如：瞪大眼睛张嘴）",
  "action": "动作整体描述",
  "actionPhases": [
    {"kind": "预备", "duration": 0.4, "description": "蓄力/抬手等准备动作"},
    {"kind": "主体", "duration": 1.2, "description": "主体动作"},
    {"kind": "缓冲", "duration": 0.4, "description": "收回/落定/喘气"}
  ],
  "dialogue": "对话原文（无对话则空字符串）",
  "emotionStart": "镜头开始时的情绪",
  "emotionEnd": "镜头结束时的情绪",
  "emotion": "本镜头主导情绪",
  "transitionToNext": {"kind": "硬切|淡入淡出|素材过渡", "material": "素材过渡时的过渡素材描述，如：转身背对（其他 kind 省略）"},
  "duration": 预估秒数
}

情绪只能是：开心/愤怒/悲伤/惊讶/平静/紧张/得意/尴尬/害怕/思考 之一。

硬性规则：
1. 禁止只输出素材 ID 或编号，所有描述字段必须是完整中文描述。
2. actionPhases 必须输出且三段齐全（预备-主体-缓冲），三段时长之和等于 duration；duration 小于 1.2 秒时可省略 actionPhases。
3. emotionStart 必须承接上一镜头的 emotionEnd（读取上下文），避免情绪突变；确有剧烈转折时才允许跳变，并在 action 里写清缓冲动作。
4. 相邻镜头若表情或角色姿势变化剧烈，transitionToNext 用「淡入淡出」或「素材过渡」（写一个自然的过渡动作素材描述），不要用硬切。
5. 对话语速按 4-5 字/秒估算 duration，最小 0.8 秒；无对话的纯动作镜头 1-3 秒。
6. 场景变化拆新镜头；每句对话通常一个镜头；无对话的动作也要成镜头。`

function extractJsonArray(content: string): string {
  let s = content.trim()
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence) s = fence[1].trim()
  const start = s.indexOf('[')
  const end = s.lastIndexOf(']')
  if (start >= 0 && end > start) s = s.slice(start, end + 1)
  return s
}

function toActionPhases(raw: unknown): ActionPhase[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined
  const kinds = ['预备', '主体', '缓冲'] as const
  const phases: ActionPhase[] = []
  for (const item of raw) {
    const o = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>
    const kind = kinds.includes(o.kind as (typeof kinds)[number])
      ? (o.kind as ActionPhase['kind'])
      : null
    const duration = typeof o.duration === 'number' && o.duration > 0 ? o.duration : NaN
    if (!kind || isNaN(duration)) continue
    phases.push({
      kind,
      duration,
      description: typeof o.description === 'string' ? o.description : undefined,
    })
  }
  return phases.some((p) => p.kind === '主体') && phases.length >= 2 ? phases : undefined
}

function toTransition(raw: unknown): TransitionPlan | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const o = raw as Record<string, unknown>
  const kind = ['硬切', '淡入淡出', '素材过渡'].includes(o.kind as string)
    ? (o.kind as TransitionKind)
    : null
  if (!kind) return undefined
  const t: TransitionPlan = { kind }
  if (typeof o.material === 'string' && o.material.trim()) {
    t.materialId = o.material.trim()
  }
  if (typeof o.duration === 'number' && o.duration > 0 && o.duration <= 1.5) {
    t.duration = o.duration
  }
  return t
}

function toShot(raw: unknown, fallbackIndex: number): Shot {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const emotion: Emotion = EMOTIONS.includes(o.emotion as Emotion)
    ? (o.emotion as Emotion)
    : '平静'
  const emotionStart: Emotion = EMOTIONS.includes(o.emotionStart as Emotion)
    ? (o.emotionStart as Emotion)
    : emotion
  const emotionEnd: Emotion = EMOTIONS.includes(o.emotionEnd as Emotion)
    ? (o.emotionEnd as Emotion)
    : emotion
  const dialogue = typeof o.dialogue === 'string' ? o.dialogue : ''
  const shot: Shot = {
    id: typeof o.id === 'string' && o.id ? o.id : `shot-${Date.now()}-${fallbackIndex}`,
    index: typeof o.index === 'number' ? o.index : fallbackIndex,
    scene: typeof o.scene === 'string' ? o.scene : '',
    character: typeof o.character === 'string' ? o.character : '',
    expression: typeof o.expression === 'string' ? o.expression : '',
    action: typeof o.action === 'string' ? o.action : '',
    dialogue,
    emotion,
    duration:
      typeof o.duration === 'number' && o.duration > 0
        ? Math.max(0.8, o.duration)
        : Math.max(2, Math.round(dialogue.length / 4)),
    emotionStart,
    emotionEnd,
  }
  const phases = toActionPhases(o.actionPhases)
  if (phases) shot.actionPhases = phases
  const transition = toTransition(o.transitionToNext ?? o.transition)
  if (transition) shot.transition = transition
  return shot
}

function sampleShotsToText(shots: Shot[]): string {
  const lines = shots.slice(0, 12).map((sh) => {
    const phases = (sh.actionPhases ?? []).map((p) => `${p.kind}${p.duration}s`).join('→')
    const tr = sh.transition ? `${sh.transition.kind}` : ''
    return `- 场景:${sh.scene || '无'} 角色:${sh.character || '无'} 表情:${sh.expression || '无'} 情绪:${sh.emotionStart ?? sh.emotion}→${sh.emotionEnd ?? sh.emotion} 动作:${sh.action || '无'}${phases ? ` [${phases}]` : ''}${tr ? ` 转场:${tr}` : ''} 对话:${sh.dialogue || '无'} 时长:${sh.duration}s`
  })
  return lines.join('\n')
}

export async function parseScript(
  scriptText: string,
  sampleShots?: Shot[],
): Promise<ParseScriptResult> {
  const text = (scriptText || '').trim()
  if (!text) return { ok: false, message: '剧本为空' }
  const config = getAIConfig()
  if (!config.llm.apiBase || !config.llm.apiKey || !config.llm.model) {
    return { ok: false, message: '请先在设置中配置大模型' }
  }
  const samples = sampleShots && sampleShots.length > 0 ? sampleShotsToText(sampleShots) : ''
  const userText = samples
    ? `以下是用户人工精修过的分镜样例（学习它的三段动作节奏、情绪梯度和转场策略风格，不要照抄内容）：\n${samples}\n\n---\n请解析下面的新剧本：\n${text}`
    : text
  try {
    const content = await callLLM(config.llm, userText, SYSTEM_PROMPT)
    const jsonStr = extractJsonArray(content)
    let arr: unknown
    try {
      arr = JSON.parse(jsonStr)
    } catch {
      return { ok: false, message: 'AI 返回内容不是合法 JSON' }
    }
    if (!Array.isArray(arr) || arr.length === 0) {
      return { ok: false, message: 'AI 返回的不是非空数组' }
    }
    const shots = arr.map((raw, i) => toShot(raw, i + 1))
    return { ok: true, shots }
  } catch (e) {
    return { ok: false, message: errMsg(e) }
  }
}

// ---------------------------------------------------------------------------
// AI 重新生成单个镜头
// ---------------------------------------------------------------------------

const REGEN_SYSTEM_PROMPT =
  '你是专业的沙雕动画分镜师。根据用户提供的镜头对话和上下文，重新设计这个镜头的「表情」「动作」「情绪」和「时长」。严格返回JSON对象，不要返回任何其他文字或markdown，格式：{expression:表情描述, action:动作描述, emotion:情绪(只能是开心/愤怒/悲伤/惊讶/平静/紧张/得意/尴尬/害怕/思考之一), duration:预估秒数}。规则：不要改写对话内容本身；duration按4-5字/秒估算，最小0.5秒。'

function extractJsonObject(content: string): string {
  let s = content.trim()
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence) s = fence[1].trim()
  const start = s.indexOf('{')
  const end = s.lastIndexOf('}')
  if (start >= 0 && end > start) s = s.slice(start, end + 1)
  return s
}

export async function regenerateShot(shot: Shot): Promise<RegenShotResult> {
  const config = getAIConfig()
  if (!config.llm.apiBase || !config.llm.apiKey || !config.llm.model) {
    return { ok: false, message: '请先在设置中配置大模型' }
  }
  if (!shot.dialogue || !shot.dialogue.trim()) {
    return { ok: false, message: '该镜头没有对话，无法重新解析' }
  }
  try {
    const userText = [
      `场景：${shot.scene || '（无）'}`,
      `角色：${shot.character || '（无）'}`,
      `对话：${shot.dialogue}`,
    ].join('\n')
    const content = await callLLM(config.llm, userText, REGEN_SYSTEM_PROMPT)
    let obj: unknown
    try {
      obj = JSON.parse(extractJsonObject(content))
    } catch {
      return { ok: false, message: 'AI 返回内容不是合法 JSON' }
    }
    const o = (obj && typeof obj === 'object' ? obj : {}) as Record<string, unknown>
    const emotion: Emotion = EMOTIONS.includes(o.emotion as Emotion)
      ? (o.emotion as Emotion)
      : '平静'
    const updated: Shot = {
      ...shot,
      expression: typeof o.expression === 'string' && o.expression.trim() ? o.expression : shot.expression,
      action: typeof o.action === 'string' && o.action.trim() ? o.action : shot.action,
      emotion,
      duration:
        typeof o.duration === 'number' && o.duration > 0
          ? Math.max(0.5, o.duration)
          : shot.duration,
    }
    return { ok: true, shot: updated }
  } catch (e) {
    return { ok: false, message: errMsg(e) }
  }
}

/** 导出供 voiceover 使用的原始 TTS Buffer 函数 */
export { ttsAudioBuffer }

// ---------------------------------------------------------------------------
// 配音生成（Edge TTS / 通用 TTS）
// ---------------------------------------------------------------------------

import { writeFileSync, readFileSync, mkdirSync, existsSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { getDataDir } from './database'
import type { VoiceGenItem, VoiceGenResult } from '../shared/types'

/** 判定 TTS 提供商：显式配置优先；未配置接口地址时默认走本地引擎（免配置可用） */
function ttsProviderOf(config: TTSConfig): 'local' | 'http' {
  if (config.provider === 'local' || config.provider === 'http') return config.provider
  return config.apiBase && config.apiKey ? 'http' : 'local'
}

export async function generateVoiceover(item: VoiceGenItem): Promise<VoiceGenResult> {
  const config = getAIConfig()
  if (!item.text.trim()) {
    return { ok: false, message: '文本为空' }
  }
  const provider = ttsProviderOf(config.tts)
  if (provider === 'http' && (!config.tts.apiBase || !config.tts.apiKey)) {
    return { ok: false, message: '请先在「设置」中配置 TTS 接口' }
  }
  try {
    const dir = join(getDataDir(), 'voiceovers')
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    const base = join(dir, `voice-${item.shotId}-${Date.now()}`)

    if (provider === 'local') {
      const { filePath } = await synthesizeLocal(item.text, {
        voiceName: config.tts.localVoice,
        // 以「设置」里的语速为准（试听与批量配音保持一致）
        speed: config.tts.speed || item.speed || 1,
        volume: 1,
      }, base)
      return { ok: true, file: `voiceovers/${filePath.split(/[\\/]/).pop()}`, speed: config.tts.speed }
    }

    const { buf, ext } = await ttsAudioBuffer(config.tts, item.text)
    const filename = `${base.split(/[\\/]/).pop()}.${ext}`
    writeFileSync(join(dir, filename), buf)
    return { ok: true, file: `voiceovers/${filename}`, speed: config.tts.speed }
  } catch (e) {
    return { ok: false, message: errMsg(e) }
  }
}
