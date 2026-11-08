import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { biliNavPlugin } from './vite.biliPlugin'

// 仅供浏览器预览设置页与叠加页，不参与 Electron 打包
export default defineConfig({
  root: 'src/renderer',
  base: './',
  plugins: [react(), tailwindcss(), biliNavPlugin()],
  server: {
    port: 5199,
    strictPort: true,
    proxy: {
      // 预览环境借用 Vite 代理直连 B站公开接口，避免浏览器 CORS
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
})
