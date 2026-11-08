import { createServer, type Server } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { extname, join, resolve, sep } from 'node:path'
import { WebSocket, WebSocketServer } from 'ws'

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.wasm': 'application/wasm',
  '.map': 'application/json; charset=utf-8'
}

export class OverlayServer {
  private server: Server | null = null
  private wss: WebSocketServer | null = null
  private configProvider: (() => unknown) | null = null
  port = 0

  constructor(private readonly rendererDir: string) {}

  setConfigProvider(provider: () => unknown): void {
    this.configProvider = provider
  }

  async start(preferredPort: number): Promise<number> {
    for (let port = preferredPort; port < preferredPort + 12; port += 1) {
      try {
        await this.listen(port)
        this.port = port
        return port
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EADDRINUSE') throw error
      }
    }
    throw new Error(`端口 ${preferredPort} 附近没有可用端口`)
  }

  private listen(port: number): Promise<void> {
    return new Promise((resolvePromise, reject) => {
      const server = createServer((req, res) => void this.serve(req, res))
      server.on('error', reject)
      server.listen(port, '127.0.0.1', () => {
        this.server = server
        this.wss = new WebSocketServer({ server, path: '/ws' })
        this.wss.on('connection', (socket: WebSocket) => {
          socket.send(JSON.stringify({ type: 'hello', server: 'bonebowl' }))
          if (this.configProvider) {
            socket.send(JSON.stringify({ type: 'config', config: this.configProvider() }))
          }
        })
        resolvePromise()
      })
    })
  }

  private async serve(req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse): Promise<void> {
    try {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1')
      let pathname = decodeURIComponent(url.pathname)
      if (pathname === '/' || pathname === '/overlay' || pathname === '/settings') pathname = '/index.html'

      const root = resolve(this.rendererDir)
      const filePath = resolve(join(root, pathname))
      if (filePath !== root && !filePath.startsWith(root + sep)) {
        res.writeHead(403).end('Forbidden')
        return
      }

      let target = filePath
      try {
        const info = await stat(target)
        if (info.isDirectory()) target = join(target, 'index.html')
      } catch {
        target = join(root, 'index.html')
      }

      let body: Buffer
      try {
        body = await readFile(target)
      } catch {
        res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end(
          '<!doctype html><meta charset="utf-8"><body style="font-family:system-ui;background:#f4f1ea;color:#26241f;display:grid;place-items:center;height:100vh;margin:0"><div><h1>叠加层尚未构建</h1><p>先运行 <code>npm run build</code>，或用开发模式访问 Vite 地址。</p><p><a href="/overlay">当前地址</a></p></div></body>'
        )
        return
      }

      const ext = extname(target).toLowerCase()
      const isHtml = ext === '.html'
      res.writeHead(200, {
        'Content-Type': MIME[ext] ?? 'application/octet-stream',
        'Cache-Control': isHtml ? 'no-cache' : 'public, max-age=31536000, immutable',
        'Access-Control-Allow-Origin': '*'
      })
      res.end(body)
    } catch (error) {
      console.error('[server]', error)
      res.writeHead(500).end('Internal Server Error')
    }
  }

  broadcast(payload: unknown): number {
    if (!this.wss) return 0
    const text = JSON.stringify(payload)
    let sent = 0
    for (const client of this.wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(text)
        sent += 1
      }
    }
    return sent
  }

  clientCount(): number {
    if (!this.wss) return 0
    let count = 0
    for (const client of this.wss.clients) {
      if (client.readyState === WebSocket.OPEN) count += 1
    }
    return count
  }

  async stop(): Promise<void> {
    this.wss?.close()
    this.wss = null
    await new Promise<void>((resolvePromise) => {
      if (!this.server) return resolvePromise()
      this.server.close(() => resolvePromise())
      this.server = null
    })
  }
}
