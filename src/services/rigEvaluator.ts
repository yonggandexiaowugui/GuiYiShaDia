// ============================================================================
// 骨骼求值器（纯函数，零依赖）：clip 采样 → 限幅 → 骨树世界变换
// P1 由骨骼实验室使用；P2+ 绑骨渲染路径（drawScene）直接复用
// ============================================================================
import type { AnimClip, BoneKey, RigDef } from '@shared/rig'

/** 单骨采样结果：局部角（已限幅）+ 父空间位移 + 是否被限幅截断 */
export interface SampledBone {
  angle: number
  dx: number
  dy: number
  clamped: boolean
}

/** 单骨世界变换：pivot 世界坐标 + 世界角（度） */
export interface WorldBone {
  x: number
  y: number
  angle: number
}

/** 最短路径角度插值（350°→10° 走 +20°，不反向甩一圈） */
export function lerpAngle(a: number, b: number, t: number): number {
  let d = (b - a) % 360
  if (d > 180) d -= 360
  if (d < -180) d += 360
  return a + d * t
}

function lerpNum(a: number | undefined, b: number | undefined, t: number): number | undefined {
  if (a === undefined && b === undefined) return undefined
  const va = a ?? 0
  const vb = b ?? 0
  return va + (vb - va) * t
}

/** 在关键帧序列上取 t 时刻的值（相邻帧线性插值；首尾之外取端点） */
function sampleKeys(keys: BoneKey[], t: number): { angle?: number; dx?: number; dy?: number } {
  const first = keys[0]
  const last = keys[keys.length - 1]
  if (t <= first.time) return first
  if (t >= last.time) return last
  for (let i = 0; i < keys.length - 1; i++) {
    const k0 = keys[i]
    const k1 = keys[i + 1]
    if (t >= k0.time && t <= k1.time) {
      const span = k1.time - k0.time
      const p = span > 0 ? (t - k0.time) / span : 0
      return {
        angle:
          k0.angle !== undefined && k1.angle !== undefined
            ? lerpAngle(k0.angle, k1.angle, p)
            : (k1.angle ?? k0.angle),
        dx: lerpNum(k0.dx, k1.dx, p),
        dy: lerpNum(k0.dy, k1.dy, p),
      }
    }
  }
  return last
}

/** 采样 clip 在 time 时刻的全部骨局部姿态（loop clip 取模；无轨道骨用 rest 角；限幅截断） */
export function samplePose(rig: RigDef, clip: AnimClip, time: number): Map<string, SampledBone> {
  const t = clip.loop
    ? ((time % clip.duration) + clip.duration) % clip.duration
    : Math.min(Math.max(time, 0), clip.duration)
  const out = new Map<string, SampledBone>()
  for (const bone of rig.bones) {
    const keys = clip.tracks[bone.id]
    let angle = bone.defaultAngle
    let dx = 0
    let dy = 0
    if (keys && keys.length > 0) {
      const k = sampleKeys(keys, t)
      if (k.angle !== undefined) angle = k.angle
      dx = k.dx ?? 0
      dy = k.dy ?? 0
    }
    const lo = bone.defaultAngle + bone.minAngle
    const hi = bone.defaultAngle + bone.maxAngle
    const clamped = angle < lo || angle > hi
    if (clamped) angle = Math.min(hi, Math.max(lo, angle))
    out.set(bone.id, { angle, dx, dy, clamped })
  }
  return out
}

/**
 * 沿骨树累计世界变换（rig.bones 必须 parent-first 排序）
 * 递推：worldPivot(b) = worldPivot(parent) + R(parentWorldAngle) · (lp + d)
 * 其中 lp = pivot(b) - pivot(parent)（rest 常量），d 为采样位移
 */
export function buildWorldPose(
  rig: RigDef,
  sampled: Map<string, SampledBone>,
): Map<string, WorldBone> {
  const byId = new Map(rig.bones.map((b) => [b.id, b]))
  const world = new Map<string, WorldBone>()
  for (const bone of rig.bones) {
    const s = sampled.get(bone.id) ?? { angle: bone.defaultAngle, dx: 0, dy: 0, clamped: false }
    if (!bone.parentId) {
      world.set(bone.id, { x: s.dx, y: s.dy, angle: s.angle })
      continue
    }
    const parent = byId.get(bone.parentId)
    const pw = parent ? world.get(parent.id) : undefined
    if (!parent || !pw) {
      // 父骨缺失（数据错误）：退化为角色空间原点
      world.set(bone.id, { x: bone.pivot[0] + s.dx, y: bone.pivot[1] + s.dy, angle: s.angle })
      continue
    }
    const lpx = bone.pivot[0] - parent.pivot[0] + s.dx
    const lpy = bone.pivot[1] - parent.pivot[1] + s.dy
    const rad = (pw.angle * Math.PI) / 180
    const cos = Math.cos(rad)
    const sin = Math.sin(rad)
    world.set(bone.id, {
      x: pw.x + lpx * cos - lpy * sin,
      y: pw.y + lpx * sin + lpy * cos,
      angle: pw.angle + s.angle,
    })
  }
  return world
}
