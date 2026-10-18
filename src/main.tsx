import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { installDevMockApi } from './devMockApi'
import { useStore } from './services/store'
import { getPeaks } from './services/waveform'
import { drawScene, collectImageUrls, preloadImages } from './services/sceneRenderer'

installDevMockApi()

// 开发期自动化钩子：把 store / 波形服务 / 渲染器挂到 window，便于「无界面」驱动端到端验证。
// 仅 DEV 生效，生产构建不会包含。
if (import.meta.env.DEV) {
  const w = window as unknown as {
    __guiyiStore?: typeof useStore
    __guiyiWave?: { getPeaks: typeof getPeaks }
    __guiyiRender?: {
      drawScene: typeof drawScene
      collectImageUrls: typeof collectImageUrls
      preloadImages: typeof preloadImages
    }
  }
  w.__guiyiStore = useStore
  w.__guiyiWave = { getPeaks }
  w.__guiyiRender = { drawScene, collectImageUrls, preloadImages }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
