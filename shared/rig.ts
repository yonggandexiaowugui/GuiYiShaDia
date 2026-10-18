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

/** 按 id 查 rig 模板（当前仅内置 q14；P4 起支持角色自带扩展 rig） */
export function getRig(rigs: RigDef[], id: string): RigDef | undefined {
  return rigs.find((r) => r.id === id)
}

/** 按 id 查动作 clip（缺失时回退第一个，保证渲染路径永不为空） */
export function getAnimClip(clips: AnimClip[], id: string): AnimClip | undefined {
  return clips.find((c) => c.id === id) ?? clips[0]
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
  // -------------------------------------------------------------------------
  // P3：补齐短剧必备 9 clip（以下为新增 7 个；角度均控制在限幅区间内）
  // -------------------------------------------------------------------------
  {
    id: 'talk',
    name: '说话',
    duration: 0.8,
    loop: true,
    tracks: {
      // 配合配音循环：头轻点 + 颈随动 + 手臂微张
      head: [
        { time: 0, angle: 0 },
        { time: 0.2, angle: -5 },
        { time: 0.4, angle: 2 },
        { time: 0.6, angle: -3 },
        { time: 0.8, angle: 0 },
      ],
      neck: [
        { time: 0, angle: 0 },
        { time: 0.2, angle: 2 },
        { time: 0.4, angle: 0 },
        { time: 0.8, angle: 0 },
      ],
      spine: [
        { time: 0, angle: 0 },
        { time: 0.4, angle: 1.5 },
        { time: 0.8, angle: 0 },
      ],
      upperArmL: [
        { time: 0, angle: 0 },
        { time: 0.4, angle: 3 },
        { time: 0.8, angle: 0 },
      ],
      upperArmR: [
        { time: 0, angle: 0 },
        { time: 0.4, angle: -3 },
        { time: 0.8, angle: 0 },
      ],
    },
  },
  {
    id: 'step-forward',
    name: '上前一步',
    duration: 0.9,
    loop: false,
    tracks: {
      // 向 +x 迈一步：root 横移 + 双腿交替 + 手臂反摆（落点保持，不弹回）
      root: [
        { time: 0, dx: 0, dy: 0 },
        { time: 0.25, dx: 12, dy: -6 },
        { time: 0.5, dx: 24, dy: 0 },
        { time: 0.75, dx: 32, dy: -5 },
        { time: 0.9, dx: 36, dy: 0 },
      ],
      thighL: [
        { time: 0, angle: 0 },
        { time: 0.2, angle: 22 },
        { time: 0.45, angle: 0 },
        { time: 0.7, angle: -14 },
        { time: 0.9, angle: 0 },
      ],
      shinL: [
        { time: 0, angle: 0 },
        { time: 0.2, angle: 35 },
        { time: 0.45, angle: 5 },
        { time: 0.7, angle: 20 },
        { time: 0.9, angle: 0 },
      ],
      thighR: [
        { time: 0, angle: 0 },
        { time: 0.2, angle: -12 },
        { time: 0.45, angle: 20 },
        { time: 0.7, angle: 0 },
        { time: 0.9, angle: 0 },
      ],
      shinR: [
        { time: 0, angle: 0 },
        { time: 0.2, angle: 12 },
        { time: 0.45, angle: 30 },
        { time: 0.7, angle: 5 },
        { time: 0.9, angle: 0 },
      ],
      upperArmL: [
        { time: 0, angle: 0 },
        { time: 0.45, angle: -8 },
        { time: 0.9, angle: 0 },
      ],
      upperArmR: [
        { time: 0, angle: 0 },
        { time: 0.45, angle: 8 },
        { time: 0.9, angle: 0 },
      ],
      spine: [
        { time: 0, angle: 0 },
        { time: 0.45, angle: 3 },
        { time: 0.9, angle: 0 },
      ],
    },
  },
  {
    id: 'step-back',
    name: '受惊后退',
    duration: 0.6,
    loop: false,
    tracks: {
      // 快速后跳 + 双臂惊张 + 上身微仰（定格保持）
      root: [
        { time: 0, dx: 0, dy: 0 },
        { time: 0.15, dx: -14, dy: -8 },
        { time: 0.3, dx: -26, dy: 0 },
        { time: 0.6, dx: -26, dy: 0 },
      ],
      upperArmL: [
        { time: 0, angle: 0 },
        { time: 0.25, angle: 50 },
        { time: 0.6, angle: 38 },
      ],
      upperArmR: [
        { time: 0, angle: 0 },
        { time: 0.25, angle: -50 },
        { time: 0.6, angle: -40 },
      ],
      spine: [
        { time: 0, angle: 0 },
        { time: 0.25, angle: -8 },
        { time: 0.6, angle: -6 },
      ],
      head: [
        { time: 0, angle: 0 },
        { time: 0.25, angle: -8 },
        { time: 0.6, angle: -6 },
      ],
      thighL: [
        { time: 0, angle: 0 },
        { time: 0.25, angle: -12 },
        { time: 0.6, angle: 0 },
      ],
      thighR: [
        { time: 0, angle: 0 },
        { time: 0.25, angle: 12 },
        { time: 0.6, angle: 0 },
      ],
    },
  },
  {
    id: 'reach',
    name: '伸手挽留',
    duration: 1.1,
    loop: false,
    tracks: {
      // 双臂前伸（右臂直抬、左臂借屈肘到位，规避限幅）+ 身体前倾，保持后收回
      upperArmR: [
        { time: 0, angle: 0 },
        { time: 0.35, angle: -80 },
        { time: 0.85, angle: -80 },
        { time: 1.1, angle: 0 },
      ],
      forearmR: [
        { time: 0, angle: 0 },
        { time: 0.35, angle: 8 },
        { time: 0.85, angle: 8 },
        { time: 1.1, angle: 0 },
      ],
      upperArmL: [
        { time: 0, angle: 0 },
        { time: 0.35, angle: 52 },
        { time: 0.85, angle: 52 },
        { time: 1.1, angle: 0 },
      ],
      forearmL: [
        { time: 0, angle: 0 },
        { time: 0.35, angle: 38 },
        { time: 0.85, angle: 38 },
        { time: 1.1, angle: 0 },
      ],
      spine: [
        { time: 0, angle: 0 },
        { time: 0.35, angle: 4 },
        { time: 0.85, angle: 4 },
        { time: 1.1, angle: 0 },
      ],
      head: [
        { time: 0, angle: 0 },
        { time: 0.35, angle: 6 },
        { time: 0.85, angle: 6 },
        { time: 1.1, angle: 0 },
      ],
      hip: [
        { time: 0, dy: 0 },
        { time: 0.35, dy: 4 },
        { time: 0.85, dy: 4 },
        { time: 1.1, dy: 0 },
      ],
    },
  },
  {
    id: 'kneel',
    name: '跪地',
    duration: 1.3,
    loop: false,
    tracks: {
      // 双膝外分跪坐：胯大幅下沉 + 小腿折叠 + 上身微弓（跪姿保持到结束）
      hip: [
        { time: 0, dy: 0 },
        { time: 0.55, dy: 86 },
        { time: 0.7, dy: 82 },
        { time: 1.3, dy: 82 },
      ],
      thighL: [
        { time: 0, angle: 0 },
        { time: 0.55, angle: 20 },
        { time: 1.3, angle: 20 },
      ],
      thighR: [
        { time: 0, angle: 0 },
        { time: 0.55, angle: -20 },
        { time: 1.3, angle: -20 },
      ],
      shinL: [
        { time: 0, angle: 0 },
        { time: 0.55, angle: 95 },
        { time: 1.3, angle: 95 },
      ],
      shinR: [
        { time: 0, angle: 0 },
        { time: 0.55, angle: 95 },
        { time: 1.3, angle: 95 },
      ],
      spine: [
        { time: 0, angle: 0 },
        { time: 0.55, angle: 8 },
        { time: 1.3, angle: 8 },
      ],
      head: [
        { time: 0, angle: 0 },
        { time: 0.55, angle: 12 },
        { time: 1.3, angle: 12 },
      ],
      upperArmL: [
        { time: 0, angle: 0 },
        { time: 0.55, angle: 12 },
        { time: 1.3, angle: 12 },
      ],
      upperArmR: [
        { time: 0, angle: 0 },
        { time: 0.55, angle: -12 },
        { time: 1.3, angle: -12 },
      ],
    },
  },
  {
    id: 'collapse',
    name: '倒地',
    duration: 1.4,
    loop: false,
    tracks: {
      // 瘫软堆坐：root 整体下沉微倾 + 躯干弓到限幅 + 双腿折叠（瘫姿保持）
      root: [
        { time: 0, angle: 0, dy: 0 },
        { time: 0.5, angle: 4, dy: 30 },
        { time: 0.8, angle: 12, dy: 44 },
        { time: 1.4, angle: 10, dy: 44 },
      ],
      hip: [
        { time: 0, dy: 0 },
        { time: 0.5, dy: 36 },
        { time: 1.4, dy: 36 },
      ],
      thighL: [
        { time: 0, angle: 0 },
        { time: 0.5, angle: 35 },
        { time: 1.4, angle: 35 },
      ],
      thighR: [
        { time: 0, angle: 0 },
        { time: 0.5, angle: -30 },
        { time: 1.4, angle: -30 },
      ],
      shinL: [
        { time: 0, angle: 0 },
        { time: 0.5, angle: 80 },
        { time: 1.4, angle: 80 },
      ],
      shinR: [
        { time: 0, angle: 0 },
        { time: 0.5, angle: 75 },
        { time: 1.4, angle: 75 },
      ],
      spine: [
        { time: 0, angle: 0 },
        { time: 0.5, angle: 14 },
        { time: 1.4, angle: 14 },
      ],
      neck: [
        { time: 0, angle: 0 },
        { time: 0.6, angle: 22 },
        { time: 1.4, angle: 22 },
      ],
      head: [
        { time: 0, angle: 0 },
        { time: 0.6, angle: 16 },
        { time: 1.4, angle: 16 },
      ],
      upperArmL: [
        { time: 0, angle: 0 },
        { time: 0.5, angle: 18 },
        { time: 1.4, angle: 18 },
      ],
      upperArmR: [
        { time: 0, angle: 0 },
        { time: 0.5, angle: -18 },
        { time: 1.4, angle: -18 },
      ],
    },
  },
  {
    id: 'turn-away',
    name: '转身离开',
    duration: 1.3,
    loop: false,
    tracks: {
      // 向 -x 走开：root 横移 + 整体微倾 + 两步行走交替（人停在终点）
      root: [
        { time: 0, dx: 0, dy: 0, angle: 0 },
        { time: 0.4, dx: -20, dy: -5, angle: -8 },
        { time: 0.7, dx: -38, dy: 0, angle: -8 },
        { time: 1.0, dx: -54, dy: -5, angle: -8 },
        { time: 1.3, dx: -64, dy: 0, angle: -8 },
      ],
      thighL: [
        { time: 0, angle: 0 },
        { time: 0.25, angle: 24 },
        { time: 0.6, angle: -18 },
        { time: 0.95, angle: 20 },
        { time: 1.3, angle: -6 },
      ],
      shinL: [
        { time: 0, angle: 0 },
        { time: 0.25, angle: 32 },
        { time: 0.6, angle: 8 },
        { time: 0.95, angle: 30 },
        { time: 1.3, angle: 4 },
      ],
      thighR: [
        { time: 0, angle: 0 },
        { time: 0.25, angle: -16 },
        { time: 0.6, angle: 22 },
        { time: 0.95, angle: -14 },
        { time: 1.3, angle: 0 },
      ],
      shinR: [
        { time: 0, angle: 0 },
        { time: 0.25, angle: 10 },
        { time: 0.6, angle: 30 },
        { time: 0.95, angle: 8 },
        { time: 1.3, angle: 0 },
      ],
      upperArmL: [
        { time: 0, angle: 0 },
        { time: 0.3, angle: -10 },
        { time: 0.7, angle: 8 },
        { time: 1.3, angle: 0 },
      ],
      upperArmR: [
        { time: 0, angle: 0 },
        { time: 0.3, angle: 10 },
        { time: 0.7, angle: -8 },
        { time: 1.3, angle: 0 },
      ],
      head: [
        { time: 0, angle: 0 },
        { time: 0.4, angle: -6 },
        { time: 1.3, angle: -6 },
      ],
    },
  },
]
