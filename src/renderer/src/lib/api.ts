import QRCode from 'qrcode'
import {
  DEFAULT_CONFIG,
  type AppConfig,
  type AppInfo,
  type BoneBowlAPI,
  type BoneSize,
  type GiftCatalogItem,
  type GiftEvent,
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

const mockCatalog: GiftCatalogItem[] = [
  { id: 31036, name: '小花花', price: 100, coinType: 'gold', image: 'https://i0.hdslb.com/bfs/live/28357ba4cd566418730ca29da2c552efa7e4a390.webp' },
  { id: 31039, name: '牛哇牛哇', price: 100, coinType: 'gold', image: 'https://i0.hdslb.com/bfs/live/7571c8bdfcb65f9b00ab1307b2c86630f0d00859.webp' },
  { id: 35432, name: '鼓鼓掌', price: 500, coinType: 'gold', image: 'https://i0.hdslb.com/bfs/live/353e3de2d989a2cc0e68526a1965019aaf94081d.webp' },
  { id: 35520, name: '比心', price: 1000, coinType: 'gold', image: 'https://i0.hdslb.com/bfs/live/77f216bef72e29d62db79de373bf158a763c80c8.webp' },
  { id: 35525, name: '甜滋滋', price: 5000, coinType: 'gold', image: 'https://i0.hdslb.com/bfs/live/27cc54dfa35680e8f365be17372d39a1bd0eca29.webp' },
  { id: 35545, name: '情书', price: 5200, coinType: 'gold', image: 'https://i0.hdslb.com/bfs/live/cdc77fab896a1b9502b20c361355173094180b01.webp' },
  { id: 34315, name: '喜欢你', price: 9900, coinType: 'gold', image: 'https://i0.hdslb.com/bfs/live/8bedf765322d218e363251a712d0853874847146.webp' },
  { id: 35542, name: '钻石戒指', price: 19900, coinType: 'gold', image: 'https://i0.hdslb.com/bfs/live/0961371ed967d0d1a37cb3cb774bba04840fa280.webp' },
  { id: 35768, name: '亲密之旅', price: 50000, coinType: 'gold', image: 'https://i0.hdslb.com/bfs/live/1a58587ade058d840ed583b6b00e4ba7ce576f0c.webp' },
  { id: 32093, name: '极速超跑（流光飞电）', price: 100000, coinType: 'gold', image: 'https://i0.hdslb.com/bfs/live/3db1c96b11437782a4871eaac618c2fbc1a490c4.webp' },
  { id: 33070, name: '小电视飞船（荣耀飞船）', price: 2999000, coinType: 'gold', image: 'https://i0.hdslb.com/bfs/live/4bf6c6043f4b580c908f17866fd5fa81cda6c93a.webp' }
]

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
    // 预览里通过 Vite 代理拉真实礼物面板，失败则退回内置示例
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
      return list.filter((item) => Number.isFinite(item.id)).map(mapGift)
    } catch {
      await delay(300)
      return mockCatalog
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
    if (mockQrPolls <= 1) return { state: 'waiting', message: '等待扫码' }
    if (mockQrPolls === 2) return { state: 'scanned', message: '已扫码，在手机上确认' }
    mockConfig.sessdata = 'mock-SESSDATA'
    persistMockConfig()
    return { state: 'success', sessdata: 'mock-SESSDATA', uname: '月见里的兔子', uid: 60861121 }
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
