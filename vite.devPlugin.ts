import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import type { ServerResponse } from 'node:http'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import type { Plugin, ViteDevServer } from 'vite'
import { normalizeConfig } from './src/shared/config'
import { DEFAULT_CONFIG, type AppConfig, type GiftEvent } from './src/shared/types'
import { refreshLoginIfNeeded } from './src/main/bilibili/refresh'
import { OverlayServer } from './src/main/server'

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

let overlayService: Promise<{ server: OverlayServer; port: number }> | null = null

/** dev 预览也启动一个真实的叠加层服务，试投可通过 /ws 推给 OBS */
function ensureOverlayService(): Promise<{ server: OverlayServer; port: number }> {
  if (!overlayService) {
    overlayService = (async () => {
      const config = readConfig()
      const overlay = new OverlayServer(join(process.cwd(), 'out', 'renderer'))
      overlay.setConfigProvider(() => {
        const current = readConfig()
        return { boneLifetimeSec: current.boneLifetimeSec }
      })
      const port = await overlay.start(config.port || 17800)
      return { server: overlay, port }
    })().catch((error) => {
      overlayService = null
      throw error
    })
  }
  return overlayService
}

function buildTestGift(ruleId?: string): GiftEvent {
  const config = readConfig()
  const rule =
    (ruleId ? config.gifts.find((g) => g.id === ruleId) : undefined) ??
    config.gifts.find((g) => g.enabled) ??
    config.gifts[0]
  return {
    giftId: rule?.giftId ?? 0,
    giftName: rule?.name ?? '测试骨头',
    uid: 0,
    uname: '测试观众',
    num: 1,
    bones: Math.max(1, rule?.bones ?? 1),
    scale: rule?.scale ?? 1,
    timestamp: Date.now()
  }
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
      server.httpServer?.once('close', () => {
        const current = overlayService
        overlayService = null
        void current
          ?.then(({ server: overlay }) => overlay.stop())
          .catch(() => undefined)
      })
      server.middlewares.use(async (req, res, next) => {
        if (!req.url) {
          next()
          return
        }
        const url = new URL(req.url, 'http://localhost')

        if (url.pathname === '/dev-overlay-info') {
          try {
            const { server: overlay, port } = await ensureOverlayService()
            sendJson(res, 200, { port, clients: overlay.clientCount() })
          } catch {
            sendJson(res, 500, { message: '叠加层服务启动失败' })
          }
          return
        }

        if (url.pathname === '/dev-test-gift' && req.method === 'POST') {
          try {
            const body = JSON.parse((await readBody(req)) || '{}') as { ruleId?: string }
            const { server: overlay, port } = await ensureOverlayService()
            const clients = overlay.broadcast({ type: 'gift', gift: buildTestGift(body.ruleId) })
            sendJson(res, 200, { ok: true, port, clients })
          } catch {
            sendJson(res, 500, { message: '试投失败' })
          }
          return
        }

        if (url.pathname === '/dev-config') {
          if (req.method === 'GET') {
            sendJson(res, 200, readConfig())
            return
          }
          if (req.method === 'POST') {
            try {
              const body = await readBody(req)
              const patch = JSON.parse(body || '{}') as Partial<AppConfig>
              const next = writeConfig(patch)
              // 已连接的叠加层立即应用消失时长等运行参数
              void overlayService
                ?.then(({ server: overlay }) => {
                  overlay.broadcast({
                    type: 'config',
                    config: { boneLifetimeSec: next.boneLifetimeSec }
                  })
                })
                .catch(() => undefined)
              sendJson(res, 200, next)
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
            let biliJct = ''
            for (const cookie of upstream.headers.getSetCookie()) {
              const first = cookie.split(';')[0]?.trim() ?? ''
              if (first.startsWith('SESSDATA=')) {
                sessdata = first.slice('SESSDATA='.length)
              } else if (first.startsWith('bili_jct=')) {
                biliJct = first.slice('bili_jct='.length)
              }
            }
            const refreshToken =
              (json.data as { refresh_token?: string } | undefined)?.refresh_token ?? ''
            sendJson(res, upstream.status, { ...json, sessdata, biliJct, refreshToken })
          } catch {
            sendJson(res, 502, { code: -1, message: '轮询请求失败' })
          }
          return
        }

        if (url.pathname === '/bili-refresh' && req.method === 'POST') {
          try {
            const body = JSON.parse((await readBody(req)) || '{}') as {
              sessdata?: string
              biliJct?: string
              refreshToken?: string
            }
            const refreshed = await refreshLoginIfNeeded({
              sessdata: body.sessdata ?? '',
              biliJct: body.biliJct ?? '',
              refreshToken: body.refreshToken ?? ''
            })
            sendJson(res, 200, refreshed ? writeConfig(refreshed) : null)
          } catch {
            sendJson(res, 500, null)
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
