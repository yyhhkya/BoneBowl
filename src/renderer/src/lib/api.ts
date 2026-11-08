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
  type RoomStatus,
  type UpdateStatus
} from '../../../shared/types'

const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

let mockConfig: AppConfig = {
  ...clone(DEFAULT_CONFIG),
  roomId: null,
  gifts: [
    { id: 'seed-bloom', giftId: 31036, name: '小花花', bones: 1, size: 'small', enabled: true },
    { id: 'seed-battery', giftId: 31164, name: '电池', bones: 3, size: 'medium', enabled: true },
    { id: 'seed-heart', giftId: 30064, name: '小心心', bones: 5, size: 'large', enabled: true }
  ]
}
let mockStatus: RoomStatus = { state: 'idle' }
const statusListeners = new Set<(s: RoomStatus) => void>()
const giftListeners = new Set<(g: GiftEvent) => void>()
const configListeners = new Set<(c: AppConfig) => void>()
const updateListeners = new Set<(s: UpdateStatus) => void>()
let mockUpdateStatus: UpdateStatus = { state: 'none', message: '已是最新版本' }
let mockQrPolls = 0
let channel: BroadcastChannel | null = null
if (typeof BroadcastChannel !== 'undefined') {
  channel = new BroadcastChannel('bonebowl-mock')
}

function emitStatus(status: RoomStatus, wait = 0): void {
  mockStatus = status
  setTimeout(() => statusListeners.forEach((cb) => cb(status)), wait)
}

const mockCatalog: GiftCatalogItem[] = [
  { id: 31036, name: '小花花', price: 100, coinType: 'gold' },
  { id: 31164, name: '电池', price: 100, coinType: 'gold' },
  { id: 30064, name: '小心心', price: 500, coinType: 'gold' },
  { id: 30760, name: '牛哇牛哇', price: 100, coinType: 'gold' },
  { id: 30537, name: '小花花车', price: 1000, coinType: 'gold' },
  { id: 30628, name: '干杯', price: 2000, coinType: 'gold' },
  { id: 30536, name: '爱心瓶', price: 3000, coinType: 'gold' },
  { id: 30581, name: '爱心气球', price: 5000, coinType: 'gold' },
  { id: 30580, name: '爱心发射', price: 10000, coinType: 'gold' },
  { id: 30535, name: '飞机', price: 100000, coinType: 'gold' }
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
    configListeners.forEach((cb) => cb(clone(mockConfig)))
    return clone(mockConfig)
  },
  connect: async (opts) => {
    const roomId = opts?.roomId ?? mockConfig.roomId
    if (!roomId) throw new Error('先填写直播间号')
    const sessdata = (opts?.sessdata ?? mockConfig.sessdata).trim()
    if (!sessdata) throw new Error('连接直播间需要先扫码登录 B站账号')
    mockConfig.roomId = roomId
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
    await delay(700)
    return mockCatalog
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
    return { state: 'success', sessdata: 'mock-SESSDATA', uname: '月见里的兔子', uid: 60861121 }
  },
  getUpdateStatus: async () => mockUpdateStatus,
  checkUpdate: async () => {
    mockUpdateStatus = { state: 'checking', message: '正在检查更新' }
    updateListeners.forEach((cb) => cb(mockUpdateStatus))
    await delay(900)
    mockUpdateStatus = { state: 'none', message: '已是最新版本' }
    updateListeners.forEach((cb) => cb(mockUpdateStatus))
    return mockUpdateStatus
  },
  installUpdate: async () => undefined,
  onUpdate: (cb) => {
    updateListeners.add(cb)
    return () => updateListeners.delete(cb)
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
