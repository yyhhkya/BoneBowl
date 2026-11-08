export type BoneSize = 'small' | 'medium' | 'large'

export interface GiftRule {
  id: string
  giftId: number
  name: string
  bones: number
  size: BoneSize
  enabled: boolean
}

export interface AppConfig {
  roomId: number | null
  sessdata: string
  autoConnect: boolean
  port: number
  overlayScale: number
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
  size: BoneSize
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
  testGift: (size?: BoneSize) => Promise<void>
  getInfo: () => Promise<AppInfo>
  openOverlay: () => Promise<void>
  openExternal: (url: string) => Promise<void>
  copyText: (text: string) => Promise<void>
  qrLogin: () => Promise<QrLoginInfo>
  qrPoll: (key: string) => Promise<QrLoginPoll>
  verifyLogin: () => Promise<LoginCheck>
  onStatus: (cb: (status: RoomStatus) => void) => () => void
  onGift: (cb: (gift: GiftEvent) => void) => () => void
  onConfig: (cb: (config: AppConfig) => void) => () => void
}

export const SIZES: BoneSize[] = ['small', 'medium', 'large']

export const SIZE_LABEL: Record<BoneSize, string> = {
  small: '小',
  medium: '中',
  large: '大'
}

export const DEFAULT_CONFIG: AppConfig = {
  roomId: null,
  sessdata: '',
  autoConnect: false,
  port: 17800,
  overlayScale: 1,
  boneLifetimeSec: 0,
  gifts: []
}
