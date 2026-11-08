import type { Plugin } from 'vite'

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'

const BILI_HEADERS = {
  'User-Agent': UA,
  Referer: 'https://www.bilibili.com/'
}

function sendJson(res: import('node:http').ServerResponse, status: number, body: unknown): void {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(body))
}

/**
 * 浏览器预览专用：
 * - /bili-poll 由本地 dev 服务轮询二维码，读取 Set-Cookie 里的 SESSDATA（浏览器读不到 HttpOnly）
 * - /bili-nav 用真实 SESSDATA 请求 nav，返回真实昵称与登录状态
 */
export function biliNavPlugin(): Plugin {
  return {
    name: 'bonebowl-bili-login',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url) {
          next()
          return
        }
        const url = new URL(req.url, 'http://localhost')

        if (url.pathname === '/bili-poll') {
          const key = (url.searchParams.get('qrcode_key') ?? '').trim()
          if (!key) {
            sendJson(res, 400, { code: -1, message: '缺少 qrcode_key' })
            return
          }
          try {
            const upstream = await fetch(
              `https://passport.bilibili.com/x/passport-login/web/qrcode/poll?qrcode_key=${encodeURIComponent(key)}`,
              { headers: BILI_HEADERS }
            )
            const json = (await upstream.json()) as Record<string, unknown>
            let sessdata = ''
            for (const cookie of upstream.headers.getSetCookie()) {
              const first = cookie.split(';')[0]?.trim() ?? ''
              if (first.startsWith('SESSDATA=')) {
                sessdata = first.slice('SESSDATA='.length)
                break
              }
            }
            sendJson(res, upstream.status, { ...json, sessdata })
          } catch {
            sendJson(res, 502, { code: -1, message: '轮询请求失败' })
          }
          return
        }

        if (url.pathname === '/bili-nav') {
          const sessdata = (url.searchParams.get('sessdata') ?? '').trim()
          if (!sessdata || sessdata.length > 512) {
            sendJson(res, 400, { code: -1, message: '缺少 SESSDATA' })
            return
          }
          try {
            const upstream = await fetch('https://api.bilibili.com/x/web-interface/nav', {
              headers: { ...BILI_HEADERS, Cookie: `SESSDATA=${sessdata}` }
            })
            sendJson(res, upstream.status, await upstream.json())
          } catch {
            sendJson(res, 502, { code: -1, message: 'nav 请求失败' })
          }
          return
        }

        next()
      })
    }
  }
}
