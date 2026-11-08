import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { biliNavPlugin } from './vite.biliPlugin'

export default defineConfig({
  main: {},
  preload: {},
  renderer: {
    base: './',
    plugins: [react(), tailwindcss(), biliNavPlugin()],
    server: {
      proxy: {
        // 浏览器里直接打开 5173 时也能拉真实礼物列表
        '/bili-live': {
          target: 'https://api.live.bilibili.com',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/bili-live/, ''),
          headers: { Referer: 'https://live.bilibili.com/' }
        },
        '/bili-passport': {
          target: 'https://passport.bilibili.com',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/bili-passport/, ''),
          headers: { Referer: 'https://www.bilibili.com/' }
        }
      }
    }
  }
})
