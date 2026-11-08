import { keysFromNav, signWbi, type WbiKeys } from './wbi'
import type { GiftCatalogItem } from '../../shared/types'

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'
const REFERER = 'https://live.bilibili.com/'

interface BiliResponse<T> {
  code: number
  message?: string
  msg?: string
  data?: T
}

let keyCache: { keys: WbiKeys; at: number } | null = null
let buvidCache: { b3: string; b4: string; at: number } | null = null

function cookieHeader(sessdata: string, buvid: string): string {
  const parts: string[] = []
  const s = sessdata.trim()
  if (s) parts.push(s.includes('=') ? s : `SESSDATA=${s}`)
  if (buvid) parts.push(buvid)
  return parts.join('; ')
}

async function biliFetch<T>(url: string, cookie = ''): Promise<BiliResponse<T>> {
  const response = await fetch(url, {
    headers: {
      'User-Agent': UA,
      Referer: REFERER,
      Origin: 'https://live.bilibili.com',
      Accept: 'application/json, text/plain, */*',
      ...(cookie ? { Cookie: cookie } : {})
    }
  })
  if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`)
  return (await response.json()) as BiliResponse<T>
}

async function getBuvid(): Promise<string> {
  if (buvidCache && Date.now() - buvidCache.at < 6 * 3600_000) {
    return `buvid3=${buvidCache.b3}; buvid4=${buvidCache.b4}`
  }
  try {
    const json = await biliFetch<{ b_3?: string; b_4?: string }>(
      'https://api.bilibili.com/x/frontend/finger/spi'
    )
    const b3 = json.data?.b_3
    const b4 = json.data?.b_4
    if (b3 && b4) {
      buvidCache = { b3, b4, at: Date.now() }
      return `buvid3=${b3}; buvid4=${b4}`
    }
  } catch (error) {
    console.warn('[bili] buvid 获取失败', error)
  }
  return ''
}

export async function getWbiKeys(sessdata: string): Promise<WbiKeys> {
  if (keyCache && Date.now() - keyCache.at < 6 * 3600_000) return keyCache.keys
  const buvid = await getBuvid()
  const json = await biliFetch<{ wbi_img?: { img_url?: string; sub_url?: string }; mid?: number }>(
    'https://api.bilibili.com/x/web-interface/nav',
    cookieHeader(sessdata, buvid)
  )
  const keys = keysFromNav(json.data ?? {})
  keyCache = { keys, at: Date.now() }
  if (json.data?.mid) loginUidCache = { uid: json.data.mid, at: Date.now(), withCookie: !!sessdata }
  return keys
}

let loginUidCache: { uid: number; at: number; withCookie: boolean } | null = null

/** 扫码登录成功后清掉匿名阶段的 UID 缓存 */
export function resetLoginCache(): void {
  loginUidCache = null
}

async function getLoginUid(sessdata: string): Promise<number> {
  if (!sessdata) return 0
  if (loginUidCache && loginUidCache.withCookie && Date.now() - loginUidCache.at < 10 * 60_000) {
    return loginUidCache.uid
  }
  const buvid = await getBuvid()
  try {
    const json = await biliFetch<{ mid?: number }>(
      'https://api.bilibili.com/x/web-interface/nav',
      cookieHeader(sessdata, buvid)
    )
    const uid = json.data?.mid ?? 0
    loginUidCache = { uid, at: Date.now(), withCookie: true }
    return uid
  } catch (error) {
    console.warn('[bili] 获取登录 UID 失败', error)
    return 0
  }
}

export interface RoomInit {
  roomId: number
  shortId: number
  uid: number
}

export async function getRealRoomId(shortId: number): Promise<RoomInit> {
  const json = await biliFetch<{ room_id: number; short_id: number; uid: number }>(
    `https://api.live.bilibili.com/room/v1/Room/room_init?id=${encodeURIComponent(String(shortId))}`
  )
  if (json.code !== 0 || !json.data?.room_id) {
    throw new Error(`直播间 ${shortId} 无效${json.code === 60004 ? '（不存在）' : `（code ${json.code}）`}`)
  }
  return { roomId: json.data.room_id, shortId: json.data.short_id, uid: json.data.uid }
}

export interface DanmuInfo {
  token: string
  hosts: { host: string; wssPort: number }[]
  uid: number
}

export async function getDanmuInfo(realRoomId: number, sessdata: string): Promise<DanmuInfo> {
  const keys = await getWbiKeys(sessdata)
  const buvid = await getBuvid()
  const signed = signWbi({ id: realRoomId, type: 0, web_location: '444.8' }, keys)
  const query = Object.entries(signed)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&')
  const json = await biliFetch<{
    token: string
    host_list: { host: string; wss_port: number }[]
  }>(
    `https://api.live.bilibili.com/xlive/web-room/v1/index/getDanmuInfo?${query}`,
    cookieHeader(sessdata, buvid)
  )
  if (json.code !== 0 || !json.data?.token) {
    const message = json.message && json.message !== '0' ? json.message : `code ${json.code}`
    throw new Error(`获取连接密钥失败（${message}）`)
  }
  const hosts = (json.data.host_list ?? []).map((h) => ({ host: h.host, wssPort: h.wss_port || 443 }))
  if (!hosts.length) throw new Error('没有可用的弹幕服务器')
  const uid = await getLoginUid(sessdata)
  return { token: json.data.token, hosts, uid }
}

interface GiftListEntry {
  id: number
  name: string
  price?: number
  coin_type?: string
  coinType?: string
}

export async function fetchGiftCatalog(shortRoomId: number, sessdata: string): Promise<GiftCatalogItem[]> {
  const room = await getRealRoomId(shortRoomId)
  const buvid = await getBuvid()
  const json = await biliFetch<{
    gift_config?: { base_config?: { list?: GiftListEntry[] } }
    gift_data?: {
      room_gift_list?: { gold_list?: GiftListEntry[]; silver_list?: GiftListEntry[] }
    }
  }>(
    `https://api.live.bilibili.com/xlive/web-room/v1/giftPanel/roomGiftList?platform=web&room_id=${room.roomId}`,
    cookieHeader(sessdata, buvid)
  )
  const base = json.data?.gift_config?.base_config?.list ?? []
  const roomGifts = json.data?.gift_data?.room_gift_list
  const combined = base.length
    ? base
    : [...(roomGifts?.gold_list ?? []), ...(roomGifts?.silver_list ?? [])]
  if (combined.length === 0) {
    throw new Error('没有取到礼物列表，填写 SESSDATA 后重试，或手动添加礼物 ID')
  }
  return combined
    .filter((item) => Number.isFinite(item.id))
    .map((item) => ({
      id: item.id,
      name: item.name || `礼物 ${item.id}`,
      price: item.price ?? 0,
      coinType: item.coin_type ?? item.coinType ?? ''
    }))
}
