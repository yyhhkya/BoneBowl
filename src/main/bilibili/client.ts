import { EventEmitter } from 'node:events'
import WebSocket from 'ws'
import { brotliDecompressSync, inflateSync } from 'node:zlib'
import { getDanmuInfo, getRealRoomId } from './api'
import type { RoomStatus } from '../../shared/types'

export interface SendGiftData {
  giftId: number
  giftName: string
  uid: number
  uname: string
  num: number
  timestamp: number
  tid?: string
  rnd?: string
  coin_type?: string
  total_coin?: number
}

const OP_HEARTBEAT = 2
const OP_MESSAGE = 5
const OP_AUTH = 7
const OP_AUTH_REPLY = 8

function buildPacket(op: number, body: Buffer | string, seq = 1, ver = 1): Buffer {
  const payload = typeof body === 'string' ? Buffer.from(body, 'utf8') : body
  const header = Buffer.alloc(16)
  header.writeUInt32BE(16 + payload.length, 0)
  header.writeUInt16BE(16, 4)
  header.writeUInt16BE(ver, 6)
  header.writeUInt32BE(op, 8)
  header.writeUInt32BE(seq, 12)
  return Buffer.concat([header, payload])
}

function decodePackets(buffer: Buffer, out: unknown[] = []): unknown[] {
  let offset = 0
  while (offset + 16 <= buffer.length) {
    const total = buffer.readUInt32BE(offset)
    const headerLen = buffer.readUInt16BE(offset + 4)
    const ver = buffer.readUInt16BE(offset + 6)
    const op = buffer.readUInt32BE(offset + 8)
    if (total < headerLen || offset + total > buffer.length) break
    const body = buffer.subarray(offset + headerLen, offset + total)
    offset += total
    if (op !== OP_MESSAGE && op !== OP_AUTH_REPLY) continue
    if (ver === 2) decodePackets(inflateSync(body), out)
    else if (ver === 3) decodePackets(brotliDecompressSync(body), out)
    else {
      const text = body.toString('utf8').trim()
      if (!text) continue
      try {
        out.push(JSON.parse(text))
      } catch {
        // 心跳回复等非 JSON 内容直接忽略
      }
    }
  }
  return out
}

export class LiveClient extends EventEmitter {
  private socket: WebSocket | null = null
  private heartbeat: NodeJS.Timeout | null = null
  private retryTimer: NodeJS.Timeout | null = null
  private stopped = true
  private attempts = 0
  private seen = new Map<string, number>()
  private status: RoomStatus = { state: 'idle' }

  constructor(private readonly options: { roomId: number; sessdata: string }) {
    super()
  }

  getStatus(): RoomStatus {
    return this.status
  }

  async start(): Promise<void> {
    this.stopped = false
    this.attempts = 0
    await this.run()
  }

  stop(): void {
    this.stopped = true
    this.clearTimers()
    this.socket?.removeAllListeners()
    this.socket?.close()
    this.socket = null
    this.setStatus({ state: 'idle' })
  }

  private setStatus(status: RoomStatus): void {
    this.status = status
    this.emit('status', status)
  }

  private clearTimers(): void {
    if (this.heartbeat) clearInterval(this.heartbeat)
    if (this.retryTimer) clearTimeout(this.retryTimer)
    this.heartbeat = null
    this.retryTimer = null
  }

  private async run(): Promise<void> {
    this.setStatus({ state: 'connecting', roomId: this.options.roomId })
    try {
      const room = await getRealRoomId(this.options.roomId)
      this.lastRealRoomId = room.roomId
      const info = await getDanmuInfo(room.roomId, this.options.sessdata)
      this.openSocket(room.roomId, info.token, info.hosts, info.uid)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.setStatus({ state: 'error', message })
      this.scheduleRetry()
    }
  }

  private scheduleRetry(): void {
    if (this.stopped) return
    this.attempts += 1
    const delay = Math.min(30_000, 1_000 * 2 ** Math.min(this.attempts, 5))
    console.log(`[bili] ${Math.round(delay / 1000)}s 后重连（第 ${this.attempts} 次）`)
    this.retryTimer = setTimeout(() => void this.run(), delay)
  }

  private openSocket(
    realRoomId: number,
    token: string,
    hosts: { host: string; wssPort: number }[],
    uid: number
  ): void {
    const host = hosts[0]
    const socket = new WebSocket(`wss://${host.host}:${host.wssPort}/sub`, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
        Origin: 'https://live.bilibili.com'
      }
    })
    this.socket = socket

    socket.on('open', () => {
      if (socket !== this.socket) return
      const auth = JSON.stringify({
        uid,
        roomid: realRoomId,
        protover: 3,
        platform: 'web',
        type: 2,
        key: token
      })
      socket.send(buildPacket(OP_AUTH, auth))
      this.heartbeat = setInterval(() => {
        if (socket.readyState === WebSocket.OPEN) socket.send(buildPacket(OP_HEARTBEAT, ''))
      }, 30_000)
    })

    socket.on('message', (raw) => {
      if (socket !== this.socket) return
      let payloads: unknown[]
      try {
        payloads = decodePackets(Buffer.isBuffer(raw) ? raw : Buffer.from(raw as ArrayBuffer))
      } catch (error) {
        console.warn('[bili] 解包失败', error)
        return
      }
      for (const payload of payloads) this.handlePayload(payload)
    })

    socket.on('close', () => {
      if (socket !== this.socket) return
      this.clearTimers()
      this.socket = null
      if (!this.stopped) this.scheduleRetry()
    })

    socket.on('error', (error) => {
      if (socket !== this.socket) return
      console.warn('[bili] socket error', error.message)
    })
  }

  private handlePayload(payload: unknown): void {
    if (!payload || typeof payload !== 'object') return
    const cmd = (payload as { cmd?: string }).cmd ?? ''
    if (cmd === 'SEND_GIFT') {
      const data = (payload as { data?: SendGiftData }).data
      if (!data) return
      if (this.isDuplicate(data)) return
      this.attempts = 0
      this.emit('gift', data)
      return
    }
    const code = (payload as { code?: number }).code
    if (typeof code === 'number' && !('cmd' in payload)) {
      if (code === 0 && this.status.state !== 'connected') {
        const roomId = this.options.roomId
        const realRoomId = this.lastRealRoomId
        this.attempts = 0
        this.setStatus({ state: 'connected', roomId, realRoomId })
      } else if (code !== 0) {
        this.setStatus({ state: 'error', message: `认证失败（code ${code}）` })
      }
    }
  }

  private lastRealRoomId = 0

  private isDuplicate(data: SendGiftData): boolean {
    const key = data.tid || data.rnd || `${data.uid}-${data.giftId}-${data.timestamp}-${data.num}`
    const now = Date.now()
    if (this.seen.has(key)) return true
    this.seen.set(key, now)
    if (this.seen.size > 4000) {
      for (const [k, at] of this.seen) {
        if (now - at > 10 * 60_000) this.seen.delete(k)
      }
    }
    return false
  }
}
