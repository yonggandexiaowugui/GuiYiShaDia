// ============================================================================
// 绑骨角色「小菱」部件生成器 v2（node scripts/generate-rig-character.mjs）
// 风格：Q 版黑金军装少女（参考用户提供的 chibi 立绘）
// - 大面积黑长发（后发马尾层 + 刘海发饰层）、空白脸（表情贴图独立叠加）
// - 军装上衣金肩章斜挎带 + A 字裙 + 长靴，白手套
// - SVG（viewBox = 角色空间单位，3px/单位）→ sharp 光栅化 PNG（透明背景）
// - 产物：src/assets/rig-character/*.png（11 个部件 + 4 张表情贴图）
//         以及 assets-builtin/char-rigged-xiaofang.png 整体预览图（按 manifest 合成）
// - 几何必须与 shared/characterRig.ts 的 manifest 严格一致：
//   所有部件四周含 3 单位出血边；四肢为圆头胶囊，关节帽圆心 = 骨 pivot
// ============================================================================
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT = path.join(ROOT, 'src', 'assets', 'rig-character')
const BUILTIN_OUT = path.join(ROOT, 'assets-builtin')
fs.mkdirSync(OUT, { recursive: true })
fs.mkdirSync(BUILTIN_OUT, { recursive: true })

// px / 角色空间单位
const S = 3

// 黑金军装配色
const SKIN = '#f7dcc8'
const SKIN_SH = '#ecc9b2'
const HAIR = '#211d26'
const HAIR_HI = '#453e50'
const HAIR_LINE = '#100e14'
const UNI = '#26222e'
const UNI_D = '#1b1822'
const GOLD = '#d9b36c'
const GOLD_D = '#b08d4a'
const GLOVE = '#f2ede4'
const LINE = '#14121a'
const SW = 2.7 // 部件描边（单位）

function svg(w, h, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w * S}" height="${h * S}" viewBox="0 0 ${w} ${h}">${body}</svg>`
}

const pngs = {}
async function png(file, svgText) {
  pngs[file] = Buffer.from(svgText)
  await sharp(pngs[file]).png().toFile(path.join(OUT, file))
  console.log('png :', file)
}

// 圆头竖直胶囊（关节帽圆心 = pivot；cx 为图内中线）
function capsule(cx, top, w, h, fill) {
  return `<rect x="${cx - w / 2}" y="${top}" width="${w}" height="${h}" rx="${w / 2}" fill="${fill}" stroke="${LINE}" stroke-width="${SW}"/>`
}

// ---------------------------------------------------------------------------
// 头（124×128，pivot 图内 (62,75)）：空白鹅蛋脸，无任何五官
// ---------------------------------------------------------------------------
await png('head.png', svg(124, 128,
  // 脸：上圆下收的鹅蛋（顶 y=14 藏进前发覆盖区，避免头顶露肤色弧）
  `<path d="M 8 58 Q 8 14 62 14 Q 116 14 116 58 Q 116 98 90 116 Q 62 127 34 116 Q 8 98 8 58 Z" fill="${SKIN}" stroke="${LINE}" stroke-width="${SW}"/>` +
  // 耳朵
  `<ellipse cx="9" cy="60" rx="7" ry="11" fill="${SKIN}" stroke="${LINE}" stroke-width="${SW}"/>` +
  `<ellipse cx="115" cy="60" rx="7" ry="11" fill="${SKIN}" stroke="${LINE}" stroke-width="${SW}"/>` +
  // 腮部淡阴影（体积感）
  `<path d="M 24 92 Q 40 106 62 106 Q 84 106 100 92 Q 88 112 62 112 Q 36 112 24 92 Z" fill="${SKIN_SH}" opacity="0.55"/>`))

// ---------------------------------------------------------------------------
// 后发层（150×246，pivot 图内 (75,63)）：头盖弧 + 偏右大马尾垂到臀下
// 画布比头部宽：马尾外缘甩到躯干侧缘外（char x≈63 > 躯干 55），侧视可见
// ---------------------------------------------------------------------------
await png('back-hair.png', svg(150, 246,
  // 头盖弧（画在头后，略大于头轮廓）
  `<path d="M 23 62 Q 23 4 75 4 Q 127 4 127 62 L 127 84 Q 112 70 75 70 Q 38 70 23 84 Z" fill="${HAIR}" stroke="${HAIR_LINE}" stroke-width="${SW}"/>` +
  // 大马尾：从发旋向右鼓起再垂落，尾梢波浪
  `<path d="M 75 34 Q 148 46 142 102 Q 137 150 124 188 Q 116 214 106 234 Q 102 242 98 234 Q 92 212 98 186 Q 108 142 106 100 Q 104 58 75 34 Z" fill="${HAIR}" stroke="${HAIR_LINE}" stroke-width="${SW}"/>` +
  // 发束分缕
  `<path d="M 92 60 Q 106 92 102 140 Q 100 172 90 204" stroke="${HAIR_HI}" stroke-width="2.2" fill="none" stroke-linecap="round" opacity="0.8"/>` +
  `<path d="M 78 66 Q 86 110 82 160 Q 80 190 74 214" stroke="${HAIR_HI}" stroke-width="1.8" fill="none" stroke-linecap="round" opacity="0.6"/>` +
  // 发根扎束处
  `<ellipse cx="75" cy="36" rx="10" ry="6" fill="${GOLD_D}" stroke="${HAIR_LINE}" stroke-width="1.6"/>`))

// ---------------------------------------------------------------------------
// 前发层（128×74，pivot 图内 (64,69)）：中分刘海 + 右侧金色流苏发饰
// 刘海底缘在 pivot 上 2（y=67），不遮挡下方表情区
// ---------------------------------------------------------------------------
await png('front-hair.png', svg(128, 74,
  // 左片刘海
  `<path d="M 64 6 Q 30 4 12 26 Q 6 44 10 66 Q 20 46 38 38 Q 54 32 64 30 Z" fill="${HAIR}" stroke="${HAIR_LINE}" stroke-width="${SW}"/>` +
  // 右片刘海
  `<path d="M 64 6 Q 98 4 116 26 Q 122 44 118 66 Q 108 46 92 38 Q 76 32 64 30 Z" fill="${HAIR}" stroke="${HAIR_LINE}" stroke-width="${SW}"/>` +
  // 顶部发缝高光
  `<path d="M 64 8 Q 40 8 22 24" stroke="${HAIR_HI}" stroke-width="2.2" fill="none" stroke-linecap="round" opacity="0.75"/>` +
  `<path d="M 64 8 Q 88 8 106 24" stroke="${HAIR_HI}" stroke-width="2.2" fill="none" stroke-linecap="round" opacity="0.75"/>` +
  // 右侧金色流苏发饰：链 + 坠
  `<path d="M 92 26 Q 104 30 112 40" stroke="${GOLD}" stroke-width="2.6" fill="none" stroke-linecap="round"/>` +
  `<circle cx="112" cy="43" r="3.4" fill="${GOLD}" stroke="${GOLD_D}" stroke-width="1.4"/>` +
  `<path d="M 100 30 L 100 40 M 106 33 L 106 44" stroke="${GOLD}" stroke-width="1.6" stroke-linecap="round"/>`))

// ---------------------------------------------------------------------------
// 脖（30×36，pivot 居中）
// ---------------------------------------------------------------------------
await png('neck.png', svg(30, 36,
  `<rect x="3" y="3" width="24" height="30" rx="8" fill="${SKIN}" stroke="${LINE}" stroke-width="${SW}"/>`))

// ---------------------------------------------------------------------------
// 躯干（110×106，pivot 图内 (55,73)）：军装上衣，金肩章 + 斜挎带 + 双排扣
// 领口在图内 y=3（-302），下摆 y=103（-202）
// ---------------------------------------------------------------------------
await png('torso.png', svg(110, 106,
  // 主体（微收腰长袍形）
  `<path d="M 20 6 L 90 6 Q 100 6 102 18 L 104 78 Q 104 100 84 102 L 26 102 Q 6 100 6 78 L 8 18 Q 10 6 20 6 Z" fill="${UNI}" stroke="${LINE}" stroke-width="${SW}"/>` +
  // 衣领（V 领露颈肤）
  `<path d="M 40 4 L 55 22 L 70 4 Z" fill="${SKIN_SH}" stroke="${LINE}" stroke-width="2"/>` +
  // 肩章（左右各一枚金章 + 流苏）
  `<rect x="10" y="8" width="24" height="11" rx="4" fill="${GOLD}" stroke="${GOLD_D}" stroke-width="1.6"/>` +
  `<rect x="76" y="8" width="24" height="11" rx="4" fill="${GOLD}" stroke="${GOLD_D}" stroke-width="1.6"/>` +
  `<path d="M 14 19 L 10 30 M 20 19 L 18 31 M 26 19 L 26 30 M 80 19 L 76 30 M 86 19 L 86 31 M 92 19 L 98 30" stroke="${GOLD}" stroke-width="1.6" stroke-linecap="round"/>` +
  // 斜挎金带（右肩 → 左腰）
  `<path d="M 82 12 L 30 96 L 42 100 L 90 18 Z" fill="${GOLD}" stroke="${GOLD_D}" stroke-width="1.6"/>` +
  // 双排金扣
  `<circle cx="46" cy="46" r="3" fill="${GOLD}"/><circle cx="60" cy="46" r="3" fill="${GOLD}"/>` +
  `<circle cx="46" cy="60" r="3" fill="${GOLD}"/><circle cx="60" cy="60" r="3" fill="${GOLD}"/>` +
  `<circle cx="46" cy="74" r="3" fill="${GOLD}"/><circle cx="60" cy="74" r="3" fill="${GOLD}"/>` +
  // 下摆暗部
  `<path d="M 6 84 Q 55 94 104 84 L 104 88 Q 55 98 6 88 Z" fill="${UNI_D}"/>`))

// ---------------------------------------------------------------------------
// 胯/裙（102×66，pivot 图内 (51,19)）：A 字军装裙 + 金边
// 裙腰在图内 y=3（-202）
// ---------------------------------------------------------------------------
await png('hip.png', svg(102, 66,
  `<path d="M 10 4 L 92 4 Q 98 4 98 12 L 96 44 Q 94 62 74 63 L 28 63 Q 8 62 6 44 L 4 12 Q 4 4 10 4 Z" fill="${UNI}" stroke="${LINE}" stroke-width="${SW}"/>` +
  // 腰带金边
  `<rect x="6" y="4" width="90" height="8" rx="4" fill="${GOLD}" stroke="${GOLD_D}" stroke-width="1.4"/>` +
  // 裙摆金线 + 暗部褶
  `<path d="M 6 52 Q 51 60 96 52" stroke="${GOLD}" stroke-width="2" fill="none" opacity="0.9"/>` +
  `<path d="M 30 14 L 26 60 M 51 14 L 51 61 M 72 14 L 76 60" stroke="${UNI_D}" stroke-width="2" opacity="0.8"/>`))

// ---------------------------------------------------------------------------
// 大臂（44×86，pivot 图内 (22,10)）：黑袖 + 金肩环
// ---------------------------------------------------------------------------
await png('upper-arm.png', svg(44, 86,
  capsule(22, 3, 38, 80, UNI) +
  `<rect x="4" y="3" width="36" height="13" rx="6.5" fill="${GOLD}" stroke="${GOLD_D}" stroke-width="1.5"/>`))

// ---------------------------------------------------------------------------
// 小臂（40×78，pivot 图内 (20,10)）：黑袖 + 底部白手套袖口
// ---------------------------------------------------------------------------
await png('forearm.png', svg(40, 78,
  capsule(20, 3, 34, 72, UNI) +
  `<rect x="4" y="60" width="32" height="14" rx="7" fill="${GLOVE}" stroke="${LINE}" stroke-width="2"/>`))

// ---------------------------------------------------------------------------
// 手（32×42，pivot 图内 (16,8)）：白手套小胖手
// ---------------------------------------------------------------------------
await png('hand.png', svg(32, 42,
  `<rect x="3" y="3" width="26" height="36" rx="13" fill="${GLOVE}" stroke="${LINE}" stroke-width="${SW}"/>` +
  `<path d="M 8 30 Q 16 36 24 30" stroke="#d8d0c2" stroke-width="1.8" fill="none" stroke-linecap="round"/>`))

// ---------------------------------------------------------------------------
// 大腿（44×106，pivot 图内 (22,10)）：黑裤袜
// ---------------------------------------------------------------------------
await png('thigh.png', svg(44, 106,
  capsule(22, 3, 38, 100, UNI)))

// ---------------------------------------------------------------------------
// 小腿/长靴（42×114，pivot 图内 (21,12)）：长筒靴 + 金靴口 + 靴头
// ---------------------------------------------------------------------------
await png('shin.png', svg(42, 114,
  capsule(21, 3, 36, 108, UNI) +
  // 靴口金边
  `<rect x="4" y="3" width="34" height="11" rx="5.5" fill="${GOLD}" stroke="${GOLD_D}" stroke-width="1.5"/>` +
  // 靴头（向前伸的小圆头）
  `<ellipse cx="19" cy="103" rx="17" ry="9" fill="${UNI_D}" stroke="${LINE}" stroke-width="${SW}"/>` +
  `<path d="M 8 99 Q 19 94 32 99" stroke="${GOLD}" stroke-width="1.8" fill="none" opacity="0.85"/>`))

// ---------------------------------------------------------------------------
// 表情贴图（70×52 透明底五官；脸宽 118 → 眼距 ±16.5、眼 y=13、嘴 y=36）
// ---------------------------------------------------------------------------
const EX = 18.5
const ER = 51.5
const EY = 13
const MX = 35
const MY = 36

// 平静：点眼 + 一字嘴
await png('expr-calm.png', svg(70, 52,
  `<circle cx="${EX}" cy="${EY}" r="3" fill="${LINE}"/><circle cx="${ER}" cy="${EY}" r="3" fill="${LINE}"/>` +
  `<path d="M${MX - 8.5} ${MY} L${MX + 8.5} ${MY}" stroke="${LINE}" stroke-width="2" stroke-linecap="round"/>`))

// 开心：弯眼 + 微笑 + 腮红
await png('expr-happy.png', svg(70, 52,
  `<path d="M${EX - 6} ${EY + 1} Q${EX} ${EY - 5.2} ${EX + 6} ${EY + 1}" stroke="${LINE}" stroke-width="2" fill="none" stroke-linecap="round"/>` +
  `<path d="M${ER - 6} ${EY + 1} Q${ER} ${EY - 5.2} ${ER + 6} ${EY + 1}" stroke="${LINE}" stroke-width="2" fill="none" stroke-linecap="round"/>` +
  `<path d="M${MX - 9} ${MY - 3} Q${MX} ${MY + 6.2} ${MX + 9} ${MY - 3}" stroke="${LINE}" stroke-width="2" fill="none" stroke-linecap="round"/>` +
  `<ellipse cx="10" cy="17" rx="5" ry="2.6" fill="#ff9e9e" opacity="0.6"/><ellipse cx="60" cy="17" rx="5" ry="2.6" fill="#ff9e9e" opacity="0.6"/>`))

// 愤怒：点眼 + 倒八眉 + 锯齿嘴
await png('expr-angry.png', svg(70, 52,
  `<circle cx="${EX}" cy="${EY}" r="3" fill="${LINE}"/><circle cx="${ER}" cy="${EY}" r="3" fill="${LINE}"/>` +
  `<path d="M${EX - 7.8} ${EY - 4.2} L${EX + 6.2} ${EY + 1.4}" stroke="${LINE}" stroke-width="2.4" stroke-linecap="round"/>` +
  `<path d="M${ER + 7.8} ${EY - 4.2} L${ER - 6.2} ${EY + 1.4}" stroke="${LINE}" stroke-width="2.4" stroke-linecap="round"/>` +
  `<path d="M${MX - 10.4} ${MY + 1} L${MX - 6.9} ${MY - 2.2} L${MX - 3.5} ${MY + 1} L${MX} ${MY - 2.2} L${MX + 3.5} ${MY + 1} L${MX + 6.9} ${MY - 2.2} L${MX + 10.4} ${MY + 1}" stroke="${LINE}" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`))

// 惊讶：大白眼 + O 嘴
await png('expr-shocked.png', svg(70, 52,
  `<circle cx="${EX}" cy="${EY}" r="5.2" fill="#fff" stroke="${LINE}" stroke-width="1.4"/>` +
  `<circle cx="${ER}" cy="${EY}" r="5.2" fill="#fff" stroke="${LINE}" stroke-width="1.4"/>` +
  `<circle cx="${EX}" cy="${EY}" r="2" fill="${LINE}"/><circle cx="${ER}" cy="${EY}" r="2" fill="${LINE}"/>` +
  `<circle cx="${MX}" cy="${MY}" r="5.8" fill="none" stroke="${LINE}" stroke-width="2"/>`))

// ---------------------------------------------------------------------------
// 整体预览图（assets-builtin/char-rigged-xiaofong.png）：按 manifest 摆放部件合成
// 画布 360×430，角色空间 → 预览：scale=0.95，脚底中心 (180, 418)
// 摆放 = 骨 pivot 世界坐标 + 图内 pivot 偏移（与 rigDraw 同一套对齐逻辑）
// ---------------------------------------------------------------------------
const PREVIEW_SCALE = 0.95
const PREVIEW_OX = 180
const PREVIEW_OY = 418
// 骨 pivot（与 shared/rig.ts BUILTIN_RIG 一致；head 加 idle 呼吸角 0）
const PIVOTS = {
  root: [0, 0], hip: [0, -186], spine: [0, -232], neck: [0, -300], head: [0, -346],
  upperArmL: [-56, -288], forearmL: [-56, -220], handL: [-56, -160],
  upperArmR: [56, -288], forearmR: [56, -220], handR: [56, -160],
  thighL: [-24, -186], shinL: [-24, -96], thighR: [24, -186], shinR: [24, -96],
}
// 部件摆放表：[文件, boneId, 图宽, 图高, pivotX, pivotY]（与 manifest 严格一致）
const LAYOUT = [
  ['back-hair.png', 'head', 150, 246, 0.5, 0.2561],
  ['thigh.png', 'thighL', 44, 106, 0.5, 0.0943],
  ['shin.png', 'shinL', 42, 114, 0.5, 0.1053],
  ['thigh.png', 'thighR', 44, 106, 0.5, 0.0943],
  ['shin.png', 'shinR', 42, 114, 0.5, 0.1053],
  ['upper-arm.png', 'upperArmL', 44, 86, 0.5, 0.1163],
  ['forearm.png', 'forearmL', 40, 78, 0.5, 0.1282],
  ['hand.png', 'handL', 32, 42, 0.5, 0.1905],
  ['upper-arm.png', 'upperArmR', 44, 86, 0.5, 0.1163],
  ['forearm.png', 'forearmR', 40, 78, 0.5, 0.1282],
  ['hand.png', 'handR', 32, 42, 0.5, 0.1905],
  ['hip.png', 'hip', 102, 66, 0.5, 0.2879],
  ['torso.png', 'spine', 110, 106, 0.5, 0.6887],
  ['neck.png', 'neck', 30, 36, 0.5, 0.5],
  ['head.png', 'head', 124, 128, 0.5, 0.5859],
  ['front-hair.png', 'head', 128, 74, 0.5, 0.9324],
  ['expr-calm.png', 'head', 70, 52, 0, 0], // 表情：中心对 face 锚点（pivot 下 6）
]
const composites = []
for (const [file, boneId, w, h, px, py] of LAYOUT) {
  const [bx, by] = PIVOTS[boneId]
  let ax = 0
  let ay = 0
  if (file.startsWith('expr-')) {
    // 表情锚点：中心在 head pivot 正下 6（ax/ay 均为角色空间单位）
    ax = bx - w / 2
    ay = by - h / 2 + 6
  } else {
    ax = bx - px * w
    ay = by - py * h
  }
  composites.push({
    input: await sharp(pngs[file]).resize(Math.round(w * PREVIEW_SCALE), Math.round(h * PREVIEW_SCALE)).png().toBuffer(),
    left: Math.round((PREVIEW_OX + ax) * PREVIEW_SCALE),
    top: Math.round((PREVIEW_OY + ay) * PREVIEW_SCALE),
  })
}
const PW = Math.round(360 * PREVIEW_SCALE)
const PH = Math.round(430 * PREVIEW_SCALE)
await sharp({
  create: { width: PW, height: PH, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 0 } },
})
  .composite(composites)
  .png()
  .toFile(path.join(BUILTIN_OUT, 'char-rigged-xiaofang.png'))
console.log('preview ->', path.join(BUILTIN_OUT, 'char-rigged-xiaofang.png'))

console.log('done ->', OUT)
