import QRCode from 'qrcode'
import type { LoginCheck, QrLoginInfo, QrLoginPoll } from '../../shared/types'

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'

const PASSPORT_HEADERS = {
  'User-Agent': UA,
  Referer: 'https://www.bilibili.com/',
  Origin: 'https://www.bilibili.com',
  Accept: 'application/json, text/plain, */*'
}

interface GenerateResponse {
  code: number
  message?: string
  data?: { url?: string; qrcode_key?: string }
}

interface PollResponse {
  code: number
  message?: string
  data?: { code?: number; message?: string; url?: string; timestamp?: number; refresh_token?: string }
}

export interface QrLoginResult extends QrLoginPoll {
  biliJct?: string
  refreshToken?: string
}

function readSetCookies(response: Response): string[] {
  const headers = response.headers as unknown as { getSetCookie?: () => string[] }
  if (typeof headers.getSetCookie === 'function') return headers.getSetCookie()
  const single = response.headers.get('set-cookie')
  return single ? [single] : []
}

export async function generateQrLogin(): Promise<QrLoginInfo> {
  const response = await fetch(
    'https://passport.bilibili.com/x/passport-login/web/qrcode/generate',
    { headers: PASSPORT_HEADERS }
  )
  if (!response.ok) throw new Error(`获取二维码失败：HTTP ${response.status}`)
  const json = (await response.json()) as GenerateResponse
  const url = json.data?.url
  const key = json.data?.qrcode_key
  if (json.code !== 0 || !url || !key) {
    throw new Error(`获取二维码失败：${json.message && json.message !== '0' ? json.message : `code ${json.code}`}`)
  }
  const image = await QRCode.toDataURL(url, {
    margin: 1,
    width: 360,
    color: { dark: '#3a2f1f', light: '#fffdf4' }
  })
  return { key, image, expiresIn: 180 }
}

/** 用 nav 接口在线校验 SESSDATA 是否仍然有效 */
export async function verifyLogin(sessdata: string): Promise<LoginCheck> {
  const s = sessdata.trim()
  if (!s) return { state: 'none', message: '还没有登录' }
  try {
    const response = await fetch('https://api.bilibili.com/x/web-interface/nav', {
      headers: { ...PASSPORT_HEADERS, Cookie: `SESSDATA=${s}` },
      signal: AbortSignal.timeout(8000)
    })
    if (!response.ok) {
      return { state: 'error', message: `验证登录失败：HTTP ${response.status}` }
    }
    const json = (await response.json()) as {
      data?: { isLogin?: boolean; uname?: string; mid?: number }
    }
    if (json.data?.isLogin && json.data.mid) {
      return { state: 'valid', uname: json.data.uname, uid: json.data.mid }
    }
    return { state: 'invalid', message: '登录已失效，请重新扫码' }
  } catch (error) {
    return { state: 'error', message: error instanceof Error ? error.message : '无法验证登录状态' }
  }
}

export async function pollQrLogin(key: string): Promise<QrLoginResult> {
  const response = await fetch(
    `https://passport.bilibili.com/x/passport-login/web/qrcode/poll?qrcode_key=${encodeURIComponent(key)}`,
    { headers: PASSPORT_HEADERS }
  )
  if (!response.ok) return { state: 'error', message: `轮询失败：HTTP ${response.status}` }
  const json = (await response.json()) as PollResponse
  if (json.code !== 0) {
    return { state: 'error', message: `轮询失败：${json.message ?? `code ${json.code}`}` }
  }
  const status = json.data?.code
  if (status === 86101) return { state: 'waiting', message: '等待扫码' }
  if (status === 86090) return { state: 'scanned', message: '已扫码，在手机上确认' }
  if (status === 86038) return { state: 'expired', message: '二维码已过期' }
  if (status !== 0) return { state: 'error', message: json.data?.message || `未知状态 ${status}` }

  const cookies = readSetCookies(response)
  let sessdata = ''
  let biliJct = ''
  for (const cookie of cookies) {
    const first = cookie.split(';')[0]?.trim() ?? ''
    if (first.startsWith('SESSDATA=')) {
      sessdata = first.slice('SESSDATA='.length)
    } else if (first.startsWith('bili_jct=')) {
      biliJct = first.slice('bili_jct='.length)
    }
  }
  if (!sessdata) return { state: 'error', message: '登录成功，但没有取到 SESSDATA' }
  const check = await verifyLogin(sessdata)
  if (check.state === 'invalid') {
    return { state: 'error', message: '登录校验未通过，请重新扫码' }
  }
  return {
    state: 'success',
    sessdata,
    uname: check.uname,
    uid: check.uid,
    biliJct,
    refreshToken: json.data?.refresh_token ?? ''
  }
}
