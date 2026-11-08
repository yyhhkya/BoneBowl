import QRCode from 'qrcode'
import type { QrLoginInfo, QrLoginPoll } from '../../shared/types'

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
  data?: { code?: number; message?: string; url?: string; timestamp?: number }
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

async function fetchProfile(sessdata: string): Promise<{ uname?: string; uid?: number }> {
  try {
    const response = await fetch('https://api.bilibili.com/x/web-interface/nav', {
      headers: {
        'User-Agent': UA,
        Referer: 'https://www.bilibili.com/',
        Cookie: `SESSDATA=${sessdata}`
      }
    })
    const json = (await response.json()) as { data?: { uname?: string; mid?: number } }
    return { uname: json.data?.uname, uid: json.data?.mid }
  } catch {
    return {}
  }
}

export async function pollQrLogin(key: string): Promise<QrLoginPoll> {
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
  for (const cookie of cookies) {
    const first = cookie.split(';')[0]?.trim() ?? ''
    if (first.startsWith('SESSDATA=')) {
      sessdata = first.slice('SESSDATA='.length)
      break
    }
  }
  if (!sessdata) return { state: 'error', message: '登录成功，但没有取到 SESSDATA' }
  const profile = await fetchProfile(sessdata)
  return { state: 'success', sessdata, uname: profile.uname, uid: profile.uid }
}
