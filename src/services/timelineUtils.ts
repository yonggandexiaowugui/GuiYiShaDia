// ============================================================================
// 时间轴工具函数：基于轨道/片段模型
// ============================================================================

import type { Track } from '@shared/types'

/** 工程总时长（秒） */
export function totalDuration(tracks: Track[]): number {
  let max = 0
  for (const tr of tracks) {
    for (const c of tr.clips) {
      max = Math.max(max, c.start + c.duration)
    }
  }
  return max
}
