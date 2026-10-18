import React, { useEffect } from 'react'
import Toolbar from './components/Toolbar'
import MaterialLibrary from './components/MaterialLibrary'
import PreviewArea from './components/PreviewArea'
import PropertyPanel from './components/PropertyPanel'
import Timeline from './components/Timeline'
import PsdLayerDialog from './components/PsdLayerDialog'
import Toasts from './components/Toasts'
import ExportOverlay from './components/ExportOverlay'
import { useStore } from './services/store'
import { useResizable } from './hooks/useResizable'
import type { ProjectFile } from '@shared/types'

/** 全局快捷键：删除片段 / 撤销 / 重做 / 播放暂停 / 复制片段 */
function useGlobalShortcuts(): void {
  useEffect(() => {
    const isTyping = (el: EventTarget | null): boolean => {
      const node = el as HTMLElement | null
      if (!node) return false
      const tag = node.tagName?.toLowerCase()
      return tag === 'input' || tag === 'textarea' || tag === 'select' || node.isContentEditable
    }

    const onKey = (e: KeyboardEvent): void => {
      const st = useStore.getState()
      const mod = e.ctrlKey || e.metaKey

      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) st.redo()
        else st.undo()
        return
      }
      if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        st.redo()
        return
      }
      if (isTyping(e.target)) return

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (st.selectedIds.length > 0 || st.selectedClip) {
          e.preventDefault()
          st.deleteSelectedClips()
        }
        return
      }
      if (e.code === 'Space') {
        e.preventDefault()
        st.togglePlay()
        return
      }
      if (mod && e.key.toLowerCase() === 'd') {
        if (st.selectedClip) {
          e.preventDefault()
          st.duplicateClip(st.selectedClip.trackId, st.selectedClip.clipId)
        }
      }
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}

/** 菜单动作（文件菜单 / 快捷键触发）→ store 动作 */
function useMenuActions(): void {
  useEffect(() => {
    const off = window.api.onMenuAction((action) => {
      const st = useStore.getState()
      if (action === 'new') {
        if (window.confirm('新建工程会清空当前时间轴，确定继续？')) st.newProject()
      } else if (action === 'save') {
        void st.saveProject()
      } else if (action === 'open') {
        void st.openProject()
      } else if (action === 'export') {
        void st.runExport()
      }
    })
    return off
  }, [])
}

/** 自动保存：轨道内容变化后防抖 4 秒写盘；并在启动时检查是否有可恢复的自动保存 */
function useAutosave(): {
  recovery: { data: ProjectFile; savedAt: number } | null
  applyRecovery: () => void
  discardRecovery: () => void
} {
  const [recovery, setRecovery] = React.useState<{ data: ProjectFile; savedAt: number } | null>(null)

  // 启动检查：只在自动保存里确实有片段时才提示，避免空白工程也弹恢复
  useEffect(() => {
    void (async () => {
      try {
        const res = await window.api.readAutosave()
        if (!res.ok || !res.data || !res.savedAt) return
        const clips = res.data.tracks.reduce((n, t) => n + t.clips.length, 0)
        if (clips > 0) setRecovery({ data: res.data, savedAt: res.savedAt })
      } catch {
        /* 读取失败不影响使用 */
      }
    })()
  }, [])

  // 内容变化 → 防抖写盘（订阅 store，避免每次拖动都写文件）
  useEffect(() => {
    let timer: number | undefined
    const unsub = useStore.subscribe((state, prev) => {
      if (state.tracks === prev.tracks) return
      if (timer !== undefined) window.clearTimeout(timer)
      timer = window.setTimeout(() => {
        timer = undefined
        try {
          void window.api.autosaveProject(useStore.getState().toProjectData())
        } catch {
          /* 自动保存失败不打断编辑 */
        }
      }, 4000)
    })
    return () => {
      unsub()
      if (timer !== undefined) window.clearTimeout(timer)
    }
  }, [])

  const applyRecovery = (): void => {
    const r = recovery
    if (!r) return
    const st = useStore.getState()
    useStore.setState({
      tracks: r.data.tracks.length > 0 ? r.data.tracks : st.tracks,
      projectName: r.data.name || '未命名',
      orientation: r.data.orientation === 'portrait' ? 'portrait' : 'landscape',
      selectedClip: null,
      currentTime: 0,
    })
    setRecovery(null)
    st.pushToast('已恢复上次未保存的内容')
  }

  const discardRecovery = (): void => {
    setRecovery(null)
    void window.api.clearAutosave()
  }

  return { recovery, applyRecovery, discardRecovery }
}

const App: React.FC = () => {
  const psdDialog = useStore((s) => s.psdDialog)
  // 浏览器调试模式（无 Electron preload，走 devMockApi）：明确提示，避免误以为能真实导出
  const isMock = typeof window !== 'undefined' && Boolean((window as unknown as { __guiyiMock?: boolean }).__guiyiMock)

  useGlobalShortcuts()
  useMenuActions()
  const { recovery, applyRecovery, discardRecovery } = useAutosave()

  const lib = useResizable(260, 'left', 200, 500)
  const props = useResizable(300, 'right', 200, 500)
  const timeline = useResizable(240, 'bottom', 120, 460)

  return (
    <div className="app-layout-v2">
      {isMock && (
        <div className="debug-banner">
          ⚠ 浏览器调试模式：素材与导出均为模拟，不会产生真实文件。请使用桌面应用窗口操作。
        </div>
      )}
      {recovery && (
        <div className="recovery-banner">
          <span>
            检测到上次未保存的内容（{new Date(recovery.savedAt).toLocaleString()}），是否恢复？
          </span>
          <span className="recovery-actions">
            <button className="primary" onClick={applyRecovery}>恢复</button>
            <button onClick={discardRecovery}>丢弃</button>
          </span>
        </div>
      )}
      <Toolbar />
      <div className="workspace">
        <div className="panel" style={{ width: lib.size, flexShrink: 0 }}>
          <MaterialLibrary />
        </div>
        <div className={`splitter splitter-v${lib.dragging ? ' dragging' : ''}`} onMouseDown={lib.onMouseDown} />
        <div className="panel panel-center">
          <PreviewArea />
        </div>
        <div className={`splitter splitter-v${props.dragging ? ' dragging' : ''}`} onMouseDown={props.onMouseDown} />
        <div className="panel" style={{ width: props.size, flexShrink: 0 }}>
          <PropertyPanel />
        </div>
      </div>
      <div className={`splitter splitter-h${timeline.dragging ? ' dragging' : ''}`} onMouseDown={timeline.onMouseDown} />
      <div className="panel" style={{ height: timeline.size, flexShrink: 0 }}>
        <Timeline />
      </div>
      {psdDialog && <PsdLayerDialog />}
      <ExportOverlay />
      <Toasts />
    </div>
  )
}

export default App
