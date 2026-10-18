// 打包前准备 FFmpeg：把一个可用的 ffmpeg 二进制复制到 resources/ffmpeg/，
// 供 electron-builder 通过 extraResources 打进安装包。
//
// 查找顺序：GUIYI_FFMPEG 环境变量 → 系统 PATH → 常见安装目录 → ffmpeg-static
// 用法：node scripts/prepare-ffmpeg.mjs [输出目录]
//   （输出目录默认 resources/ffmpeg；也可传临时目录仅做验证，不污染仓库）
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const EXE = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'
const PROBE = process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe'

/** 在 PATH 中查找可执行文件 */
function which(name) {
  try {
    const out = execFileSync(process.platform === 'win32' ? 'where' : 'which', [name], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    return out.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)[0] ?? null
  } catch {
    return null
  }
}

function candidates() {
  const list = []
  if (process.env.GUIYI_FFMPEG) list.push(process.env.GUIYI_FFMPEG)
  const onPath = which('ffmpeg')
  if (onPath) list.push(onPath)

  const dirs = [
    path.join(os.homedir(), 'AppData', 'Local', 'ffmpeg', 'bin'),
    'C:/ffmpeg/bin',
    'D:/ffmpeg/bin',
    'C:/Program Files/ffmpeg/bin',
  ]
  for (const d of dirs) list.push(path.join(d, EXE))

  list.push(path.join(process.cwd(), 'node_modules', 'ffmpeg-static', EXE))
  return list
}

function firstExisting(list) {
  for (const p of list) {
    try {
      if (p && fs.existsSync(p) && fs.statSync(p).isFile()) return p
    } catch {
      /* ignore */
    }
  }
  return null
}

const outDir = path.resolve(process.argv[2] ?? path.join('resources', 'ffmpeg'))
const src = firstExisting(candidates())

if (!src) {
  console.error('❌ 未找到可用的 ffmpeg。请安装 ffmpeg 并加入 PATH，或设置 GUIYI_FFMPEG 指向 ffmpeg.exe')
  process.exit(1)
}

fs.mkdirSync(outDir, { recursive: true })
const dst = path.join(outDir, EXE)
fs.copyFileSync(src, dst)
let total = fs.statSync(dst).size
console.log(`✅ ffmpeg: ${src} → ${dst}（${(total / 1024 / 1024).toFixed(2)} MB）`)

// 关键：如果是 --enable-shared 的共享构建，exe 还需要同目录的 av*.dll 才能运行。
// 只复制 exe 会在没有装 ffmpeg 的机器上启动失败，所以必须把 DLL 一并带上。
const srcDir = path.dirname(src)
const dlls = fs.readdirSync(srcDir).filter((f) => f.toLowerCase().endsWith('.dll'))
for (const dll of dlls) {
  fs.copyFileSync(path.join(srcDir, dll), path.join(outDir, dll))
  total += fs.statSync(path.join(outDir, dll)).size
}
if (dlls.length > 0) {
  console.log(`✅ 依赖 DLL ${dlls.length} 个（共享构建必需）`)
} else {
  console.log('ℹ 未发现 DLL，应为静态构建，单文件即可运行')
}
console.log(`ℹ 体积合计 ${(total / 1024 / 1024).toFixed(1)} MB（会打进安装包，介意体积可删除 resources/ffmpeg）`)

// ffprobe 非必需（当前代码未使用），有则一并带上，方便后续诊断
const probeSrc = firstExisting([
  path.join(srcDir, PROBE),
  which('ffprobe'),
])
if (probeSrc) {
  fs.copyFileSync(probeSrc, path.join(outDir, PROBE))
  console.log(`✅ ffprobe: ${probeSrc} → ${path.join(outDir, PROBE)}`)
} else {
  console.log('ℹ ffprobe 未找到，跳过（不影响导出）')
}
