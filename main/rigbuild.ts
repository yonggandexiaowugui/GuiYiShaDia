// ============================================================================
// 组装绑骨角色（P5 用户侧轻编辑）：用户从素材库选图填 11 部件槽 → 拷贝规格化
// → 内联 rig 入素材库。几何/骨骼/pivot 全部沿用 BUILTIN manifest——
// 用户只换"皮"，永不碰骨骼与标定（呼应"绑定流程需人工完成、AI 永不自动绑骨"）
// ============================================================================
import crypto from 'node:crypto'
import path from 'node:path'
import fs from 'node:fs'
import sharp from 'sharp'
import { addMaterial, resolveAsset } from './database'
import { generateThumbnail } from './media'
import { log } from './log'
import { BUILTIN_RIGGED_CHARACTER, RIG_PART_LABELS, RIG_PART_ORDER } from '../shared/characterRig'
import type { CharacterRig } from '../shared/characterRig'
import type { ImageGenResult } from '../shared/types'

/** px/角色空间单位（与 riggen/manifest 一致） */
const S = 3

/**
 * 组装绑骨角色并入库。
 * @param parts 11 部件槽：部件文件名 → 来源素材相对路径（素材库 file_path）
 * @param expressions 表情槽：exprId → 来源素材相对路径；缺省项复用内置 expr-*.png
 */
export async function buildRigCharacter(
  name: string,
  parts: Record<string, string>,
  expressions: Record<string, string>,
): Promise<ImageGenResult> {
  const charName = name.trim()
  if (!charName) return { ok: false, message: '请给角色起个名字' }
  const missing = RIG_PART_ORDER.filter((f) => !parts[f])
  if (missing.length > 0) {
    return { ok: false, message: `还有部件未选图：${missing.map((f) => RIG_PART_LABELS[f]).join('、')}` }
  }
  for (const f of RIG_PART_ORDER) {
    if (!fs.existsSync(resolveAsset(parts[f]))) {
      return { ok: false, message: `部件「${RIG_PART_LABELS[f]}」的来源图不存在，请重新选择` }
    }
  }

  const id = crypto.randomUUID()
  const dir = `assets/rig-characters/${id}`
  const absDir = resolveAsset(dir)
  fs.mkdirSync(absDir, { recursive: true })
  try {
    // 部件：统一拉伸到 manifest 画布（渲染即按此尺寸绘制，所见即所得）
    for (const file of RIG_PART_ORDER) {
      const spec = BUILTIN_RIGGED_CHARACTER.parts.find((p) => p.image === file)
      if (!spec) throw new Error(`manifest 缺少部件 ${file}`)
      await sharp(resolveAsset(parts[file]))
        .ensureAlpha()
        .resize(spec.width * S, spec.height * S, { fit: 'fill' })
        .png()
        .toFile(path.join(absDir, file))
    }
    // 表情：选中则规格化到 face 锚点画布；未选复用内置 bundled 贴图
    const face = BUILTIN_RIGGED_CHARACTER.face
    const exprImages: Record<string, string> = {}
    for (const e of BUILTIN_RIGGED_CHARACTER.expressions) {
      const src = expressions[e.id]
      if (!src) continue
      const file = `expr-${e.id}.png`
      await sharp(resolveAsset(src))
        .ensureAlpha()
        .resize(face.width * S, face.height * S, { fit: 'fill' })
        .png()
        .toFile(path.join(absDir, file))
      exprImages[e.id] = `${dir}/${file}`
    }

    // 内联 manifest：几何严格沿用内置，仅替换皮图路径
    const rig: CharacterRig = {
      ...BUILTIN_RIGGED_CHARACTER,
      id: `user-${id.slice(0, 8)}`,
      name: charName,
      parts: BUILTIN_RIGGED_CHARACTER.parts.map((p) => ({ ...p, image: `${dir}/${p.image}` })),
      expressions: BUILTIN_RIGGED_CHARACTER.expressions.map((e) => ({
        ...e,
        ...(exprImages[e.id] ? { image: exprImages[e.id] } : {}),
      })),
    }
    const thumbRel = await generateThumbnail(path.join(absDir, 'head.png'), id)
    const material = await addMaterial({
      id,
      name: charName,
      category: '角色',
      tags: ['组装', '绑骨', '角色'],
      file_path: `${dir}/head.png`,
      thumbnail_path: thumbRel,
      meta: JSON.stringify({ source: 'user-rig', rigged: true, characterRigId: rig.id, rig }),
    })
    log(`rigbuild: ok 「${charName}」 ${RIG_PART_ORDER.length} parts + ${Object.keys(exprImages).length} exprs`)
    return { ok: true, material }
  } catch (e) {
    fs.rmSync(absDir, { recursive: true, force: true })
    const msg = e instanceof Error ? e.message : String(e)
    log(`rigbuild: failed ${msg}`)
    return { ok: false, message: msg }
  }
}
