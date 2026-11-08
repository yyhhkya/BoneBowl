import QRCode from 'qrcode'
import {
  DEFAULT_CONFIG,
  type AppConfig,
  type AppInfo,
  type BoneBowlAPI,
  type BoneSize,
  type GiftCatalogItem,
  type GiftEvent,
  type LoginCheck,
  type QrLoginPoll,
  type RoomStatus
} from '../../../shared/types'

const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

const MOCK_CONFIG_KEY = 'bonebowl:mock-config'

function loadMockConfig(): AppConfig {
  const fallback: AppConfig = { ...clone(DEFAULT_CONFIG), roomId: null, gifts: [] }
  try {
    const raw = window.localStorage.getItem(MOCK_CONFIG_KEY)
    if (!raw) return fallback
    const parsed = JSON.parse(raw) as Partial<AppConfig>
    return {
      ...fallback,
      ...parsed,
      roomId: typeof parsed.roomId === 'number' && parsed.roomId > 0 ? parsed.roomId : null,
      gifts: Array.isArray(parsed.gifts) ? parsed.gifts : []
    }
  } catch {
    return fallback
  }
}

function persistMockConfig(): void {
  try {
    window.localStorage.setItem(MOCK_CONFIG_KEY, JSON.stringify(mockConfig))
  } catch {
    // 存储不可用时只保留在内存里
  }
}

let mockConfig: AppConfig = loadMockConfig()
let mockStatus: RoomStatus = { state: 'idle' }
const statusListeners = new Set<(s: RoomStatus) => void>()
const giftListeners = new Set<(g: GiftEvent) => void>()
const configListeners = new Set<(c: AppConfig) => void>()
let mockQrPolls = 0
let channel: BroadcastChannel | null = null
if (typeof BroadcastChannel !== 'undefined') {
  channel = new BroadcastChannel('bonebowl-mock')
}

function emitStatus(status: RoomStatus, wait = 0): void {
  mockStatus = status
  setTimeout(() => statusListeners.forEach((cb) => cb(status)), wait)
}

interface RawGift {
  id?: number
  name?: string
  price?: number
  coin_type?: string
  webp?: string
  img_basic?: string
}

function mapGift(item: RawGift): GiftCatalogItem {
  return {
    id: Number(item.id),
    name: typeof item.name === 'string' && item.name ? item.name : `礼物 ${item.id}`,
    price: Number(item.price) || 0,
    coinType: typeof item.coin_type === 'string' ? item.coin_type : '',
    image: (typeof item.webp === 'string' && item.webp) || (typeof item.img_basic === 'string' ? item.img_basic : '')
  }
}

function emitGift(size: BoneSize = 'medium'): void {
  const rule = mockConfig.gifts.find((g) => g.enabled) ?? mockConfig.gifts[0]
  const gift: GiftEvent = {
    giftId: rule?.giftId ?? 31036,
    giftName: rule?.name ?? '小花花',
    uid: 60861121,
    uname: '月见里的兔子',
    num: 1,
    bones: rule?.bones ?? 3,
    size,
    timestamp: Date.now()
  }
  setTimeout(() => giftListeners.forEach((cb) => cb(gift)), 20)
  channel?.postMessage({ type: 'gift', gift })
}

const mockApi: BoneBowlAPI = {
  getConfig: async () => clone(mockConfig),
  saveConfig: async (patch) => {
    mockConfig = { ...mockConfig, ...patch } as AppConfig
    persistMockConfig()
    configListeners.forEach((cb) => cb(clone(mockConfig)))
    return clone(mockConfig)
  },
  connect: async (opts) => {
    const roomId = opts?.roomId ?? mockConfig.roomId
    if (!roomId) throw new Error('先填写直播间号')
    const sessdata = (opts?.sessdata ?? mockConfig.sessdata).trim()
    if (!sessdata) throw new Error('连接直播间需要先扫码登录 B站账号')
    mockConfig.roomId = roomId
    persistMockConfig()
    emitStatus({ state: 'connecting', roomId })
    await delay(900)
    emitStatus({ state: 'connected', roomId, realRoomId: roomId })
    return mockStatus
  },
  disconnect: async () => {
    emitStatus({ state: 'idle' })
    return mockStatus
  },
  getStatus: async () => mockStatus,
  fetchGifts: async (roomId) => {
    if (!roomId) throw new Error('先填写直播间号')
    // 预览里通过 Vite 代理拉真实礼物面板，失败直接报错，不回退示例数据
    const controller = new AbortController()
    const timer = window.setTimeout(() => controller.abort(), 8000)
    try {
      const init = (await fetch(`/bili-live/room/v1/Room/room_init?id=${roomId}`, {
        signal: controller.signal
      }).then((res) => res.json())) as { data?: { room_id?: number } }
      const realId = Number(init?.data?.room_id) || roomId
      const json = (await fetch(
        `/bili-live/xlive/web-room/v1/giftPanel/giftConfig?platform=pc&room_id=${realId}`,
        { signal: controller.signal }
      ).then((res) => res.json())) as { data?: { list?: RawGift[] } }
      const list = json?.data?.list ?? []
      if (!Array.isArray(list) || list.length === 0) throw new Error('礼物列表为空')
      const seen = new Set<string>()
      return list
        .filter((item) => Number.isFinite(item.id))
        .map(mapGift)
        .filter((item) => {
          const key = item.name.trim()
          if (!key || seen.has(key)) return false
          seen.add(key)
          return true
        })
    } catch {
      throw new Error('拿不到实时礼物列表：开发预览需要重启 npm run dev:web 让代理生效，或检查网络后重试')
    } finally {
      window.clearTimeout(timer)
      controller.abort()
    }
  },
  testGift: async (size) => {
    emitGift(size)
  },
  getInfo: async (): Promise<AppInfo> => ({
    port: Number(window.location.port) || 17800,
    overlayUrl: `${window.location.origin}/overlay`,
    version: '0.1.0',
    isDev: true
  }),
  openOverlay: async () => {
    window.open('/overlay?test=1', '_blank')
  },
  openExternal: async (url) => {
    window.open(url, '_blank', 'noopener')
  },
  copyText: async (text) => {
    await navigator.clipboard.writeText(text)
  },
  qrLogin: async () => {
    mockQrPolls = 0
    await delay(300)
    const image = await QRCode.toDataURL('https://www.bilibili.com/', {
      margin: 1,
      width: 360,
      color: { dark: '#2f2a22', light: '#fffdf7' }
    })
    return { key: 'mock-qr-key', image, expiresIn: 180 }
  },
  qrPoll: async (): Promise<QrLoginPoll> => {
    mockQrPolls += 1
    await delay(300)
    // 预览没有真实扫码通道，保持等待直到二维码过期
    if (mockQrPolls > 90) return { state: 'expired', message: '二维码已过期' }
    return { state: 'waiting', message: '等待扫码' }
  },
  verifyLogin: async (): Promise<LoginCheck> => {
    if (!mockConfig.sessdata.trim()) return { state: 'none', message: '还没有登录' }
    if (mockConfig.sessdata === 'mock-SESSDATA') {
      return { state: 'valid', uname: '月见里的兔子', uid: 60861121 }
    }
    return { state: 'invalid', message: '登录已失效，请重新扫码' }
  },
  onStatus: (cb) => {
    statusListeners.add(cb)
    return () => statusListeners.delete(cb)
  },
  onGift: (cb) => {
    giftListeners.add(cb)
    return () => giftListeners.delete(cb)
  },
  onConfig: (cb) => {
    configListeners.add(cb)
    return () => configListeners.delete(cb)
  }
}

export function getApi(): BoneBowlAPI {
  return window.bonebowl ?? mockApi
}
