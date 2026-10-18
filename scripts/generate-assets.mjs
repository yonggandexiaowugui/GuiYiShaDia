// ============================================================================
// 内置素材包生成器（node scripts/generate-assets.mjs）
// - 图片：手写 SVG → sharp 光栅化 PNG（透明背景 / 竖屏场景）
// - 音效：纯 PCM 合成 → 16bit 44.1kHz WAV
// - 产物：assets-builtin/*.png|*.wav + manifest.json（主进程首次启动播种入库）
// ============================================================================
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'assets-builtin')
fs.mkdirSync(OUT, { recursive: true })

const manifest = { version: 1, materials: [] }

async function png(file, svg) {
  await sharp(Buffer.from(svg)).png().toFile(path.join(OUT, file))
  console.log('png :', file)
}

function addPng(id, name, category, tags, file, extra = {}) {
  manifest.materials.push({ id, name, category, tags, file, ...extra })
}

// ---------------------------------------------------------------------------
// 角色：大方脸（600×600 透明，多表情）
// ---------------------------------------------------------------------------
const SKIN = '#ffcf9e'
const LINE = '#3a2a1a'

function squareFace({ eyes, mouth, extra = '' }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600">
  <rect x="90" y="70" width="420" height="430" rx="60" fill="${SKIN}" stroke="${LINE}" stroke-width="10"/>
  ${eyes}
  ${mouth}
  ${extra}
</svg>`
}

const sq = {
  // 眼睛 / 嘴 各表情部件
  dotEyes: `<circle cx="220" cy="250" r="18" fill="${LINE}"/><circle cx="380" cy="250" r="18" fill="${LINE}"/>`,
  happyEyes: `<path d="M190 260 Q220 230 250 260" stroke="${LINE}" stroke-width="12" fill="none" stroke-linecap="round"/><path d="M350 260 Q380 230 410 260" stroke="${LINE}" stroke-width="12" fill="none" stroke-linecap="round"/>`,
  angryBrows: `<path d="M175 215 L260 245" stroke="${LINE}" stroke-width="14" stroke-linecap="round"/><path d="M425 215 L340 245" stroke="${LINE}" stroke-width="14" stroke-linecap="round"/>`,
  bigEyes: `<circle cx="220" cy="250" r="30" fill="#fff" stroke="${LINE}" stroke-width="8"/><circle cx="380" cy="250" r="30" fill="#fff" stroke="${LINE}" stroke-width="8"/><circle cx="220" cy="250" r="12" fill="${LINE}"/><circle cx="380" cy="250" r="12" fill="${LINE}"/>`,
  lineMouth: `<path d="M250 390 L350 390" stroke="${LINE}" stroke-width="12" stroke-linecap="round"/>`,
  smileMouth: `<path d="M225 360 Q300 430 375 360" stroke="${LINE}" stroke-width="12" fill="none" stroke-linecap="round"/>`,
  zigzagMouth: `<path d="M230 395 L260 375 L290 395 L320 375 L350 395" stroke="${LINE}" stroke-width="10" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
  oMouth: `<circle cx="300" cy="390" r="34" fill="none" stroke="${LINE}" stroke-width="12"/>`,
  wavyMouth: `<path d="M225 390 Q250 368 275 390 T325 390 T375 390" stroke="${LINE}" stroke-width="10" fill="none" stroke-linecap="round"/>`,
  sweat: `<path d="M455 105 C455 105 485 150 485 175 A24 24 0 1 1 437 175 C437 150 455 105 455 105 Z" fill="#7ec8ff" stroke="#3a6a8a" stroke-width="6"/>`,
  blush: `<ellipse cx="165" cy="330" rx="28" ry="14" fill="#ff9e9e" opacity="0.6"/><ellipse cx="435" cy="330" rx="28" ry="14" fill="#ff9e9e" opacity="0.6"/>`,
}

const squareFaces = [
  ['idle', '平静', sq.dotEyes + sq.lineMouth, {}],
  ['happy', '开心', sq.happyEyes + sq.smileMouth + sq.blush, { emotionWeight: 1 }],
  ['angry', '愤怒', sq.dotEyes + sq.angryBrows + sq.zigzagMouth, { emotionWeight: -1 }],
  ['shocked', '惊讶', sq.bigEyes + sq.oMouth, {}],
  ['scared', '害怕', sq.dotEyes + sq.wavyMouth + sq.sweat, { emotionWeight: -0.5 }],
]
for (const [slug, label, parts, extra] of squareFaces) {
  const file = `char-square-${slug}.png`
  await png(file, squareFace({ eyes: '', mouth: parts }))
  addPng(`builtin-char-square-${slug}`, `大方脸·${label}`, '角色', ['内置', '大方脸', label], file, {
    minDuration: 0.8,
    maxDuration: 8,
    ...extra,
  })
}

// ---------------------------------------------------------------------------
// 绑骨角色「小菱」（P3）：素材库缩略图 = 整体 A-pose 预览图
// 由 scripts/generate-rig-character.mjs（npm run gen:rig）按 manifest 合成产出，
// 本脚本只登记入库；实际播放由渲染端按 shared/characterRig.ts + 部件图骨骼绘制。
// ---------------------------------------------------------------------------
{
  const preview = 'char-rigged-xiaofang.png'
  if (!fs.existsSync(path.join(OUT, preview))) {
    throw new Error(`缺少 ${preview}，请先运行 npm run gen:rig`)
  }
  console.log('use :', preview, '（gen:rig 产出，免重复生成）')
  addPng('builtin-char-rigged-xiaofang', '小菱·绑骨', '角色', ['内置', '绑骨', '骨骼'], preview, {
    minDuration: 0.5,
    maxDuration: 30,
    metaExtra: { rigged: true, characterRigId: 'xiaofang' },
  })
}

// ---------------------------------------------------------------------------
// 场景（1080×1920 竖屏，剪影风）
// ---------------------------------------------------------------------------
const scenes = []

// 深夜卧室
scenes.push([
  'scene-bedroom',
  '深夜卧室',
  ['内置', '场景', '夜晚', '卧室', '诡异'],
  `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920">
  <defs>
    <linearGradient id="wall" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#0b1026"/><stop offset="1" stop-color="#1b2440"/>
    </linearGradient>
  </defs>
  <rect width="1080" height="1920" fill="url(#wall)"/>
  <rect x="0" y="1500" width="1080" height="420" fill="#141021"/>
  <rect x="340" y="300" width="400" height="560" rx="12" fill="#0a0f22" stroke="#2c3a5e" stroke-width="14"/>
  <line x1="540" y1="300" x2="540" y2="860" stroke="#2c3a5e" stroke-width="10"/>
  <line x1="340" y1="580" x2="740" y2="580" stroke="#2c3a5e" stroke-width="10"/>
  <circle cx="620" cy="430" r="70" fill="#e8e4c9"/>
  <circle cx="590" cy="410" r="14" fill="#c9c5a8"/><circle cx="645" cy="450" r="10" fill="#c9c5a8"/>
  <circle cx="420" cy="380" r="4" fill="#aab"/><circle cx="480" cy="500" r="3" fill="#aab"/><circle cx="700" cy="540" r="4" fill="#aab"/>
  <rect x="120" y="1150" width="560" height="240" rx="20" fill="#241d33"/>
  <rect x="120" y="1080" width="140" height="110" rx="16" fill="#2e2542"/>
  <rect x="120" y="1330" width="560" height="60" rx="10" fill="#1a1526"/>
  <rect x="800" y="1240" width="160" height="200" rx="8" fill="#201a2e"/>
  <circle cx="880" cy="1330" r="12" fill="#0f0c18"/>
</svg>`,
])

// 诡异走廊
scenes.push([
  'scene-corridor',
  '诡异走廊',
  ['内置', '场景', '走廊', '诡异', '深夜'],
  `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920">
  <rect width="1080" height="1920" fill="#07070d"/>
  <polygon points="0,0 1080,0 660,760 420,760" fill="#0d0d18"/>
  <polygon points="0,1920 1080,1920 660,960 420,960" fill="#101020"/>
  <polygon points="0,0 420,760 420,960 0,1920" fill="#0b0b14"/>
  <polygon points="1080,0 660,760 660,960 1080,1920" fill="#0b0b14"/>
  <rect x="420" y="760" width="240" height="200" fill="#05050a"/>
  <ellipse cx="540" cy="860" rx="180" ry="90" fill="#3aff8a" opacity="0.08"/>
  <ellipse cx="540" cy="860" rx="70" ry="36" fill="#3aff8a" opacity="0.12"/>
  <g fill="#131325">
    <polygon points="60,500 250,690 250,1030 60,1420"/>
    <polygon points="300,720 380,780 380,940 300,1040"/>
    <polygon points="1020,500 830,690 830,1030 1020,1420"/>
    <polygon points="780,720 700,780 700,940 780,1040"/>
  </g>
  <g stroke="#23233a" stroke-width="6">
    <line x1="60" y1="500" x2="250" y2="690"/><line x1="1020" y1="500" x2="830" y2="690"/>
  </g>
</svg>`,
])

// 午夜街道
scenes.push([
  'scene-street',
  '午夜街道',
  ['内置', '场景', '街道', '夜晚', '路灯'],
  `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#05060f"/><stop offset="1" stop-color="#101a2e"/>
    </linearGradient>
  </defs>
  <rect width="1080" height="1920" fill="url(#sky)"/>
  <circle cx="850" cy="240" r="90" fill="#e8e4c9"/>
  <circle cx="150" cy="180" r="4" fill="#99a"/><circle cx="300" cy="320" r="3" fill="#99a"/><circle cx="520" cy="140" r="4" fill="#99a"/><circle cx="700" cy="420" r="3" fill="#99a"/>
  <rect x="0" y="700" width="240" height="620" fill="#0a0e18"/>
  <rect x="300" y="820" width="200" height="500" fill="#0c1120"/>
  <rect x="820" y="760" width="260" height="560" fill="#0a0e18"/>
  <g fill="#ffd27a" opacity="0.85">
    <rect x="60" y="780" width="34" height="46"/><rect x="140" y="900" width="34" height="46"/>
    <rect x="360" y="900" width="30" height="42"/><rect x="880" y="850" width="34" height="46"/>
  </g>
  <rect x="0" y="1320" width="1080" height="600" fill="#080a10"/>
  <rect x="560" y="980" width="18" height="360" fill="#1a2030"/>
  <circle cx="569" cy="965" r="26" fill="#ffdf9e"/>
  <polygon points="569,965 400,1340 738,1340" fill="#ffdf9e" opacity="0.10"/>
  <ellipse cx="569" cy="1345" rx="170" ry="24" fill="#ffdf9e" opacity="0.12"/>
</svg>`,
])

for (const [slug, name, tags, svg] of scenes) {
  const file = `${slug}.png`
  await png(file, svg)
  addPng(`builtin-${slug}`, name, '场景', tags, file, {
    minDuration: 1.5,
    maxDuration: 12,
    allowHardCut: true,
  })
}

// ---------------------------------------------------------------------------
// 表情 / 特效贴纸（300×300 透明）
// ---------------------------------------------------------------------------
const stickers = [
  [
    'fx-question',
    '问号',
    `<path d="M100 108 A52 52 0 1 1 176 152 Q176 182 150 192 L150 214" stroke="#ff4d4d" stroke-width="26" fill="none" stroke-linecap="round"/><circle cx="150" cy="252" r="18" fill="#ff4d4d"/>`,
  ],
  [
    'fx-exclaim',
    '感叹号',
    `<rect x="128" y="40" width="44" height="150" rx="22" fill="#ff4d4d"/><circle cx="150" cy="248" r="24" fill="#ff4d4d"/>`,
  ],
  [
    'fx-sweat',
    '汗滴',
    `<path d="M150 30 C150 30 235 140 235 195 A85 85 0 1 1 65 195 C65 140 150 30 150 30 Z" fill="#7ec8ff" stroke="#3a6a8a" stroke-width="10"/><ellipse cx="115" cy="200" rx="18" ry="30" fill="#bfe6ff" opacity="0.8" transform="rotate(-20 115 200)"/>`,
  ],
  [
    'fx-blacklines',
    '无语黑线',
    `<g stroke="#222" stroke-width="22" stroke-linecap="round"><line x1="80" y1="60" x2="80" y2="240"/><line x1="150" y1="60" x2="150" y2="240"/><line x1="220" y1="60" x2="220" y2="240"/></g>`,
  ],
  [
    'fx-redeyes',
    '红眼特效',
    `<ellipse cx="95" cy="150" rx="46" ry="26" fill="#ff2222" opacity="0.35"/><ellipse cx="205" cy="150" rx="46" ry="26" fill="#ff2222" opacity="0.35"/><ellipse cx="95" cy="150" rx="30" ry="16" fill="#ff3333"/><ellipse cx="205" cy="150" rx="30" ry="16" fill="#ff3333"/><ellipse cx="95" cy="150" rx="10" ry="6" fill="#ffcccc"/><ellipse cx="205" cy="150" rx="10" ry="6" fill="#ffcccc"/>`,
  ],
]
for (const [slug, name, svg] of stickers) {
  const file = `${slug}.png`
  await png(file, `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300">${svg}</svg>`)
  addPng(`builtin-${slug}`, name, '特效', ['内置', '表情', name], file, { maxDuration: 3 })
}

// ---------------------------------------------------------------------------
// 音效（44100Hz mono s16le WAV，纯 PCM 合成）
// ---------------------------------------------------------------------------
const SR = 44100

function writeWav(file, samples) {
  const dataSize = samples.length * 2
  const buf = Buffer.alloc(44 + dataSize)
  buf.write('RIFF', 0)
  buf.writeUInt32LE(36 + dataSize, 4)
  buf.write('WAVE', 8)
  buf.write('fmt ', 12)
  buf.writeUInt32LE(16, 16)
  buf.writeUInt16LE(1, 20) // PCM
  buf.writeUInt16LE(1, 22) // mono
  buf.writeUInt32LE(SR, 24)
  buf.writeUInt32LE(SR * 2, 28)
  buf.writeUInt16LE(2, 32)
  buf.writeUInt16LE(16, 34)
  buf.write('data', 36)
  buf.writeUInt32LE(dataSize, 40)
  for (let i = 0; i < samples.length; i++) {
    const v = Math.max(-1, Math.min(1, samples[i]))
    buf.writeInt16LE(Math.round(v * 32767), 44 + i * 2)
  }
  fs.writeFileSync(path.join(OUT, file), buf)
  console.log('wav :', file)
}

function addWav(id, name, tags, file, extra = {}) {
  manifest.materials.push({ id, name, category: '音效', tags, file, maxDuration: 10, loopFlag: false, ...extra })
}

/** 音乐（BGM）素材：长时长、可循环 */
function addMusic(id, name, tags, file, seconds) {
  manifest.materials.push({
    id, name, category: '音乐', tags, file,
    loopFlag: true, minDuration: 4, maxDuration: 300, sourceSeconds: Math.round(seconds * 100) / 100,
  })
}

const secs = (s) => Math.floor(s * SR)

// 诡异低鸣 3s：55Hz + 58Hz 差频拍动 + 少量噪声，缓慢进出
{
  const n = secs(3)
  const out = new Float32Array(n)
  let noiseState = 0
  for (let i = 0; i < n; i++) {
    const t = i / SR
    const env = Math.sin((Math.PI * i) / n) ** 2
    noiseState = noiseState * 0.98 + (Math.random() * 2 - 1) * 0.02
    out[i] = env * (0.5 * Math.sin(2 * Math.PI * 55 * t) + 0.4 * Math.sin(2 * Math.PI * 58.3 * t) + noiseState * 2)
  }
  writeWav('sfx-drone.wav', out)
  addWav('builtin-sfx-drone', '诡异低鸣', ['内置', '氛围', '诡异'], 'sfx-drone.wav')
}

// 咚 0.6s：70Hz 指数衰减 + 起始瞬态
{
  const n = secs(0.6)
  const out = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const t = i / SR
    const env = Math.exp(-t * 9)
    const click = t < 0.01 ? (Math.random() * 2 - 1) * 0.5 : 0
    out[i] = env * Math.sin(2 * Math.PI * 70 * t) * 0.9 + click
  }
  writeWav('sfx-thud.wav', out)
  addWav('builtin-sfx-thud', '咚（重击）', ['内置', '打击', '重击'], 'sfx-thud.wav')
}

// 吱呀 1.5s：慢 FM 锯齿 + 幅度摆动
{
  const n = secs(1.5)
  const out = new Float32Array(n)
  let phase = 0
  for (let i = 0; i < n; i++) {
    const t = i / SR
    const f = 320 + 260 * Math.sin(2 * Math.PI * 1.6 * t) + 80 * Math.sin(2 * Math.PI * 6.3 * t)
    phase += (2 * Math.PI * f) / SR
    const saw = 2 * (phase / (2 * Math.PI) - Math.floor(phase / (2 * Math.PI) + 0.5))
    const env = Math.sin((Math.PI * i) / n) * (0.6 + 0.4 * Math.sin(2 * Math.PI * 9 * t))
    out[i] = saw * env * 0.35
  }
  writeWav('sfx-creak.wav', out)
  addWav('builtin-sfx-creak', '吱呀（门轴）', ['内置', '门', '诡异'], 'sfx-creak.wav')
}

// 心跳 2s：两对 lub-dub
{
  const n = secs(2)
  const out = new Float32Array(n)
  const thump = (t0, amp) => {
    const start = Math.floor(t0 * SR)
    const len = secs(0.18)
    for (let i = 0; i < len && start + i < n; i++) {
      const t = i / SR
      out[start + i] += amp * Math.exp(-t * 22) * Math.sin(2 * Math.PI * 62 * t)
    }
  }
  thump(0.0, 1.0)
  thump(0.28, 0.7)
  thump(1.0, 1.0)
  thump(1.28, 0.7)
  writeWav('sfx-heartbeat.wav', out)
  addWav('builtin-sfx-heartbeat', '心跳', ['内置', '紧张', '心跳'], 'sfx-heartbeat.wav')
}

// 嗖 0.8s：噪声 + 一阶低通扫频
{
  const n = secs(0.8)
  const out = new Float32Array(n)
  let lp = 0
  for (let i = 0; i < n; i++) {
    const t = i / SR
    const env = Math.sin((Math.PI * i) / n) ** 1.5
    const cutoff = 0.02 + 0.25 * Math.sin((Math.PI * i) / n) // 扫频
    lp += cutoff * ((Math.random() * 2 - 1) - lp)
    out[i] = lp * env * 1.6
  }
  writeWav('sfx-whoosh.wav', out)
  addWav('builtin-sfx-whoosh', '嗖（快速划过）', ['内置', '转场', '动作'], 'sfx-whoosh.wav')
}

// ---------------------------------------------------------------------------
// 角色：瓜子脸（尖下巴 + 刘海）、圆圆脸（圆脸 + 呆毛），各 5 表情
// ---------------------------------------------------------------------------
const sweatAt = (x, y) =>
  `<path d="M${x} ${y} C${x} ${y} ${x + 26} ${y + 44} ${x + 26} ${y + 60} A 26 26 0 1 1 ${x - 26} ${y + 60} C${x - 26} ${y + 44} ${x} ${y} ${x} ${y} Z" fill="#7ec8ff" stroke="#3a6a8a" stroke-width="5"/>`

function makeParts({ ex1, ex2, ey, my }) {
  return {
    idle: `<circle cx="${ex1}" cy="${ey}" r="16" fill="${LINE}"/><circle cx="${ex2}" cy="${ey}" r="16" fill="${LINE}"/><path d="M${my - 52} ${my} L${my + 52} ${my}" stroke="${LINE}" stroke-width="11" stroke-linecap="round"/>`,
    happy: `<path d="M${ex1 - 30} ${ey + 10} Q${ex1} ${ey - 26} ${ex1 + 30} ${ey + 10}" stroke="${LINE}" stroke-width="11" fill="none" stroke-linecap="round"/><path d="M${ex2 - 30} ${ey + 10} Q${ex2} ${ey - 26} ${ex2 + 30} ${ey + 10}" stroke="${LINE}" stroke-width="11" fill="none" stroke-linecap="round"/><path d="M${my - 56} ${my - 16} Q${my} ${my + 44} ${my + 56} ${my - 16}" stroke="${LINE}" stroke-width="11" fill="none" stroke-linecap="round"/><ellipse cx="${ex1 - 16}" cy="${ey + 60}" rx="24" ry="12" fill="#ff9e9e" opacity="0.55"/><ellipse cx="${ex2 + 16}" cy="${ey + 60}" rx="24" ry="12" fill="#ff9e9e" opacity="0.55"/>`,
    angry: `<path d="M${ex1 - 40} ${ey - 46} L${ex1 + 26} ${ey - 14}" stroke="${LINE}" stroke-width="13" stroke-linecap="round"/><path d="M${ex2 + 40} ${ey - 46} L${ex2 - 26} ${ey - 14}" stroke="${LINE}" stroke-width="13" stroke-linecap="round"/><circle cx="${ex1}" cy="${ey}" r="15" fill="${LINE}"/><circle cx="${ex2}" cy="${ey}" r="15" fill="${LINE}"/><path d="M${my - 58} ${my - 2} L${my - 30} ${my - 20} L${my - 2} ${my - 2} L${my + 26} ${my - 20} L${my + 54} ${my - 2}" stroke="${LINE}" stroke-width="9" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
    shocked: `<circle cx="${ex1}" cy="${ey}" r="25" fill="#fff" stroke="${LINE}" stroke-width="7"/><circle cx="${ex2}" cy="${ey}" r="25" fill="#fff" stroke="${LINE}" stroke-width="7"/><circle cx="${ex1}" cy="${ey}" r="10" fill="${LINE}"/><circle cx="${ex2}" cy="${ey}" r="10" fill="${LINE}"/><circle cx="${my}" cy="${my + 4}" r="28" fill="none" stroke="${LINE}" stroke-width="11"/>`,
    scared: `<circle cx="${ex1}" cy="${ey}" r="19" fill="#fff" stroke="${LINE}" stroke-width="6"/><circle cx="${ex2}" cy="${ey}" r="19" fill="#fff" stroke="${LINE}" stroke-width="6"/><circle cx="${ex1 + 6}" cy="${ey + 4}" r="8" fill="${LINE}"/><circle cx="${ex2 + 6}" cy="${ey + 4}" r="8" fill="${LINE}"/><path d="M${my - 52} ${my} Q${my - 28} ${my - 18} ${my - 4} ${my} T${my + 40} ${my} T${my + 58} ${my}" stroke="${LINE}" stroke-width="9" fill="none" stroke-linecap="round"/>${sweatAt(ex2 + 66, ey - 84)}`,
  }
}

const ovalFace = ({ parts }) => `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600">
  <path d="M300 78 C196 78 138 176 142 296 C146 414 214 516 300 542 C386 516 454 414 458 296 C462 176 404 78 300 78 Z" fill="#ffd9b3" stroke="${LINE}" stroke-width="10"/>
  <path d="M170 196 Q206 66 318 82 Q424 96 438 192 Q378 118 298 120 Q214 122 170 196 Z" fill="#4a3423"/>
  ${parts}
</svg>`

const roundFace = ({ parts }) => `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600">
  <circle cx="300" cy="302" r="216" fill="#ffe3cf" stroke="${LINE}" stroke-width="10"/>
  <path d="M302 88 C306 46 352 32 374 52 C346 52 326 70 324 98 Z" fill="${LINE}"/>
  ${parts}
</svg>`

const ovalParts = makeParts({ ex1: 216, ex2: 384, ey: 306, my: 434 })
const roundParts = makeParts({ ex1: 224, ex2: 376, ey: 272, my: 402 })
const faceSets = [
  ['oval', '瓜子脸', ovalFace, ovalParts, '#ffd9b3'],
  ['round', '圆圆脸', roundFace, roundParts, '#ffe3cf'],
]
for (const [slug, label, builder, parts] of faceSets) {
  const variants = [
    ['idle', '平静', parts.idle, {}],
    ['happy', '开心', parts.happy, { emotionWeight: 1 }],
    ['angry', '愤怒', parts.angry, { emotionWeight: -1 }],
    ['shocked', '惊讶', parts.shocked, {}],
    ['scared', '害怕', parts.scared, { emotionWeight: -0.5 }],
  ]
  for (const [vslug, vlabel, vparts, extra] of variants) {
    const file = `char-${slug}-${vslug}.png`
    await png(file, builder({ parts: vparts }))
    addPng(`builtin-char-${slug}-${vslug}`, `${label}·${vlabel}`, '角色', ['内置', label, vlabel], file, {
      minDuration: 0.8,
      maxDuration: 8,
      ...extra,
    })
  }
}

// ---------------------------------------------------------------------------
// 场景扩充（1080×1920 竖屏，剪影风）
// ---------------------------------------------------------------------------
// 教室
scenes.push([
  'scene-classroom', '教室', ['内置', '场景', '教室', '校园'],
  `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920">
  <defs><linearGradient id="cw" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2a3440"/><stop offset="1" stop-color="#3c4a56"/></linearGradient></defs>
  <rect width="1080" height="1920" fill="url(#cw)"/>
  <rect x="90" y="260" width="560" height="340" rx="10" fill="#1e3b32" stroke="#5a4632" stroke-width="16"/>
  <path d="M130 500 L260 380 L380 460 L520 340 L610 420" stroke="#dfe8e2" stroke-width="6" fill="none" opacity="0.5"/>
  <rect x="730" y="240" width="260" height="380" rx="8" fill="#9db8c8" opacity="0.35" stroke="#5a4632" stroke-width="12"/>
  <line x1="860" y1="240" x2="860" y2="620" stroke="#5a4632" stroke-width="10"/>
  <rect x="0" y="1240" width="1080" height="680" fill="#6b5236"/>
  <g fill="#8a6d48"><rect x="60" y="1120" width="380" height="130" rx="10"/><rect x="620" y="1120" width="380" height="130" rx="10"/><rect x="340" y="1460" width="380" height="130" rx="10"/></g>
  <g fill="#4a3a26"><rect x="100" y="1250" width="300" height="26" rx="6"/><rect x="660" y="1250" width="300" height="26" rx="6"/><rect x="380" y="1590" width="300" height="26" rx="6"/></g>
</svg>`,
])
// 办公室
scenes.push([
  'scene-office', '办公室', ['内置', '场景', '办公室', '公司', '上班'],
  `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920">
  <rect width="1080" height="1920" fill="#2b2f36"/>
  <rect x="0" y="1350" width="1080" height="570" fill="#3a3f47"/>
  <g fill="#23262c"><rect x="40" y="880" width="480" height="480" rx="10"/><rect x="560" y="880" width="480" height="480" rx="10"/></g>
  <g fill="#7ec8ff" opacity="0.5"><rect x="110" y="950" width="200" height="130" rx="6"/><rect x="630" y="950" width="200" height="130" rx="6"/></g>
  <g fill="#4a5260"><rect x="110" y="1120" width="340" height="120" rx="8"/><rect x="630" y="1120" width="340" height="120" rx="8"/></g>
  <rect x="120" y="330" width="240" height="360" rx="8" fill="#8fa8bc" opacity="0.3" stroke="#1c1f24" stroke-width="12"/>
  <rect x="420" y="330" width="240" height="360" rx="8" fill="#8fa8bc" opacity="0.3" stroke="#1c1f24" stroke-width="12"/>
  <rect x="720" y="330" width="240" height="360" rx="8" fill="#8fa8bc" opacity="0.3" stroke="#1c1f24" stroke-width="12"/>
  <g fill="#dfe8f2"><circle cx="180" cy="160" r="10"/><circle cx="540" cy="140" r="10"/><circle cx="900" cy="160" r="10"/></g>
</svg>`,
])
// 地铁车厢
scenes.push([
  'scene-subway', '地铁车厢', ['内置', '场景', '地铁', '交通'],
  `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920">
  <rect width="1080" height="1920" fill="#39404a"/>
  <rect x="0" y="1500" width="1080" height="420" fill="#2a3038"/>
  <g fill="#141920" stroke="#5a6470" stroke-width="12"><rect x="60" y="300" width="380" height="520" rx="14"/><rect x="640" y="300" width="380" height="520" rx="14"/></g>
  <g fill="#c8d4de" opacity="0.5"><rect x="90" y="340" width="140" height="440"/><rect x="670" y="340" width="140" height="440"/></g>
  <rect x="0" y="1000" width="1080" height="90" fill="#c8a24a" opacity="0.7"/>
  <g stroke="#8a929c" stroke-width="8"><line x1="200" y1="180" x2="200" y2="420"/><line x1="540" y1="180" x2="540" y2="420"/><line x1="880" y1="180" x2="880" y2="420"/></g>
  <g fill="#e8b84a"><circle cx="200" cy="470" r="34"/><circle cx="540" cy="470" r="34"/><circle cx="880" cy="470" r="34"/></g>
  <g fill="#f2c94c"><ellipse cx="330" cy="1250" rx="60" ry="20"/><ellipse cx="760" cy="1250" rx="60" ry="20"/></g>
</svg>`,
])
// 公园（白天）
scenes.push([
  'scene-park', '白天公园', ['内置', '场景', '公园', '白天', '户外'],
  `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920">
  <defs><linearGradient id="ps" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7ec0ee"/><stop offset="1" stop-color="#bfe0f5"/></linearGradient></defs>
  <rect width="1080" height="1920" fill="url(#ps)"/>
  <circle cx="870" cy="230" r="95" fill="#ffe89e"/>
  <g fill="#fff" opacity="0.85"><ellipse cx="260" cy="300" rx="130" ry="46"/><ellipse cx="360" cy="260" rx="90" ry="36"/></g>
  <rect x="0" y="1180" width="1080" height="740" fill="#7cb868"/>
  <path d="M420 1920 Q500 1500 540 1180 L700 1180 Q640 1520 720 1920 Z" fill="#c8b48a"/>
  <g><rect x="140" y="980" width="40" height="220" fill="#7a5230"/><circle cx="160" cy="880" r="150" fill="#4e8f46"/><circle cx="90" cy="960" r="90" fill="#5aa050"/><circle cx="240" cy="950" r="85" fill="#448240"/></g>
  <g><rect x="920" y="1040" width="34" height="180" fill="#7a5230"/><circle cx="937" cy="960" r="120" fill="#548c4a"/></g>
  <g fill="#8a5a34"><rect x="560" y="1060" width="260" height="26" rx="8"/><rect x="560" y="1130" width="260" height="26" rx="8"/><rect x="580" y="1086" width="24" height="120"/><rect x="776" y="1086" width="24" height="120"/></g>
</svg>`,
])
// 天台
scenes.push([
  'scene-rooftop', '天台', ['内置', '场景', '天台', '楼顶', '黄昏'],
  `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920">
  <defs><linearGradient id="rt" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a2a50"/><stop offset="0.6" stop-color="#b06a4a"/><stop offset="1" stop-color="#e8a05a"/></linearGradient></defs>
  <rect width="1080" height="1920" fill="url(#rt)"/>
  <circle cx="300" cy="700" r="85" fill="#ffe0a0"/>
  <g fill="#241a30"><rect x="0" y="760" width="150" height="420"/><rect x="180" y="820" width="110" height="360"/><rect x="820" y="780" width="260" height="400"/><rect x="700" y="860" width="90" height="320"/></g>
  <g fill="#ffd27a" opacity="0.8"><rect x="40" y="820" width="20" height="26"/><rect x="860" y="840" width="20" height="26"/><rect x="960" y="900" width="20" height="26"/></g>
  <rect x="0" y="1180" width="1080" height="740" fill="#4a4048"/>
  <rect x="0" y="1140" width="1080" height="50" fill="#5a5058"/>
  <g stroke="#2a242c" stroke-width="14"><line x1="0" y1="1260" x2="1080" y2="1260"/><line x1="90" y1="1190" x2="90" y2="1500"/><line x1="360" y1="1190" x2="360" y2="1500"/><line x1="630" y1="1190" x2="630" y2="1500"/><line x1="900" y1="1190" x2="900" y2="1500"/></g>
  <rect x="620" y="980" width="180" height="160" rx="10" fill="#3a343c" stroke="#2a242c" stroke-width="10"/>
</svg>`,
])
// 便利店
scenes.push([
  'scene-store', '便利店', ['内置', '场景', '便利店', '商店', '夜晚'],
  `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920">
  <rect width="1080" height="1920" fill="#20262e"/>
  <rect x="0" y="1400" width="1080" height="520" fill="#2c333c"/>
  <g fill="#e8f0f6" opacity="0.9"><rect x="80" y="360" width="420" height="60" rx="8"/><rect x="80" y="480" width="420" height="60" rx="8"/><rect x="80" y="600" width="420" height="60" rx="8"/></g>
  <g><rect x="110" y="300" width="60" height="50" fill="#e05a5a"/><rect x="200" y="300" width="60" height="50" fill="#5ab0e0"/><rect x="290" y="300" width="60" height="50" fill="#e0c05a"/><rect x="380" y="300" width="60" height="50" fill="#5ae08a"/><rect x="150" y="420" width="60" height="50" fill="#b05ae0"/><rect x="260" y="420" width="60" height="50" fill="#e08a5a"/><rect x="370" y="420" width="60" height="50" fill="#5ae0d0"/></g>
  <rect x="640" y="280" width="340" height="560" rx="12" fill="#101820" stroke="#3a4652" stroke-width="12"/>
  <g fill="#bfe6ff" opacity="0.65"><rect x="670" y="320" width="280" height="140" rx="6"/><rect x="670" y="500" width="280" height="140" rx="6"/><rect x="670" y="680" width="280" height="120" rx="6"/></g>
  <rect x="60" y="900" width="960" height="40" fill="#e8f0f6" opacity="0.5"/>
  <rect x="700" y="1250" width="320" height="150" fill="#3a4652"/>
  <rect x="760" y="1160" width="200" height="90" rx="8" fill="#1c242c" stroke="#3a4652" stroke-width="8"/>
</svg>`,
])
// 网吧
scenes.push([
  'scene-netbar', '网吧', ['内置', '场景', '网吧', '电脑', '夜晚'],
  `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920">
  <rect width="1080" height="1920" fill="#0e1218"/>
  <rect x="0" y="1420" width="1080" height="500" fill="#161c24"/>
  <g><rect x="70" y="700" width="400" height="260" rx="10" fill="#1c242e" stroke="#2c3642" stroke-width="8"/><rect x="95" y="725" width="350" height="210" rx="4" fill="#3a6a9a" opacity="0.7"/><rect x="250" y="960" width="40" height="40" fill="#2c3642"/></g>
  <g><rect x="610" y="700" width="400" height="260" rx="10" fill="#1c242e" stroke="#2c3642" stroke-width="8"/><rect x="635" y="725" width="350" height="210" rx="4" fill="#7a4a9a" opacity="0.6"/><rect x="790" y="960" width="40" height="40" fill="#2c3642"/></g>
  <g><rect x="70" y="1160" width="400" height="180" rx="10" fill="#1c242e" stroke="#2c3642" stroke-width="8"/><rect x="95" y="1180" width="350" height="140" rx="4" fill="#2a7a6a" opacity="0.6"/></g>
  <g><rect x="610" y="1160" width="400" height="180" rx="10" fill="#1c242e" stroke="#2c3642" stroke-width="8"/><rect x="635" y="1180" width="350" height="140" rx="4" fill="#9a6a3a" opacity="0.6"/></g>
  <g fill="#7ec8ff" opacity="0.25"><ellipse cx="270" cy="830" rx="260" ry="160"/><ellipse cx="810" cy="830" rx="260" ry="160"/></g>
  <rect x="0" y="180" width="1080" height="60" fill="#1c242e"/>
  <g fill="#e05a5a"><rect x="90" y="196" width="60" height="28"/><rect x="180" y="196" width="60" height="28"/><rect x="270" y="196" width="60" height="28"/></g>
</svg>`,
])
// 老家院子
scenes.push([
  'scene-homeyard', '老家院子', ['内置', '场景', '院子', '老家', '乡村'],
  `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920">
  <defs><linearGradient id="hy" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8ab8d8"/><stop offset="1" stop-color="#c8dce8"/></linearGradient></defs>
  <rect width="1080" height="1920" fill="url(#hy)"/>
  <rect x="0" y="620" width="1080" height="130" fill="#8a5a3a"/>
  <g fill="#6a4428"><rect x="0" y="620" width="1080" height="30"/><rect x="0" y="700" width="1080" height="30"/></g>
  <g stroke="#6a4428" stroke-width="8"><line x1="120" y1="650" x2="120" y2="750"/><line x1="360" y1="650" x2="360" y2="750"/><line x1="600" y1="650" x2="600" y2="750"/><line x1="840" y1="650" x2="840" y2="750"/></g>
  <rect x="0" y="750" width="1080" height="1170" fill="#b8a488"/>
  <rect x="380" y="980" width="320" height="620" fill="#5a4432"/>
  <circle cx="620" cy="1300" r="14" fill="#e8c05a"/>
  <g stroke="#8a7a5a" stroke-width="10"><line x1="80" y1="900" x2="330" y2="900"/><line x1="700" y1="940" x2="1000" y2="940"/></g>
  <g><rect x="110" y="900" width="70" height="110" rx="8" fill="#e08a8a"/><rect x="230" y="900" width="70" height="130" rx="8" fill="#8ab0e0"/><rect x="740" y="940" width="80" height="90" rx="8" fill="#e0d08a"/></g>
  <g><rect x="880" y="1180" width="26" height="180" fill="#7a5230"/><circle cx="893" cy="1120" r="110" fill="#5a9a50"/></g>
</svg>`,
])
// 客厅（白天）
scenes.push([
  'scene-livingroom', '客厅（白天）', ['内置', '场景', '客厅', '家', '白天'],
  `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920">
  <rect width="1080" height="1920" fill="#d8cfc0"/>
  <rect x="0" y="1420" width="1080" height="500" fill="#b8a888"/>
  <rect x="120" y="320" width="380" height="520" rx="10" fill="#a8cde8" stroke="#8a7a64" stroke-width="14"/>
  <g stroke="#8a7a64" stroke-width="10"><line x1="310" y1="320" x2="310" y2="840"/><line x1="120" y1="580" x2="500" y2="580"/></g>
  <circle cx="220" cy="440" r="46" fill="#ffe89e" opacity="0.9"/>
  <rect x="640" y="600" width="380" height="300" rx="14" fill="#8a6a4a"/>
  <rect x="640" y="560" width="380" height="60" rx="14" fill="#9a7a56"/>
  <g fill="#6a4e34"><rect x="660" y="920" width="60" height="120"/><rect x="940" y="920" width="60" height="120"/></g>
  <rect x="680" y="1080" width="300" height="40" rx="10" fill="#7a5a3e"/>
  <rect x="710" y="1250" width="240" height="150" rx="8" fill="#2c3038"/>
  <rect x="730" y="1270" width="200" height="110" rx="4" fill="#5a8ab8"/>
  <circle cx="560" cy="240" r="60" fill="#e8e0d0" opacity="0.8"/>
</svg>`,
])
// 医院走廊
scenes.push([
  'scene-hospital', '医院走廊', ['内置', '场景', '医院', '走廊'],
  `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920">
  <rect width="1080" height="1920" fill="#dfe8e4"/>
  <rect x="0" y="1500" width="1080" height="420" fill="#b8ccc4"/>
  <g fill="#c8dcd4" stroke="#8aa89c" stroke-width="8"><rect x="80" y="500" width="220" height="620" rx="8"/><rect x="780" y="500" width="220" height="620" rx="8"/></g>
  <g fill="#8aa89c"><rect x="200" y="760" width="16" height="90"/><rect x="880" y="760" width="16" height="90"/></g>
  <rect x="420" y="380" width="240" height="90" rx="10" fill="#4a9a8a"/>
  <g fill="#fff"><rect x="450" y="405" width="180" height="40" rx="6"/></g>
  <g fill="#e05a5a"><path d="M540 420 h20 v-14 a10 10 0 0 1 20 0 v14 h20 v20 h-60 Z" opacity="0.9"/></g>
  <rect x="480" y="620" width="120" height="60" rx="8" fill="#a8c4bc"/>
  <g stroke="#9ab4ac" stroke-width="6"><line x1="0" y1="1180" x2="1080" y2="1180"/></g>
  <rect x="0" y="180" width="1080" height="40" fill="#c8dcd4"/>
  <g fill="#f2a8b8"><rect x="140" y="188" width="120" height="24" rx="6"/><rect x="820" y="188" width="120" height="24" rx="6"/></g>
</svg>`,
])

// 渲染新增场景（前 3 个旧场景已在上方循环里生成，跳过）
for (const [slug, name, tags, svg] of scenes.slice(3)) {
  const file = `${slug}.png`
  await png(file, svg)
  addPng(`builtin-${slug}`, name, '场景', tags, file, {
    minDuration: 1.5,
    maxDuration: 12,
    allowHardCut: true,
  })
}

// ---------------------------------------------------------------------------
// 音效扩充（15 个）
// ---------------------------------------------------------------------------
// 惊吓弦乐 1.2s
{
  const n = secs(1.2)
  const out = new Float32Array(n)
  const phases = [0, 0, 0]
  for (let i = 0; i < n; i++) {
    const t = i / SR
    const f = 620 + 700 * Math.min(1, t / 0.9)
    let v = 0
    for (let k = 0; k < 3; k++) {
      phases[k] += (2 * Math.PI * f * (1 + k * 0.012)) / SR
      const p = phases[k] / (2 * Math.PI)
      v += 2 * (p - Math.floor(p + 0.5))
    }
    const env = t < 0.08 ? t / 0.08 : t < 0.85 ? 1 : Math.exp(-(t - 0.85) * 12)
    out[i] = (v / 3) * env * 0.55 + (Math.random() * 2 - 1) * 0.05 * env
  }
  writeWav('sfx-stinger.wav', out)
  addWav('builtin-sfx-stinger', '惊吓弦乐', ['内置', '惊吓', '恐怖'], 'sfx-stinger.wav')
}
// 玻璃碎 0.8s
{
  const n = secs(0.8)
  const out = new Float32Array(n)
  for (let k = 0; k < 14; k++) {
    const t0 = Math.random() * 0.15
    const f = 1800 + Math.random() * 4200
    const dur = 0.1 + Math.random() * 0.4
    const s0 = Math.floor(t0 * SR)
    const len = Math.min(secs(dur), n - s0)
    for (let i = 0; i < len; i++) out[s0 + i] += Math.sin((2 * Math.PI * f * i) / SR) * Math.exp(-(i / SR) * 9) * 0.2
  }
  for (let i = 0; i < secs(0.09) && i < n; i++) out[i] += (Math.random() * 2 - 1) * 0.7 * Math.exp(-(i / SR) * 30)
  writeWav('sfx-glass.wav', out)
  addWav('builtin-sfx-glass', '玻璃碎裂', ['内置', '碎裂', '碰撞'], 'sfx-glass.wav')
}
// 掌声 2s
{
  const n = secs(2)
  const out = new Float32Array(n)
  for (let k = 0; k < 90; k++) {
    const t0 = Math.random() * 1.9
    const s0 = Math.floor(t0 * SR)
    const len = Math.min(secs(0.03), n - s0)
    const a = 0.25 + Math.random() * 0.3
    for (let i = 0; i < len; i++) out[s0 + i] += (Math.random() * 2 - 1) * a * Math.exp(-(i / SR) * 120)
  }
  const fade = secs(0.4)
  for (let i = 0; i < fade; i++) out[n - 1 - i] *= i / fade
  writeWav('sfx-applause.wav', out)
  addWav('builtin-sfx-applause', '掌声', ['内置', '人群', '鼓励'], 'sfx-applause.wav')
}
// 人群欢呼 2s
{
  const n = secs(2)
  const out = new Float32Array(n)
  let lp = 0
  for (let i = 0; i < n; i++) {
    const t = i / SR
    const cutoff = 0.08 + 0.2 * (0.5 + 0.5 * Math.sin(2 * Math.PI * 7 * t))
    lp += cutoff * (Math.random() * 2 - 1 - lp)
    const env = Math.min(1, t / 0.15) * (t > 1.5 ? Math.max(0, (2 - t) / 0.5) : 1)
    out[i] = lp * env * 1.6
  }
  for (let k = 0; k < 3; k++) {
    const f0 = 700 + Math.random() * 500
    const s0 = Math.floor((0.2 + Math.random() * 0.8) * SR)
    const len = Math.min(secs(0.5), n - s0)
    for (let i = 0; i < len; i++) out[s0 + i] += Math.sin((2 * Math.PI * (f0 + 300 * (i / SR))) * (i / SR)) * 0.08 * Math.sin((Math.PI * i) / len)
  }
  writeWav('sfx-cheer.wav', out)
  addWav('builtin-sfx-cheer', '人群欢呼', ['内置', '人群', '欢呼'], 'sfx-cheer.wav')
}
// 鼓点加速 1.6s
{
  const n = secs(1.6)
  const out = new Float32Array(n)
  let t0 = 0
  let gap = 0.24
  while (t0 < 1.35) {
    const s0 = Math.floor(t0 * SR)
    const len = Math.min(secs(0.16), n - s0)
    for (let i = 0; i < len; i++) out[s0 + i] += Math.exp(-(i / SR) * 26) * Math.sin((2 * Math.PI * 95 * i) / SR) * 0.7
    t0 += gap
    gap = Math.max(0.1, gap - 0.018)
  }
  const s0 = Math.floor(1.38 * SR)
  const len = Math.min(secs(0.5), n - s0)
  for (let i = 0; i < len; i++) out[s0 + i] += Math.exp(-(i / SR) * 9) * Math.sin((2 * Math.PI * 62 * i) / SR) * 1.0
  writeWav('sfx-drums.wav', out)
  addWav('builtin-sfx-drums', '鼓点（加速）', ['内置', '打击', '紧张'], 'sfx-drums.wav')
}
// 开门 1.2s
{
  const n = secs(1.2)
  const out = new Float32Array(n)
  let phase = 0
  for (let i = 0; i < n; i++) {
    const t = i / SR
    const f = 180 + 320 * Math.min(1, t / 1.0) + 40 * Math.sin(2 * Math.PI * 5 * t)
    phase += (2 * Math.PI * f) / SR
    const saw = 2 * (phase / (2 * Math.PI) - Math.floor(phase / (2 * Math.PI) + 0.5))
    const env = Math.min(1, t / 0.1) * (t > 0.9 ? Math.max(0, (1.2 - t) / 0.3) : 1)
    out[i] = saw * env * 0.22
  }
  writeWav('sfx-dooropen.wav', out)
  addWav('builtin-sfx-dooropen', '开门', ['内置', '门', '日常'], 'sfx-dooropen.wav')
}
// 关门砰 0.7s
{
  const n = secs(0.7)
  const out = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const t = i / SR
    out[i] = Math.exp(-t * 11) * Math.sin(2 * Math.PI * 55 * t) * 0.95
  }
  for (let i = 0; i < secs(0.02) && i < n; i++) out[i] += (Math.random() * 2 - 1) * 0.5
  writeWav('sfx-slam.wav', out)
  addWav('builtin-sfx-slam', '关门砰', ['内置', '门', '撞击'], 'sfx-slam.wav')
}
// 脚步 1.6s（4 步）
{
  const n = secs(1.6)
  const out = new Float32Array(n)
  for (let k = 0; k < 4; k++) {
    const s0 = Math.floor(k * 0.4 * SR)
    let lp = 0
    for (let i = 0; i < secs(0.09) && s0 + i < n; i++) {
      lp += 0.12 * (Math.random() * 2 - 1 - lp)
      out[s0 + i] += (lp * 1.4 + Math.exp(-(i / SR) * 40) * Math.sin((2 * Math.PI * 100 * i) / SR) * 0.5) * (k % 2 ? 0.8 : 1)
    }
  }
  writeWav('sfx-steps.wav', out)
  addWav('builtin-sfx-steps', '脚步声', ['内置', '走路', '日常'], 'sfx-steps.wav')
}
// 电话铃 2s
{
  const n = secs(2)
  const out = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const t = i / SR
    const on = (t % 1.0) < 0.7
    if (!on) continue
    const trem = 0.7 + 0.3 * Math.sin(2 * Math.PI * 20 * t)
    out[i] = (Math.sin(2 * Math.PI * 440 * t) + Math.sin(2 * Math.PI * 480 * t)) * 0.32 * trem
  }
  writeWav('sfx-phone.wav', out)
  addWav('builtin-sfx-phone', '电话铃', ['内置', '电话', '日常'], 'sfx-phone.wav')
}
// 闹钟 1.5s
{
  const n = secs(1.5)
  const out = new Float32Array(n)
  for (let b = 0; b < 6; b++) {
    const s0 = Math.floor(b * 0.25 * SR)
    for (let i = 0; i < secs(0.12) && s0 + i < n; i++) {
      const sq = Math.sin((2 * Math.PI * 880 * i) / SR) > 0 ? 1 : -1
      out[s0 + i] += sq * 0.3 * Math.min(1, i / (SR * 0.005))
    }
  }
  writeWav('sfx-alarm.wav', out)
  addWav('builtin-sfx-alarm', '闹钟', ['内置', '闹钟', '日常'], 'sfx-alarm.wav')
}
// 倒吸气 0.6s
{
  const n = secs(0.6)
  const out = new Float32Array(n)
  let lp = 0
  for (let i = 0; i < n; i++) {
    const t = i / SR
    const cutoff = 0.04 + 0.3 * (t / 0.6)
    lp += cutoff * (Math.random() * 2 - 1 - lp)
    out[i] = (lp * 1.8 + Math.sin(2 * Math.PI * (300 + 350 * t) * t) * 0.08) * Math.sin(Math.PI * (i / n)) ** 0.7
  }
  writeWav('sfx-gasp.wav', out)
  addWav('builtin-sfx-gasp', '倒吸气', ['内置', '惊讶', '呼吸'], 'sfx-gasp.wav')
}
// 嗡嗡（尴尬） 1.2s
{
  const n = secs(1.2)
  const out = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const t = i / SR
    const sq = Math.sin(2 * Math.PI * 110 * t) > 0 ? 1 : -1
    const env = Math.sin((Math.PI * i) / n) ** 0.5
    out[i] = (sq * 0.7 + Math.sin(2 * Math.PI * 220 * t) * 0.3) * (0.7 + 0.3 * Math.sin(2 * Math.PI * 6 * t)) * env * 0.28
  }
  writeWav('sfx-buzz.wav', out)
  addWav('builtin-sfx-buzz', '嗡嗡（尴尬）', ['内置', '尴尬', '氛围'], 'sfx-buzz.wav')
}
// 消音哔 0.9s
{
  const n = secs(0.9)
  const out = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const t = i / SR
    const env = Math.min(1, t / 0.012) * Math.min(1, (0.9 - t) / 0.012)
    out[i] = Math.sin(2 * Math.PI * 1000 * t) * 0.35 * env
  }
  writeWav('sfx-beep.wav', out)
  addWav('builtin-sfx-beep', '消音哔——', ['内置', '消音', '搞笑'], 'sfx-beep.wav')
}
// 弹簧 boing 0.7s
{
  const n = secs(0.7)
  const out = new Float32Array(n)
  let phase = 0
  for (let i = 0; i < n; i++) {
    const t = i / SR
    const f = 260 + 260 * Math.exp(-t * 4.5) * Math.cos(2 * Math.PI * 13 * t)
    phase += (2 * Math.PI * Math.max(40, f)) / SR
    out[i] = Math.sin(phase) * Math.exp(-t * 4) * 0.5
  }
  writeWav('sfx-boing.wav', out)
  addWav('builtin-sfx-boing', '弹簧（滑稽）', ['内置', '滑稽', '弹跳'], 'sfx-boing.wav')
}
// 叮（硬币/点子） 0.6s
{
  const n = secs(0.6)
  const out = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const t = i / SR
    out[i] = (Math.sin(2 * Math.PI * 1318 * t) * 0.5 + Math.sin(2 * Math.PI * 1975 * t) * 0.35 + Math.sin(2 * Math.PI * 2637 * t) * 0.15) * Math.exp(-t * 7) * 0.5
  }
  writeWav('sfx-ding.wav', out)
  addWav('builtin-sfx-ding', '叮（点子/金币）', ['内置', '提示', '金币'], 'sfx-ding.wav')
}

// ---------------------------------------------------------------------------
// BGM（音乐分类）：小节网格调度，无缝循环
// ---------------------------------------------------------------------------
const MF = (m) => 440 * 2 ** ((m - 69) / 12)

function bgm({ bars, bpm, build }) {
  const beat = 60 / bpm
  const total = bars * 4 * beat
  const n = secs(total)
  const out = new Float32Array(n)
  const note = (startBeat, durBeats, freq, amp, kind = 'pluck') => {
    const s0 = Math.floor(startBeat * beat * SR)
    if (s0 >= n) return
    const len = Math.min(Math.floor(durBeats * beat * SR), n - s0)
    for (let i = 0; i < len; i++) {
      const t = i / SR
      let env
      if (kind === 'pad') env = Math.min(1, t / 0.25) * Math.min(1, Math.max(0, durBeats * beat - t) / 0.5)
      else env = Math.exp(-t * (kind === 'bass' ? 3.5 : 6))
      let v = Math.sin(2 * Math.PI * freq * t)
      if (kind === 'pluck') {
        v = (v + 0.4 * Math.sin(4 * Math.PI * freq * t) + 0.18 * Math.sin(6 * Math.PI * freq * t)) * 0.7
      }
      out[s0 + i] += amp * env * v
    }
  }
  const hat = (startBeat, amp = 0.1) => {
    const s0 = Math.floor(startBeat * beat * SR)
    if (s0 >= n) return
    const len = Math.min(secs(0.045), n - s0)
    for (let i = 0; i < len; i++) out[s0 + i] += amp * (Math.random() * 2 - 1) * Math.exp(-(i / SR) * 90)
  }
  build({ note, hat, bars })
  return out
}

// BGM·诡异氛围 24s：低音簇缓慢交替 + 稀疏高音铃
{
  const out = bgm({ bars: 6, bpm: 60, build: ({ note }) => {
    const roots = [45, 45, 46, 44, 45, 45]
    roots.forEach((r, c) => {
      note(c * 4, 4.2, MF(r), 0.22, 'pad')
      note(c * 4, 4.2, MF(r + 7), 0.15, 'pad')
      note(c * 4, 4.2, MF(r + 12), 0.1, 'pad')
      if (c === 1 || c === 4) note(c * 4 + 2.5, 2, MF(r + 24), 0.12, 'pluck')
    })
  } })
  writeWav('bgm-eerie.wav', out)
  addMusic('builtin-bgm-eerie', 'BGM·诡异氛围', ['内置', 'BGM', '诡异', '恐怖'], 'bgm-eerie.wav', 24)
}
// BGM·紧张鼓点 16s：低音急促 + 踩镲
{
  const out = bgm({ bars: 8, bpm: 120, build: ({ note, hat, bars }) => {
    const roots = [45, 45, 47, 47, 48, 48, 47, 47]
    for (let b = 0; b < bars; b++) {
      const r = MF(roots[b] - 12)
      for (let e = 0; e < 8; e++) {
        note(b * 4 + e * 0.5, 0.5, e % 2 ? r * 2 : r, e % 4 === 0 ? 0.34 : 0.22, 'bass')
        if (e % 2 === 1) hat(b * 4 + e * 0.5, 0.09)
      }
      note(b * 4, 1, MF(roots[b]), 0.14, 'pad')
    }
  } })
  writeWav('bgm-tense.wav', out)
  addMusic('builtin-bgm-tense', 'BGM·紧张鼓点', ['内置', 'BGM', '紧张', '追逐'], 'bgm-tense.wav', 16)
}
// BGM·滑稽蹦跳 14.5s：大调琶音 + 低音蹦跳
{
  const out = bgm({ bars: 8, bpm: 132, build: ({ note, bars }) => {
    const roots = [60, 60, 65, 67, 60, 60, 65, 67]
    const arp = [0, 4, 7, 12, 7, 4, 0, -5]
    for (let b = 0; b < bars; b++) {
      note(b * 4, 1, MF(roots[b] - 24), 0.3, 'bass')
      note(b * 4 + 2, 1, MF(roots[b] - 24), 0.26, 'bass')
      for (let e = 0; e < 8; e++) note(b * 4 + e * 0.5, 0.5, MF(roots[b] + arp[e]), 0.16, 'pluck')
    }
  } })
  writeWav('bgm-funny.wav', out)
  addMusic('builtin-bgm-funny', 'BGM·滑稽蹦跳', ['内置', 'BGM', '搞笑', '日常'], 'bgm-funny.wav', 14.55)
}
// BGM·悲伤弦乐 27.4s：小调长铺垫
{
  const out = bgm({ bars: 8, bpm: 70, build: ({ note, bars }) => {
    const chords = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62], [57, 60, 64], [53, 57, 60], [48, 52, 55], [52, 55, 59]]
    for (let b = 0; b < bars; b++) {
      chords[b].forEach((m, k) => note(b * 4, 4.3, MF(m), k === 0 ? 0.2 : 0.13, 'pad'))
      note(b * 4, 4.3, MF(chords[b][0] - 12), 0.18, 'bass')
    }
  } })
  writeWav('bgm-sad.wav', out)
  addMusic('builtin-bgm-sad', 'BGM·悲伤弦乐', ['内置', 'BGM', '悲伤', '抒情'], 'bgm-sad.wav', 27.43)
}
// BGM·日常轻快 19.2s：I-V-vi-IV 铺底
{
  const out = bgm({ bars: 8, bpm: 100, build: ({ note, hat, bars }) => {
    const chords = [[60, 64, 67], [55, 59, 62], [57, 60, 64], [53, 57, 60], [60, 64, 67], [55, 59, 62], [57, 60, 64], [53, 57, 60]]
    for (let b = 0; b < bars; b++) {
      chords[b].forEach((m, k) => note(b * 4, 4.2, MF(m), k === 0 ? 0.16 : 0.1, 'pad'))
      note(b * 4, 1, MF(chords[b][0] - 12), 0.24, 'bass')
      note(b * 4 + 2, 1, MF(chords[b][0] - 12 + 7), 0.2, 'bass')
      hat(b * 4 + 1, 0.08)
      hat(b * 4 + 3, 0.08)
    }
  } })
  writeWav('bgm-daily.wav', out)
  addMusic('builtin-bgm-daily', 'BGM·日常轻快', ['内置', 'BGM', '日常', '轻松'], 'bgm-daily.wav', 19.2)
}

// ---------------------------------------------------------------------------
fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8')
console.log(`\nmanifest: ${manifest.materials.length} 个内置素材`)
