// ============================================================================
// 诡异沙雕动画制作器 · 全局共享类型定义（主进程 / 渲染进程共用）
// 继承自 SandAnim（MIT），扩展竖屏 / 演出模板 / 口型 / 逐词字幕等字段
// ============================================================================

/** 素材分类 */
export type MaterialCategory = '场景' | '角色' | '表情' | '特效' | '音效' | '音乐'

/** 分类顺序 */
export const CATEGORIES: MaterialCategory[] = ['场景', '角色', '表情', '特效', '音效', '音乐']

/** "全部"分类的虚拟值 */
export const CATEGORY_ALL = '全部' as const

/** 单个素材 */
export interface Material {
  id: string
  name: string
  category: MaterialCategory
  tags: string[]
  file_path: string
  thumbnail_path: string | null
  meta: string | null
  created_at: number

  // ---- 动画平滑：素材元数据 ----
  assetType?: string
  minDuration?: number
  maxDuration?: number
  allowHardCut?: boolean
  transitionIds?: string[]
  emotionWeight?: number
  loopFlag?: boolean
}

export interface AddMaterialInput {
  id?: string
  name: string
  category: MaterialCategory
  tags?: string[]
  file_path: string
  thumbnail_path?: string | null
  meta?: string | null
  created_at?: number
}

export interface UpdateMaterialInput {
  name?: string
  category?: MaterialCategory
  tags?: string[]
  assetType?: string
  minDuration?: number
  maxDuration?: number
  allowHardCut?: boolean
  transitionIds?: string[]
  emotionWeight?: number
  loopFlag?: boolean
}

/** PSD 图层信息 */
export interface PsdLayerInfo {
  id: string
  name: string
  width: number
  height: number
  preview: string
  selected: boolean
}

/** PSD 图层导入条目 */
export interface PsdLayerImportItem {
  id: string
  name: string
  category: MaterialCategory
}

// ============================================================================
// AI 配置 + 剧本分镜
// ============================================================================

export const EMOTIONS = [
  '开心', '愤怒', '悲伤', '惊讶', '平静', '紧张', '得意', '尴尬', '害怕', '思考',
] as const

export type Emotion = (typeof EMOTIONS)[number]

/** 动作阶段 */
export interface ActionPhase {
  kind: '预备' | '主体' | '缓冲'
  duration: number
  description?: string
}

export type TransitionKind = '硬切' | '淡入淡出' | '素材过渡'

export interface TransitionPlan {
  kind: TransitionKind
  materialId?: string
  duration?: number
}

/** 演出模板 id */
export type MotionTemplateId =
  | 'idle' | 'zoom' | 'slideL' | 'slideR' | 'shake' | 'title'
  | 'sway' | 'bounce' | 'blackout'

/** 逐词时间戳 */
export interface WordTiming {
  word: string
  offsetMs: number
  durationMs: number
}

/** 口型配置 */
export interface MouthConfig {
  mode: 'twoState' | 'rhubarb'
  cycleMs: number
  openMs: number
}

/** 字幕样式 */
export interface SubtitleStyle {
  /** 字号占画面宽度的比例（0.02~0.08） */
  fontScale: number
  position: 'top' | 'center' | 'bottom'
  /** 描边宽度（按 1080 宽基准的像素） */
  strokeWidth: number
  textColor: string
  /** 是否绘制半透明底条 */
  background: boolean
}

export const DEFAULT_SUBTITLE_STYLE: SubtitleStyle = {
  fontScale: 0.036,
  position: 'bottom',
  strokeWidth: 4,
  textColor: '#ffffff',
  background: true,
}

// ============================================================================
// 轨道 / 片段（剪映式纯轨道驱动，R1 重构核心）
// ============================================================================

/** 轨道类型：决定渲染顺序与素材类别 */
export type TrackType = 'scene' | 'character' | 'expression' | 'effect' | 'voice' | 'sfx'

/** 单个轨道 */
export interface Track {
  id: string
  type: TrackType
  name: string // 显示名（"场景" / "角色" / "表情" / "特效" / "配音" / "音效"）
  clips: Clip[]
}

/** 单个片段：可以是视觉素材（图片）或音频素材（音乐 / 配音） */
export interface Clip {
  id: string
  trackId: string
  materialId: string | null // 关联素材；null = 纯文本配音（待生成）
  name: string
  start: number // 秒，在轨道上的起点
  duration: number // 秒
  // 视觉类扩展
  motion?: MotionTemplateId
  emotion?: Emotion
  // 音频类扩展
  volume?: number
  sourceDuration?: number // 音频源真实时长；视觉类省略（可任意拉伸）
  /** 循环铺满：片段时长可超过音频源长度，超出部分重复播放（BGM 素材默认开启） */
  loop?: boolean
  // 配音专用
  text?: string // 配音台词（生成 TTS 的输入）
  /** 字幕文本：不设置时跟随配音台词；设为空串则不显示字幕（配音与字幕独立控制） */
  subtitle?: string
  voiceFile?: string // TTS 生成的文件相对路径（voiceovers/xxx.mp3）
  color?: string // UI 显示色（覆盖默认轨道色）
}

/** 轨道类型 → 渲染顺序（数值越小越底层） */
export const TRACK_RENDER_ORDER: Record<TrackType, number> = {
  scene: 0,
  character: 1,
  expression: 2,
  effect: 3,
  voice: 99, // 音频，不参与视觉渲染
  sfx: 99,
}

/** 轨道类型 → 素材分类映射（用于从素材库拖拽入轨） */
export const TRACK_TYPE_TO_CATEGORY: Record<TrackType, MaterialCategory | null> = {
  scene: '场景',
  character: '角色',
  expression: '表情',
  effect: '特效',
  voice: null, // 配音由 TTS 生成，不来自素材库
  sfx: '音效',
}

/** 素材分类 → 默认轨道类型 */
export const CATEGORY_TO_TRACK_TYPE: Record<MaterialCategory, TrackType> = {
  场景: 'scene',
  角色: 'character',
  表情: 'expression',
  特效: 'effect',
  音效: 'sfx',
  音乐: 'sfx', // BGM 复用音效轨（长音频片段）
}

/** 轨道类型 → 主题色（用于 clip 显示） */
export const TRACK_COLORS: Record<TrackType, string> = {
  scene: '#4a5a8a',
  character: '#7ec850',
  expression: '#e6a23c',
  effect: '#b291ff',
  voice: '#ff7ab8',
  sfx: '#5ac8dc',
}

/** 创建默认 6 条轨道 */
export function createDefaultTracks(): Track[] {
  return [
    { id: 'track-effect', type: 'effect', name: '特效', clips: [] },
    { id: 'track-expression', type: 'expression', name: '表情', clips: [] },
    { id: 'track-character', type: 'character', name: '角色', clips: [] },
    { id: 'track-scene', type: 'scene', name: '场景', clips: [] },
    { id: 'track-voice', type: 'voice', name: '配音', clips: [] },
    { id: 'track-sfx', type: 'sfx', name: '音效', clips: [] },
  ]
}

/** 分镜镜头（AI 剧本解析输出格式，前端立刻转换为轨道 clips） */
export interface Shot {
  id?: string
  index: number
  scene: string
  character: string
  expression: string
  action: string
  dialogue: string
  emotion: Emotion
  duration: number
  modified?: boolean

  // ---- 动画平滑 ----
  actionPhases?: ActionPhase[]
  emotionStart?: Emotion
  emotionEnd?: Emotion
  transition?: TransitionPlan
  microMotion?: boolean

  // ---- 诡异沙雕扩展 ----
  motion?: MotionTemplateId
  mouth?: MouthConfig
  wordTimings?: WordTiming[]
  subtitleOffsetMs?: number
}

// ============================================================================
// 工程文件（.guiyi，JSON）
// ============================================================================

export interface ProjectFile {
  version: number
  name: string
  fps: number
  resolution: [number, number] // 竖屏 [1080, 1920]
  orientation: 'portrait' | 'landscape'
  /** 全部轨道与片段（工程的唯一内容来源） */
  tracks: Track[]
  pxPerSec?: number
  subtitleStyle?: SubtitleStyle
  exportSettings?: ExportSettings
  createdAt: number
  updatedAt: number
}

/** 工程文件版本 / 扩展名 */
export const PROJECT_VERSION = 1
export const PROJECT_EXT = 'guiyi'

export interface OpenProjectResult {
  ok: boolean
  path?: string
  data?: ProjectFile
  message?: string
}

/** 自动保存读取结果（用于崩溃恢复提示） */
export interface AutosaveResult {
  ok: boolean
  data?: ProjectFile
  /** 自动保存写入时间（毫秒时间戳） */
  savedAt?: number
  message?: string
}

export interface RegenShotResult {
  ok: boolean
  shot?: Shot
  message?: string
}

export interface LLMConfig {
  apiBase: string
  apiKey: string
  model: string
}

export interface TTSConfig {
  /** 提供商：local = 使用系统自带语音引擎（免配置）；http = 自建/第三方 HTTP 接口 */
  provider?: 'local' | 'http'
  /** 本地引擎的声库名（如 "Microsoft Huihui Desktop"）；留空则用系统默认 */
  localVoice?: string
  apiBase: string
  apiKey: string
  voiceId: string
  speed: number
  pitch: number
}

export interface AIConfig {
  llm: LLMConfig
  tts: TTSConfig
  /** AI 绘图（素材生成）：pollinations = 免配置公共源；custom = OpenAI 兼容 images 接口 */
  image?: ImageGenConfig
}

export interface ImageGenConfig {
  provider?: 'pollinations' | 'custom'
  /** custom：OpenAI 兼容接口地址（如 https://api.xxx.com/v1） */
  apiBase: string
  apiKey: string
  model: string
}

export interface ImageGenResult {
  ok: boolean
  message?: string
  seconds?: number
  material?: Material
}

export interface AIResult {
  ok: boolean
  message: string
}

export interface TTSResult extends AIResult {
  dataUrl?: string
}

export interface ParseScriptResult {
  ok: boolean
  shots?: Shot[]
  message?: string
}

// ============================================================================
// 配音 / 音效 / BGM / 导出
// ============================================================================

export interface AudioTrackItem {
  type: 'voice' | 'asset'
  file: string
  startMs: number
  durationMs: number
  volume: number
  /** 循环铺满：片段长于音频源时重复播放（BGM 用） */
  loop?: boolean
}

export interface ExportStartOptions {
  outputPath: string
  width: number
  height: number
  fps: number
  audio: AudioTrackItem[]
  totalSeconds: number
  /** H.264 质量（CRF，越小越清晰、文件越大）。默认 20 */
  crf?: number
}

/** 导出参数（随工程保存） */
export interface ExportSettings {
  /** 帧率：24 更省，60 更顺滑 */
  fps: number
  /** H.264 CRF 质量参数 */
  crf: number
}

export const DEFAULT_EXPORT_SETTINGS: ExportSettings = {
  fps: 30,
  crf: 20,
}

export interface ExportResult {
  ok: boolean
  message?: string
  outputPath?: string
  cancelled?: boolean
}

export interface ExportProgress {
  phase: 'render' | 'encode'
  current: number
  total: number
}

export interface VoiceGenItem {
  shotIndex: number
  shotId: string
  text: string
  speed: number
}

export interface VoiceGenResult {
  ok: boolean
  file?: string
  speed?: number
  message?: string
}

// ============================================================================
// 渲染进程通过 contextBridge 暴露的 window.api 类型
// ============================================================================
export interface GuiYiShaDiaoApi {
  // 素材
  getMaterials: (category?: MaterialCategory | typeof CATEGORY_ALL) => Promise<Material[]>
  addMaterial: (data: AddMaterialInput) => Promise<Material>
  updateMaterial: (id: string, data: UpdateMaterialInput) => Promise<Material | null>
  deleteMaterial: (id: string) => Promise<boolean>
  importImage: (filePath: string) => Promise<Material>
  importPSD: (filePath: string) => Promise<PsdLayerInfo[]>
  importAudio: (filePath: string) => Promise<Material>
  importPSDLayers: (filePath: string, items: PsdLayerImportItem[]) => Promise<Material[]>
  /** 对素材库图片执行本地 AI 去背景，产出新素材（原图保留） */
  removeBackground: (materialId: string) => Promise<Material>
  selectFiles: () => Promise<string[]>
  assetUrl: (relPath: string | null | undefined) => string

  // AI
  getAIConfig: () => Promise<AIConfig>
  saveAIConfig: (config: Partial<AIConfig>) => Promise<AIConfig>
  testLLM: (config: LLMConfig) => Promise<AIResult>
  testTTS: (config: TTSConfig) => Promise<TTSResult>
  /** AI 生成图片素材（走设置里的绘图配置） */
  generateImageMaterial: (prompt: string, category: MaterialCategory) => Promise<ImageGenResult>
  /** 测试绘图配置连通性（不入库） */
  testImageGen: (config: ImageGenConfig) => Promise<ImageGenResult>
  parseScript: (script: string, sampleShots?: Shot[]) => Promise<ParseScriptResult>
  regenerateShot: (shot: Shot) => Promise<RegenShotResult>

  // 工程
  saveProject: (defaultName: string, data: ProjectFile) => Promise<string | null>
  openProject: () => Promise<OpenProjectResult>
  onMenuAction: (cb: (action: 'new' | 'save' | 'open' | 'export') => void) => () => void

  // 自动保存 / 崩溃恢复
  autosaveProject: (data: ProjectFile) => Promise<void>
  readAutosave: () => Promise<AutosaveResult>
  clearAutosave: () => Promise<void>

  // 配音 / 导出
  generateVoiceover: (item: VoiceGenItem) => Promise<VoiceGenResult>
  deleteVoiceoverFile: (file: string) => Promise<boolean>
  listTTSVoices: () => Promise<string[]>
  pickExportPath: (defaultName: string) => Promise<string | null>
  startExport: (opts: ExportStartOptions) => Promise<{ ok: boolean; message?: string }>
  writeFrame: (png: Uint8Array) => Promise<void>
  finishExport: () => Promise<ExportResult>
  cancelExport: () => Promise<void>
  onExportProgress: (cb: (p: ExportProgress) => void) => () => void
  showItemInFolder: (path: string) => void
}

declare global {
  interface Window {
    api: GuiYiShaDiaoApi
  }
}
