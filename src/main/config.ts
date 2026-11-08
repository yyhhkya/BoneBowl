import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { DEFAULT_CONFIG, type AppConfig } from '../shared/types'

let cached: AppConfig | null = null

function configPath(): string {
  return join(app.getPath('userData'), 'config.json')
}

function normalize(raw: Partial<AppConfig>): AppConfig {
  return {
    roomId: typeof raw.roomId === 'number' && raw.roomId > 0 ? raw.roomId : null,
    sessdata: typeof raw.sessdata === 'string' ? raw.sessdata.trim() : '',
    autoConnect: raw.autoConnect === true,
    port: Number.isInteger(raw.port) && raw.port! >= 1024 && raw.port! <= 65535 ? raw.port! : DEFAULT_CONFIG.port,
    overlayScale: typeof raw.overlayScale === 'number' && raw.overlayScale > 0 ? raw.overlayScale : 1,
    boneLifetimeSec:
      typeof raw.boneLifetimeSec === 'number' && raw.boneLifetimeSec > 0
        ? Math.min(300, Math.round(raw.boneLifetimeSec))
        : 0,
    gifts: Array.isArray(raw.gifts)
      ? raw.gifts
          .filter((g): g is AppConfig['gifts'][number] => !!g && typeof g.giftId === 'number')
          .map((g) => ({
            id: String(g.id || `rule-${g.giftId}-${Math.random().toString(36).slice(2, 8)}`),
            giftId: Number(g.giftId),
            name: typeof g.name === 'string' && g.name ? g.name : `礼物 ${g.giftId}`,
            bones: Math.min(50, Math.max(1, Math.round(Number(g.bones) || 1))),
            size: g.size === 'small' || g.size === 'medium' || g.size === 'large' ? g.size : 'medium',
            enabled: g.enabled !== false
          }))
      : DEFAULT_CONFIG.gifts
  }
}

export function loadConfig(): AppConfig {
  if (cached) return cached
  try {
    if (existsSync(configPath())) {
      cached = normalize(JSON.parse(readFileSync(configPath(), 'utf8')) as Partial<AppConfig>)
      return cached
    }
  } catch (error) {
    console.error('[config] read failed, using defaults', error)
  }
  cached = normalize(DEFAULT_CONFIG)
  return cached
}

export function saveConfig(patch: Partial<AppConfig>): AppConfig {
  const next = normalize({ ...loadConfig(), ...patch })
  cached = next
  const file = configPath()
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, JSON.stringify(next, null, 2), 'utf8')
  return next
}
