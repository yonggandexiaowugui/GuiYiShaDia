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
  /** 绘制分层键（缺省回退 boneId）：同骨多部件（如双发层）靠它排序 */
  drawKey?: string
  /** 部件图：内置角色为文件名（src/assets/rig-character/ 下）；AI 角色为相对资源路径（assets/...） */
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

/** 素材 meta 中的绑骨标记（JSON 解析结果）；AI 生成角色会内联完整 rig */
export interface RiggedMeta {
  rigged: true
  characterRigId: string
  /** P4：AI 绑骨角色把 manifest 直接存进素材 meta（自包含，不走注册表） */
  rig?: CharacterRig
}

/** 校验内联 rig 的最小结构（parts/face/expressions 齐备才认） */
function isCharacterRig(v: unknown): v is CharacterRig {
  if (!v || typeof v !== 'object') return false
  const o = v as Partial<CharacterRig>
  return (
    typeof o.id === 'string' &&
    typeof o.rigId === 'string' &&
    Array.isArray(o.parts) &&
    o.parts.length > 0 &&
    !!o.face &&
    Array.isArray(o.expressions) &&
    o.expressions.length > 0
  )
}

/** 解析素材 meta；非绑骨素材返回 null（整图模式） */
export function parseRiggedMeta(meta: string | null): RiggedMeta | null {
  if (!meta) return null
  try {
    const obj = JSON.parse(meta) as { rigged?: unknown; characterRigId?: unknown; rig?: unknown }
    if (obj && obj.rigged === true && typeof obj.characterRigId === 'string') {
      return {
        rigged: true,
        characterRigId: obj.characterRigId,
        ...(isCharacterRig(obj.rig) ? { rig: obj.rig } : {}),
      }
    }
  } catch {
    // meta 非 JSON：视为整图素材
  }
  return null
}

/** 全部已注册绑骨角色（P4 起追加用户导入角色） */
export const CHARACTER_RIGS: CharacterRig[] = []

/** 按 id 查绑骨角色 */
export function getCharacterRig(id: string): CharacterRig | undefined {
  return CHARACTER_RIGS.find((c) => c.id === id)
}

/** 解析绑骨素材的 manifest：优先内联 rig（AI 角色），否则查注册表（内置角色） */
export function resolveCharacterRig(meta: RiggedMeta): CharacterRig | undefined {
  return meta.rig ?? getCharacterRig(meta.characterRigId)
}

/** 情绪 → 表情贴图文件（Clip.emotion 驱动；未映射的情绪回退平静） */
export function expressionForEmotion(charRig: CharacterRig, emotion: string | undefined): string {
  const map: Record<string, string> = { 开心: 'happy', 愤怒: 'angry', 惊讶: 'shocked', 害怕: 'shocked' }
  const id = (emotion && map[emotion]) || 'calm'
  return charRig.expressions.find((e) => e.id === id)?.image ?? charRig.expressions[0].image
}

// ---------------------------------------------------------------------------
// 内置绑骨角色「小菱」（v2 Q 版黑金军装风，参考用户提供的 chibi 立绘）：
// 约 2.7 头身、大面积黑长发（后发层压躯干下/刘海层叠脸上）、空白脸叠表情贴图
// 几何与 scripts/generate-rig-character.mjs 严格一致：
// 所有部件图四周含 3 单位出血边，pivot 比例已含出血
// id 保留 'xiaofang'：旧工程/已播种素材按 id 引用注册表，皮自动换新
// ---------------------------------------------------------------------------
export const BUILTIN_RIGGED_CHARACTER: CharacterRig = {
  id: 'xiaofang',
  name: '小菱（绑骨）',
  rigId: 'q14',
  parts: [
    // 后发层：大马尾垂到臀下，压在全身最底层（随 head 骨转）；画布加宽让马尾露出躯干侧缘
    { boneId: 'head', drawKey: 'back-hair', image: 'back-hair.png', width: 150, height: 246, pivotX: 0.5, pivotY: 0.2561 },
    // 躯干链
    { boneId: 'hip', drawKey: 'hip', image: 'hip.png', width: 102, height: 66, pivotX: 0.5, pivotY: 0.2879 },
    { boneId: 'spine', drawKey: 'spine', image: 'torso.png', width: 110, height: 106, pivotX: 0.5, pivotY: 0.6887 },
    { boneId: 'neck', drawKey: 'neck', image: 'neck.png', width: 30, height: 36, pivotX: 0.5, pivotY: 0.5 },
    { boneId: 'head', drawKey: 'head', image: 'head.png', width: 124, height: 128, pivotX: 0.5, pivotY: 0.5859 },
    // 左臂（圆头胶囊，关节帽圆心 = pivot）
    { boneId: 'upperArmL', drawKey: 'upperArmL', image: 'upper-arm.png', width: 44, height: 86, pivotX: 0.5, pivotY: 0.1163 },
    { boneId: 'forearmL', drawKey: 'forearmL', image: 'forearm.png', width: 40, height: 78, pivotX: 0.5, pivotY: 0.1282 },
    { boneId: 'handL', drawKey: 'handL', image: 'hand.png', width: 32, height: 42, pivotX: 0.5, pivotY: 0.1905 },
    // 右臂（镜像共用同图）
    { boneId: 'upperArmR', drawKey: 'upperArmR', image: 'upper-arm.png', width: 44, height: 86, pivotX: 0.5, pivotY: 0.1163 },
    { boneId: 'forearmR', drawKey: 'forearmR', image: 'forearm.png', width: 40, height: 78, pivotX: 0.5, pivotY: 0.1282 },
    { boneId: 'handR', drawKey: 'handR', image: 'hand.png', width: 32, height: 42, pivotX: 0.5, pivotY: 0.1905 },
    // 左腿
    { boneId: 'thighL', drawKey: 'thighL', image: 'thigh.png', width: 44, height: 106, pivotX: 0.5, pivotY: 0.0943 },
    { boneId: 'shinL', drawKey: 'shinL', image: 'shin.png', width: 42, height: 114, pivotX: 0.5, pivotY: 0.1053 },
    // 右腿
    { boneId: 'thighR', drawKey: 'thighR', image: 'thigh.png', width: 44, height: 106, pivotX: 0.5, pivotY: 0.0943 },
    { boneId: 'shinR', drawKey: 'shinR', image: 'shin.png', width: 42, height: 114, pivotX: 0.5, pivotY: 0.1053 },
    // 前发层：刘海 + 金色流苏发饰，叠在脸上层最顶（不挡表情区）
    { boneId: 'head', drawKey: 'front-hair', image: 'front-hair.png', width: 128, height: 74, pivotX: 0.5, pivotY: 0.9324 },
  ],
  // 表情锚点：70×52 区域，中心在 head pivot 正下 6 单位（大致面部中上部）
  face: { width: 70, height: 52, offsetX: 0, offsetY: 6 },
  expressions: [
    { id: 'calm', name: '平静', image: 'expr-calm.png' },
    { id: 'happy', name: '开心', image: 'expr-happy.png' },
    { id: 'angry', name: '愤怒', image: 'expr-angry.png' },
    { id: 'shocked', name: '惊讶', image: 'expr-shocked.png' },
  ],
}

CHARACTER_RIGS.push(BUILTIN_RIGGED_CHARACTER)

// ---------------------------------------------------------------------------
// 部件槽位表（P4 AI 生成 / P5 组装共用单一事实源，避免三副本漂移）
// ---------------------------------------------------------------------------
/** 9 身体部件 + 2 发件的生成顺序（头部先出） */
export const RIG_PART_ORDER = [
  'head.png',
  'back-hair.png',
  'front-hair.png',
  'torso.png',
  'hip.png',
  'neck.png',
  'upper-arm.png',
  'forearm.png',
  'hand.png',
  'thigh.png',
  'shin.png',
]

/** 部件文件 → 中文槽位名 */
export const RIG_PART_LABELS: Record<string, string> = {
  'head.png': '头部',
  'back-hair.png': '后发（马尾）',
  'front-hair.png': '刘海/发饰',
  'torso.png': '躯干（上装）',
  'hip.png': '胯部（下装）',
  'neck.png': '脖子',
  'upper-arm.png': '大臂（左右共用）',
  'forearm.png': '小臂（左右共用）',
  'hand.png': '手（左右共用）',
  'thigh.png': '大腿（左右共用）',
  'shin.png': '小腿/鞋（左右共用）',
}
