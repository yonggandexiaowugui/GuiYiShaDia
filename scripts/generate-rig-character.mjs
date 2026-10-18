// ============================================================================
// 绑骨角色「小方」部件生成器（node scripts/generate-rig-character.mjs）
// - SVG（viewBox = 角色空间单位，3px/单位）→ sharp 光栅化 PNG（透明背景）
// - 产物：src/assets/rig-character/*.png（9 个部件 + 4 张表情贴图）
// - 几何必须与 shared/characterRig.ts 的 manifest 严格一致：
//   所有部件四周含 3 单位出血边；四肢为圆头胶囊，关节帽圆心 = 骨 pivot
// ============================================================================
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'assets', 'rig-character')
fs.mkdirSync(OUT, { recursive: true })

// px / 角色空间单位
const S = 3

// 配色与大方脸（scripts/generate-assets.mjs）同族
const SKIN = '#ffcf9e'
const LINE = '#3a2a1a'
const SHIRT = '#465a7d'
const PANTS = '#33394a'
const SHOE = '#262033'
const SW = 2.7 // 部件描边（单位）

function svg(w, h, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w * S}" height="${h * S}" viewBox="0 0 ${w} ${h}">${body}</svg>`
}

async function png(file, svgText) {
  await sharp(Buffer.from(svgText)).png().toFile(path.join(OUT, file))
  console.log('png :', file)
}

// ---------------------------------------------------------------------------
// 身体部件（pivot 几何见 manifest；rect x/y=3 即出血边）
// ---------------------------------------------------------------------------
// 头：96×104 圆角方头（无五官，五官由表情贴图叠加）
await png('head.png', svg(102, 110,
  `<rect x="3" y="3" width="96" height="104" rx="26" fill="${SKIN}" stroke="${LINE}" stroke-width="${SW}"/>`))

// 颈：24×30 小圆柱
await png('neck.png', svg(30, 36,
  `<rect x="3" y="3" width="24" height="30" rx="8" fill="${SKIN}" stroke="${LINE}" stroke-width="${SW}"/>`))

// 躯干：88×128 圆角长袍
await png('torso.png', svg(94, 134,
  `<rect x="3" y="3" width="88" height="128" rx="20" fill="${SHIRT}" stroke="${LINE}" stroke-width="${SW}"/>`))

// 胯：76×56 裤裆
await png('hip.png', svg(82, 62,
  `<rect x="3" y="3" width="76" height="56" rx="14" fill="${PANTS}" stroke="${LINE}" stroke-width="${SW}"/>`))

// 大臂：26×94 胶囊（袖子），顶部关节帽圆心 = 肩 pivot
await png('upper-arm.png', svg(32, 100,
  `<rect x="3" y="3" width="26" height="94" rx="13" fill="${SHIRT}" stroke="${LINE}" stroke-width="${SW}"/>`))

// 小臂：22×82 胶囊（肤色，短袖设定）
await png('forearm.png', svg(28, 88,
  `<rect x="3" y="3" width="22" height="82" rx="11" fill="${SKIN}" stroke="${LINE}" stroke-width="${SW}"/>`))

// 手：24×38 小胖手
await png('hand.png', svg(30, 44,
  `<rect x="3" y="3" width="24" height="38" rx="12" fill="${SKIN}" stroke="${LINE}" stroke-width="${SW}"/>`))

// 大腿：30×120 胶囊
await png('thigh.png', svg(36, 126,
  `<rect x="3" y="3" width="30" height="120" rx="15" fill="${PANTS}" stroke="${LINE}" stroke-width="${SW}"/>`))

// 小腿：24×112 胶囊 + 底部鞋头
await png('shin.png', svg(30, 118,
  `<rect x="3" y="3" width="24" height="112" rx="12" fill="${PANTS}" stroke="${LINE}" stroke-width="${SW}"/>` +
  `<ellipse cx="15" cy="108" rx="13.5" ry="8" fill="${SHOE}" stroke="${LINE}" stroke-width="${SW}"/>`))

// ---------------------------------------------------------------------------
// 表情贴图（62×46 透明底五官，位置按大方脸 600×600 比例换算到头部）
// 眼位 (18.2, 8.3) / (43.8, 8.3)；嘴心 (31, 32.6)
// ---------------------------------------------------------------------------
const EX = 18.2 // 左眼 x
const ER = 43.8 // 右眼 x
const EY = 8.3 // 眼 y
const MX = 31 // 嘴心 x
const MY = 32.6 // 嘴心 y

// 平静：点眼 + 一字嘴
await png('expr-calm.png', svg(62, 46,
  `<circle cx="${EX}" cy="${EY}" r="2.9" fill="${LINE}"/><circle cx="${ER}" cy="${EY}" r="2.9" fill="${LINE}"/>` +
  `<path d="M${MX - 8} ${MY} L${MX + 8} ${MY}" stroke="${LINE}" stroke-width="1.9" stroke-linecap="round"/>`))

// 开心：弯眼 + 微笑 + 腮红
await png('expr-happy.png', svg(62, 46,
  `<path d="M${EX - 5.5} ${EY + 1} Q${EX} ${EY - 4.8} ${EX + 5.5} ${EY + 1}" stroke="${LINE}" stroke-width="1.9" fill="none" stroke-linecap="round"/>` +
  `<path d="M${ER - 5.5} ${EY + 1} Q${ER} ${EY - 4.8} ${ER + 5.5} ${EY + 1}" stroke="${LINE}" stroke-width="1.9" fill="none" stroke-linecap="round"/>` +
  `<path d="M${MX - 8} ${MY - 3} Q${MX} ${MY + 5.8} ${MX + 8} ${MY - 3}" stroke="${LINE}" stroke-width="1.9" fill="none" stroke-linecap="round"/>` +
  `<ellipse cx="9.4" cy="15" rx="4.5" ry="2.3" fill="#ff9e9e" opacity="0.6"/><ellipse cx="52.6" cy="15" rx="4.5" ry="2.3" fill="#ff9e9e" opacity="0.6"/>`))

// 愤怒：点眼 + 倒八眉 + 锯齿嘴
await png('expr-angry.png', svg(62, 46,
  `<circle cx="${EX}" cy="${EY}" r="2.9" fill="${LINE}"/><circle cx="${ER}" cy="${EY}" r="2.9" fill="${LINE}"/>` +
  `<path d="M${EX - 7.2} ${EY - 3.8} L${EX + 5.8} ${EY + 1.2}" stroke="${LINE}" stroke-width="2.2" stroke-linecap="round"/>` +
  `<path d="M${ER + 7.2} ${EY - 3.8} L${ER - 5.8} ${EY + 1.2}" stroke="${LINE}" stroke-width="2.2" stroke-linecap="round"/>` +
  `<path d="M${MX - 9.6} ${MY + 1} L${MX - 6.4} ${MY - 2} L${MX - 3.2} ${MY + 1} L${MX} ${MY - 2} L${MX + 3.2} ${MY + 1} L${MX + 6.4} ${MY - 2} L${MX + 9.6} ${MY + 1}" stroke="${LINE}" stroke-width="1.7" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`))

// 惊讶：大白眼 + O 嘴
await png('expr-shocked.png', svg(62, 46,
  `<circle cx="${EX}" cy="${EY}" r="4.8" fill="#fff" stroke="${LINE}" stroke-width="1.3"/>` +
  `<circle cx="${ER}" cy="${EY}" r="4.8" fill="#fff" stroke="${LINE}" stroke-width="1.3"/>` +
  `<circle cx="${EX}" cy="${EY}" r="1.9" fill="${LINE}"/><circle cx="${ER}" cy="${EY}" r="1.9" fill="${LINE}"/>` +
  `<circle cx="${MX}" cy="${MY}" r="5.4" fill="none" stroke="${LINE}" stroke-width="1.9"/>`))

console.log('done ->', OUT)
