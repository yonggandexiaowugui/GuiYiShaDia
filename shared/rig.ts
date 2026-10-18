// ============================================================================
// 骨骼系统（P1）：全局共用 rig 模板 + 动作 clip 数据
// 设计原则：
// - 骨架与动作全局共用，角色只提供"皮"（P2+ 绑骨模式复用此处的数据与求值器）
// - 只允许绕 pivot 旋转 + 单轴位移，不做骨骼缩放变形
// - 每骨角度限幅，超出在 UI 标红
// 坐标系：角色空间原点 = root 脚底中心 (0,0)，x 向右，y 向下（身体部位 y 为负）
// 尺寸基准：四头身 Q 版，总高 400 单位（头高 100）
// ============================================================================

/** 骨骼定义（rest 姿态常量） */
export interface BoneDef {
  id: string
  parentId: string | null
  /** 中文显示名 */
  name: string
  /** pivot：角色空间坐标（关节旋转中心） */
  pivot: [number, number]
  /** rest 局部角（度） */
  defaultAngle: number
  /** 限幅：相对 defaultAngle 的偏移区间（度） */
  minAngle: number
  maxAngle: number
  /** P1 占位部件尺寸 [宽, 高] */
  partSize: [number, number]
  /** P1 占位部件中心相对 pivot 的偏移 */
  partOffset: [number, number]
  /** P1 占位色 */
  color: string
}

/** 骨架模板（所有角色共用同一份） */
export interface RigDef {
  id: string
  name: string
  /** 角色总高（角色空间单位） */
  height: number
  /** 必须 parent-first 排序（求值器按数组顺序递归） */
  bones: BoneDef[]
}

/** 动作关键帧：angle 为该骨的局部角绝对值（度）；dx/dy 为父空间位移（仅 root/hip 使用） */
export interface BoneKey {
  time: number
  angle?: number
  dx?: number
  dy?: number
}

/** 动作 clip：纯骨骼关键帧数据，不含任何皮肤像素，全角色复用 */
export interface AnimClip {
  id: string
  name: string
  duration: number
  loop: boolean
  tracks: Partial<Record<string, BoneKey[]>>
}

// ---------------------------------------------------------------------------
// 内置 rig：14 骨 Q 版模板
// ---------------------------------------------------------------------------
export const BUILTIN_RIG: RigDef = {
  id: 'q14',
  name: 'Q版14骨',
  height: 400,
  bones: [
    // root：整体位移 / 整体旋转（倒地等动作用），脚下小踏板
    { id: 'root', parentId: null, name: '根', pivot: [0, 0], defaultAngle: 0, minAngle: -30, maxAngle: 30, partSize: [44, 10], partOffset: [0, -2], color: '#8a8f98' },
    // 躯干链
    { id: 'hip', parentId: 'root', name: '胯', pivot: [0, -186], defaultAngle: 0, minAngle: -10, maxAngle: 10, partSize: [72, 44], partOffset: [0, 0], color: '#c9a06a' },
    { id: 'spine', parentId: 'hip', name: '腰', pivot: [0, -232], defaultAngle: 0, minAngle: -15, maxAngle: 15, partSize: [80, 96], partOffset: [0, -26], color: '#7ec850' },
    { id: 'neck', parentId: 'spine', name: '颈', pivot: [0, -300], defaultAngle: 0, minAngle: -25, maxAngle: 25, partSize: [26, 22], partOffset: [0, 0], color: '#7ec850' },
    { id: 'head', parentId: 'neck', name: '头', pivot: [0, -346], defaultAngle: 0, minAngle: -20, maxAngle: 20, partSize: [90, 98], partOffset: [0, -10], color: '#e6c8a0' },
    // 左臂（前摆 ±60°；前抬指人允许到 -95°）
    { id: 'upperArmL', parentId: 'spine', name: '左大臂', pivot: [-56, -288], defaultAngle: 0, minAngle: -95, maxAngle: 60, partSize: [26, 72], partOffset: [0, 32], color: '#5ac8dc' },
    { id: 'forearmL', parentId: 'upperArmL', name: '左小臂', pivot: [-56, -220], defaultAngle: 0, minAngle: 0, maxAngle: 120, partSize: [22, 64], partOffset: [0, 28], color: '#5ac8dc' },
    { id: 'handL', parentId: 'forearmL', name: '左手', pivot: [-56, -160], defaultAngle: 0, minAngle: -30, maxAngle: 30, partSize: [22, 26], partOffset: [0, 10], color: '#5ac8dc' },
    // 右臂
    { id: 'upperArmR', parentId: 'spine', name: '右大臂', pivot: [56, -288], defaultAngle: 0, minAngle: -95, maxAngle: 60, partSize: [26, 72], partOffset: [0, 32], color: '#4a9eff' },
    { id: 'forearmR', parentId: 'upperArmR', name: '右小臂', pivot: [56, -220], defaultAngle: 0, minAngle: 0, maxAngle: 120, partSize: [22, 64], partOffset: [0, 28], color: '#4a9eff' },
    { id: 'handR', parentId: 'forearmR', name: '右手', pivot: [56, -160], defaultAngle: 0, minAngle: -30, maxAngle: 30, partSize: [22, 26], partOffset: [0, 10], color: '#4a9eff' },
    // 左腿（膝只能单向弯曲 0~100°）
    { id: 'thighL', parentId: 'hip', name: '左大腿', pivot: [-24, -186], defaultAngle: 0, minAngle: -45, maxAngle: 45, partSize: [28, 94], partOffset: [0, 42], color: '#b291ff' },
    { id: 'shinL', parentId: 'thighL', name: '左小腿', pivot: [-24, -96], defaultAngle: 0, minAngle: 0, maxAngle: 100, partSize: [24, 88], partOffset: [0, 40], color: '#b291ff' },
    // 右腿
    { id: 'thighR', parentId: 'hip', name: '右大腿', pivot: [24, -186], defaultAngle: 0, minAngle: -45, maxAngle: 45, partSize: [28, 94], partOffset: [0, 42], color: '#ff7ab8' },
    { id: 'shinR', parentId: 'thighR', name: '右小腿', pivot: [24, -96], defaultAngle: 0, minAngle: 0, maxAngle: 100, partSize: [24, 88], partOffset: [0, 40], color: '#ff7ab8' },
  ],
}

// ---------------------------------------------------------------------------
// 内置 clip：P1 验证用（idle / point）
// ---------------------------------------------------------------------------
export const BUILTIN_CLIPS: AnimClip[] = [
  {
    id: 'idle',
    name: '待机',
    duration: 3.2,
    loop: true,
    tracks: {
      // 呼吸：胯微起伏 + 腰轻摆 + 头微动
      hip: [
        { time: 0, dy: 0 },
        { time: 1.6, dy: -4 },
        { time: 3.2, dy: 0 },
      ],
      spine: [
        { time: 0, angle: 0 },
        { time: 1.6, angle: 2 },
        { time: 3.2, angle: 0 },
      ],
      neck: [
        { time: 0, angle: 0 },
        { time: 1.6, angle: 1.5 },
        { time: 3.2, angle: 0 },
      ],
      head: [
        { time: 0, angle: 0 },
        { time: 0.8, angle: -2.5 },
        { time: 1.6, angle: 0 },
        { time: 2.4, angle: 2.5 },
        { time: 3.2, angle: 0 },
      ],
      upperArmL: [
        { time: 0, angle: 0 },
        { time: 1.6, angle: 2 },
        { time: 3.2, angle: 0 },
      ],
      upperArmR: [
        { time: 0, angle: 0 },
        { time: 1.6, angle: -2 },
        { time: 3.2, angle: 0 },
      ],
    },
  },
  {
    id: 'point',
    name: '指人',
    duration: 0.9,
    loop: false,
    tracks: {
      // 预备（下沉后坐）→ 主体（右臂抬起指向）→ 缓冲（定住）→ 收回
      upperArmR: [
        { time: 0, angle: 0 },
        { time: 0.15, angle: 10 },
        { time: 0.45, angle: -82 },
        { time: 0.65, angle: -86 },
        { time: 0.9, angle: 0 },
      ],
      forearmR: [
        { time: 0, angle: 0 },
        { time: 0.15, angle: 18 },
        { time: 0.45, angle: 4 },
        { time: 0.65, angle: 6 },
        { time: 0.9, angle: 0 },
      ],
      spine: [
        { time: 0, angle: 0 },
        { time: 0.45, angle: -5 },
        { time: 0.65, angle: -5 },
        { time: 0.9, angle: 0 },
      ],
      head: [
        { time: 0, angle: 0 },
        { time: 0.45, angle: 4 },
        { time: 0.9, angle: 0 },
      ],
      hip: [
        { time: 0, dy: 0 },
        { time: 0.45, dy: 2 },
        { time: 0.9, dy: 0 },
      ],
    },
  },
]
