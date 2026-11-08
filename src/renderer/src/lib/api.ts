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

let mockConfig: AppConfig = { ...clone(DEFAULT_CONFIG), roomId: null, gifts: [] }
let mockStatus: RoomStatus = { state: 'idle' }
const statusListeners = new Set<(s: RoomStatus) => void>()
const giftListeners = new Set<(g: GiftEvent) => void>()
const configListeners = new Set<(c: AppConfig) => void>()
let channel: BroadcastChannel | null = null
if (typeof BroadcastChannel !== 'undefined') {
  channel = new BroadcastChannel('bonebowl-mock')
}

async function saveMockConfig(patch: Partial<AppConfig>): Promise<AppConfig> {
  const response = await fetch('/dev-config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch)
  })
  if (!response.ok) throw new Error('保存配置失败，请重启 dev 服务后重试')
  mockConfig = (await response.json()) as AppConfig
  configListeners.forEach((cb) => cb(clone(mockConfig)))
  return clone(mockConfig)
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

function buildMockGift(size: BoneSize = 'medium'): GiftEvent {
  const rule = mockConfig.gifts.find((g) => g.enabled) ?? mockConfig.gifts[0]
  return {
    giftId: rule?.giftId ?? 31036,
    giftName: rule?.name ?? '小花花',
    uid: 60861121,
    uname: '月见里的兔子',
    num: 1,
    bones: rule?.bones ?? 3,
    size,
    timestamp: Date.now()
  }
}

function emitGift(size: BoneSize = 'medium', broadcast = true): void {
  const gift = buildMockGift(size)
  setTimeout(() => giftListeners.forEach((cb) => cb(gift)), 20)
  if (broadcast) channel?.postMessage({ type: 'gift', gift })
}

const mockApi: BoneBowlAPI = {
  getConfig: async () => {
    const response = await fetch('/dev-config')
    if (!response.ok) throw new Error('读取配置失败，请重启 dev 服务后重试')
    mockConfig = (await response.json()) as AppConfig
    return clone(mockConfig)
  },
  saveConfig: async (patch) => saveMockConfig(patch),
  connect: async (opts) => {
    const roomId = opts?.roomId ?? mockConfig.roomId
    if (!roomId) throw new Error('先填写直播间号')
    const sessdata = (opts?.sessdata ?? mockConfig.sessdata).trim()
    if (!sessdata) throw new Error('连接直播间需要先扫码登录 B站账号')
    try {
      await saveMockConfig({ roomId })
    } catch {
      // 持久化失败不阻断预览里的连接流程
    }
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
    const boneSize: BoneSize = size ?? 'medium'
    try {
      const response = await fetch('/dev-test-gift', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ size: boneSize })
      })
      if (!response.ok) throw new Error('试投失败')
      // 已经由叠加层服务通过 WebSocket 广播，这里只更新设置页的事件列表
      emitGift(boneSize, false)
    } catch {
      emitGift(boneSize)
    }
  },
  getInfo: async (): Promise<AppInfo> => {
    try {
      const response = await fetch('/dev-overlay-info')
      if (response.ok) {
        const info = (await response.json()) as { port?: number }
        const port = Number(info.port) || 17800
        return {
          port,
          overlayUrl: `${window.location.origin}/overlay?ws=${port}`,
          version: '0.1.0',
          isDev: true
        }
      }
    } catch {
      // 叠加层服务不可用时退回当前页面端口
    }
    return {
      port: Number(window.location.port) || 17800,
      overlayUrl: `${window.location.origin}/overlay`,
      version: '0.1.0',
      isDev: true
    }
  },
  openOverlay: async () => {
    const info = await mockApi.getInfo()
    const joiner = info.overlayUrl.includes('?') ? '&' : '?'
    window.open(`${info.overlayUrl}${joiner}test=1`, '_blank')
  },
  openExternal: async (url) => {
    window.open(url, '_blank', 'noopener')
  },
  copyText: async (text) => {
    await navigator.clipboard.writeText(text)
  },
  qrLogin: async () => {
    const response = await fetch('/bili-passport/x/passport-login/web/qrcode/generate')
    if (!response.ok) throw new Error(`获取二维码失败：HTTP ${response.status}`)
    const json = (await response.json()) as {
      code?: number
      data?: { url?: string; qrcode_key?: string }
    }
    const url = json.data?.url
    const key = json.data?.qrcode_key
    if (json.code !== 0 || !url || !key) {
      throw new Error('获取二维码失败，请重启 npm run dev:web 让代理生效')
    }
    const image = await QRCode.toDataURL(url, {
      margin: 1,
      width: 360,
      color: { dark: '#2f2a22', light: '#fffdf7' }
    })
    return { key, image, expiresIn: 180 }
  },
  qrPoll: async (key: string): Promise<QrLoginPoll> => {
    const response = await fetch(`/bili-poll?qrcode_key=${encodeURIComponent(key)}`)
    if (!response.ok) return { state: 'error', message: `轮询失败：HTTP ${response.status}` }
    const json = (await response.json()) as {
      code?: number
      sessdata?: string
      biliJct?: string
      refreshToken?: string
      data?: { code?: number; message?: string }
    }
    if (json.code !== 0) return { state: 'error', message: '轮询失败，请刷新二维码' }
    const status = json.data?.code
    if (status === 86101) return { state: 'waiting', message: '等待扫码' }
    if (status === 86090) return { state: 'scanned', message: '已扫码，在手机上确认' }
    if (status === 86038) return { state: 'expired', message: '二维码已过期' }
    if (status !== 0) return { state: 'error', message: json.data?.message || '未知状态' }
    const sessdata = (json.sessdata ?? '').trim()
    if (!sessdata) return { state: 'error', message: '登录成功，但没有取到 SESSDATA' }
    const biliJct = (json.biliJct ?? '').trim()
    const refreshToken = (json.refreshToken ?? '').trim()
    mockConfig.sessdata = sessdata
    mockConfig.biliJct = biliJct
    mockConfig.refreshToken = refreshToken
    try {
      await saveMockConfig({ sessdata, biliJct, refreshToken })
    } catch {
      // 配置写入失败不影响本次登录结果
    }
    const nav = await fetch(`/bili-nav?sessdata=${encodeURIComponent(sessdata)}`)
      .then((res) => res.json())
      .catch(() => null)
    return { state: 'success', sessdata, uname: nav?.data?.uname, uid: nav?.data?.mid }
  },
  verifyLogin: async (): Promise<LoginCheck> => {
    let sessdata = mockConfig.sessdata.trim()
    if (!sessdata) return { state: 'none', message: '还没有登录' }
    if (sessdata !== 'mock-SESSDATA' && mockConfig.refreshToken) {
      try {
        const refreshed = (await fetch('/bili-refresh', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessdata,
            biliJct: mockConfig.biliJct,
            refreshToken: mockConfig.refreshToken
          })
        }).then((res) => res.json())) as AppConfig | null
        if (refreshed) {
          mockConfig = refreshed
          sessdata = mockConfig.sessdata.trim()
        }
      } catch {
        // 续期失败时继续用现有 Cookie 校验
      }
    }
    if (sessdata === 'mock-SESSDATA') {
      return { state: 'valid', message: '预览占位会话' }
    }
    try {
      const response = await fetch(`/bili-nav?sessdata=${encodeURIComponent(sessdata)}`)
      if (!response.ok) return { state: 'error', message: `验证登录失败：HTTP ${response.status}` }
      const json = (await response.json()) as {
        data?: { isLogin?: boolean; uname?: string; mid?: number }
      }
      if (json.data?.isLogin && json.data.mid) {
        return { state: 'valid', uname: json.data.uname, uid: json.data.mid }
      }
      return { state: 'invalid', message: '登录已失效，请重新扫码' }
    } catch {
      return { state: 'error', message: '无法验证登录状态' }
    }
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
