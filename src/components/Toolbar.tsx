import React from 'react'
import { useStore, totalDuration, DEMO_PRESETS } from '../services/store'
import ScriptParseDialog from './ScriptParseDialog'
import SettingsDialog from './SettingsDialog'

const Toolbar: React.FC = () => {
  const importFiles = useStore((s) => s.importFiles)
  const importing = useStore((s) => s.importing)
  const orientation = useStore((s) => s.orientation)
  const setOrientation = useStore((s) => s.setOrientation)
  const tracks = useStore((s) => s.tracks)
  const generateVoiceovers = useStore((s) => s.generateVoiceovers)
  const loadDemo = useStore((s) => s.loadDemo)
  const runExport = useStore((s) => s.runExport)
  const exporting = useStore((s) => s.exportStatus?.running ?? false)
  const saveProject = useStore((s) => s.saveProject)
  const openProject = useStore((s) => s.openProject)
  const [showScriptDialog, setShowScriptDialog] = React.useState(false)
  const [showSettings, setShowSettings] = React.useState(false)
  const [demoMenu, setDemoMenu] = React.useState(false)
  const [generatingVoice, setGeneratingVoice] = React.useState(false)

  // 点击其它地方关闭示例菜单
  React.useEffect(() => {
    if (!demoMenu) return
    const close = (): void => setDemoMenu(false)
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [demoMenu])

  const voiceTrack = tracks.find((t) => t.type === 'voice')
  const voiceClipCount = voiceTrack?.clips.filter((c) => c.text && !c.voiceFile).length ?? 0
  const totalClips = tracks.reduce((sum, t) => sum + t.clips.length, 0)
  const total = totalDuration(tracks)

  return (
    <>
      <div className="toolbar">
        <div className="title">诡异沙雕动画制作器</div>
        <button onClick={() => void importFiles()} disabled={importing}>
          {importing ? '导入中…' : '导入素材'}
        </button>
        <button onClick={() => void openProject()} title="打开工程 (.guiyi)">打开</button>
        <button onClick={() => void saveProject()} title="保存工程 (Ctrl+S)">保存</button>
        <button onClick={() => setShowScriptDialog(true)}>AI 剧本</button>
        <div className="demo-wrap">
          <button onClick={() => setDemoMenu((v) => !v)} title="一键载入一个完整示例短片">
            载入示例 ▾
          </button>
          {demoMenu && (
            <div className="tl-add-menu" style={{ top: 30, left: 0 }}>
              {DEMO_PRESETS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => {
                    loadDemo(p.id)
                    setDemoMenu(false)
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>
          )}
        </div>
        <button
          onClick={() => {
            setGeneratingVoice(true)
            void generateVoiceovers().finally(() => setGeneratingVoice(false))
          }}
          disabled={voiceClipCount === 0 || generatingVoice}
          title={voiceClipCount === 0 ? '配音轨道没有待生成的片段' : `为 ${voiceClipCount} 个片段生成配音`}
        >
          {generatingVoice ? '生成中…' : `生成配音 (${voiceClipCount})`}
        </button>
        <button
          onClick={() => setOrientation(orientation === 'portrait' ? 'landscape' : 'portrait')}
          title="切换预览方向"
        >
          {orientation === 'portrait' ? '📱 竖屏' : '🖥 横屏'}
        </button>
        <button onClick={() => setShowSettings(true)}>设置</button>
        <div className="spacer" />
        <span style={{ color: '#888', fontSize: 12 }}>
          {totalClips} 片段 · {total.toFixed(1)}s
        </span>
        <button className="primary" onClick={() => void runExport()} disabled={exporting}>
          {exporting ? '导出中…' : '导出视频'}
        </button>
      </div>
      {showScriptDialog && <ScriptParseDialog onClose={() => setShowScriptDialog(false)} />}
      {showSettings && <SettingsDialog onClose={() => setShowSettings(false)} />}
    </>
  )
}

export default Toolbar
