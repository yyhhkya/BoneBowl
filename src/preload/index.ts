import { contextBridge, ipcRenderer, clipboard } from 'electron'
import type {
  AppConfig,
  BoneBowlAPI,
  GiftEvent,
  LoginCheck,
  QrLoginInfo,
  QrLoginPoll,
  RoomStatus
} from '../shared/types'

const api: BoneBowlAPI = {
  getConfig: () => ipcRenderer.invoke('config:get'),
  saveConfig: (patch: Partial<AppConfig>) => ipcRenderer.invoke('config:save', patch),
  connect: (opts) => ipcRenderer.invoke('room:connect', opts),
  disconnect: () => ipcRenderer.invoke('room:disconnect'),
  getStatus: () => ipcRenderer.invoke('room:status'),
  fetchGifts: (roomId: number) => ipcRenderer.invoke('gifts:fetch', roomId),
  testGift: (ruleId?: string) => ipcRenderer.invoke('test:gift', ruleId) as Promise<number>,
  getOverlayClients: () => ipcRenderer.invoke('overlay:clients') as Promise<number>,
  getInfo: () => ipcRenderer.invoke('app:info'),
  openOverlay: () => ipcRenderer.invoke('overlay:open'),
  openExternal: (url: string) => ipcRenderer.invoke('external:open', url),
  copyText: (text: string) => {
    clipboard.writeText(text)
    return Promise.resolve()
  },
  qrLogin: () => ipcRenderer.invoke('login:qrcode') as Promise<QrLoginInfo>,
  qrPoll: (key: string) => ipcRenderer.invoke('login:poll', key) as Promise<QrLoginPoll>,
  verifyLogin: () => ipcRenderer.invoke('login:verify') as Promise<LoginCheck>,
  onStatus: (cb: (status: RoomStatus) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, status: RoomStatus): void => cb(status)
    ipcRenderer.on('status', listener)
    return () => ipcRenderer.removeListener('status', listener)
  },
  onGift: (cb: (gift: GiftEvent) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, gift: GiftEvent): void => cb(gift)
    ipcRenderer.on('gift', listener)
    return () => ipcRenderer.removeListener('gift', listener)
  },
  onConfig: (cb: (config: AppConfig) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, config: AppConfig): void => cb(config)
    ipcRenderer.on('config', listener)
    return () => ipcRenderer.removeListener('config', listener)
  }
}

contextBridge.exposeInMainWorld('bonebowl', api)
