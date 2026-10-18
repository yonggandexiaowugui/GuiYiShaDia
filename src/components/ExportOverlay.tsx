import React from 'react'
import { useStore } from '../services/store'

/** 导出进度 / 结果浮层：显示渲染与编码进度，可取消；完成后可打开所在文件夹 */
const ExportOverlay: React.FC = () => {
  const status = useStore((s) => s.exportStatus)
  const done = useStore((s) => s.exportDone)
  const cancelExportRun = useStore((s) => s.cancelExportRun)
  const dismissExportDone = useStore((s) => s.dismissExportDone)

  if (!status?.running && !done) return null

  if (status?.running) {
    const pct = status.total > 0 ? Math.round((status.current / status.total) * 100) : 0
    return (
      <div className="export-overlay">
        <div className="export-card">
          <div className="export-title">正在导出视频</div>
          <div className="export-phase">
            {status.phase} · {status.current} / {status.total} 帧
          </div>
          <div className="export-bar">
            <div className="export-bar-fill" style={{ width: `${pct}%` }} />
          </div>
          <div className="export-hint">{pct}%（渲染时界面可能略有卡顿，请勿关闭窗口）</div>
          <button className="danger" onClick={() => void cancelExportRun()} style={{ width: '100%' }}>
            取消导出
          </button>
        </div>
      </div>
    )
  }

  // 完成 / 失败
  const ok = done?.ok
  return (
    <div className="export-overlay" onClick={dismissExportDone}>
      <div className="export-card" onClick={(e) => e.stopPropagation()}>
        <div className="export-title">{ok ? '✅ 导出完成' : done?.cancelled ? '已取消导出' : '❌ 导出失败'}</div>
        {done?.path && <div className="export-path" title={done.path}>{done.path}</div>}
        {!ok && done?.message && <div className="export-err">{done.message}</div>}
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          {ok && done?.path && (
            <button
              className="primary"
              style={{ flex: 1 }}
              onClick={() => window.api.showItemInFolder(done.path!)}
            >
              打开所在文件夹
            </button>
          )}
          <button style={{ flex: 1 }} onClick={dismissExportDone}>
            关闭
          </button>
        </div>
      </div>
    </div>
  )
}

export default ExportOverlay
