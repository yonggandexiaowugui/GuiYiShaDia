import React from 'react'
import { useStore } from '../../services/store'

interface Props {
  /** 左侧轨道标签列宽度 */
  labelWidth: number
  /** 按住播放头开始拖动（由 Timeline 提供，用于进入 scrub 状态） */
  onScrubStart: (e: React.PointerEvent) => void
}

/**
 * 独立播放头组件：只订阅 currentTime / pxPerSec。
 * 关键点——播放时 currentTime 每帧变化，如果放在 Timeline 里会导致
 * 整条时间轴（所有轨道与片段）跟着每帧重渲染；拆出来后 Timeline 不再订阅时间。
 */
const Playhead: React.FC<Props> = ({ labelWidth, onScrubStart }) => {
  const currentTime = useStore((s) => s.currentTime)
  const px = useStore((s) => s.pxPerSec)

  return (
    <div
      className="tl-playhead"
      style={{ left: labelWidth + currentTime * px }}
      onPointerDown={onScrubStart}
    >
      <span className="tl-playhead-grip" />
    </div>
  )
}

export default Playhead
