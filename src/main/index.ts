import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { loadConfig, saveConfig } from './config'
import { OverlayServer } from './server'
import { LiveClient, type SendGiftData } from './bilibili/client'
import { fetchGiftCatalog, resetLoginCache } from './bilibili/api'
import { generateQrLogin, pollQrLogin } from './bilibili/login'
import { checkForUpdates, getUpdateStatus, installUpdate, wireUpdater } from './updater'
import type {
  AppConfig,
  AppInfo,
  BoneSize,
  GiftEvent,
  GiftRule,
  RoomStatus
} from '../shared/types'

const rendererDir = join(import.meta.dirname, '../renderer')
const preloadFile =
  ['../preload/index.mjs', '../preload/index.js']
    .map((p) => join(import.meta.dirname, p))
    .find((p) => existsSync(p)) ?? join(import.meta.dirname, '../preload/index.js')
let win: BrowserWindow | null = null
let server: OverlayServer | null = null
let liveClient: LiveClient | null = null
let lastStatus: RoomStatus = { state: 'idle' }

function overlayUrl(): string {
  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) return `${devUrl.replace(/\/$/, '')}/overlay?ws=${server?.port ?? loadConfig().port}`
  return `http://127.0.0.1:${server?.port ?? loadConfig().port}/overlay`
}

function appInfo(): AppInfo {
  return {
    port: server?.port ?? loadConfig().port,
    overlayUrl: overlayUrl(),
    version: app.getVersion(),
    isDev: !app.isPackaged
  }
}

function createWindow(): void {
  win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 1060,
    minHeight: 700,
    show: false,
    backgroundColor: '#f4f1ea',
    autoHideMenuBar: true,
    title: 'BoneBowl',
    webPreferences: {
      preload: preloadFile,
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  win.once('ready-to-show', () => win?.show())
  win.on('closed', () => {
    win = null
  })

  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) void win.loadURL(devUrl)
  else void win.loadFile(join(rendererDir, 'index.html'))
}

function emitStatus(status: RoomStatus): void {
  lastStatus = status
  console.log(`[status] ${JSON.stringify(status)}`)
  win?.webContents.send('status', status)
}

function stopClient(): void {
  liveClient?.removeAllListeners()
  liveClient?.stop()
  liveClient = null
}

function startClient(opts: { roomId?: number | null; sessdata?: string } = {}): RoomStatus {
  const config = loadConfig()
  const roomId = opts.roomId ?? config.roomId
  const sessdata = (opts.sessdata ?? config.sessdata).trim()
  if (!roomId) {
    emitStatus({ state: 'error', message: '还没有填写直播间号' })
    return lastStatus
  }
  if (!sessdata) {
    emitStatus({ state: 'error', message: '连接直播间需要先扫码登录 B站账号' })
    return lastStatus
  }
  stopClient()
  const client = new LiveClient({ roomId, sessdata })
  liveClient = client
  client.on('status', emitStatus)
  client.on('gift', (data: SendGiftData) => handleGift(data))
  void client.start()
  return lastStatus
}

function handleGift(data: SendGiftData): void {
  const config = loadConfig()
  const rule = config.gifts.find((g) => g.enabled && g.giftId === data.giftId)
  if (!rule) return
  const count = Math.min(40, Math.max(1, Math.round(rule.bones * Math.max(1, data.num || 1))))
  const event: GiftEvent = {
    giftId: data.giftId,
    giftName: data.giftName || rule.name,
    uid: data.uid,
    uname: data.uname || '观众',
    num: data.num || 1,
    bones: count,
    size: rule.size,
    timestamp: data.timestamp ? data.timestamp * 1000 : Date.now()
  }
  server?.broadcast({ type: 'gift', gift: event })
  win?.webContents.send('gift', event)
}

function pickTestRule(): GiftRule {
  const config = loadConfig()
  const enabled = config.gifts.filter((g) => g.enabled)
  const size: BoneSize = 'medium'
  return enabled[0] ?? { id: 'test', giftId: 0, name: '测试骨头', bones: 1, size, enabled: true }
}

function sendTestGift(size?: BoneSize): void {
  const rule = pickTestRule()
  const event: GiftEvent = {
    giftId: rule.giftId,
    giftName: rule.name,
    uid: 0,
    uname: '测试观众',
    num: 1,
    bones: Math.max(1, rule.bones),
    size: size ?? rule.size,
    timestamp: Date.now()
  }
  server?.broadcast({ type: 'gift', gift: event })
  win?.webContents.send('gift', event)
}

function registerIpc(): void {
  ipcMain.handle('config:get', () => loadConfig())

  ipcMain.handle('config:save', async (_event, patch: Partial<AppConfig>) => {
    const before = loadConfig()
    const next = saveConfig(patch)
    if (patch.port && next.port !== before.port) {
      await restartServer(next.port)
    }
    server?.broadcast({
      type: 'config',
      config: { overlayScale: next.overlayScale, boneLifetimeSec: next.boneLifetimeSec }
    })
    win?.webContents.send('config', next)
    return next
  })

  ipcMain.handle('room:connect', (_event, opts?: { roomId?: number; sessdata?: string }) => {
    const config = saveConfig({
      ...(opts?.roomId ? { roomId: opts.roomId } : {}),
      ...(typeof opts?.sessdata === 'string' ? { sessdata: opts.sessdata } : {})
    })
    return startClient({ roomId: config.roomId, sessdata: config.sessdata })
  })

  ipcMain.handle('room:disconnect', () => {
    stopClient()
    emitStatus({ state: 'idle' })
    return lastStatus
  })

  ipcMain.handle('room:status', () => lastStatus)

  ipcMain.handle('gifts:fetch', async (_event, roomId: number) => {
    return fetchGiftCatalog(roomId, loadConfig().sessdata)
  })

  ipcMain.handle('test:gift', (_event, size?: BoneSize) => {
    sendTestGift(size)
  })

  ipcMain.handle('app:info', () => appInfo())

  ipcMain.handle('overlay:open', () => shell.openExternal(overlayUrl()))

  ipcMain.handle('external:open', (_event, url: string) => {
    if (/^https?:\/\//i.test(url)) return shell.openExternal(url)
    return Promise.resolve()
  })

  ipcMain.handle('login:qrcode', () => generateQrLogin())

  ipcMain.handle('login:poll', async (_event, key: string) => {
    const result = await pollQrLogin(key)
    if (result.state === 'success' && result.sessdata) {
      resetLoginCache()
      const next = saveConfig({ sessdata: result.sessdata })
      win?.webContents.send('config', next)
    }
    return result
  })

  ipcMain.handle('update:status', () => getUpdateStatus())
  ipcMain.handle('update:check', () => checkForUpdates())
  ipcMain.handle('update:install', () => {
    installUpdate()
  })
}

async function restartServer(port: number): Promise<void> {
  if (server) {
    await server.stop()
  }
  server = new OverlayServer(rendererDir)
  server.setConfigProvider(() => ({
    overlayScale: loadConfig().overlayScale,
    boneLifetimeSec: loadConfig().boneLifetimeSec
  }))
  const actual = await server.start(port)
  if (actual !== port) console.warn(`[server] 端口 ${port} 被占用，改用 ${actual}`)
}

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (win) {
      if (win.isMinimized()) win.restore()
      win.focus()
    }
  })

  app.whenReady().then(async () => {
    const config = loadConfig()
    await restartServer(config.port)
    createWindow()
    registerIpc()
    wireUpdater()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })

    if (config.autoConnect && config.roomId && config.sessdata) startClient({ roomId: config.roomId })

    if (config.autoUpdate && config.updateFeedUrl && app.isPackaged) {
      setTimeout(() => void checkForUpdates(), 4000)
    }
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })

  app.on('before-quit', () => {
    stopClient()
    void server?.stop()
  })
}
