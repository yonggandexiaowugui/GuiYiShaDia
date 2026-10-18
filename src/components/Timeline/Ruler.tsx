import React from 'react'

interface Props {
  total: number
  px: number
  /** 左侧轨道标签列宽度（刻度需要整体右移，避免被标签遮住） */
  offset?: number
}

/** 秒级刻度尺，缩放越小标注间隔越大 */
const Ruler: React.FC<Props> = ({ total, px, offset = 0 }) => {
  const secs = Math.ceil(total) + 1
  const labelStep = px >= 60 ? 1 : px >= 30 ? 2 : px >= 20 ? 5 : 10
  const ticks: number[] = []
  for (let i = 0; i < secs; i++) ticks.push(i)
  return (
    <div className="tl-ruler">
      {ticks.map((s) => {
        const labeled = s % labelStep === 0
        return (
          <div
            key={s}
            className={`tl-tick${labeled ? ' labeled' : ''}`}
            style={{ left: offset + s * px }}
          >
            {labeled && <span className="tl-tick-label">{s}s</span>}
          </div>
        )
      })}
    </div>
  )
}

export default Ruler
