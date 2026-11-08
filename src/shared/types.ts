export interface GiftRule {
  id: string
  giftId: number
  name: string
  bones: number
  /** 骨头大小倍率，0.5–2.0 */
  scale: number
  enabled: boolean
}

export interface AppConfig {
  roomId: number | null
  sessdata: string
  biliJct: string
  refreshToken: string
  autoConnect: boolean
  port: number
  boneLifetimeSec: number
  gifts: GiftRule[]
}

export interface GiftEvent {
  giftId: number
  giftName: string
  uid: number
  uname: string
  num: number
  bones: number
  scale: number
  timestamp: number
}

export type RoomStatus =
  | { state: 'idle' }
  | { state: 'connecting'; roomId: number }
  | { state: 'connected'; roomId: number; realRoomId: number }
  | { state: 'error'; message: string }

export interface GiftCatalogItem {
  id: number
  name: string
  price: number
  coinType: string
  image?: string
}

export interface AppInfo {
  port: number
  overlayUrl: string
  version: string
  isDev: boolean
}

export interface QrLoginInfo {
  key: string
  image: string
  expiresIn: number
}

export type QrLoginState = 'waiting' | 'scanned' | 'success' | 'expired' | 'error'

export interface QrLoginPoll {
  state: QrLoginState
  message?: string
  sessdata?: string
  uname?: string
  uid?: number
}

export type LoginCheckState = 'none' | 'checking' | 'valid' | 'invalid' | 'error'

export interface LoginCheck {
  state: LoginCheckState
  uname?: string
  uid?: number
  message?: string
}

export interface BoneBowlAPI {
  getConfig: () => Promise<AppConfig>
  saveConfig: (patch: Partial<AppConfig>) => Promise<AppConfig>
  connect: (opts?: { roomId?: number; sessdata?: string }) => Promise<RoomStatus>
  disconnect: () => Promise<RoomStatus>
  getStatus: () => Promise<RoomStatus>
  fetchGifts: (roomId: number) => Promise<GiftCatalogItem[]>
  testGift: (ruleId?: string) => Promise<number>
  getOverlayClients: () => Promise<number>
  getInfo: () => Promise<AppInfo>
  openOverlay: () => Promise<void>
  openExternal: (url: string) => Promise<void>
  copyText: (text: string) => Promise<void>
  minimizeWindow: () => void
  closeWindow: () => void
  qrLogin: () => Promise<QrLoginInfo>
  qrPoll: (key: string) => Promise<QrLoginPoll>
  verifyLogin: () => Promise<LoginCheck>
  onStatus: (cb: (status: RoomStatus) => void) => () => void
  onGift: (cb: (gift: GiftEvent) => void) => () => void
  onConfig: (cb: (config: AppConfig) => void) => () => void
}

export const DEFAULT_CONFIG: AppConfig = {
  roomId: null,
  sessdata: '',
  biliJct: '',
  refreshToken: '',
  autoConnect: false,
  port: 17800,
  boneLifetimeSec: 0,
  gifts: []
}
