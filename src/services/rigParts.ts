// ============================================================================
// 绑骨部件图资源（P3）：sceneRenderer（预览/导出）与骨骼实验室共用同一解析
// - 部件图由 scripts/generate-rig-character.mjs 生成，构建期随 glob 打包
// - 图片本体缓存复用 sceneRenderer 的 imgCache（经 preloadImages 统一预热）
// ============================================================================
import type { CharacterRig } from '@shared/characterRig'

const PART_URLS = import.meta.glob('/src/assets/rig-character/*.png', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>

/** 按文件名解析部件图 URL；缺失（生成脚本未跑）返回空串 */
export function partUrl(file: string): string {
  for (const [p, url] of Object.entries(PART_URLS)) {
    if (p.endsWith('/' + file)) return url
  }
  return ''
}

/** 该角色需要的全部图（部件 + 表情贴图，去重） */
export function rigPartFiles(charRig: CharacterRig): string[] {
  return [
    ...new Set([
      ...charRig.parts.map((p) => p.image),
      ...charRig.expressions.map((e) => e.image),
    ]),
  ]
}

/** 该角色全部部件图的已解析 URL（预热用） */
export function rigPartUrls(charRig: CharacterRig): string[] {
  return rigPartFiles(charRig)
    .map((f) => partUrl(f))
    .filter((u) => u !== '')
}

/** 部件绘制顺序：先四肢（下层），后躯干/头（上层） */
export const RIG_DRAW_ORDER = [
  'thighL', 'shinL', 'thighR', 'shinR',
  'upperArmL', 'forearmL', 'handL', 'upperArmR', 'forearmR', 'handR',
  'root', 'hip', 'spine', 'neck', 'head',
]

/** 检查某角色的部件图是否全部就绪（生成脚本未跑时为 false） */
export function riggedAvailable(charRig: CharacterRig): boolean {
  return rigPartFiles(charRig).every((f) => partUrl(f) !== '')
}
