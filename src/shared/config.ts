import { DEFAULT_CONFIG, type AppConfig } from './types'

const LEGACY_SIZE_SCALE: Record<string, number> = { small: 0.76, medium: 1, large: 1.34 }

function clampScale(value: number): number {
  return Math.min(2, Math.max(0.5, Math.round(value * 20) / 20))
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
        ? Math.min(300, Math.round(raw.boneLifetimeSec))
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
