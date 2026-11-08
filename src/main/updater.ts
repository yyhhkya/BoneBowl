import { app, BrowserWindow } from 'electron'
import electronUpdater from 'electron-updater'
import { loadConfig } from './config'
import type { UpdateStatus } from '../shared/types'

const { autoUpdater } = electronUpdater

let status: UpdateStatus = { state: 'idle' }
let wired = false

function emit(next: UpdateStatus): void {
  status = next
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('update:status', status)
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function wireUpdater(): void {
  if (wired) return
  wired = true
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.on('checking-for-update', () => emit({ state: 'checking', message: '正在检查更新' }))
  autoUpdater.on('update-available', (info) =>
    emit({ state: 'available', message: `发现新版本 ${info.version}`, version: info.version })
  )
  autoUpdater.on('update-not-available', () => emit({ state: 'none', message: '已是最新版本' }))
  autoUpdater.on('download-progress', (progress) =>
    emit({
      state: 'downloading',
      percent: Math.round(progress.percent),
      message: `下载中 ${Math.round(progress.percent)}%`
    })
  )
  autoUpdater.on('update-downloaded', (info) =>
    emit({ state: 'ready', version: info.version, message: '下载完成，重启后安装' })
  )
  autoUpdater.on('error', (error) => emit({ state: 'error', message: errorMessage(error) }))
}

export function getUpdateStatus(): UpdateStatus {
  return status
}

export async function checkForUpdates(): Promise<UpdateStatus> {
  if (!app.isPackaged) {
    emit({ state: 'dev', message: '开发模式不检查更新' })
    return status
  }
  wireUpdater()
  const url = loadConfig().updateFeedUrl.trim()
  if (!url) {
    emit({ state: 'error', message: '还没有填写更新源地址' })
    return status
  }
  try {
    autoUpdater.setFeedURL({ provider: 'generic', url })
    emit({ state: 'checking', message: '正在检查更新' })
    await autoUpdater.checkForUpdates()
  } catch (error) {
    emit({ state: 'error', message: errorMessage(error) })
  }
  return status
}

export function installUpdate(): void {
  if (status.state === 'ready') autoUpdater.quitAndInstall()
}
