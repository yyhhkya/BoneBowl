import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import type { ServerResponse } from 'node:http'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import type { Plugin, ViteDevServer } from 'vite'
import { normalizeConfig } from './src/shared/config'
import { DEFAULT_CONFIG, type AppConfig } from './src/shared/types'

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'

const BILI_HEADERS = {
  'User-Agent': UA,
  Referer: 'https://www.bilibili.com/'
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(body))
}

/** 与 Electron 主进程 userData 对应的 config.json 路径 */
function configFilePath(): string {
  const home = homedir()
  const base =
    process.platform === 'win32'
      ? (process.env.APPDATA ?? join(home, 'AppData', 'Roaming'))
      : process.platform === 'darwin'
        ? join(home, 'Library', 'Application Support')
        : (process.env.XDG_CONFIG_HOME ?? join(home, '.config'))
  return join(base, 'bonebowl', 'config.json')
}

function readConfig(): AppConfig {
  try {
    const file = configFilePath()
    if (existsSync(file)) {
      return normalizeConfig(JSON.parse(readFileSync(file, 'utf8')) as Partial<AppConfig>)
    }
  } catch (error) {
    console.warn('[dev-config] 读取失败，使用默认配置', error)
  }
  return normalizeConfig(DEFAULT_CONFIG)
}

function writeConfig(patch: Partial<AppConfig>): AppConfig {
  const next = normalizeConfig({ ...readConfig(), ...patch })
  const file = configFilePath()
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, JSON.stringify(next, null, 2), 'utf8')
  return next
}

async function readBody(req: import('node:http').IncomingMessage): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(Buffer.from(chunk as Buffer))
  return Buffer.concat(chunks).toString('utf8')
}

/**
 * 浏览器预览专用：
 * - /dev-config 读写与正式应用相同的 config.json
 * - /bili-poll 由本地 dev 服务轮询二维码，读取 Set-Cookie 里的 SESSDATA（浏览器读不到 HttpOnly）
 * - /bili-nav 用真实 SESSDATA 请求 nav，返回真实昵称与登录状态
 */
export function devApiPlugin(): Plugin {
  return {
    name: 'bonebowl-dev-api',
    configureServer(server: ViteDevServer) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url) {
          next()
          return
        }
        const url = new URL(req.url, 'http://localhost')

        if (url.pathname === '/dev-config') {
          if (req.method === 'GET') {
            sendJson(res, 200, readConfig())
            return
          }
          if (req.method === 'POST') {
            try {
              const body = await readBody(req)
              const patch = JSON.parse(body || '{}') as Partial<AppConfig>
              sendJson(res, 200, writeConfig(patch))
            } catch {
              sendJson(res, 400, { message: '配置写入失败' })
            }
            return
          }
          sendJson(res, 405, { message: 'Method Not Allowed' })
          return
        }

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
