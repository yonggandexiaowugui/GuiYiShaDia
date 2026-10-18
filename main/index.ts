// Electron 主进程入口
import { app, BrowserWindow, Menu, protocol } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import { Readable } from 'node:stream'
import { getDb, getPaths, getDataDir } from './database'
import { registerIpc } from './ipc'
import { seedBuiltinAssets } from './builtin'
import { log, resetLogFile } from './log'

process.on('uncaughtException', (err) => log(`uncaughtException: ${err?.stack || err}`))
process.on('unhandledRejection', (err) => log(`unhandledRejection: ${err}`))

// 关闭 GPU 硬件加速，提升不同显卡驱动 / 远程桌面下的启动兼容性
app.disableHardwareAcceleration()

const isDev = !!process.env.VITE_DEV_SERVER_URL
const preloadPath = path.join(__dirname, '../preload/index.cjs')

let mainWindow: BrowserWindow | null = null

/** 确保 userData 可写；不可写时回退到系统临时目录（避免 SQLITE_CANTOPEN） */
function ensureWritableUserData(): void {
  const defaultDir = app.getPath('userData')
  try {
    const probe = path.join(defaultDir, '.writetest')
    fs.mkdirSync(defaultDir, { recursive: true })
    fs.writeFileSync(probe, 'ok')
    fs.unlinkSync(probe)
    return
  } catch {
    /* 走回退 */
  }
  const fallback = path.join(app.getPath('temp'), 'guiyishadiao-data')
  try {
    fs.mkdirSync(fallback, { recursive: true })
    app.setPath('userData', fallback)
    resetLogFile()
    log(`userData not writable, fallback to: ${fallback}`)
  } catch (e) {
    log(`userData fallback failed: ${e}`)
  }
}

// app ready 前注册特权协议，渲染进程可像 https 一样访问 guiyi:// 资源
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'guiyi',
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true },
  },
])

function sendMenuAction(action: 'new' | 'save' | 'open' | 'export'): void {
  const win = BrowserWindow.getAllWindows()[0]
  if (win && !win.isDestroyed()) {
    win.webContents.send('menu:action', action)
  }
}

function buildAppMenu(): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: '文件',
      submenu: [
        { label: '新建工程', accelerator: 'CmdOrCtrl+N', click: () => sendMenuAction('new') },
        { label: '打开工程…', accelerator: 'CmdOrCtrl+O', click: () => sendMenuAction('open') },
        { label: '保存工程', accelerator: 'CmdOrCtrl+S', click: () => sendMenuAction('save') },
        { type: 'separator' },
        { label: '导出视频…', accelerator: 'CmdOrCtrl+E', click: () => sendMenuAction('export') },
        { type: 'separator' },
        { role: 'quit', label: '退出' },
      ],
    },
    { label: '编辑', role: 'editMenu' },
    { label: '视图', role: 'viewMenu' },
    { label: '帮助', role: 'help' },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1200,
    minHeight: 700,
    title: '诡异沙雕动画制作器',
    backgroundColor: '#1e1e1e',
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  if (isDev) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL!)
  } else {
    mainWindow.loadFile(path.join(__dirname, '../../dist/index.html'))
  }

  mainWindow.webContents.on('render-process-gone', (_e, details) =>
    log(`render-process-gone: ${JSON.stringify(details)}`),
  )
  mainWindow.webContents.on('preload-error', (_e, p, err) =>
    log(`preload-error: ${p} ${err?.message ?? err}`),
  )

  // 开发期自动化：GUIYI_AUTO_EXPORT=<输出 mp4 绝对路径> 时，页面加载后自动载入示例并导出，
  // 便于「无界面」地验证导出链路产出的真实文件。仅未打包时生效。
  if (!app.isPackaged && process.env.GUIYI_AUTO_EXPORT) {
    mainWindow.webContents.once('did-finish-load', () => {
      void runAutoExport(process.env.GUIYI_AUTO_EXPORT as string)
    })
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

/** 自动执行一次「载入示例 → 导出」，结果写入主进程日志 */
async function runAutoExport(outPath: string): Promise<void> {
  const win = mainWindow
  if (!win || win.isDestroyed()) return
  log(`autoexport: start → ${outPath}`)
  try {
    const result = await win.webContents.executeJavaScript(
      `(async () => {
         const wait = (ms) => new Promise((r) => setTimeout(r, ms));
         const count = (ts) => ts.reduce((n, t) => n + t.clips.length, 0);
         const dur = (ts) => ts.reduce((m, t) => Math.max(m, ...t.clips.map((c) => c.start + c.duration), 0), 0);
         for (let i = 0; i < 100 && !window.__guiyiStore; i++) await wait(100);
         if (!window.__guiyiStore) return { ok: false, message: 'store 未暴露' };
         const s = () => window.__guiyiStore.getState();
         const out = {};

         await s().loadMaterials();

         // ---- 示例模板：三个预设应产出不同规模 ----
         out.presets = {};
         for (const id of ['mystery', 'slapstick', 'loop']) {
           s().loadDemo(id);
           await wait(250);
           out.presets[id] = { clips: count(s().tracks), seconds: Math.round(dur(s().tracks) * 10) / 10 };
         }

         // ---- 多选 + 批量删除 + 撤销 ----
         s().loadDemo('mystery');
         await wait(300);
         const before = count(s().tracks);
         const refs = s().tracks.flatMap((t) => t.clips.map((c) => ({ trackId: t.id, clipId: c.id })));
         s().selectClip(refs[0], 'replace');
         s().selectClip(refs[1], 'toggle');
         s().selectClip(refs[2], 'toggle');
         out.multiSelect = s().selectedIds.length;
         s().deleteSelectedClips();
         await wait(120);
         out.batchDelete = { before, after: count(s().tracks) };
         s().undo();
         await wait(120);
         out.afterUndo = count(s().tracks);
         out.clipsBefore = count(s().tracks);

         // ---- 自动保存 → 读回校验 ----
         await window.api.autosaveProject(s().toProjectData());
         const auto = await window.api.readAutosave();
         out.autosave = { ok: auto.ok, clips: auto.ok && auto.data ? count(auto.data.tracks) : -1 };

         // ---- 工程往返：保存 → 新建清空 → 重新打开 ----
         await s().saveProject();
         out.savedPath = s().projectPath;
         s().newProject();
         await wait(150);
         out.clipsAfterNew = count(s().tracks);
         await s().openProject();
         await wait(250);
         out.clipsAfterOpen = count(s().tracks);
         out.roundTripOk = out.clipsAfterOpen === out.clipsBefore;

         // ---- 生成配音并导出（保持神秘复苏模板作为交付物） ----
         s().loadDemo('mystery');
         await wait(250);
         await s().generateVoiceovers();
         await wait(300);

         // ---- 波形：真实解码音效与配音，验证 fetch + decodeAudioData 链路 ----
         if (window.__guiyiWave) {
           const sfxMat = s().materials.find((m) => m.category === '音效');
           const voiceClip = s().tracks.flatMap((t) => t.clips).find((c) => c.voiceFile);
           const probes = {};
           for (const [name, url] of [
             ['sfx', sfxMat ? window.api.assetUrl(sfxMat.file_path) : ''],
             ['voice', voiceClip ? window.api.assetUrl(voiceClip.voiceFile) : ''],
           ]) {
             if (!url) { probes[name] = 'no-url'; continue; }
             const peaks = await window.__guiyiWave.getPeaks(url);
             probes[name] = peaks
               ? { buckets: peaks.length, max: Math.round(Math.max(...peaks) * 1000) / 1000 }
               : 'decode-failed';
           }
           out.waveform = probes;
         }

         await s().runExport();
         out.export = s().exportDone;
         return out;
       })()`,
      true,
    )
    log(`autoexport: done ${JSON.stringify(result)}`)
  } catch (e) {
    log(`autoexport: failed ${e instanceof Error ? e.message : String(e)}`)
  }
}

/** 常见资源类型 → MIME（媒体播放/预览需要正确的 Content-Type） */
const MIME_MAP: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.ogg': 'audio/ogg',
  '.json': 'application/json',
}

/** guiyi:// 协议：相对路径 → userData/guiyishadiao 下的磁盘文件
 *  支持 Range 请求（音频/视频拖动进度必须），并按扩展名返回正确 Content-Type */
function registerAssetProtocol(): void {
  protocol.handle('guiyi', async (request) => {
    const url = new URL(request.url)
    const rel = decodeURIComponent(url.pathname).replace(/^\/+/, '')
    const abs = path.join(getDataDir(), rel)

    let stat: fs.Stats
    try {
      stat = fs.statSync(abs)
    } catch {
      return new Response('Not Found', { status: 404 })
    }
    if (!stat.isFile()) return new Response('Not Found', { status: 404 })

    const type = MIME_MAP[path.extname(abs).toLowerCase()] ?? 'application/octet-stream'
    const range = request.headers.get('range')
    const match = range ? /bytes=(\d*)-(\d*)/.exec(range) : null

    if (match && stat.size > 0) {
      const start = match[1] ? Number(match[1]) : 0
      const end = match[2] ? Math.min(Number(match[2]), stat.size - 1) : stat.size - 1
      if (start > end || start >= stat.size) {
        return new Response(null, {
          status: 416,
          headers: { 'Content-Range': `bytes */${stat.size}` },
        })
      }
      const stream = Readable.toWeb(fs.createReadStream(abs, { start, end })) as ReadableStream
      return new Response(stream, {
        status: 206,
        headers: {
          'Content-Type': type,
          'Content-Length': String(end - start + 1),
          'Content-Range': `bytes ${start}-${end}/${stat.size}`,
          'Accept-Ranges': 'bytes',
        },
      })
    }

    const stream = Readable.toWeb(fs.createReadStream(abs)) as ReadableStream
    return new Response(stream, {
      status: 200,
      headers: {
        'Content-Type': type,
        'Content-Length': String(stat.size),
        'Accept-Ranges': 'bytes',
      },
    })
  })
}

app.whenReady().then(() => {
  ensureWritableUserData()
  log('app ready')

  try {
    getPaths()
    getDb()
    log('database initialized')
  } catch (err) {
    log(`database init failed: ${err}`)
  }

  seedBuiltinAssets(log).catch((e) => log(`builtin seed failed: ${e}`))

  registerAssetProtocol()
  registerIpc()
  buildAppMenu()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
