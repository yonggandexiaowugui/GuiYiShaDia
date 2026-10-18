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

function addWav(id, name, tags, file) {
  manifest.materials.push({ id, name, category: '音效', tags, file, maxDuration: 10, loopFlag: false })
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
fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8')
console.log(`\nmanifest: ${manifest.materials.length} 个内置素材`)
