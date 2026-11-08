import { constants, createPublicKey, publicEncrypt } from 'node:crypto'
import type { AppConfig } from '../../shared/types'

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'
const REFERER = 'https://www.bilibili.com/'

// 官方 Web 端 Cookie 刷新使用的 RSA 公钥（JWK 形式）
const PUBLIC_KEY = createPublicKey({
  key: {
    kty: 'RSA',
    n: 'y4HdjgJHBlbaBN04VERG4qNBIFHP6a3GozCl75AihQloSWCXC5HDNgyinEnhaQ_4-gaMud_GF50elYXLlCToR9se9Z8z433U3KjM-3Yx7ptKkmQNAMggQwAVKgq3zYAoidNEWuxpkY_mAitTSRLnsJW-NCTa0bqBFF6Wm1MxgfE',
    e: 'AQAB'
  },
  format: 'jwk'
})

type Session = Pick<AppConfig, 'sessdata' | 'biliJct' | 'refreshToken'>

function cookieHeader(session: Pick<AppConfig, 'sessdata' | 'biliJct'>): string {
  const parts = [`SESSDATA=${session.sessdata}`]
  if (session.biliJct) parts.push(`bili_jct=${session.biliJct}`)
  return parts.join('; ')
}

function readSetCookies(response: Response): string[] {
  const headers = response.headers as unknown as { getSetCookie?: () => string[] }
  if (typeof headers.getSetCookie === 'function') return headers.getSetCookie()
  const single = response.headers.get('set-cookie')
  return single ? [single] : []
}

function cookieValue(response: Response, name: string): string {
  for (const cookie of readSetCookies(response)) {
    const first = cookie.split(';')[0]?.trim() ?? ''
    if (first.startsWith(`${name}=`)) return first.slice(name.length + 1)
  }
  return ''
}

/** 用 RSA-OAEP(SHA-256) 加密 refresh_<timestamp>，得到 correspondPath */
export function correspondPath(timestamp: number): string {
  const encrypted = publicEncrypt(
    { key: PUBLIC_KEY, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
    Buffer.from(`refresh_${timestamp}`, 'utf8')
  )
  return encrypted.toString('hex')
}

interface CookieInfoResponse {
  code?: number
  data?: { refresh?: boolean; timestamp?: number }
}

interface RefreshResponse {
  code?: number
  data?: { refresh_token?: string }
}

/**
 * 按官方流程续期 Cookie：
 * cookie/info 检查 → correspond 取 refresh_csrf → cookie/refresh → confirm/refresh
 * 返回新的凭证；不需要续期、缺少凭证或失败时返回 null。
 */
export async function refreshLoginIfNeeded(session: Session): Promise<Session | null> {
  const sessdata = session.sessdata.trim()
  const biliJct = session.biliJct.trim()
  const refreshToken = session.refreshToken.trim()
  if (!sessdata || !biliJct || !refreshToken) return null

  const headers = {
    'User-Agent': UA,
    Referer: REFERER,
    Cookie: cookieHeader({ sessdata, biliJct })
  }

  try {
    const infoResponse = await fetch(
      `https://passport.bilibili.com/x/passport-login/web/cookie/info?csrf=${encodeURIComponent(biliJct)}`,
      { headers, signal: AbortSignal.timeout(8000) }
    )
    if (!infoResponse.ok) return null
    const info = (await infoResponse.json()) as CookieInfoResponse
    if (info.code !== 0 || !info.data?.refresh) return null

    const path = correspondPath(Number(info.data.timestamp) || Date.now())
    const csrfResponse = await fetch(`https://www.bilibili.com/correspond/1/${path}`, {
      headers,
      signal: AbortSignal.timeout(8000)
    })
    if (!csrfResponse.ok) return null
    const html = await csrfResponse.text()
    const match = html.match(/<div[^>]*id="1-name"[^>]*>([^<]+)<\/div>/)
    const refreshCsrf = match?.[1]?.trim() ?? ''
    if (!refreshCsrf) return null

    const refreshResponse = await fetch(
      'https://passport.bilibili.com/x/passport-login/web/cookie/refresh',
      {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          csrf: biliJct,
          refresh_csrf: refreshCsrf,
          source: 'main_web',
          refresh_token: refreshToken
        }),
        signal: AbortSignal.timeout(8000)
      }
    )
    if (!refreshResponse.ok) return null
    const refreshed = (await refreshResponse.json()) as RefreshResponse
    if (refreshed.code !== 0 || !refreshed.data?.refresh_token) return null

    const nextSessdata = cookieValue(refreshResponse, 'SESSDATA') || sessdata
    const nextBiliJct = cookieValue(refreshResponse, 'bili_jct') || biliJct
    const nextRefreshToken = refreshed.data.refresh_token

    // 用新 Cookie 和旧 refresh_token 确认，让旧令牌失效
    try {
      await fetch('https://passport.bilibili.com/x/passport-login/web/confirm/refresh', {
        method: 'POST',
        headers: {
          'User-Agent': UA,
          Referer: REFERER,
          Cookie: cookieHeader({ sessdata: nextSessdata, biliJct: nextBiliJct }),
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({ csrf: nextBiliJct, refresh_token: refreshToken }),
        signal: AbortSignal.timeout(8000)
      })
    } catch {
      // 确认失败不阻断新凭证保存
    }

    return { sessdata: nextSessdata, biliJct: nextBiliJct, refreshToken: nextRefreshToken }
  } catch (error) {
    console.warn('[bili] Cookie 续期失败', error)
    return null
  }
}
