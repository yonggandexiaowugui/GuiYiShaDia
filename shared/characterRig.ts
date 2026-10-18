// ============================================================================
// 绑骨角色（P2）：部件 → 骨映射 manifest
// 原则：骨架与动作全局共用（shared/rig.ts），角色只提供"皮"
// - 每个部件声明：绑定的骨、图内 pivot 位置、角色空间尺寸
// - 脸部不挂骨：表情贴图独立叠加在 head 骨局部空间（face 锚点）
// - 部件图由 scripts/generate-rig-character.mjs 程序生成，接缝靠圆头关节帽重叠
// ============================================================================

/** 单个部件 → 骨映射 */
export interface RiggedPart {
  boneId: string
  /** 部件图文件名（src/assets/rig-character/ 下） */
  image: string
  /** 角色空间尺寸（含出血边，单位同 rig.height=400 体系） */
  width: number
  height: number
  /** 图内 pivot（0~1，相对图左上）：绘制时该点对齐骨 pivot */
  pivotX: number
  pivotY: number
}

/** 表情锚点：表情贴图在 head 骨局部空间的位置与尺寸 */
export interface FaceAnchor {
  width: number
  height: number
  /** 相对 head 骨 pivot 的局部偏移 */
  offsetX: number
  offsetY: number
}

/** 表情贴图（透明背景五官，叠在头部上方，随 head 骨变换） */
export interface ExpressionDef {
  id: string
  name: string
  image: string
}

/** 绑骨角色 manifest：一套部件映射 + 表情锚点，引用全局 rig */
export interface CharacterRig {
  id: string
  name: string
  rigId: string
  parts: RiggedPart[]
  face: FaceAnchor
  expressions: ExpressionDef[]
}

// ---------------------------------------------------------------------------
// 内置绑骨角色「小方」：大方脸的绑骨兄弟（同风格配色）
// 几何与 scripts/generate-rig-character.mjs 严格一致：
// 所有部件图四周含 3 单位出血边，pivot 比例已含出血
// ---------------------------------------------------------------------------
export const BUILTIN_RIGGED_CHARACTER: CharacterRig = {
  id: 'xiaofang',
  name: '小方（绑骨）',
  rigId: 'q14',
  parts: [
    // 躯干链
    { boneId: 'hip', image: 'hip.png', width: 82, height: 62, pivotX: 0.5, pivotY: 0.5 },
    { boneId: 'spine', image: 'torso.png', width: 94, height: 134, pivotX: 0.5, pivotY: 0.5597 },
    { boneId: 'neck', image: 'neck.png', width: 30, height: 36, pivotX: 0.5, pivotY: 0.5 },
    { boneId: 'head', image: 'head.png', width: 102, height: 110, pivotX: 0.5, pivotY: 0.5182 },
    // 左臂（圆头胶囊，关节帽圆心 = pivot）
    { boneId: 'upperArmL', image: 'upper-arm.png', width: 32, height: 100, pivotX: 0.5, pivotY: 0.16 },
    { boneId: 'forearmL', image: 'forearm.png', width: 28, height: 88, pivotX: 0.5, pivotY: 0.1591 },
    { boneId: 'handL', image: 'hand.png', width: 30, height: 44, pivotX: 0.5, pivotY: 0.3409 },
    // 右臂（镜像共用同图）
    { boneId: 'upperArmR', image: 'upper-arm.png', width: 32, height: 100, pivotX: 0.5, pivotY: 0.16 },
    { boneId: 'forearmR', image: 'forearm.png', width: 28, height: 88, pivotX: 0.5, pivotY: 0.1591 },
    { boneId: 'handR', image: 'hand.png', width: 30, height: 44, pivotX: 0.5, pivotY: 0.3409 },
    // 左腿
    { boneId: 'thighL', image: 'thigh.png', width: 36, height: 126, pivotX: 0.5, pivotY: 0.1429 },
    { boneId: 'shinL', image: 'shin.png', width: 30, height: 118, pivotX: 0.5, pivotY: 0.1271 },
    // 右腿
    { boneId: 'thighR', image: 'thigh.png', width: 36, height: 126, pivotX: 0.5, pivotY: 0.1429 },
    { boneId: 'shinR', image: 'shin.png', width: 30, height: 118, pivotX: 0.5, pivotY: 0.1271 },
  ],
  // 表情锚点：62×46 区域，中心在 head pivot 正下 4 单位（大致面部中上部）
  face: { width: 62, height: 46, offsetX: 0, offsetY: 4 },
  expressions: [
    { id: 'calm', name: '平静', image: 'expr-calm.png' },
    { id: 'happy', name: '开心', image: 'expr-happy.png' },
    { id: 'angry', name: '愤怒', image: 'expr-angry.png' },
    { id: 'shocked', name: '惊讶', image: 'expr-shocked.png' },
  ],
}
