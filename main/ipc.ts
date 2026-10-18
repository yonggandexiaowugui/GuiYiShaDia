// ============================================================================
// IPC 注册表：渲染进程通过 window.api（preload contextBridge）调用这里
// M0：素材 CRUD + 文件选择 + assetUrl 可用；AI / 工程 / 导出为占位（后续里程碑实现）
// ============================================================================
import { ipcMain, dialog, shell, BrowserWindow, app } from 'electron'
import path from 'node:path'
import type {
  AddMaterialInput,
  ExportStartOptions,
  MaterialCategory,
  ProjectFile,
  PsdLayerImportItem,
  Shot,
  UpdateMaterialInput,
} from '../shared/types'
import {
  addMaterial,
  deleteMaterial,
  getDataDir,
  listMaterials,
  resolveAsset,
  updateMaterial,
} from './database'
import { importAudio, importImage } from './media'
import { removeMaterialBackground } from './bgremove'
import { exportPSDLayers, parsePSD } from './psd'
import { getAIConfig, generateVoiceover, parseScript, regenerateShot, saveAIConfig, testLLM, testTTS } from './ai'
import { generateImageMaterial, testImageGen } from './imagegen'
import { generateRigCharacter } from './riggen'
import { buildRigCharacter } from './rigbuild'
import { listLocalVoices } from './tts'
import { cancelExport, finishExport, pickExportPath, startExport, writeFrame } from './exporter'
import { autosaveProject, clearAutosave, openProjectFile, readAutosave, saveProjectFile } from './project'

export function registerIpc(): void {
  // ---- 素材（M0 可用） ----
  ipcMain.handle('materials:list', (_e, category?: MaterialCategory | '全部') => listMaterials(category))
  ipcMain.handle('materials:add', (_e, data: AddMaterialInput) => addMaterial(data))
  ipcMain.handle('materials:update', (_e, id: string, data: UpdateMaterialInput) => updateMaterial(id, data))
  ipcMain.handle('materials:delete', (_e, id: string) => deleteMaterial(id))

  ipcMain.handle('files:select', async () => {
    const result = await dialog.showOpenDialog({
      title: '导入素材',
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: '素材文件', extensions: ['png', 'jpg', 'jpeg', 'psd', 'mp3', 'wav', 'ogg', 'm4a'] },
        { name: '图片', extensions: ['png', 'jpg', 'jpeg'] },
        { name: 'Photoshop', extensions: ['psd'] },
        { name: '音频', extensions: ['mp3', 'wav', 'ogg', 'm4a'] },
      ],
    })
    return result.canceled ? [] : result.filePaths
  })

  // 相对路径 → guiyi:// URL（供 <img> / fetch 使用）
  ipcMain.handle('asset:url', (_e, relPath: string | null | undefined) => {
    if (!relPath) return ''
    const rel = relPath.split(path.sep).join('/').replace(/^\/+/, '')
    return `guiyi://app/${rel}`
  })

  // ---- 媒体导入（M1） ----
  ipcMain.handle('media:importImage', (_e, filePath: string) => importImage(filePath))
  ipcMain.handle('media:removeBackground', (_e, materialId: string) => removeMaterialBackground(materialId))
  ipcMain.handle('media:importAudio', (_e, filePath: string) => importAudio(filePath))
  ipcMain.handle('media:importPSD', (_e, filePath: string) => parsePSD(filePath))
  ipcMain.handle('media:importPSDLayers', (_e, filePath: string, items: PsdLayerImportItem[]) =>
    exportPSDLayers(filePath, items),
  )

  // ---- AI ----
  ipcMain.handle('ai:getConfig', () => getAIConfig())
  ipcMain.handle('ai:saveConfig', (_e, config: Partial<ReturnType<typeof getAIConfig>>) => saveAIConfig(config))
  ipcMain.handle('ai:testLLM', (_e, config: Parameters<typeof testLLM>[0]) => testLLM(config))
  ipcMain.handle('ai:testTTS', (_e, config: Parameters<typeof testTTS>[0]) => testTTS(config))
  ipcMain.handle('ai:generateImage', (_e, prompt: string, category: Parameters<typeof generateImageMaterial>[1]) =>
    generateImageMaterial(prompt, category),
  )
  ipcMain.handle('ai:testImageGen', (_e, config: Parameters<typeof testImageGen>[0]) => testImageGen(config))
  ipcMain.handle('ai:generateRigCharacter', (e, name: string, style: string) =>
    generateRigCharacter(name, style, (p) => {
      if (!e.sender.isDestroyed()) e.sender.send('ai:rigCharacterProgress', p)
    }),
  )
  ipcMain.handle(
    'rig:buildCharacter',
    (_e, name: string, parts: Record<string, string>, expressions: Record<string, string>) =>
      buildRigCharacter(name, parts, expressions),
  )
  ipcMain.handle('ai:parseScript', (_e, script: string, sampleShots?: Shot[]) => parseScript(script, sampleShots))
  ipcMain.handle('ai:regenShot', (_e, shot: Shot) => regenerateShot(shot))

  // ---- 工程 ----
  ipcMain.handle('project:save', (e, defaultName: string, data: ProjectFile) =>
    saveProjectFile(BrowserWindow.fromWebContents(e.sender), defaultName, data),
  )
  ipcMain.handle('project:open', (e) => openProjectFile(BrowserWindow.fromWebContents(e.sender)))
  ipcMain.handle('project:autosave', (_e, data: ProjectFile) => autosaveProject(data))
  ipcMain.handle('project:readAutosave', () => readAutosave())
  ipcMain.handle('project:clearAutosave', () => clearAutosave())

  // ---- 配音 / 导出 ----
  ipcMain.handle('voice:generate', (_e, item: Parameters<typeof generateVoiceover>[0]) => generateVoiceover(item))
  ipcMain.handle('voice:listVoices', () => listLocalVoices())
  ipcMain.handle('voice:delete', () => false)

  ipcMain.handle('export:pickPath', (e, defaultName: string) => {
    // 开发期自动化：设置 GUIYI_AUTO_EXPORT 时跳过另存为对话框，直接用该路径
    const auto = !app.isPackaged ? process.env.GUIYI_AUTO_EXPORT : undefined
    if (auto) return auto
    return pickExportPath(BrowserWindow.fromWebContents(e.sender), defaultName)
  })
  ipcMain.handle('export:start', (e, opts: ExportStartOptions) =>
    startExport(opts, {
      onProgress: (p) => {
        if (!e.sender.isDestroyed()) e.sender.send('export:progress', { phase: 'encode', ...p })
      },
    }),
  )
  ipcMain.handle('export:writeFrame', (_e, png: Uint8Array) => writeFrame(png))
  ipcMain.handle('export:finish', () => finishExport())
  ipcMain.handle('export:cancel', () => cancelExport())

  ipcMain.handle('shell:showItemInFolder', (_e, p: string) => {
    // 绝对路径（导出产物）直接用；相对路径（素材）→ 数据目录下的绝对路径
    shell.showItemInFolder(path.isAbsolute(p) ? p : resolveAsset(p))
  })

  // 供主进程内部调试：返回数据目录
  ipcMain.handle('debug:dataDir', () => getDataDir())
}
