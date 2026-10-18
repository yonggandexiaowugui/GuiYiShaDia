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
  } else if (!app.isPackaged && process.env.GUIYI_AUTO_TEST === 'bgremove') {
    mainWindow.webContents.once('did-finish-load', () => {
      void runAutoBgRemove()
    })
  } else if (!app.isPackaged && process.env.GUIYI_AUTO_TEST === 'imagegen') {
    mainWindow.webContents.once('did-finish-load', () => {
      void runAutoImageGen()
    })
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

/** 自动化：去背景链路自检——导入一张真实照片 → IPC 去背景 → 校验产物 */
async function runAutoBgRemove(): Promise<void> {
  const win = mainWindow
  if (!win || win.isDestroyed()) return
  const photoPath = process.env.GUIYI_AUTO_PHOTO
  if (!photoPath) {
    log('autobg: skipped (GUIYI_AUTO_PHOTO not set)')
    return
  }
  log(`autobg: start`)
  try {
    const result = await win.webContents.executeJavaScript(
      `(async () => {
         const wait = (ms) => new Promise((r) => setTimeout(r, ms));
         for (let i = 0; i < 100 && !window.__guiyiStore; i++) await wait(100);
         if (!window.__guiyiStore) return { ok: false, message: 'store 未暴露' };
         const s = () => window.__guiyiStore.getState();
         const out = {};
         await s().loadMaterials();
         const imported = await window.api.importImage(${JSON.stringify(photoPath)});
         out.imported = { id: imported.id, name: imported.name, category: imported.category };
         const t0 = Date.now();
         const created = await window.api.removeBackground(imported.id);
         out.created = {
           id: created.id,
           name: created.name,
           category: created.category,
           tags: created.tags,
           seconds: Math.round((Date.now() - t0) / 100) / 10,
         };
         // 校验产物可经 guiyi:// 协议取回且尺寸合理
         const url = window.api.assetUrl(created.file_path);
         const resp = await fetch(url);
         const buf = await resp.arrayBuffer();
         out.pngBytes = buf.byteLength;
         out.ok = out.pngBytes > 100;
         return out;
       })()`,
      true,
    )
    log(`autobg: done ${JSON.stringify(result)}`)
  } catch (e) {
    log(`autobg: failed ${e instanceof Error ? e.message : String(e)}`)
  }
}

/** 自动化：AI 生成素材自检——默认公共源生成一张 → 校验入库产物可取回 */
async function runAutoImageGen(): Promise<void> {
  const win = mainWindow
  if (!win || win.isDestroyed()) return
  log('autoimg: start')
  try {
    const result = await win.webContents.executeJavaScript(
      `(async () => {
         const wait = (ms) => new Promise((r) => setTimeout(r, ms));
         for (let i = 0; i < 100 && !window.__guiyiStore; i++) await wait(100);
         if (!window.__guiyiStore) return { ok: false, message: 'store 未暴露' };
         const s = () => window.__guiyiStore.getState();
         const out = {};
         await s().loadMaterials();
         const before = s().materials.length;
         const res = await window.api.generateImageMaterial('a fat orange cat wearing sunglasses, cartoon sticker style', '角色');
         out.res = { ok: res.ok, message: res.message, seconds: res.seconds, name: res.material?.name, category: res.material?.category, tags: res.material?.tags };
         await s().loadMaterials();
         out.materialsBefore = before;
         out.materialsAfter = s().materials.length;
         if (res.ok && res.material) {
           const resp = await fetch(window.api.assetUrl(res.material.file_path));
           out.bytes = (await resp.arrayBuffer()).byteLength;
           const thumbResp = await fetch(window.api.assetUrl(res.material.thumbnail_path));
           out.thumbBytes = (await thumbResp.arrayBuffer()).byteLength;
         }
         out.ok = res.ok === true && out.materialsAfter === before + 1;
         return out;
       })()`,
      true,
    )
    log(`autoimg: done ${JSON.stringify(result)}`)
  } catch (e) {
    log(`autoimg: failed ${e instanceof Error ? e.message : String(e)}`)
  }
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

         // ---- 选择集合 / 剪贴板 / 群组平移 / 微调（新增能力自检） ----
         s().loadDemo('mystery');
         await wait(300);
         {
           const refs2 = s().tracks.flatMap((t) => t.clips.map((c) => ({ trackId: t.id, clipId: c.id })));
           const pick = (id) => s().tracks.flatMap((t) => t.clips).find((c) => c.id === id);

           // 全选
           s().selectAllClips();
           out.selectAll = s().selectedIds.length;

           // 复制 → 粘贴（粘贴到播放头 0s）
           s().setCurrentTime(0);
           s().copySelectedClips();
           const beforePaste = count(s().tracks);
           s().pasteClips();
           await wait(80);
           out.paste = { before: beforePaste, after: count(s().tracks), selected: s().selectedIds.length };
           s().undo();
           await wait(80);
           out.pasteUndo = count(s().tracks);

           // 群组平移：跨轨道选中两个片段，整体 +1s，相对间隔应不变
           s().selectClip(refs2[0], 'replace');
           const other = refs2.find((r) => r.trackId !== refs2[0].trackId);
           if (other) s().selectClip(other, 'toggle');
           const g0 = pick(refs2[0].clipId)?.start ?? 0;
           const g1 = other ? (pick(other.clipId)?.start ?? 0) : g0;
           const origins = s().selectedIds.map((id) => ({ clipId: id, start: pick(id)?.start ?? 0 }));
           s().beginInteraction();
           s().moveClipsAsGroup(origins, 1.0);
           await wait(80);
           const h0 = pick(refs2[0].clipId)?.start ?? 0;
           const h1 = other ? (pick(other.clipId)?.start ?? 0) : h0;
           out.groupMove = {
             count: origins.length,
             gapBefore: Math.round((g1 - g0) * 100) / 100,
             gapAfter: Math.round((h1 - h0) * 100) / 100,
             moved: Math.round((h0 - g0) * 100) / 100,
           };
           s().undo();
           await wait(80);

           // 方向键微调：单片段 +0.1s
           s().selectClip(refs2[0], 'replace');
           const n0 = pick(refs2[0].clipId)?.start ?? 0;
           s().nudgeSelectedClips(0.1);
           await wait(50);
           out.nudge = Math.round(((pick(refs2[0].clipId)?.start ?? 0) - n0) * 100) / 100;
           s().undo();
           await wait(80);

           // 整体夹到 0：先整体右移 5s，再整体左移 999s，应夹到 0 且组内相对位置不变
           s().selectAllClips();
           {
             const c0 = s().tracks.flatMap((t) => t.clips);
             const spread0 = Math.max(...c0.map((c) => c.start)) - Math.min(...c0.map((c) => c.start));
             s().beginInteraction();
             s().moveClipsAsGroup(c0.map((c) => ({ clipId: c.id, start: c.start })), 5);
             await wait(60);
             const c1 = s().tracks.flatMap((t) => t.clips);
             const min1 = Math.min(...c1.map((c) => c.start));
             s().beginInteraction();
             s().moveClipsAsGroup(c1.map((c) => ({ clipId: c.id, start: c.start })), -999);
             await wait(60);
             const c2 = s().tracks.flatMap((t) => t.clips);
             const min2 = Math.min(...c2.map((c) => c.start));
             const spread2 = Math.max(...c2.map((c) => c.start)) - min2;
             out.clamp = {
               minAfterRight: Math.round(min1 * 100) / 100,
               minAfterLeft: Math.round(min2 * 100) / 100,
               shift: Math.round((min1 - min2) * 100) / 100,
               spreadKept: Math.round((spread2 - spread0) * 100) / 100,
             };
             s().undo();
             await wait(60);
             s().undo();
             await wait(60);
           }
         }

         // ---- 配音与字幕独立控制：像素级验证「跟随 / 自定义 / 关闭」三态 ----
         s().loadDemo('mystery');
         await wait(300);
         {
           const voice = s().tracks.find((t) => t.type === 'voice');
           const vclip = voice?.clips[0];
           if (voice && vclip && window.__guiyiRender) {
             const R = window.__guiyiRender;
             const W = 960;
             const H = 540;
             const mats = s().materials;
             await R.preloadImages(R.collectImageUrls(s().tracks, mats, window.api.assetUrl));

             // 只取画面底部字幕带，做逐像素比对
             const bandAt = (t, tracks) => {
               const cv = document.createElement('canvas');
               cv.width = W;
               cv.height = H;
               const ctx = cv.getContext('2d');
               R.drawScene({
                 ctx, tracks, materials: mats, currentTime: t,
                 width: W, height: H, assetUrl: window.api.assetUrl, subtitleStyle: s().subtitleStyle,
               });
               return ctx.getImageData(0, Math.round(H * 0.8), W, Math.round(H * 0.2)).data;
             };
             const diffCount = (a, b) => {
               let n = 0;
               for (let i = 0; i < a.length; i += 4) {
                 if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2]) n++;
               }
               return n;
             };

             const midT = vclip.start + vclip.duration / 2;
             const followBand = bandAt(midT, s().tracks);
             s().updateClip(voice.id, vclip.id, { subtitle: '' });
             const hiddenBand = bandAt(midT, s().tracks);
             s().updateClip(voice.id, vclip.id, { subtitle: '自定义字幕测试文本' });
             const customBand = bandAt(midT, s().tracks);
             const noVoiceBand = bandAt(
               midT,
               s().tracks.map((t) => (t.type === 'voice' ? { ...t, clips: [] } : t)),
             );
             out.subtitle = {
               followVsHidden: diffCount(followBand, hiddenBand),
               followVsCustom: diffCount(followBand, customBand),
               hiddenEqualsNoVoiceTrack: diffCount(hiddenBand, noVoiceBand),
             };

             // 持久化：自定义字幕经保存 → 新建 → 打开后应保持
             await s().saveProject();
             s().newProject();
             await wait(150);
             await s().openProject();
             await wait(250);
             out.subtitlePersisted = s().tracks.find((t) => t.type === 'voice')?.clips[0]?.subtitle ?? null;
           }
         }

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
