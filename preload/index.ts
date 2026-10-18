// ============================================================================
// 预加载脚本：contextBridge 暴露 window.api（渲染进程唯一通道，不碰 Node）
// 通道命名与 main/ipc.ts 一一对应
// ============================================================================
import { contextBridge, ipcRenderer } from 'electron'
import type { GuiYiShaDiaoApi, ExportProgress, RigCharacterProgress } from '../shared/types'

const api: GuiYiShaDiaoApi = {
  // 素材
  getMaterials: (category) => ipcRenderer.invoke('materials:list', category),
  addMaterial: (data) => ipcRenderer.invoke('materials:add', data),
  updateMaterial: (id, data) => ipcRenderer.invoke('materials:update', id, data),
  deleteMaterial: (id) => ipcRenderer.invoke('materials:delete', id),
  importImage: (filePath) => ipcRenderer.invoke('media:importImage', filePath),
  importPSD: (filePath) => ipcRenderer.invoke('media:importPSD', filePath),
  importAudio: (filePath) => ipcRenderer.invoke('media:importAudio', filePath),
  importPSDLayers: (filePath, items) => ipcRenderer.invoke('media:importPSDLayers', filePath, items),
  removeBackground: (materialId) => ipcRenderer.invoke('media:removeBackground', materialId),
  selectFiles: () => ipcRenderer.invoke('files:select'),
  assetUrl: (relPath) => {
    if (!relPath) return ''
    const rel = relPath.replace(/\\/g, '/').replace(/^\/+/, '')
    return `guiyi://app/${rel}`
  },

  // AI
  getAIConfig: () => ipcRenderer.invoke('ai:getConfig'),
  saveAIConfig: (config) => ipcRenderer.invoke('ai:saveConfig', config),
  testLLM: (config) => ipcRenderer.invoke('ai:testLLM', config),
  testTTS: (config) => ipcRenderer.invoke('ai:testTTS', config),
  generateImageMaterial: (prompt, category) => ipcRenderer.invoke('ai:generateImage', prompt, category),
  testImageGen: (config) => ipcRenderer.invoke('ai:testImageGen', config),
  generateRigCharacter: (name, style) => ipcRenderer.invoke('ai:generateRigCharacter', name, style),
  onRigCharacterProgress: (cb) => {
    const listener = (_e: unknown, p: RigCharacterProgress): void => cb(p)
    ipcRenderer.on('ai:rigCharacterProgress', listener)
    return () => ipcRenderer.removeListener('ai:rigCharacterProgress', listener)
  },
  parseScript: (script, sampleShots) => ipcRenderer.invoke('ai:parseScript', script, sampleShots),
  regenerateShot: (shot) => ipcRenderer.invoke('ai:regenShot', shot),

  // 工程
  saveProject: (defaultName, data) => ipcRenderer.invoke('project:save', defaultName, data),
  openProject: () => ipcRenderer.invoke('project:open'),
  onMenuAction: (cb) => {
    const listener = (_e: unknown, action: 'new' | 'save' | 'open' | 'export'): void => cb(action)
    ipcRenderer.on('menu:action', listener)
    return () => ipcRenderer.removeListener('menu:action', listener)
  },

  // 自动保存 / 崩溃恢复
  autosaveProject: (data) => ipcRenderer.invoke('project:autosave', data),
  readAutosave: () => ipcRenderer.invoke('project:readAutosave'),
  clearAutosave: () => ipcRenderer.invoke('project:clearAutosave'),

  // 配音 / 导出
  generateVoiceover: (item) => ipcRenderer.invoke('voice:generate', item),
  deleteVoiceoverFile: (file) => ipcRenderer.invoke('voice:delete', file),
  listTTSVoices: () => ipcRenderer.invoke('voice:listVoices'),
  pickExportPath: (defaultName) => ipcRenderer.invoke('export:pickPath', defaultName),
  startExport: (opts) => ipcRenderer.invoke('export:start', opts),
  writeFrame: (png) => ipcRenderer.invoke('export:writeFrame', png),
  finishExport: () => ipcRenderer.invoke('export:finish'),
  cancelExport: () => ipcRenderer.invoke('export:cancel'),
  onExportProgress: (cb) => {
    const listener = (_e: unknown, p: ExportProgress): void => cb(p)
    ipcRenderer.on('export:progress', listener)
    return () => ipcRenderer.removeListener('export:progress', listener)
  },
  showItemInFolder: (p) => ipcRenderer.invoke('shell:showItemInFolder', p),
}

contextBridge.exposeInMainWorld('api', api)
