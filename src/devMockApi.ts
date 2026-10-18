// ============================================================================
// 开发期浏览器 Mock：仅当在普通浏览器（无 Electron preload）中打开 dev 页面时安装。
// 目的：让 UI 可以在浏览器里被自动化测试（Electron 窗口无法被截图工具访问）。
// 生产环境 / Electron 内不会生效。
// ============================================================================
import type {
  GuiYiShaDiaoApi,
  Material,
  MaterialCategory,
  Shot,
  CATEGORY_ALL,
} from '@shared/types'
import { BUILTIN_RIGGED_CHARACTER } from '@shared/characterRig'

function svg(w: number, h: number, body: string): string {
  return `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${body}</svg>`,
  )}`
}

function sceneSvg(label: string, c1: string, c2: string): string {
  return svg(
    1920,
    1080,
    `<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs>
     <rect width="1920" height="1080" fill="url(#g)"/>
     <rect x="120" y="380" width="260" height="700" fill="rgba(0,0,0,0.35)"/>
     <rect x="420" y="300" width="220" height="780" fill="rgba(0,0,0,0.5)"/>
     <rect x="700" y="440" width="300" height="640" fill="rgba(0,0,0,0.3)"/>
     <rect x="1080" y="340" width="240" height="740" fill="rgba(0,0,0,0.45)"/>
     <rect x="1380" y="420" width="300" height="660" fill="rgba(0,0,0,0.35)"/>
     <text x="960" y="120" fill="rgba(255,255,255,0.5)" font-size="60" font-family="sans-serif" text-anchor="middle">${label}</text>`,
  )
}

function charSvg(name: string, color: string): string {
  return svg(
    600,
    1000,
    `<g fill="${color}">
      <circle cx="300" cy="180" r="110"/>
      <rect x="170" y="310" width="260" height="430" rx="60"/>
      <rect x="120" y="340" width="70" height="330" rx="35"/>
      <rect x="410" y="340" width="70" height="330" rx="35"/>
      <rect x="200" y="740" width="80" height="240" rx="35"/>
      <rect x="320" y="740" width="80" height="240" rx="35"/>
     </g>
     <text x="300" y="960" fill="#fff" font-size="70" font-family="sans-serif" text-anchor="middle">${name}</text>`,
  )
}

function effectSvg(name: string, color: string): string {
  return svg(
    800,
    800,
    `<radialGradient id="r"><stop offset="0" stop-color="${color}" stop-opacity="0.9"/>
      <stop offset="1" stop-color="${color}" stop-opacity="0"/></radialGradient>
     <rect width="800" height="800" fill="url(#r)"/>
     <text x="400" y="430" fill="#fff" font-size="60" font-family="sans-serif" text-anchor="middle">${name}</text>`,
  )
}

function makeMaterial(
  id: string,
  name: string,
  category: MaterialCategory,
  tags: string[],
  file: string,
): Material {
  return {
    id,
    name,
    category,
    tags,
    file_path: file,
    thumbnail_path: file,
    meta: null,
    created_at: Date.now(),
  }
}

const MOCK_MATERIALS: Material[] = [
  makeMaterial('b-scene-street', '午夜街道', '场景', ['内置', '场景', '街道', '夜晚', '路灯'], sceneSvg('午夜街道', '#0b1026', '#22304f')),
  makeMaterial('b-scene-corridor', '诡异走廊', '场景', ['内置', '场景', '走廊', '诡异', '深夜'], sceneSvg('诡异走廊', '#141a12', '#3a4a2a')),
  makeMaterial('b-scene-bedroom', '深夜卧室', '场景', ['内置', '场景', '夜晚', '卧室', '诡异'], sceneSvg('深夜卧室', '#1a1208', '#3a2a12')),
  makeMaterial('b-char-idle', '大方脸·平静', '角色', ['内置', '大方脸', '平静'], charSvg('平静', '#c9d6e8')),
  makeMaterial('b-char-happy', '大方脸·开心', '角色', ['内置', '大方脸', '开心'], charSvg('开心', '#f0d98a')),
  makeMaterial('b-char-angry', '大方脸·愤怒', '角色', ['内置', '大方脸', '愤怒'], charSvg('愤怒', '#e08a8a')),
  makeMaterial('b-char-shocked', '大方脸·惊讶', '角色', ['内置', '大方脸', '惊讶'], charSvg('惊讶', '#b6a2e8')),
  makeMaterial('b-char-scared', '大方脸·害怕', '角色', ['内置', '大方脸', '害怕'], charSvg('害怕', '#8a9ec8')),
  // 绑骨角色（P3）：meta.rigged 驱动 drawScene 骨骼渲染分支，缩略图仅占位
  {
    ...makeMaterial('b-char-rigged-xiaofang', '小方·绑骨', '角色', ['内置', '绑骨', '骨骼'], charSvg('小方', '#465a7d')),
    meta: JSON.stringify({ source: 'builtin', rigged: true, characterRigId: 'xiaofang' }),
  },
  // 内联 rig 绑骨角色（P4）：模拟 AI 生成产物——manifest 直接存在 meta.rig 里，
  // 部件图复用小方的内置图（纯文件名走 glob），验证 resolveCharacterRig 内联路径
  {
    ...makeMaterial('b-char-rigged-inline', '小方·AI内联骨骼', '角色', ['内置', '绑骨', 'AI模拟'], charSvg('内联', '#7d5a46')),
    meta: JSON.stringify({
      source: 'ai-rig',
      rigged: true,
      characterRigId: 'xiaofang-inline',
      rig: { ...BUILTIN_RIGGED_CHARACTER, id: 'xiaofang-inline', name: '小方·AI内联' },
    }),
  },
  makeMaterial('b-fx-question', '问号', '特效', ['内置', '表情', '问号'], effectSvg('问号', '#ffffff')),
  makeMaterial('b-fx-exclaim', '感叹号', '特效', ['内置', '表情', '感叹号'], effectSvg('感叹号', '#ff6060')),
  makeMaterial('b-fx-sweat', '汗滴', '特效', ['内置', '表情', '汗滴'], effectSvg('汗滴', '#8ad0ff')),
  makeMaterial('b-fx-blacklines', '无语黑线', '特效', ['内置', '表情', '无语黑线'], effectSvg('黑线', '#000000')),
  makeMaterial('b-fx-redeyes', '红眼特效', '特效', ['内置', '表情', '红眼特效'], effectSvg('红眼', '#ff0000')),
  makeMaterial('b-sfx-drone', '诡异低鸣', '音效', ['内置', '氛围', '诡异'], 'data:audio/wav;base64,'),
  makeMaterial('b-sfx-thud', '咚（重击）', '音效', ['内置', '打击', '重击'], 'data:audio/wav;base64,'),
  makeMaterial('b-sfx-creak', '吱呀（门轴）', '音效', ['内置', '门', '诡异'], 'data:audio/wav;base64,'),
  makeMaterial('b-sfx-heartbeat', '心跳', '音效', ['内置', '紧张', '心跳'], 'data:audio/wav;base64,'),
  makeMaterial('b-sfx-whoosh', '嗖（快速划过）', '音效', ['内置', '转场', '动作'], 'data:audio/wav;base64,'),
]

const DEMO_SHOTS: Shot[] = [
  { id: 's1', index: 1, scene: '午夜街道', character: '大方脸·平静', expression: '', action: '缓步前行', dialogue: '这条街……怎么一个人都没有。', emotion: '平静', duration: 3, motion: 'zoom' },
  { id: 's2', index: 2, scene: '午夜街道', character: '大方脸·害怕', expression: '', action: '猛然回头', dialogue: '谁？！出来！', emotion: '害怕', duration: 2.2, motion: 'shake' },
  { id: 's3', index: 3, scene: '诡异走廊', character: '大方脸·愤怒', expression: '', action: '缓缓逼近', dialogue: '你逃不掉的。', emotion: '愤怒', duration: 2.6, motion: 'slideL' },
  { id: 's4', index: 4, scene: '深夜卧室', character: '大方脸·害怕', expression: '', action: '无力跪地', dialogue: '我……这具身体里，为什么这么痛。', emotion: '悲伤', duration: 3.4, motion: 'idle' },
]

/** 生成一段可播放的 WAV（440Hz 正弦）data URI，用于在浏览器里验证音频链路 */
function beepWavDataUri(durationSec: number): string {
  const rate = 8000
  const samples = Math.floor(rate * durationSec)
  const bytes = new ArrayBuffer(44 + samples * 2)
  const view = new DataView(bytes)
  const writeStr = (offset: number, s: string): void => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i))
  }
  writeStr(0, 'RIFF')
  view.setUint32(4, 36 + samples * 2, true)
  writeStr(8, 'WAVE')
  writeStr(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, rate, true)
  view.setUint32(28, rate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  writeStr(36, 'data')
  view.setUint32(40, samples * 2, true)
  for (let i = 0; i < samples; i++) {
    const v = Math.sin((i / rate) * 2 * Math.PI * 440) * 0.2 * 32767
    view.setInt16(44 + i * 2, Math.round(v), true)
  }
  let bin = ''
  const u8 = new Uint8Array(bytes)
  for (let i = 0; i < u8.length; i++) bin += String.fromCharCode(u8[i])
  return `data:audio/wav;base64,${btoa(bin)}`
}

export function installDevMockApi(): void {
  if (!import.meta.env.DEV) return
  if (typeof window === 'undefined' || window.api) return

  const api = {
    getMaterials: async (category?: MaterialCategory | typeof CATEGORY_ALL) => {
      if (!category || category === '全部') return [...MOCK_MATERIALS]
      return MOCK_MATERIALS.filter((m) => m.category === category)
    },
    addMaterial: async (data: { id?: string; name: string; category: MaterialCategory }) =>
      makeMaterial(
        data.id ?? `m-${Date.now()}`,
        data.name,
        data.category,
        [],
        data.category === '场景' ? sceneSvg(data.name, '#222', '#444') : charSvg(data.name, '#ccc'),
      ),
    updateMaterial: async (_id: string, data: Partial<Material>) => ({ ...MOCK_MATERIALS[0], ...data }),
    deleteMaterial: async () => true,
    importImage: async () => MOCK_MATERIALS[0],
    importPSD: async () => [],
    importAudio: async () => MOCK_MATERIALS[11],
    importPSDLayers: async () => [],
    // 浏览器调试模式：去背景依赖本地 ONNX 推理，明确不支持
    removeBackground: async () => {
      throw new Error('去背景仅在桌面版可用，请使用应用窗口操作')
    },
    selectFiles: async () => [],
    assetUrl: (rel: string | null | undefined) => (rel ? rel : ''),

    getAIConfig: async () => ({
      llm: { apiBase: '', apiKey: '', model: '' },
      tts: { provider: 'local', localVoice: '', apiBase: '', apiKey: '', voiceId: '', speed: 1, pitch: 1 },
      image: { provider: 'pollinations', apiBase: '', apiKey: '', model: '' },
    }),
    saveAIConfig: async (c: unknown) => c,
    testLLM: async () => ({ ok: false, message: '（mock）未配置' }),
    testTTS: async () => ({ ok: true, message: '（mock）试听音频已生成', dataUrl: beepWavDataUri(1.5) }),
    generateImageMaterial: async () => ({
      ok: false,
      message: 'AI 生成素材仅在桌面版可用，请使用应用窗口操作',
    }),
    testImageGen: async () => ({ ok: false, message: '（mock）浏览器调试模式不支持' }),
    generateRigCharacter: async () => ({
      ok: false,
      message: 'AI 绑骨角色仅在桌面版可用，请使用应用窗口操作',
    }),
    onRigCharacterProgress: () => () => {},
    parseScript: async () => ({ ok: true, shots: DEMO_SHOTS }),
    regenerateShot: async (shot: Shot) => ({ ok: true, shot }),

    saveProject: async () => null,
    openProject: async () => ({ ok: false, message: '浏览器调试模式不支持打开工程，请使用桌面应用窗口。' }),
    onMenuAction: () => () => {},
    autosaveProject: async () => {},
    readAutosave: async () => ({ ok: false, message: '（mock）无自动保存' }),
    clearAutosave: async () => {},

    generateVoiceover: async (item: { shotId: string }) => ({
      ok: true,
      file: beepWavDataUri(1.6),
      speed: 1,
    }),
    deleteVoiceoverFile: async () => true,
    listTTSVoices: async () => ['Microsoft Huihui Desktop', 'Microsoft Zira Desktop'],
    // 浏览器调试模式没有主进程：绝不假装导出成功，否则用户会去找一个不存在的文件。
    // 这里返回一个占位路径让流程继续，再由 startExport 明确报错，把原因显示给用户。
    pickExportPath: async () => '（浏览器调试模式，不会生成文件）.mp4',
    startExport: async () => ({
      ok: false,
      message:
        '浏览器调试模式不支持真实导出。导出必须由桌面应用的主进程调用 FFmpeg 完成，请改用标题为「诡异沙雕动画制作器」的桌面应用窗口。',
    }),
    writeFrame: async () => {},
    finishExport: async () => ({
      ok: false,
      message: '浏览器调试模式不支持真实导出：请改用桌面应用窗口导出。',
    }),
    cancelExport: async () => {},
    onExportProgress: () => () => {},
    showItemInFolder: () => {},
  } as unknown as GuiYiShaDiaoApi

  window.api = api
  // 标记"调试模式"，让界面能明确提示用户这不是真实应用
  ;(window as unknown as { __guiyiMock?: boolean }).__guiyiMock = true
  document.title = '［调试模式］诡异沙雕动画制作器'
  // eslint-disable-next-line no-console
  console.info('[devMockApi] window.api mock installed (browser-only testing)')
}
