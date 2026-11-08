import { createHash } from 'node:crypto'

/** 官方文档 Wbi 重排表，见 bilibili-API-collect/docs/misc/sign/wbi.md */
const MIXIN_KEY_ENC_TAB = [
  46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49, 33, 9, 42, 19, 29,
  28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40, 61, 26, 17, 0, 1, 60, 51, 30, 4, 22, 25,
  54, 21, 56, 59, 6, 63, 57, 62, 11, 36, 20, 34, 44, 52
]

export interface WbiKeys {
  imgKey: string
  subKey: string
}

function fileNameKey(url: string): string {
  const name = url.slice(url.lastIndexOf('/') + 1)
  return name.split('.')[0]
}

export function keysFromNav(data: { wbi_img?: { img_url?: string; sub_url?: string } }): WbiKeys {
  const img = data?.wbi_img?.img_url ?? ''
  const sub = data?.wbi_img?.sub_url ?? ''
  if (!img || !sub) throw new Error('nav 接口没有返回 wbi_img')
  return { imgKey: fileNameKey(img), subKey: fileNameKey(sub) }
}

export function getMixinKey(keys: WbiKeys): string {
  const raw = keys.imgKey + keys.subKey
  return MIXIN_KEY_ENC_TAB.map((i) => raw[i] ?? '').join('').slice(0, 32)
}

export function signWbi(
  params: Record<string, string | number>,
  keys: WbiKeys,
  wts = Math.floor(Date.now() / 1000)
): Record<string, string> {
  const merged: Record<string, string> = { wts: String(wts) }
  for (const [key, value] of Object.entries(params)) {
    merged[key] = String(value).replace(/[!'()*]/g, '')
  }
  const query = Object.keys(merged)
    .sort()
    .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(merged[key])}`)
    .join('&')
  const wRid = createHash('md5').update(query + getMixinKey(keys)).digest('hex')
  const signed: Record<string, string> = { w_rid: wRid, wts: String(wts) }
  for (const [key, value] of Object.entries(params)) signed[key] = String(value)
  return signed
}
