import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'

// 主进程 / 预加载 / 渲染进程统一配置。
// 原生模块（better-sqlite3、sharp、ffmpeg-static）与纯 CJS 的 ag-psd 一律 external，
// 运行时由 Electron 主进程 require() 加载，不进 bundle。
export default defineConfig({
  plugins: [
    react(),
    electron([
      {
        entry: 'main/index.ts',
        vite: {
          build: {
            outDir: 'dist-electron/main',
            rollupOptions: {
              external: ['better-sqlite3', 'sharp', 'ag-psd', 'ffmpeg-static'],
            },
          },
        },
      },
      {
        entry: 'preload/index.ts',
        onstart(options) {
          if (process.env.VITE_DEV_SERVER_URL) {
            options.reload()
          }
        },
        vite: {
          build: {
            outDir: 'dist-electron/preload',
            rollupOptions: {
              external: ['electron'],
              output: {
                format: 'cjs',
                entryFileNames: 'index.cjs',
              },
            },
          },
        },
      },
    ]),
    renderer(),
  ],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'chrome120',
  },
  server: {
    port: 5173,
    strictPort: false,
  },
  resolve: {
    alias: {
      '@': '/src',
      '@shared': '/shared',
    },
  },
})
