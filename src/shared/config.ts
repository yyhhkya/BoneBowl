import { copyFileSync, existsSync } from 'node:fs'
import { DEFAULT_CONFIG, type AppConfig } from './types'

/** 允许用环境变量把配置指到临时文件，测试时不要动真实配置 */
export function resolveConfigPath(defaultPath: string): string {
  const override = process.env.BONEBOWL_CONFIG_PATH?.trim()
  return override || defaultPath
}

/** 写配置前保留上一版，误操作时可以手工恢复 config.json.bak */
export function backupConfigFile(file: string): void {
  try {
    if (!existsSync(file)) return
    copyFileSync(file, `${file}.bak`)
  } catch (error) {
    console.warn('[config] 备份失败', error)
  }
}

const LEGACY_SIZE_SCALE: Record<string, number> = { small: 0.76, medium: 1, large: 1.34 }

function clampScale(value: number): number {
  return Math.min(5, Math.max(0.5, Math.round(value * 20) / 20))
}

/** 主进程与 dev 预览共用的配置归一化 */
export function normalizeConfig(raw: Partial<AppConfig>): AppConfig {
  return {
    roomId: typeof raw.roomId === 'number' && raw.roomId > 0 ? raw.roomId : null,
    sessdata: typeof raw.sessdata === 'string' ? raw.sessdata.trim() : '',
    biliJct: typeof raw.biliJct === 'string' ? raw.biliJct.trim() : '',
    refreshToken: typeof raw.refreshToken === 'string' ? raw.refreshToken.trim() : '',
    autoConnect: raw.autoConnect === true,
    port: Number.isInteger(raw.port) && raw.port! >= 1024 && raw.port! <= 65535 ? raw.port! : DEFAULT_CONFIG.port,
    boneLifetimeSec:
      typeof raw.boneLifetimeSec === 'number' && raw.boneLifetimeSec > 0
        ? Math.min(3600, Math.round(raw.boneLifetimeSec))
        : 0,
    gifts: Array.isArray(raw.gifts)
      ? raw.gifts
          .filter((g): g is AppConfig['gifts'][number] => !!g && typeof g.giftId === 'number')
          .map((g) => {
            const legacy = g as unknown as { size?: string }
            const scale =
              typeof g.scale === 'number'
                ? g.scale
                : (LEGACY_SIZE_SCALE[legacy.size ?? ''] ?? 1)
            return {
              id: String(g.id || `rule-${g.giftId}-${Math.random().toString(36).slice(2, 8)}`),
              giftId: Number(g.giftId),
              name: typeof g.name === 'string' && g.name ? g.name : `礼物 ${g.giftId}`,
              bones: Math.min(50, Math.max(1, Math.round(Number(g.bones) || 1))),
              scale: clampScale(scale),
              enabled: g.enabled !== false
            }
          })
      : DEFAULT_CONFIG.gifts
  }
}
