import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { normalizeConfig } from '../shared/config'
import { DEFAULT_CONFIG, type AppConfig } from '../shared/types'

let cached: AppConfig | null = null

function configPath(): string {
  return join(app.getPath('userData'), 'config.json')
}

export function loadConfig(): AppConfig {
  if (cached) return cached
  try {
    if (existsSync(configPath())) {
      cached = normalizeConfig(JSON.parse(readFileSync(configPath(), 'utf8')) as Partial<AppConfig>)
      return cached
    }
  } catch (error) {
    console.error('[config] read failed, using defaults', error)
  }
  cached = normalizeConfig(DEFAULT_CONFIG)
  return cached
}

export function saveConfig(patch: Partial<AppConfig>): AppConfig {
  const next = normalizeConfig({ ...loadConfig(), ...patch })
  cached = next
  const file = configPath()
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, JSON.stringify(next, null, 2), 'utf8')
  return next
}
