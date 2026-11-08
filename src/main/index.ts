import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { loadConfig, saveConfig } from './config'
import { OverlayServer } from './server'
import { LiveClient, type SendGiftData } from './bilibili/client'
import { fetchGiftCatalog, resetLoginCache } from './bilibili/api'
import { generateQrLogin, pollQrLogin, verifyLogin } from './bilibili/login'
import { refreshLoginIfNeeded } from './bilibili/refresh'
import type {
  AppConfig,
  AppInfo,
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
  // startClient 与 LiveClient 都会报告 connecting，同一状态只广播一次
  if (JSON.stringify(status) === JSON.stringify(lastStatus)) return
  lastStatus = status
  console.log(`[status] ${JSON.stringify(status)}`)
  win?.webContents.send('status', status)
}

function stopClient(): void {
  liveClient?.removeAllListeners()
  liveClient?.stop()
  liveClient = null
}

async function refreshSessionIfNeeded(): Promise<AppConfig> {
  const current = loadConfig()
  const refreshed = await refreshLoginIfNeeded(current)
  return refreshed ? saveConfig(refreshed) : current
}

async function startClient(opts: { roomId?: number | null; sessdata?: string } = {}): Promise<RoomStatus> {
  const config = await refreshSessionIfNeeded()
  const roomId = opts.roomId ?? config.roomId
  const sessdata = (config.sessdata || opts.sessdata || '').trim()
  if (!roomId) {
    emitStatus({ state: 'error', message: '还没有填写直播间号' })
    return lastStatus
  }
  if (!sessdata) {
    emitStatus({ state: 'error', message: '连接直播间需要先扫码登录 B站账号' })
    return lastStatus
  }
  emitStatus({ state: 'connecting', roomId })
  const check = await verifyLogin(sessdata)
  if (check.state === 'invalid') {
    emitStatus({ state: 'error', message: '登录已失效，请重新扫码登录' })
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
  const giftName = (data.giftName || '').trim()
  if (!giftName) return
  // B站同一礼物存在多个 ID，映射只按礼物名称匹配
  const rule = config.gifts.find((g) => g.enabled && g.name.trim() === giftName)
  if (!rule) return
  const count = Math.min(40, Math.max(1, Math.round(rule.bones * Math.max(1, data.num || 1))))
  const event: GiftEvent = {
    giftId: data.giftId,
    giftName: data.giftName || rule.name,
    uid: data.uid,
    uname: data.uname || '观众',
    num: data.num || 1,
    bones: count,
    scale: rule.scale,
    timestamp: data.timestamp ? data.timestamp * 1000 : Date.now()
  }
  server?.broadcast({ type: 'gift', gift: event })
  win?.webContents.send('gift', event)
}

function pickTestRule(ruleId?: string): GiftRule {
  const config = loadConfig()
  if (ruleId) {
    const matched = config.gifts.find((g) => g.id === ruleId)
    if (matched) return matched
  }
  const enabled = config.gifts.filter((g) => g.enabled)
  return enabled[0] ?? { id: 'test', giftId: 0, name: '测试骨头', bones: 1, scale: 1, enabled: true }
}

function sendTestGift(ruleId?: string): number {
  const rule = pickTestRule(ruleId)
  const event: GiftEvent = {
    giftId: rule.giftId,
    giftName: rule.name,
    uid: 0,
    uname: '测试观众',
    num: 1,
    bones: Math.max(1, rule.bones),
    scale: rule.scale,
    timestamp: Date.now()
  }
  const sent = server?.broadcast({ type: 'gift', gift: event }) ?? 0
  console.log(`[test] 试投 ${event.giftName}，叠加层连接数 ${sent}`)
  win?.webContents.send('gift', event)
  return sent
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
      config: { boneLifetimeSec: next.boneLifetimeSec }
    })
    win?.webContents.send('config', next)
    return next
  })

  ipcMain.handle('room:connect', async (_event, opts?: { roomId?: number; sessdata?: string }) => {
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

  ipcMain.handle('test:gift', (_event, ruleId?: string) => {
    return sendTestGift(ruleId)
  })

  ipcMain.handle('overlay:clients', () => server?.clientCount() ?? 0)

  ipcMain.handle('app:info', () => appInfo())

  ipcMain.handle('overlay:open', () => shell.openExternal(overlayUrl()))

  ipcMain.handle('external:open', (_event, url: string) => {
    if (/^https?:\/\//i.test(url)) return shell.openExternal(url)
    return Promise.resolve()
  })

  ipcMain.handle('login:qrcode', () => generateQrLogin())

  ipcMain.handle('login:verify', async () => {
    const config = await refreshSessionIfNeeded()
    return verifyLogin(config.sessdata)
  })

  ipcMain.handle('login:poll', async (_event, key: string) => {
    const result = await pollQrLogin(key)
    if (result.state === 'success' && result.sessdata) {
      resetLoginCache()
      const next = saveConfig({
        sessdata: result.sessdata,
        ...(result.biliJct ? { biliJct: result.biliJct } : {}),
        ...(result.refreshToken ? { refreshToken: result.refreshToken } : {})
      })
      win?.webContents.send('config', next)
    }
    return {
      state: result.state,
      message: result.message,
      sessdata: result.sessdata,
      uname: result.uname,
      uid: result.uid
    }
  })
}

async function restartServer(port: number): Promise<void> {
  if (server) {
    await server.stop()
  }
  server = new OverlayServer(rendererDir)
  server.setConfigProvider(() => ({
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
    registerIpc()
    createWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })

    if (config.autoConnect) {
      if (!config.roomId) {
        console.log('[auto] 已开启自动连接，但没有填写直播间号')
      } else if (!config.sessdata) {
        console.log('[auto] 已开启自动连接，但没有登录 B站账号')
      } else {
        console.log(`[auto] 自动连接直播间 ${config.roomId}`)
        void startClient({ roomId: config.roomId })
      }
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
