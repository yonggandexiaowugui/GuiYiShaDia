// ============================================================================
// 绑骨角色画布绘制（P5 提取）：RigLabDialog 与 RigCharBuilderDialog 共用
// 输入通用 CharacterRig + 世界姿态 + 已加载部件图，绘制投影/部件/表情叠加
// 背景、骨架标注等调试层由调用方自理（两处画布尺寸与风格不同）
// ============================================================================
import type { CharacterRig } from '@shared/characterRig'
import type { WorldBone } from './rigEvaluator'
import { RIG_DRAW_ORDER } from './rigParts'

/** 视图参数：角色空间 → 画布的缩放与原点（脚底中心） */
export interface RigView {
  scale: number
  originX: number
  originY: number
}

/**
 * 绘制绑骨角色：脚下投影 → 部件（按骨变换）→ 表情贴图（head 局部空间）
 * images 以部件/表情的 image 标识（bundled 文件名或资源路径）为键
 */
export function drawRiggedCharacterPreview(
  ctx: CanvasRenderingContext2D,
  charRig: CharacterRig,
  world: Map<string, WorldBone>,
  images: Map<string, HTMLImageElement>,
  exprImage: HTMLImageElement | undefined,
  view: RigView,
): void {
  const { scale, originX, originY } = view

  // 脚下投影（静置，不随骨变换）
  ctx.fillStyle = 'rgba(0, 0, 0, 0.35)'
  ctx.beginPath()
  ctx.ellipse(originX, originY - 2, 66 * scale, 10 * scale, 0, 0, Math.PI * 2)
  ctx.fill()

  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'

  for (const boneId of RIG_DRAW_ORDER) {
    const part = charRig.parts.find((p) => p.boneId === boneId)
    if (!part) continue
    const w = world.get(boneId)
    const img = images.get(part.image)
    if (!w || !img) continue
    ctx.save()
    ctx.translate(originX + w.x * scale, originY + w.y * scale)
    ctx.rotate((w.angle * Math.PI) / 180)
    ctx.drawImage(
      img,
      -part.pivotX * part.width * scale,
      -part.pivotY * part.height * scale,
      part.width * scale,
      part.height * scale,
    )
    ctx.restore()
  }

  // 表情贴图：叠在 head 层上方，跟随 head 骨世界变换（脸不挂骨，永不拉伸变形）
  const hw = world.get('head')
  if (hw && exprImage) {
    const f = charRig.face
    ctx.save()
    ctx.translate(originX + hw.x * scale, originY + hw.y * scale)
    ctx.rotate((hw.angle * Math.PI) / 180)
    ctx.drawImage(
      exprImage,
      (f.offsetX - f.width / 2) * scale,
      (f.offsetY - f.height / 2) * scale,
      f.width * scale,
      f.height * scale,
    )
    ctx.restore()
  }
}
