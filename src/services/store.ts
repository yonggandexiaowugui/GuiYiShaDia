// ============================================================================
// 全局状态（zustand）：素材库 + 轨道/片段（Clip） + 播放控制
// 渲染循环里用 getState() 非响应式读取，不触发重渲染
// ============================================================================
import { create } from 'zustand'
import type {
  Clip,
  Material,
  MaterialCategory,
  ProjectFile,
  ExportSettings,
  PsdLayerImportItem,
  PsdLayerInfo,
  Shot,
  SubtitleStyle,
  Track,
  TrackType,
  UpdateMaterialInput,
  VoiceGenItem,
} from '@shared/types'
import {
  CATEGORY_ALL,
  CATEGORY_TO_TRACK_TYPE,
  createDefaultTracks,
  DEFAULT_EXPORT_SETTINGS,
  DEFAULT_SUBTITLE_STYLE,
  PROJECT_VERSION,
  TRACK_COLORS,
} from '@shared/types'
import { probeAudioDuration } from './audioEngine'
import { runExport } from './exporter'
import { parseRiggedMeta } from '@shared/characterRig'
import { totalDuration } from './timelineUtils'

const IMAGE_EXTS = ['.png', '.jpg', '.jpeg', '.webp']
const AUDIO_EXTS = ['.mp3', '.wav', '.ogg', '.m4a']

/** 导出取消标志（供 shouldContinue 轮询） */
let exportCancelled = false

function extOf(p: string): string {
  const m = /\.[a-z0-9]+$/i.exec(p)
  return m ? m[0].toLowerCase() : ''
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

function genId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`
}

let toastSeq = 0

/** 片段剪贴板：带上所属轨道类型，便于目标轨道已被删除时回退到同类型轨道 */
let clipClipboard: Array<{ clip: Clip; trackType: TrackType }> = []

const TYPE_LABELS: Record<TrackType, string> = {
  scene: '场景',
  character: '角色',
  expression: '表情',
  effect: '特效',
  voice: '配音',
  sfx: '音效',
}

export interface Toast {
  id: number
  text: string
}

/** 当前选中的 clip 位置 */
export interface SelectedClip {
  trackId: string
  clipId: string
}

interface GuiYiState {
  // 素材库
  materials: Material[]
  activeCategory: MaterialCategory | typeof CATEGORY_ALL
  selectedMaterialId: string | null
  loading: boolean
  search: string
  importing: boolean

  // PSD 导入弹窗
  psdDialog: { filePath: string; layers: PsdLayerInfo[] } | null

  // toast
  toasts: Toast[]

  // 工程
  project: ProjectFile | null

  // 轨道 / 片段
  tracks: Track[]
  /** 主选中片段（属性面板展示它） */
  selectedClip: SelectedClip | null
  /** 全部选中片段的 id（支持多选批量操作） */
  selectedIds: string[]

  // 历史（撤销/重做）与吸附
  history: Track[][]
  future: Track[][]
  snapEnabled: boolean

  // 预览方向
  orientation: 'portrait' | 'landscape'

  // 播放状态
  isPlaying: boolean
  currentTime: number
  playbackRate: number

  // 标尺缩放
  pxPerSec: number

  // actions：素材
  setCategory: (c: MaterialCategory | typeof CATEGORY_ALL) => void
  setSearch: (q: string) => void
  selectMaterial: (id: string | null) => void
  loadMaterials: () => Promise<void>
  addMaterial: (name: string, category: MaterialCategory) => Promise<void>
  updateMaterial: (id: string, data: UpdateMaterialInput) => Promise<void>
  deleteMaterial: (id: string) => Promise<void>

  // actions：导入
  importFiles: () => Promise<void>
  confirmPsd: (items: PsdLayerImportItem[]) => Promise<void>
  closePsd: () => void

  // actions：toast
  pushToast: (text: string) => void
  dismissToast: (id: number) => void

  // actions：轨道 / 片段
  addClip: (trackId: string, materialId: string, start: number) => Clip | null
  addVoiceClip: (text: string, start: number, duration?: number) => Clip | null
  updateClip: (trackId: string, clipId: string, patch: Partial<Clip>) => void
  deleteClip: (trackId: string, clipId: string) => void
  moveClip: (trackId: string, clipId: string, newStart: number) => void
  resizeClip: (trackId: string, clipId: string, edge: 'l' | 'r', newValue: number) => void
  /** mode: replace 单选 / toggle 多选(Ctrl) / range 区间(Shift) */
  selectClip: (sel: SelectedClip | null, mode?: 'replace' | 'toggle' | 'range') => void
  /** 直接设置选中集合（框选用），主片段取集合第一个 */
  setSelection: (ids: string[]) => void
  /** 全选所有片段 */
  selectAllClips: () => void
  /** 删除全部选中片段 */
  deleteSelectedClips: () => void
  /** 以给定原点整体平移一组片段（群组拖拽用），整体夹到 0 以上 */
  moveClipsAsGroup: (origins: Array<{ clipId: string; start: number }>, deltaSec: number) => void
  /** 方向键微调：对当前选中片段整体平移（自带历史快照） */
  nudgeSelectedClips: (deltaSec: number) => void
  /** 复制选中片段到内部剪贴板 */
  copySelectedClips: () => void
  /** 在播放头处粘贴剪贴板片段 */
  pasteClips: () => void
  duplicateClip: (trackId: string, clipId: string) => void
  moveClipToTrack: (clipId: string, fromTrackId: string, toTrackId: string, newStart: number) => void

  // actions：轨道管理（多条素材叠加）
  addTrack: (type: TrackType) => string
  deleteTrack: (trackId: string) => void

  // actions：历史 / 吸附
  beginInteraction: () => void
  undo: () => void
  redo: () => void
  setSnapEnabled: (v: boolean) => void

  // actions：时间轴缩放
  setPxPerSec: (px: number) => void
  zoomBy: (factor: number) => void

  // actions：预览方向
  setOrientation: (o: 'portrait' | 'landscape') => void

  // actions：播放控制
  play: () => void
  pause: () => void
  togglePlay: () => void
  setCurrentTime: (t: number) => void
  setPlaybackRate: (r: number) => void

  // actions：配音
  generateVoiceovers: () => Promise<void>

  // actions：AI 剧本解析
  setTracks: (tracks: Track[]) => void
  parseScript: (script: string) => Promise<void>
  loadDemo: (presetId?: string) => void
  regenerateShot: (index: number) => Promise<void>

  // actions：导出
  exportStatus: { running: boolean; phase: string; current: number; total: number } | null
  exportDone: { ok: boolean; path?: string; message?: string; cancelled?: boolean } | null
  runExport: () => Promise<void>
  cancelExportRun: () => Promise<void>
  dismissExportDone: () => void

  // actions：工程
  subtitleStyle: SubtitleStyle
  setSubtitleStyle: (patch: Partial<SubtitleStyle>) => void
  exportSettings: ExportSettings
  setExportSettings: (patch: Partial<ExportSettings>) => void
  projectName: string
  projectPath: string | null
  /** 把当前状态序列化成工程数据（保存与自动保存共用） */
  toProjectData: () => ProjectFile
  saveProject: () => Promise<void>
  openProject: () => Promise<void>
  newProject: () => void
}

// totalDuration 统一放在 timelineUtils，此处引入并再导出，避免两套签名混淆
export { totalDuration } from './timelineUtils'

/** 一键示例模板：使用内置素材名，不依赖 AI，点一下就有一个完整短片 */
export interface DemoPreset {
  id: string
  label: string
  shots: Shot[]
  /** 特效片段：按关键词在内置素材里查找 */
  fx: Array<{ kw: string; start: number; duration: number }>
  /** 音效片段 */
  sfx: Array<{ kw: string; start: number; duration: number; volume: number }>
}

export const DEMO_PRESETS: DemoPreset[] = [
  {
    id: 'mystery',
    label: '神秘复苏 · 深夜街头',
    shots: [
      { id: 'd1', index: 1, scene: '午夜街道', character: '大方脸·平静', expression: '', action: '缓步前行', dialogue: '这条街……怎么一个人都没有。', emotion: '平静', duration: 3, motion: 'zoom' },
      { id: 'd2', index: 2, scene: '午夜街道', character: '大方脸·害怕', expression: '', action: '猛然回头', dialogue: '谁？！出来！', emotion: '害怕', duration: 2.4, motion: 'shake' },
      { id: 'd3', index: 3, scene: '诡异走廊', character: '大方脸·愤怒', expression: '', action: '缓缓逼近', dialogue: '你逃不掉的。', emotion: '愤怒', duration: 3, motion: 'slideL' },
      { id: 'd4', index: 4, scene: '深夜卧室', character: '大方脸·害怕', expression: '', action: '无力跪地', dialogue: '我……这具身体里，为什么这么痛。', emotion: '悲伤', duration: 3.2, motion: 'idle' },
    ],
    fx: [
      { kw: '感叹号', start: 3.1, duration: 1.6 },
      { kw: '红眼', start: 5.4, duration: 2.6 },
    ],
    sfx: [
      { kw: '低鸣', start: 0, duration: 3, volume: 0.55 },
      { kw: '心跳', start: 3, duration: 2.4, volume: 0.85 },
      { kw: '吱呀', start: 5, duration: 3, volume: 0.7 },
    ],
  },
  {
    id: 'slapstick',
    label: '沙雕日常 · 打脸现场',
    shots: [
      { id: 's1', index: 1, scene: '深夜卧室', character: '大方脸·开心', expression: '', action: '叉腰宣布', dialogue: '我今天一定要证明自己！', emotion: '开心', duration: 3, motion: 'zoom' },
      { id: 's2', index: 2, scene: '深夜卧室', character: '大方脸·惊讶', expression: '', action: '被当场打脸', dialogue: '啪！', emotion: '惊讶', duration: 2, motion: 'shake' },
      { id: 's3', index: 3, scene: '午夜街道', character: '大方脸·愤怒', expression: '', action: '回头质问', dialogue: '你不是说很简单吗？', emotion: '愤怒', duration: 3, motion: 'slideL' },
      { id: 's4', index: 4, scene: '午夜街道', character: '大方脸·害怕', expression: '', action: '扭头就跑', dialogue: '闭嘴，快跑。', emotion: '害怕', duration: 2.6, motion: 'idle' },
    ],
    fx: [
      { kw: '感叹号', start: 2.5, duration: 1.4 },
      { kw: '汗滴', start: 5.0, duration: 1.8 },
      { kw: '黑线', start: 7.2, duration: 2.0 },
    ],
    sfx: [
      { kw: '嗖', start: 0, duration: 1.5, volume: 0.6 },
      { kw: '咚', start: 2.6, duration: 2.0, volume: 0.9 },
    ],
  },
  {
    id: 'loop',
    label: '诡异循环 · 走廊尽头',
    shots: [
      { id: 'l1', index: 1, scene: '诡异走廊', character: '大方脸·平静', expression: '', action: '走向尽头', dialogue: '再走一遍，就到家了。', emotion: '平静', duration: 3, motion: 'slideR' },
      { id: 'l2', index: 2, scene: '诡异走廊', character: '大方脸·害怕', expression: '', action: '停住脚步', dialogue: '……怎么还是这条走廊？', emotion: '害怕', duration: 3, motion: 'shake' },
      { id: 'l3', index: 3, scene: '诡异走廊', character: '大方脸·惊讶', expression: '', action: '猛拍墙面', dialogue: '门呢？！门去哪了！', emotion: '惊讶', duration: 3.2, motion: 'zoom' },
      { id: 'l4', index: 4, scene: '诡异走廊', character: '大方脸·害怕', expression: '', action: '缓缓回头', dialogue: '不……不对，是我没动过。', emotion: '害怕', duration: 3.4, motion: 'idle' },
    ],
    fx: [
      { kw: '问号', start: 2.6, duration: 1.5 },
      { kw: '红眼', start: 6.0, duration: 3.0 },
    ],
    sfx: [
      { kw: '低鸣', start: 0, duration: 6, volume: 0.5 },
      { kw: '心跳', start: 6, duration: 3, volume: 0.8 },
    ],
  },
]

/** 将 AI 返回的 Shot[] 拆分到各轨道 */
function shotsToTracks(shots: Shot[], materials: Material[]): Track[] {
  const tracks = createDefaultTracks()

  const findId = (name: string, cat: MaterialCategory): string | null => {
    if (!name) return null
    const m = materials.find(
      (x) => x.category === cat && (x.name === name || x.tags.includes(name)),
    )
    if (m) return m.id
    // 模糊匹配
    const norm = name.trim().toLowerCase()
    const fuzzy = materials.find(
      (x) =>
        x.category === cat &&
        (x.name.toLowerCase().includes(norm) || norm.includes(x.name.toLowerCase())),
    )
    return fuzzy?.id ?? null
  }

  let cursor = 0
  for (const sh of shots) {
    const dur = sh.duration ?? 3
    const start = cursor

    // scene
    const sceneId = findId(sh.scene, '场景')
    if (sceneId) {
      const tr = tracks.find((t) => t.type === 'scene')!
      // 如果与上一个场景相同则延长
      const last = tr.clips[tr.clips.length - 1]
      if (last && last.materialId === sceneId) {
        last.duration = start + dur - last.start
      } else {
        tr.clips.push({
          id: genId(),
          trackId: tr.id,
          materialId: sceneId,
          name: sh.scene || '场景',
          start,
          duration: dur,
          motion: sh.motion,
          emotion: sh.emotion,
        })
      }
    }

    // character
    const charId = findId(sh.character, '角色')
    if (charId) {
      const tr = tracks.find((t) => t.type === 'character')!
      tr.clips.push({
        id: genId(),
        trackId: tr.id,
        materialId: charId,
        name: sh.character || '角色',
        start,
        duration: dur,
        motion: sh.motion,
        emotion: sh.emotion,
      })
    }

    // expression
    const expId = findId(sh.expression, '表情')
    if (expId) {
      const tr = tracks.find((t) => t.type === 'expression')!
      tr.clips.push({
        id: genId(),
        trackId: tr.id,
        materialId: expId,
        name: sh.expression || '表情',
        start,
        duration: dur,
        emotion: sh.emotion,
      })
    }

    // voice（台词）
    if (sh.dialogue?.trim()) {
      const tr = tracks.find((t) => t.type === 'voice')!
      tr.clips.push({
        id: genId(),
        trackId: tr.id,
        materialId: null,
        name: sh.dialogue.slice(0, 16) + (sh.dialogue.length > 16 ? '…' : ''),
        start,
        duration: dur,
        text: sh.dialogue,
        emotion: sh.emotion,
      })
    }

    cursor += dur
  }

  return tracks
}

export const useStore = create<GuiYiState>((set, get) => {
  /** 记录一次可撤销的历史快照（在离散操作前调用） */
  const snapshot = (): void => {
    const h = get().history
    set({ history: [...h, get().tracks].slice(-80), future: [] })
  }

  return {
  materials: [],
  activeCategory: CATEGORY_ALL,
  selectedMaterialId: null,
  loading: false,
  search: '',
  importing: false,
  psdDialog: null,
  toasts: [],
  project: null,
  tracks: createDefaultTracks(),
  selectedClip: null,
  selectedIds: [],
  history: [],
  future: [],
  snapEnabled: true,
  exportStatus: null,
  exportDone: null,
  projectName: '诡异沙雕动画',
  projectPath: null,
  subtitleStyle: { ...DEFAULT_SUBTITLE_STYLE },
  exportSettings: { ...DEFAULT_EXPORT_SETTINGS },
  orientation: 'landscape',
  isPlaying: false,
  currentTime: 0,
  playbackRate: 1,
  pxPerSec: 80,

  setCategory: (c) => {
    set({ activeCategory: c })
    void get().loadMaterials()
  },
  setSearch: (q) => set({ search: q }),
  selectMaterial: (id) => set({ selectedMaterialId: id }),

  loadMaterials: async () => {
    set({ loading: true })
    try {
      const list = await window.api.getMaterials(get().activeCategory)
      set({ materials: list })
    } catch (e) {
      get().pushToast('加载素材失败：' + errMsg(e))
    } finally {
      set({ loading: false })
    }
  },

  addMaterial: async (name, category) => {
    await window.api.addMaterial({ name, category, file_path: `assets/${category}/placeholder` })
    await get().loadMaterials()
  },

  updateMaterial: async (id, data) => {
    try {
      await window.api.updateMaterial(id, data)
      await get().loadMaterials()
    } catch (e) {
      get().pushToast('更新素材失败：' + errMsg(e))
    }
  },

  deleteMaterial: async (id) => {
    try {
      await window.api.deleteMaterial(id)
      if (get().selectedMaterialId === id) set({ selectedMaterialId: null })
      await get().loadMaterials()
    } catch (e) {
      get().pushToast('删除素材失败：' + errMsg(e))
    }
  },

  importFiles: async () => {
    if (get().importing) return
    set({ importing: true })
    try {
      const paths = await window.api.selectFiles()
      for (const p of paths) {
        const ext = extOf(p)
        if (ext === '.psd') {
          try {
            const layers = await window.api.importPSD(p)
            if (!layers.length) {
              get().pushToast('该 PSD 没有可导入的图层')
              continue
            }
            set({ psdDialog: { filePath: p, layers } })
          } catch (e) {
            get().pushToast('解析 PSD 失败：' + errMsg(e))
          }
        } else if (IMAGE_EXTS.includes(ext)) {
          try {
            await window.api.importImage(p)
          } catch (e) {
            get().pushToast('导入图片失败：' + errMsg(e))
          }
        } else if (AUDIO_EXTS.includes(ext)) {
          try {
            await window.api.importAudio(p)
          } catch (e) {
            get().pushToast('导入音频失败：' + errMsg(e))
          }
        } else {
          get().pushToast('不支持的文件类型：' + ext)
        }
      }
      await get().loadMaterials()
    } finally {
      set({ importing: false })
    }
  },

  confirmPsd: async (items) => {
    const dlg = get().psdDialog
    if (!dlg) return
    try {
      await window.api.importPSDLayers(dlg.filePath, items)
      set({ psdDialog: null })
      await get().loadMaterials()
      get().pushToast(`已导入 ${items.length} 个图层`)
    } catch (e) {
      get().pushToast('导入 PSD 图层失败：' + errMsg(e))
    }
  },

  closePsd: () => set({ psdDialog: null }),

  pushToast: (text) => {
    const id = ++toastSeq
    set({ toasts: [...get().toasts, { id, text }] })
    setTimeout(() => get().dismissToast(id), 3600)
  },
  dismissToast: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),

  // ---------------------------------------------------------------------------
  // Clip 操作
  // ---------------------------------------------------------------------------
  addClip: (trackId, materialId, start) => {
    const st = get()
    const m = st.materials.find((x) => x.id === materialId)
    const track = st.tracks.find((t) => t.id === trackId)
    if (!m || !track) return null
    snapshot()
    const dur = 3
    const clip: Clip = {
      id: genId(),
      trackId: track.id,
      materialId: m.id,
      name: m.name,
      start: Math.max(0, start),
      duration: dur,
      sourceDuration: dur,
      volume: 1,
      color: TRACK_COLORS[track.type],
      // 素材标记为可循环（如 BGM）时，片段默认开启循环铺满
      ...(m.loopFlag ? { loop: true } : {}),
      // 绑骨角色素材：默认播放待机骨骼动作
      ...(parseRiggedMeta(m.meta) ? { rigClipId: 'idle' } : {}),
    }
    set({
      tracks: st.tracks.map((t) =>
        t.id === track.id ? { ...t, clips: [...t.clips, clip] } : t,
      ),
      selectedClip: { trackId: track.id, clipId: clip.id },
      selectedIds: [clip.id],
    })

    // 音效：用音频真实时长回写片段长度，避免被默认 3s 截断或拖长
    if (track.type === 'sfx') {
      const url = window.api.assetUrl(m.file_path)
      void probeAudioDuration(url).then((d) => {
        if (d > 0.2) get().updateClip(track.id, clip.id, { duration: d, sourceDuration: d })
      })
    }
    return clip
  },

  addVoiceClip: (text, start, duration) => {
    const st = get()
    const track = st.tracks.find((t) => t.type === 'voice')
    if (!track) return null
    snapshot()
    const clip: Clip = {
      id: genId(),
      trackId: track.id,
      materialId: null,
      name: text.length > 16 ? text.slice(0, 16) + '…' : text,
      start: Math.max(0, start),
      duration: duration ?? Math.max(1, text.length / 4),
      text,
      color: TRACK_COLORS.voice,
    }
    set({
      tracks: st.tracks.map((t) =>
        t.id === track.id ? { ...t, clips: [...t.clips, clip] } : t,
      ),
      selectedClip: { trackId: track.id, clipId: clip.id },
      selectedIds: [clip.id],
    })
    return clip
  },

  updateClip: (trackId, clipId, patch) => {
    set({
      tracks: get().tracks.map((t) =>
        t.id === trackId
          ? { ...t, clips: t.clips.map((c) => (c.id === clipId ? { ...c, ...patch } : c)) }
          : t,
      ),
    })
  },

  deleteClip: (trackId, clipId) => {
    snapshot()
    const st = get()
    set({
      tracks: st.tracks.map((t) =>
        t.id === trackId ? { ...t, clips: t.clips.filter((c) => c.id !== clipId) } : t,
      ),
      selectedIds: st.selectedIds.filter((id) => id !== clipId),
      selectedClip: st.selectedClip?.clipId === clipId ? null : st.selectedClip,
    })
  },

  duplicateClip: (trackId, clipId) => {
    const st = get()
    const src = st.tracks.find((t) => t.id === trackId)?.clips.find((c) => c.id === clipId)
    if (!src) return
    snapshot()
    const copy: Clip = { ...src, id: genId(), start: src.start + src.duration }
    set({
      tracks: st.tracks.map((t) =>
        t.id === trackId ? { ...t, clips: [...t.clips, copy] } : t,
      ),
      selectedClip: { trackId, clipId: copy.id },
      selectedIds: [copy.id],
    })
  },

  moveClip: (trackId, clipId, newStart) => {
    set({
      tracks: get().tracks.map((t) =>
        t.id === trackId
          ? {
              ...t,
              clips: t.clips.map((c) =>
                c.id === clipId ? { ...c, start: Math.max(0, newStart) } : c,
              ),
            }
          : t,
      ),
    })
  },

  moveClipToTrack: (clipId, fromTrackId, toTrackId, newStart) => {
    const st = get()
    if (fromTrackId === toTrackId) {
      st.moveClip(fromTrackId, clipId, newStart)
      return
    }
    const src = st.tracks.find((t) => t.id === fromTrackId)?.clips.find((c) => c.id === clipId)
    if (!src) return
    snapshot()
    const moved: Clip = { ...src, trackId: toTrackId, start: Math.max(0, newStart) }
    set({
      tracks: st.tracks.map((t) => {
        if (t.id === fromTrackId) return { ...t, clips: t.clips.filter((c) => c.id !== clipId) }
        if (t.id === toTrackId) return { ...t, clips: [...t.clips, moved] }
        return t
      }),
      selectedClip: { trackId: toTrackId, clipId },
      selectedIds: [clipId],
    })
  },

  resizeClip: (trackId, clipId, edge, newValue) => {
    set({
      tracks: get().tracks.map((t) => {
        if (t.id !== trackId) return t
        const clips = t.clips.map((c) => {
          if (c.id !== clipId) return c
          if (edge === 'r') {
            const dur = Math.max(0.2, newValue - c.start)
            // 循环片段可任意拉长（超出音频源长度会重复播放）；其余封顶在音频源时长
            const maxDur =
              c.loop === true
                ? Infinity
                : c.sourceDuration && c.sourceDuration > 0
                  ? c.sourceDuration
                  : Infinity
            return { ...c, duration: Math.min(dur, maxDur) }
          }
          const right = c.start + c.duration
          const newStart = Math.max(0, Math.min(newValue, right - 0.2))
          return { ...c, start: newStart, duration: right - newStart }
        })
        return { ...t, clips }
      }),
    })
  },

  selectClip: (sel, mode = 'replace') => {
    const st = get()
    if (!sel) {
      set({ selectedClip: null, selectedIds: [] })
      return
    }
    if (mode === 'replace') {
      set({ selectedClip: sel, selectedIds: [sel.clipId] })
      return
    }
    if (mode === 'toggle') {
      const has = st.selectedIds.includes(sel.clipId)
      const next = has
        ? st.selectedIds.filter((id) => id !== sel.clipId)
        : [...st.selectedIds, sel.clipId]
      set({
        selectedIds: next,
        // 取消的正是主选中时，主选中退到剩下任意一个
        selectedClip: has
          ? st.selectedClip?.clipId === sel.clipId
            ? null
            : st.selectedClip
          : sel,
      })
      return
    }
    // range：同一轨道内按开始时间做区间选择
    const track = st.tracks.find((t) => t.id === sel.trackId)
    const anchorId = st.selectedClip?.trackId === sel.trackId ? st.selectedClip.clipId : null
    const order = track ? [...track.clips].sort((a, b) => a.start - b.start).map((c) => c.id) : []
    const i = anchorId ? order.indexOf(anchorId) : -1
    const j = order.indexOf(sel.clipId)
    if (i < 0 || j < 0) {
      set({ selectedClip: sel, selectedIds: [sel.clipId] })
      return
    }
    const [lo, hi] = i <= j ? [i, j] : [j, i]
    set({ selectedClip: sel, selectedIds: order.slice(lo, hi + 1) })
  },

  setSelection: (ids) => {
    const st = get()
    if (ids.length === 0) {
      set({ selectedIds: [], selectedClip: null })
      return
    }
    const primary = st.tracks
      .flatMap((t) => t.clips.map((c) => ({ trackId: t.id, clipId: c.id })))
      .find((x) => ids.includes(x.clipId))
    set({ selectedIds: ids, selectedClip: primary ?? null })
  },

  selectAllClips: () => {
    const st = get()
    const all = st.tracks.flatMap((t) => t.clips.map((c) => ({ trackId: t.id, clipId: c.id })))
    if (all.length === 0) return
    set({ selectedIds: all.map((a) => a.clipId), selectedClip: all[0] })
  },

  /** 删除全部选中片段 */
  deleteSelectedClips: () => {
    const st = get()
    const ids = st.selectedIds.length > 0
      ? st.selectedIds
      : st.selectedClip
        ? [st.selectedClip.clipId]
        : []
    if (ids.length === 0) return
    snapshot()
    set({
      tracks: st.tracks.map((t) => ({ ...t, clips: t.clips.filter((c) => !ids.includes(c.id)) })),
      selectedClip: null,
      selectedIds: [],
    })
    st.pushToast(ids.length > 1 ? `已删除 ${ids.length} 个片段` : '已删除片段')
  },

  moveClipsAsGroup: (origins, deltaSec) => {
    if (origins.length === 0) return
    const st = get()
    // 整体夹到 0 以上，保证组内相对位置不被打乱
    const delta = Math.max(deltaSec, -Math.min(...origins.map((o) => o.start)))
    if (Math.abs(delta) < 1e-6) return
    const next = new Map(origins.map((o) => [o.clipId, Math.max(0, o.start + delta)]))
    set({
      tracks: st.tracks.map((t) => ({
        ...t,
        clips: t.clips.map((c) => (next.has(c.id) ? { ...c, start: next.get(c.id)! } : c)),
      })),
    })
  },

  nudgeSelectedClips: (deltaSec) => {
    const st = get()
    const ids = st.selectedIds.length > 0
      ? st.selectedIds
      : st.selectedClip
        ? [st.selectedClip.clipId]
        : []
    if (ids.length === 0) return
    const origins = st.tracks
      .flatMap((t) => t.clips)
      .filter((c) => ids.includes(c.id))
      .map((c) => ({ clipId: c.id, start: c.start }))
    snapshot()
    st.moveClipsAsGroup(origins, deltaSec)
  },

  copySelectedClips: () => {
    const st = get()
    const ids = st.selectedIds.length > 0
      ? st.selectedIds
      : st.selectedClip
        ? [st.selectedClip.clipId]
        : []
    if (ids.length === 0) {
      st.pushToast('没有选中片段')
      return
    }
    const items: Array<{ clip: Clip; trackType: TrackType }> = []
    for (const t of st.tracks) {
      for (const c of t.clips) {
        if (ids.includes(c.id)) items.push({ clip: { ...c }, trackType: t.type })
      }
    }
    clipClipboard = items
    st.pushToast(`已复制 ${items.length} 个片段`)
  },

  pasteClips: () => {
    const st = get()
    if (clipClipboard.length === 0) {
      st.pushToast('剪贴板为空')
      return
    }
    snapshot()
    const base = Math.min(...clipClipboard.map((i) => i.clip.start))
    const at = st.currentTime
    const tracks = st.tracks.map((t) => ({ ...t, clips: [...t.clips] }))
    const newIds: string[] = []
    for (const item of clipClipboard) {
      // 优先粘回原轨道；原轨道已被删除时回退到同类型的首个轨道
      const target =
        tracks.find((t) => t.id === item.clip.trackId) ?? tracks.find((t) => t.type === item.trackType)
      if (!target) continue
      const copy: Clip = {
        ...item.clip,
        id: genId(),
        trackId: target.id,
        start: Math.max(0, at + (item.clip.start - base)),
      }
      target.clips.push(copy)
      newIds.push(copy.id)
    }
    if (newIds.length === 0) {
      st.pushToast('没有可粘贴的目标轨道')
      return
    }
    const primary = tracks
      .flatMap((t) => t.clips.map((c) => ({ trackId: t.id, clipId: c.id })))
      .find((x) => newIds.includes(x.clipId))
    set({ tracks, selectedIds: newIds, selectedClip: primary ?? null })
    st.pushToast(`已粘贴 ${newIds.length} 个片段（${at.toFixed(1)}s 处）`)
  },

  // ---- 轨道管理（多条素材叠加） ----
  addTrack: (type) => {
    const st = get()
    snapshot()
    const count = st.tracks.filter((t) => t.type === type).length
    const base = TYPE_LABELS[type]
    const track: Track = {
      id: `${type}-${genId()}`,
      type,
      name: count === 0 ? base : `${base} ${count + 1}`,
      clips: [],
    }
    const tracks = [...st.tracks]
    let insertAt = tracks.length
    for (let i = tracks.length - 1; i >= 0; i--) {
      if (tracks[i].type === type) {
        insertAt = i + 1
        break
      }
    }
    tracks.splice(insertAt, 0, track)
    set({ tracks })
    return track.id
  },

  deleteTrack: (trackId) => {
    const st = get()
    const target = st.tracks.find((t) => t.id === trackId)
    if (!target) return
    if (st.tracks.filter((t) => t.type === target.type).length <= 1) {
      st.pushToast(`「${target.name}」是唯一的轨道，不能删除`)
      return
    }
    snapshot()
    set({ tracks: st.tracks.filter((t) => t.id !== trackId), selectedClip: null, selectedIds: [] })
  },

  // ---- 历史 / 吸附 ----
  beginInteraction: () => snapshot(),

  undo: () => {
    const h = get().history
    if (h.length === 0) {
      get().pushToast('没有可撤销的操作')
      return
    }
    set({
      tracks: h[h.length - 1],
      history: h.slice(0, -1),
      future: [get().tracks, ...get().future].slice(0, 80),
      selectedClip: null,
      selectedIds: [],
    })
  },

  redo: () => {
    const f = get().future
    if (f.length === 0) return
    set({
      tracks: f[0],
      future: f.slice(1),
      history: [...get().history, get().tracks],
      selectedClip: null,
      selectedIds: [],
    })
  },

  setSnapEnabled: (v) => set({ snapEnabled: v }),

  setPxPerSec: (px) => set({ pxPerSec: Math.max(20, Math.min(400, px)) }),
  zoomBy: (factor) => get().setPxPerSec(get().pxPerSec * factor),

  setOrientation: (o) => set({ orientation: o }),

  play: () => set({ isPlaying: true }),
  pause: () => set({ isPlaying: false }),
  togglePlay: () => set({ isPlaying: !get().isPlaying }),
  setCurrentTime: (t) => set({ currentTime: Math.max(0, t) }),
  setPlaybackRate: (r) => set({ playbackRate: Math.max(0.25, Math.min(4, r)) }),

  generateVoiceovers: async () => {
    const st = get()
    const voiceTracks = st.tracks.filter((t) => t.type === 'voice')
    if (voiceTracks.length === 0) return
    const toGen = voiceTracks.flatMap((t) => t.clips.filter((c) => c.text && !c.voiceFile))
    if (toGen.length === 0) {
      st.pushToast('没有需要配音的片段')
      return
    }
    snapshot()
    st.pushToast(`开始生成 ${toGen.length} 条配音…`)
    const results: Array<{ clipId: string; file: string; duration: number }> = []
    for (const clip of toGen) {
      try {
        const result = await window.api.generateVoiceover({
          shotIndex: 0,
          shotId: clip.id,
          text: clip.text!,
          speed: 1,
        })
        if (result.ok && result.file) {
          // 读取音频真实时长，用于回写片段时长（保证字幕/口型对齐）
          const url = window.api.assetUrl(result.file)
          const duration = await probeAudioDuration(url)
          results.push({ clipId: clip.id, file: result.file, duration })
        } else if (result.message) {
          st.pushToast(`配音「${clip.name}」失败：${result.message}`)
        }
      } catch (e) {
        st.pushToast(`配音「${clip.name}」失败：${errMsg(e)}`)
      }
    }
    // 批量写回
    if (results.length > 0) {
      const newTracks = get().tracks.map((t) => {
        if (t.type !== 'voice') return t
        return {
          ...t,
          clips: t.clips.map((c) => {
            const hit = results.find((r) => r.clipId === c.id)
            if (!hit) return c
            // 真实时长 > 0 时以音频长度为准，否则保留原估时
            const dur = hit.duration > 0.2 ? hit.duration : c.duration
            return { ...c, voiceFile: hit.file, duration: dur, sourceDuration: dur }
          }),
        }
      })
      set({ tracks: newTracks })
      st.pushToast(`配音完成：${results.length}/${toGen.length} 条成功`)
    } else {
      st.pushToast('配音全部失败，请检查「设置」中的 TTS 配置')
    }
  },

  setTracks: (tracks) => set({ tracks, selectedClip: null, selectedIds: [] }),

  parseScript: async (script) => {
    const st = get()
    try {
      const result = await window.api.parseScript(script, undefined)
      if (!result.ok || !result.shots) {
        st.pushToast(result.message || '剧本解析失败')
        return
      }
      snapshot()
      const tracks = shotsToTracks(result.shots, st.materials)
      set({ tracks, selectedClip: null, selectedIds: [] })
      st.pushToast(`解析出 ${result.shots.length} 个分镜，已拆分到轨道`)
    } catch (e) {
      st.pushToast('剧本解析出错：' + errMsg(e))
    }
  },

  loadDemo: (presetId) => {
    const st = get()
    const preset = DEMO_PRESETS.find((p) => p.id === presetId) ?? DEMO_PRESETS[0]
    snapshot()
    const tracks = shotsToTracks(preset.shots, st.materials)

    const pick = (cat: MaterialCategory, kw: string) =>
      st.materials.find((m) => m.category === cat && (m.name.includes(kw) || m.tags.includes(kw)))

    const mk = (
      track: Track,
      mat: Material,
      start: number,
      duration: number,
      volume: number,
    ): void => {
      track.clips.push({
        id: genId(),
        trackId: track.id,
        materialId: mat.id,
        name: mat.name,
        start,
        duration,
        sourceDuration: duration,
        volume,
        color: TRACK_COLORS[track.type],
      })
    }

    const sfxTrack = tracks.find((t) => t.type === 'sfx')
    if (sfxTrack) {
      for (const s of preset.sfx) {
        const mat = pick('音效', s.kw)
        if (mat) mk(sfxTrack, mat, s.start, s.duration, s.volume)
      }
    }

    const fxTrack = tracks.find((t) => t.type === 'effect')
    if (fxTrack) {
      for (const f of preset.fx) {
        const mat = pick('特效', f.kw)
        if (mat) mk(fxTrack, mat, f.start, f.duration, 1)
      }
    }

    set({ tracks, selectedClip: null, selectedIds: [], currentTime: 0 })
    const missing = preset.sfx.filter((s) => !pick('音效', s.kw)).length +
      preset.fx.filter((f) => !pick('特效', f.kw)).length
    st.pushToast(
      `已载入示例「${preset.label}」${missing > 0 ? `（${missing} 个内置素材缺失，已跳过）` : ''}`,
    )
  },

  regenerateShot: async (index) => {
    // R1-R3 阶段暂时保留接口，后续根据新模型实现
    const st = get()
    st.pushToast('重生成功能将在轨道模型稳定后恢复')
    void index
  },

  // ---------------------------------------------------------------------------
  // 导出
  // ---------------------------------------------------------------------------
  runExport: async () => {
    const st = get()
    const total = totalDuration(st.tracks)
    if (total <= 0) {
      st.pushToast('时间轴为空，没有可导出的内容')
      return
    }
    if (st.exportStatus?.running) return

    // 防护：配音片段只有文字、还没生成音频时，导出会「没有台词」。
    // 这是最容易踩的坑，导出前明确问一次，而不是默默丢声音。
    const pendingVoice = st.tracks
      .filter((t) => t.type === 'voice')
      .flatMap((t) => t.clips)
      .filter((c) => c.text?.trim() && !c.voiceFile).length
    if (pendingVoice > 0) {
      const go = window.confirm(
        `还有 ${pendingVoice} 条台词尚未生成配音。\n\n` +
          `「确定」：先生成配音再导出（推荐，视频里会有台词人声）\n` +
          `「取消」：直接导出（视频里不会有台词人声）`,
      )
      if (go) await get().generateVoiceovers()
    }

    const portrait = st.orientation === 'portrait'
    const width = portrait ? 1080 : 1920
    const height = portrait ? 1920 : 1080
    const fps = st.exportSettings.fps

    exportCancelled = false
    set({
      exportStatus: { running: true, phase: '准备中', current: 0, total: Math.ceil(total * fps) },
      exportDone: null,
    })
    // 导出期间暂停播放，避免音频引擎与渲染争抢
    st.pause()

    const result = await runExport({
      tracks: st.tracks,
      materials: st.materials,
      width,
      height,
      fps,
      totalSeconds: total,
      projectName: '诡异沙雕动画',
      subtitleStyle: st.subtitleStyle,
      crf: st.exportSettings.crf,
      shouldContinue: () => !exportCancelled,
      onProgress: (p) =>
        set({
          exportStatus: {
            running: true,
            phase: p.phase === 'render' ? '渲染画面' : '编码合成',
            current: p.current,
            total: p.total,
          },
        }),
    })

    set({
      exportStatus: null,
      // 主进程返回字段是 outputPath，这里统一成界面用的 path
      exportDone: {
        ok: result.ok,
        path: result.outputPath,
        message: result.message,
        cancelled: result.cancelled,
      },
    })
    if (result.cancelled) {
      st.pushToast('已取消导出')
    } else if (result.ok) {
      st.pushToast('导出完成：' + (result.outputPath ?? ''))
    } else {
      st.pushToast('导出失败：' + (result.message ?? '未知错误'))
    }
  },

  cancelExportRun: async () => {
    exportCancelled = true
    await window.api.cancelExport()
  },

  dismissExportDone: () => set({ exportDone: null }),

  // ---------------------------------------------------------------------------
  // 工程：保存 / 打开 / 新建
  // ---------------------------------------------------------------------------
  saveProject: async () => {
    const st = get()
    const data = st.toProjectData()
    try {
      const savedPath = await window.api.saveProject(st.projectName, data)
      if (!savedPath) return // 用户取消
      // 用文件名回填工程名，后续保存默认用同一个名字
      const base = savedPath.split(/[\\/]/).pop() ?? st.projectName
      set({ projectPath: savedPath, projectName: base.replace(/\.guiyi$/i, '') })
      // 已显式保存，清掉自动保存，避免下次启动重复提示恢复
      void window.api.clearAutosave()
      st.pushToast('工程已保存：' + savedPath)
    } catch (e) {
      st.pushToast('保存工程失败：' + errMsg(e))
    }
  },

  toProjectData: () => {
    const st = get()
    const portrait = st.orientation === 'portrait'
    return {
      version: PROJECT_VERSION,
      name: st.projectName,
      fps: 30,
      resolution: portrait ? [1080, 1920] : [1920, 1080],
      orientation: st.orientation,
      tracks: st.tracks,
      pxPerSec: st.pxPerSec,
      subtitleStyle: st.subtitleStyle,
      exportSettings: st.exportSettings,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
  },

  setSubtitleStyle: (patch) => set({ subtitleStyle: { ...get().subtitleStyle, ...patch } }),
  setExportSettings: (patch) => set({ exportSettings: { ...get().exportSettings, ...patch } }),

  openProject: async () => {
    const st = get()
    try {
      const res = await window.api.openProject()
      if (!res.ok || !res.data) {
        if (res.message && res.message !== '已取消') st.pushToast('打开工程失败：' + res.message)
        return
      }
      const d = res.data
      snapshot()
      set({
        tracks: d.tracks.length > 0 ? d.tracks : createDefaultTracks(),
        projectName: typeof d.name === 'string' && d.name ? d.name : '未命名',
        projectPath: res.path ?? null,
        orientation: d.orientation === 'portrait' ? 'portrait' : 'landscape',
        pxPerSec: typeof d.pxPerSec === 'number' ? d.pxPerSec : 80,
        subtitleStyle: d.subtitleStyle ? { ...DEFAULT_SUBTITLE_STYLE, ...d.subtitleStyle } : { ...DEFAULT_SUBTITLE_STYLE },
        exportSettings: d.exportSettings ? { ...DEFAULT_EXPORT_SETTINGS, ...d.exportSettings } : { ...DEFAULT_EXPORT_SETTINGS },
        selectedClip: null,
        selectedIds: [],
        currentTime: 0,
        isPlaying: false,
      })
      const clipCount = d.tracks.reduce((n, t) => n + t.clips.length, 0)
      st.pushToast(`已打开工程：${d.name || '未命名'}（${clipCount} 个片段）`)
      // 已打开具体工程文件，清除自动保存避免下次启动误提示
      void window.api.clearAutosave()
    } catch (e) {
      st.pushToast('打开工程失败：' + errMsg(e))
    }
  },

  newProject: () => {
    snapshot()
    set({
      tracks: createDefaultTracks(),
      projectName: '诡异沙雕动画',
      projectPath: null,
      selectedClip: null,
      selectedIds: [],
      currentTime: 0,
      isPlaying: false,
      exportDone: null,
    })
    void window.api.clearAutosave()
    get().pushToast('已新建空白工程')
  },
  }
})
