import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowSquareOut,
  Broadcast,
  Check,
  CircleNotch,
  Copy,
  EyeSlash,
  Gift,
  Plus,
  Power,
  QrCode,
  SignIn,
  WarningCircle
} from '@phosphor-icons/react'
import {
  type AppConfig,
  type AppInfo,
  type GiftEvent,
  type GiftCatalogItem,
  type GiftRule,
  type LoginCheck,
  type QrLoginInfo,
  type QrLoginState,
  type RoomProfile,
  type RoomStatus
} from '../../../shared/types'
import { getApi } from '../lib/api'
import {
  BONE_PATH,
  BoneMark,
  Button,
  Field,
  Grain,
  MicroLabel,
  SectionHeading,
  StatusPill,
  Toggle
} from './ui'
import { GiftRow } from './GiftRow'
import { GiftPickerModal } from './GiftPickerModal'
import { LoginQrModal } from './LoginQrModal'

const api = getApi()

interface Toast {
  id: number
  text: string
  tone: 'ok' | 'error'
}

const NAV = [
  { id: 'room', index: '01', label: '直播间' },
  { id: 'gifts', index: '02', label: '礼物映射' },
  { id: 'overlay', index: '03', label: '叠加层' },
  { id: 'activity', index: '04', label: '最近事件' }
]

function formatClock(ts: number): string {
  return new Date(ts).toLocaleTimeString('zh-CN', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
}

export function SettingsPage(): React.JSX.Element {
  const [config, setConfig] = useState<AppConfig | null>(null)
  const [info, setInfo] = useState<AppInfo | null>(null)
  const [status, setStatus] = useState<RoomStatus>({ state: 'idle' })
  const [loadError, setLoadError] = useState<string | null>(null)
  const [roomIdText, setRoomIdText] = useState('')
  const [roomError, setRoomError] = useState<string | null>(null)
  const [roomProfile, setRoomProfile] = useState<RoomProfile | null>(null)
  const [profileState, setProfileState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [sessdata, setSessdata] = useState('')
  const [busy, setBusy] = useState<'connect' | null>(null)
  const [activity, setActivity] = useState<GiftEvent[]>([])
  const [toasts, setToasts] = useState<Toast[]>([])
  const [portText, setPortText] = useState('')
  const [copied, setCopied] = useState(false)
  const [qr, setQr] = useState<QrLoginInfo | null>(null)
  const [qrState, setQrState] = useState<QrLoginState>('waiting')
  const [qrMessage, setQrMessage] = useState('等待扫码')
  const [qrBusy, setQrBusy] = useState(false)
  const [loginCheck, setLoginCheck] = useState<LoginCheck | null>(null)
  const [overlayClients, setOverlayClients] = useState(0)
  const [pickerOpen, setPickerOpen] = useState(false)

  const pendingRef = useRef<Partial<AppConfig>>({})
  const saveTimerRef = useRef<number | undefined>(undefined)
  const toastTimers = useRef<number[]>([])
  const toastSeq = useRef(0)

  const pushToast = useCallback((text: string, tone: 'ok' | 'error' = 'ok') => {
    const id = ++toastSeq.current
    setToasts((prev) => [...prev.slice(-2), { id, text, tone }])
    const timer = window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 3400)
    toastTimers.current.push(timer)
  }, [])

  const flushSave = useCallback(
    async (patch?: Partial<AppConfig>) => {
      if (patch) pendingRef.current = { ...pendingRef.current, ...patch }
      const pending = pendingRef.current
      if (Object.keys(pending).length === 0) return
      pendingRef.current = {}
      try {
        await api.saveConfig(pending)
      } catch (error) {
        pushToast(error instanceof Error ? error.message : '保存失败', 'error')
      }
    },
    [pushToast]
  )

  const scheduleSave = useCallback(
    (patch: Partial<AppConfig>) => {
      pendingRef.current = { ...pendingRef.current, ...patch }
      window.clearTimeout(saveTimerRef.current)
      saveTimerRef.current = window.setTimeout(() => void flushSave(), 450)
    },
    [flushSave]
  )

  useEffect(() => {
    const flush = (): void => {
      void flushSave()
    }
    const onVisibility = (): void => {
      if (document.visibilityState === 'hidden') flush()
    }
    window.addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('pagehide', flush)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [flushSave])

  useEffect(() => {
    let alive = true
    const cookie = sessdata.trim()
    if (!cookie) {
      setLoginCheck({ state: 'none' })
      return () => {
        alive = false
      }
    }
    setLoginCheck({ state: 'checking' })
    api
      .verifyLogin()
      .then((check) => {
        if (alive) setLoginCheck(check)
      })
      .catch(() => {
        if (alive) setLoginCheck({ state: 'error', message: '无法验证登录状态' })
      })
    return () => {
      alive = false
    }
  }, [sessdata])

  useEffect(() => {
    let alive = true
    const tick = (): void => {
      api
        .getOverlayClients()
        .then((count) => {
          if (alive) setOverlayClients(count)
        })
        .catch(() => {
          if (alive) setOverlayClients(0)
        })
    }
    tick()
    const timer = window.setInterval(tick, 3000)
    return () => {
      alive = false
      window.clearInterval(timer)
    }
  }, [])

  useEffect(() => {
    let alive = true
    Promise.all([api.getConfig(), api.getInfo(), api.getStatus()])
      .then(([nextConfig, nextInfo, nextStatus]) => {
        if (!alive) return
        setConfig(nextConfig)
        setInfo(nextInfo)
        setStatus(nextStatus)
        setRoomIdText(nextConfig.roomId ? String(nextConfig.roomId) : '')
        setSessdata(nextConfig.sessdata)
        setPortText(String(nextInfo.port))
      })
      .catch((error: unknown) => {
        if (!alive) return
        setLoadError(error instanceof Error ? error.message : '读取配置失败')
      })

    const offStatus = api.onStatus((next) => setStatus(next))
    const offGift = api.onGift((gift) => {
      setActivity((prev) => [gift, ...prev].slice(0, 10))
    })

    return () => {
      alive = false
      offStatus()
      offGift()
      window.clearTimeout(saveTimerRef.current)
      toastTimers.current.forEach((timer) => window.clearTimeout(timer))
    }
  }, [])

  useEffect(() => {
    const roomId = Number(roomIdText)
    if (!Number.isInteger(roomId) || roomId <= 0) {
      setRoomProfile(null)
      setProfileState('idle')
      return
    }
    let cancelled = false
    setRoomProfile(null)
    setProfileState('loading')
    const timer = window.setTimeout(() => {
      api
        .fetchRoomProfile(roomId)
        .then((profile) => {
          if (cancelled) return
          setRoomProfile(profile)
          setProfileState('ready')
        })
        .catch(() => {
          if (cancelled) return
          setProfileState('error')
        })
    }, 600)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [roomIdText])

  const updateGift = useCallback(
    (id: string, patch: Partial<GiftRule>) => {
      setConfig((prev) => {
        if (!prev) return prev
        const gifts = prev.gifts.map((gift) => (gift.id === id ? { ...gift, ...patch } : gift))
        scheduleSave({ gifts })
        return { ...prev, gifts }
      })
    },
    [scheduleSave]
  )

  const removeGift = useCallback(
    (id: string) => {
      setConfig((prev) => {
        if (!prev) return prev
        const gifts = prev.gifts.filter((gift) => gift.id !== id)
        void flushSave({ gifts })
        return { ...prev, gifts }
      })
      pushToast('已删除这条映射')
    },
    [flushSave, pushToast]
  )

  const addGift = useCallback(() => {
    setConfig((prev) => {
      if (!prev) return prev
      const gifts = [
        ...prev.gifts,
        {
          id: crypto.randomUUID(),
          giftId: 0,
          name: '',
          bones: 1,
          scale: 1,
          enabled: true
        }
      ]
      scheduleSave({ gifts })
      return { ...prev, gifts }
    })
  }, [scheduleSave])

  const handleConnect = useCallback(async () => {
    const roomId = Number(roomIdText)
    if (!Number.isInteger(roomId) || roomId <= 0) {
      setRoomError('填写有效的直播间号')
      return
    }
    if (!sessdata.trim()) {
      setRoomError(null)
      pushToast('连接直播间前先扫码登录 B站账号', 'error')
      return
    }
    if (loginCheck?.state === 'invalid') {
      setRoomError(null)
      pushToast('登录已失效，请重新扫码', 'error')
      return
    }
    setRoomError(null)
    setBusy('connect')
    try {
      const next = await api.connect({ roomId, sessdata })
      if (next.state === 'error') pushToast(next.message, 'error')
    } catch (error) {
      pushToast(error instanceof Error ? error.message : '连接失败', 'error')
    } finally {
      setBusy(null)
    }
  }, [roomIdText, sessdata, loginCheck?.state, pushToast])

  const handleTestGift = useCallback(
    async (ruleId: string) => {
      try {
        const clients = await api.testGift(ruleId)
        setOverlayClients(clients)
        if (clients > 0) {
          pushToast(`已试投，叠加层已连接（${clients}）`)
        } else {
          pushToast('已试投，但还没有叠加层连上：检查 OBS 浏览器源地址和端口', 'error')
        }
      } catch (error) {
        pushToast(error instanceof Error ? error.message : '试投失败', 'error')
      }
    },
    [pushToast]
  )

  const handleDisconnect = useCallback(async () => {
    setBusy('connect')
    try {
      await api.disconnect()
    } finally {
      setBusy(null)
    }
  }, [])

  const refreshLogin = useCallback(() => {
    if (!sessdata.trim()) {
      setLoginCheck({ state: 'none' })
      return
    }
    setLoginCheck({ state: 'checking' })
    api
      .verifyLogin()
      .then((check) => setLoginCheck(check))
      .catch(() => setLoginCheck({ state: 'error', message: '无法验证登录状态' }))
  }, [sessdata])

  const activeRoomId = Number(roomIdText) || config?.roomId || null

  const addGiftRules = useCallback(
    (items: GiftCatalogItem[], notify = false) => {
      setConfig((prev) => {
        if (!prev) return prev
        const existing = new Set(prev.gifts.map((g) => g.name.trim()).filter(Boolean))
        const additions: GiftRule[] = []
        for (const item of items) {
          const name = item.name.trim()
          if (!name || existing.has(name)) continue
          existing.add(name)
          additions.push({
            id: crypto.randomUUID(),
            giftId: item.id,
            name,
            bones: 1,
            scale: 1,
            enabled: true
          })
        }
        if (additions.length === 0) {
          if (notify) pushToast('这些礼物已经添加过了')
          return prev
        }
        const gifts = [...prev.gifts, ...additions]
        void flushSave({ gifts })
        if (notify) pushToast(`已添加 ${additions.length} 个礼物`)
        return { ...prev, gifts }
      })
    },
    [flushSave, pushToast]
  )

  const openPicker = useCallback(() => {
    if (!activeRoomId) {
      setRoomError('先填写直播间号，再选择礼物')
      pushToast('先填写直播间号', 'error')
      const input = document.getElementById('room-id') as HTMLInputElement | null
      input?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      window.setTimeout(() => input?.focus({ preventScroll: true }), 320)
      return
    }
    setPickerOpen(true)
  }, [activeRoomId, pushToast])

  const commitRoomId = useCallback(() => {
    const roomId = Number(roomIdText)
    if (Number.isInteger(roomId) && roomId > 0) {
      setConfig((prev) => (prev ? { ...prev, roomId } : prev))
      scheduleSave({ roomId })
    }
  }, [roomIdText, scheduleSave])

  const handleLogout = useCallback(async () => {
    setSessdata('')
    setLoginCheck({ state: 'none' })
    setConfig((prev) => (prev ? { ...prev, sessdata: '' } : prev))
    await flushSave({ sessdata: '' })
    if (status.state === 'connected') await api.disconnect()
    pushToast('已退出登录')
  }, [flushSave, pushToast, status.state])

  const commitPort = useCallback(async () => {
    const port = Number(portText)
    if (!Number.isInteger(port) || port < 1024 || port > 65535) {
      setPortText(String(info?.port ?? 17800))
      pushToast('端口需在 1024 到 65535 之间', 'error')
      return
    }
    if (port === info?.port) return
    await flushSave({ port })
    const nextInfo = await api.getInfo()
    setInfo(nextInfo)
    setPortText(String(nextInfo.port))
    if (nextInfo.port !== port) pushToast(`端口被占用，已改用 ${nextInfo.port}`, 'error')
    else pushToast('端口已更新，同步修改 OBS 源地址')
  }, [portText, info?.port, flushSave, pushToast])

  const handleCopy = useCallback(async () => {
    if (!info) return
    try {
      await api.copyText(info.overlayUrl)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      pushToast('复制失败，请手动选中', 'error')
    }
  }, [info, pushToast])

  const startQr = useCallback(async () => {
    setQrBusy(true)
    try {
      const info = await api.qrLogin()
      setQr(info)
      setQrState('waiting')
      setQrMessage('等待扫码')
    } catch (error) {
      pushToast(error instanceof Error ? error.message : '获取二维码失败', 'error')
    } finally {
      setQrBusy(false)
    }
  }, [pushToast])

  const handleQrExpire = useCallback(() => {
    setQrState('expired')
    setQrMessage('二维码已过期')
  }, [])

  useEffect(() => {
    if (!qr) return
    let cancelled = false
    let timer: number | undefined
    const poll = async (): Promise<void> => {
      try {
        const result = await api.qrPoll(qr.key)
        if (cancelled) return
        setQrState(result.state)
        setQrMessage(result.message ?? '')
        if (result.state === 'success' && result.sessdata) {
          const sessdata = result.sessdata
          setSessdata(sessdata)
          setConfig((prev) => (prev ? { ...prev, sessdata } : prev))
          void flushSave({ sessdata })
          pushToast(result.uname ? `已登录 ${result.uname}` : '扫码登录成功')
          setQr(null)
          return
        }
        if (result.state === 'expired' || result.state === 'error') return
        timer = window.setTimeout(() => void poll(), 2000)
      } catch {
        if (!cancelled) timer = window.setTimeout(() => void poll(), 3000)
      }
    }
    timer = window.setTimeout(() => void poll(), 1000)
    return () => {
      cancelled = true
      if (timer) window.clearTimeout(timer)
    }
  }, [qr, flushSave, pushToast])

  const handleRetry = useCallback(() => {
    window.location.reload()
  }, [])

  if (loadError) {
    return (
      <div className="grid min-h-full place-items-center px-6">
        <div className="max-w-md text-center">
          <WarningCircle size={28} className="mx-auto text-clay" />
          <h1 className="mt-4 text-2xl tracking-tight">配置读取失败</h1>
          <p className="mt-2 text-sm leading-relaxed text-ink-soft">{loadError}</p>
          <Button className="mt-6" onClick={handleRetry}>
            重新加载
          </Button>
        </div>
      </div>
    )
  }

  if (!config || !info) {
    return <LoadingShell />
  }

  const host = status.state === 'connected' ? `房间 ${status.realRoomId}` : null
  const hasCookie = sessdata.trim().length > 0
  const loginState = hasCookie ? (loginCheck?.state ?? 'checking') : 'none'
  const loginUsable = hasCookie && loginState !== 'invalid'
  const loginTitle =
    loginState === 'valid'
      ? loginCheck?.uname
        ? `已登录 ${loginCheck.uname}`
        : '已登录 B站账号'
      : loginState === 'checking'
        ? '正在验证登录'
        : loginState === 'invalid'
          ? '登录已失效'
          : loginState === 'error'
            ? '无法验证登录状态'
            : '未登录'
  const loginHint =
    loginState === 'valid'
      ? 'Cookie 有效，可随时重新扫码。'
      : loginState === 'checking'
        ? '正在向 B站 检查 Cookie 是否有效…'
        : loginState === 'invalid'
          ? 'Cookie 已失效，重新扫码后才能连接直播间。'
          : loginState === 'error'
            ? loginCheck?.message || '网络异常，暂时无法验证登录状态。'
            : '连接直播间必须登录，用 B站手机客户端扫码即可。'

  return (
    <div className="relative min-h-full">
      <Grain />
      <div className="mx-auto grid min-h-full w-full max-w-[1600px] lg:grid-cols-[264px_minmax(0,1fr)]">
        <aside className="sticky top-0 hidden h-[calc(100dvh-3rem)] flex-col border-r border-line bg-white/55 px-7 py-8 lg:flex">
          <MicroLabel>sections</MicroLabel>

          <nav className="mt-4 flex flex-col gap-1">
            {NAV.map((item) => (
              <a
                key={item.id}
                href={`#${item.id}`}
                className="focus-ring group flex items-center justify-between rounded-lg px-3 py-2 text-[13px] text-ink-soft transition-colors hover:bg-[#fff4d6] hover:text-ink"
              >
                <span>{item.label}</span>
                <span className="font-mono text-[10px] tracking-widest text-[#c7b183] group-hover:text-ember">
                  {item.index}
                </span>
              </a>
            ))}
          </nav>

          <div className="mt-auto flex flex-col gap-4">
            <div className="rounded-2xl border border-line bg-surface/70 p-4">
              <div className="flex items-center justify-between">
                <MicroLabel>status</MicroLabel>
                <StatusPill status={status} />
              </div>
              <p className="mt-3 text-[12px] leading-relaxed text-ink-soft">
                {status.state === 'connected'
                  ? `${host}，等待礼物消息`
                  : status.state === 'connecting'
                    ? '正在建立信息流连接'
                    : status.state === 'error'
                      ? status.message
                      : '尚未连接直播间'}
              </p>
            </div>
            <div className="flex items-center justify-between px-1 font-mono text-[10px] tracking-wider text-[#b7a272]">
              <span>v{info.version}</span>
              <span>{info.isDev ? 'dev' : 'local'}</span>
            </div>
          </div>
        </aside>

        <main className="min-w-0 px-5 pb-24 pt-6 md:px-10 lg:px-14 lg:pt-10 xl:px-20">
          {!window.bonebowl && (
            <div className="mb-6 flex items-start gap-2 rounded-xl border border-[#f0d68f] bg-sun/20 px-4 py-2.5 text-[11.5px] leading-relaxed text-[#7a5a10]">
              <WarningCircle size={14} className="mt-0.5 shrink-0" />
              当前是浏览器预览：直播连接和礼物都是模拟的，不会收到真实礼物。请使用桌面应用窗口查看真实连接与最近事件。
            </div>
          )}

          <header className="grid gap-10 md:grid-cols-[minmax(0,1fr)_296px] md:items-end">
            <div>
              <p className="font-mono text-[10px] tracking-[0.3em] text-ink-soft uppercase">
                Bilibili live overlay
              </p>
              <h1 className="mt-4 text-[36px] leading-[1.02] tracking-[-0.04em] text-ink md:text-[46px]">
                投喂、掉落、
                <br />
                堆满。
              </h1>
              <svg viewBox="0 0 240 12" className="mt-3 h-3 w-[180px] text-ember/65" aria-hidden="true">
                <path
                  d="M2 8c34-6 64 5 96-2s64 5 140-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                />
              </svg>
              <p className="mt-4 max-w-[46ch] text-[13.5px] leading-relaxed text-ink-soft">
                识别直播间礼物，把骨头落进碗里。填好直播间和礼物映射，再把叠加层地址交给 OBS。
              </p>
            </div>
            <StagePreview rules={config.gifts} latest={activity[0]} />
          </header>

          <section id="room" className="mt-14 scroll-mt-8">
            <SectionHeading
              title="直播间"
              description="填写开播直播间号，扫码登录后连接 B站信息流。"
            />
            <div className="mt-7 grid gap-9 lg:grid-cols-[minmax(0,1fr)_344px]">
              <div className="grid gap-6">
                <Field
                  label="直播间号"
                  hint={
                    roomProfile && roomProfile.roomId !== Number(roomIdText)
                      ? `真实房间号 ${roomProfile.roomId}`
                      : '房间短号或真实房间号都可以，连接时会自动转换。'
                  }
                  error={roomError}
                  htmlFor="room-id"
                  action={
                    profileState === 'loading' ? (
                      <span className="inline-flex items-center gap-1.5 text-[11px] text-ink-soft">
                        <CircleNotch size={12} weight="bold" className="animate-spin" />
                        识别主播…
                      </span>
                    ) : roomProfile?.anchorName ? (
                      <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface/85 py-1 pr-2.5 pl-1 text-[11px]">
                        {roomProfile.face && (
                          <img
                            src={roomProfile.face}
                            alt=""
                            referrerPolicy="no-referrer"
                            className="h-5 w-5 rounded-full object-cover"
                          />
                        )}
                        <span
                          className="max-w-[150px] truncate font-medium text-ink"
                          title={roomProfile.anchorName}
                        >
                          {roomProfile.anchorName}
                        </span>
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${
                            roomProfile.liveStatus === 1
                              ? 'animate-breathe bg-moss'
                              : 'bg-ink-soft/40'
                          }`}
                        />
                        <span className="text-ink-soft">
                          {roomProfile.liveStatus === 1 ? '直播中' : '未开播'}
                        </span>
                      </span>
                    ) : undefined
                  }
                >
                  <input
                    id="room-id"
                    className={`field-input font-mono tabular-nums ${roomError ? '!border-clay/60' : ''}`}
                    value={roomIdText}
                    inputMode="numeric"
                    placeholder="例如 30866874"
                    onChange={(event) => {
                      const digits = event.target.value.replace(/\D/g, '').slice(0, 12)
                      setRoomIdText(digits)
                      setRoomError(null)
                      const value = Number(digits)
                      scheduleSave({ roomId: Number.isInteger(value) && value > 0 ? value : null })
                    }}
                    onBlur={commitRoomId}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') void handleConnect()
                    }}
                  />
                </Field>

                <div className="grid gap-2">
                  <span className="text-[12.5px] font-medium text-ink">B站账号</span>
                  <div className="flex items-center justify-between gap-4 rounded-2xl border border-line bg-surface px-4 py-3.5">
                    <div className="flex items-center gap-3">
                      <span
                        className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${
                          loginState === 'valid'
                            ? 'bg-moss/12 text-moss'
                            : loginState === 'invalid' || loginState === 'error'
                              ? 'bg-clay/10 text-clay'
                              : 'bg-sun/35 text-[#7a5a10]'
                        }`}
                      >
                        {loginState === 'valid' ? (
                          <Check size={16} weight="bold" />
                        ) : loginState === 'checking' ? (
                          <CircleNotch size={16} weight="bold" className="animate-spin" />
                        ) : loginState === 'invalid' || loginState === 'error' ? (
                          <WarningCircle size={16} weight="bold" />
                        ) : (
                          <SignIn size={16} weight="bold" />
                        )}
                      </span>
                      <div>
                        <div className="text-[13px] font-medium">{loginTitle}</div>
                        <div className="mt-0.5 text-[11px] leading-relaxed text-ink-soft">{loginHint}</div>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {loginState === 'error' && (
                        <Button
                          variant="ghost"
                          className="!px-3 !py-1.5 !text-[11.5px]"
                          onClick={refreshLogin}
                        >
                          重试
                        </Button>
                      )}
                      {hasCookie && (
                        <Button
                          variant="ghost"
                          className="!px-3 !py-1.5 !text-[11.5px]"
                          onClick={() => void handleLogout()}
                        >
                          退出登录
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        className="!px-3 !py-1.5 !text-[11.5px]"
                        onClick={() => void startQr()}
                        loading={qrBusy}
                      >
                        <QrCode size={14} />
                        {hasCookie ? '重新扫码' : '扫码登录'}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex flex-col justify-between gap-6 rounded-2xl border border-line bg-surface/65 p-5">
                <div>
                  <MicroLabel>connection</MicroLabel>
                  <p className="mt-3 min-h-[42px] text-[12.5px] leading-relaxed text-ink-soft">
                    {status.state === 'connected'
                      ? `已接入房间 ${status.realRoomId}，礼物到达后会立即推送。`
                      : status.state === 'connecting'
                        ? '正在获取密钥并连接弹幕服务器，通常需要一到两秒。'
                        : status.state === 'error'
                          ? status.message
                          : '连接后礼物实时掉落；与叠加层的连接相互独立。'}
                  </p>
                </div>
                <div className="grid gap-3">
                  {status.state === 'connected' ? (
                    <Button variant="ghost" onClick={() => void handleDisconnect()} loading={busy === 'connect'}>
                      <Power size={15} />
                      断开连接
                    </Button>
                  ) : (
                    <Button
                      variant="accent"
                      onClick={() => void handleConnect()}
                      loading={busy === 'connect' || qrBusy}
                      disabled={!loginUsable}
                      title={loginUsable ? undefined : '先扫码登录 B站账号'}
                    >
                      <Broadcast size={15} weight="bold" />
                      {status.state === 'connecting' ? '连接中' : '连接直播间'}
                    </Button>
                  )}
                  <div className="flex items-center justify-between rounded-xl border border-line/80 px-3 py-2.5">
                    <div>
                      <div className="text-[12.5px] font-medium">自动连接</div>
                      <div className="text-[11px] text-ink-soft">启动应用后直接连上次的房间</div>
                    </div>
                    <Toggle
                      checked={config.autoConnect}
                      label="自动连接"
                      onChange={(autoConnect) => {
                        setConfig((prev) => (prev ? { ...prev, autoConnect } : prev))
                        void flushSave({ autoConnect })
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section id="gifts" className="mt-14 scroll-mt-8">
            <SectionHeading
              title="礼物映射"
              description="按礼物名称匹配规则，每份骨头数量和大小单独可调，单条消息最多 40 根。每行右侧的烧瓶按钮可按该规则试投。"
              aside={
                config.gifts.length > 0 ? (
                  <div className="flex items-center gap-2">
                    <Button variant="ghost" onClick={openPicker}>
                      <Gift size={15} />
                      选择礼物
                    </Button>
                    <Button variant="primary" onClick={addGift}>
                      <Plus size={15} weight="bold" />
                      添加
                    </Button>
                  </div>
                ) : undefined
              }
            />
            <div className="mt-7 overflow-hidden rounded-2xl border border-line bg-surface/55">
              <div className="hidden grid-cols-[minmax(0,1fr)_108px_132px_44px_32px] gap-3 border-b border-line/80 bg-[#fff4d6] px-4 py-2.5 font-mono text-[9.5px] tracking-[0.18em] text-ink-soft uppercase sm:grid">
                <span>礼物名称</span>
                <span>每份骨头</span>
                <span>大小</span>
                <span>启用</span>
                <span />
              </div>
              {config.gifts.length === 0 ? (
                <div className="flex flex-col items-center px-6 py-16 text-center">
                  <span className="grid h-12 w-12 place-items-center rounded-2xl border border-dashed border-[#f0d68f] text-ember">
                    <BoneMark className="h-6 w-6 rotate-12" />
                  </span>
                  <p className="mt-4 text-[14px] font-medium">还没有礼物映射</p>
                  <p className="mt-1 max-w-[36ch] text-[12.5px] leading-relaxed text-ink-soft">
                    从直播间礼物面板里点选，或手动添加一条。未映射的礼物不会掉落骨头。
                  </p>
                  <div className="mt-5 flex gap-2">
                    <Button variant="ghost" onClick={openPicker}>
                      <Gift size={15} />
                      选择礼物
                    </Button>
                    <Button onClick={addGift}>
                      <Plus size={15} />
                      手动添加
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="divide-y divide-line/70">
                  <AnimatePresence initial={false}>
                    {config.gifts.map((rule) => (
                      <motion.div
                        key={rule.id}
                        layout
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ type: 'spring', stiffness: 380, damping: 34 }}
                      >
                        <GiftRow
                          rule={rule}
                          onChange={(patch) => updateGift(rule.id, patch)}
                          onTest={() => void handleTestGift(rule.id)}
                          onRemove={() => removeGift(rule.id)}
                        />
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              )}
            </div>
          </section>

          <section id="overlay" className="mt-14 scroll-mt-8">
            <SectionHeading
              title="叠加层"
              description="本地服务把叠加页交给 OBS，物理在页面里独立运行。窗口最小化不影响输出。"
              aside={
                overlayClients > 0 ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-moss/10 px-2.5 py-1 text-[11px] text-moss">
                    <span className="h-1.5 w-1.5 animate-breathe rounded-full bg-moss" />
                    OBS 已连接 {overlayClients}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-clay/8 px-2.5 py-1 text-[11px] text-clay">
                    <span className="h-1.5 w-1.5 rounded-full bg-clay" />
                    OBS 未连接
                  </span>
                )
              }
            />
            <div className="mt-7 grid gap-9 lg:grid-cols-[minmax(0,1fr)_344px]">
              <div className="grid gap-6">
                <Field label="OBS 浏览器源地址" hint="宽高设为 1920 × 1080，背景自动透明。">
                  <div className="flex items-stretch gap-2">
                    <div className="field-input flex min-w-0 flex-1 items-center overflow-hidden font-mono !text-[11.5px] text-ink-soft">
                      <span className="truncate" title={info.overlayUrl}>
                        {info.overlayUrl}
                      </span>
                    </div>
                    <Button variant="ghost" className="shrink-0" onClick={() => void handleCopy()}>
                      {copied ? <Check size={15} className="text-moss" /> : <Copy size={15} />}
                      {copied ? '已复制' : '复制'}
                    </Button>
                    <Button
                      variant="soft"
                      className="shrink-0"
                      onClick={() => void api.openOverlay()}
                      aria-label="在浏览器中打开叠加层"
                    >
                      <ArrowSquareOut size={15} />
                    </Button>
                  </div>
                </Field>

                <div className="grid gap-5 sm:grid-cols-[132px_minmax(0,1fr)]">
                  <Field label="端口" hint="修改后需同步 OBS。" htmlFor="overlay-port">
                    <input
                      id="overlay-port"
                      className="field-input font-mono tabular-nums"
                      value={portText}
                      inputMode="numeric"
                      onChange={(event) => setPortText(event.target.value.replace(/\D/g, '').slice(0, 5))}
                      onBlur={() => void commitPort()}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') void commitPort()
                      }}
                    />
                  </Field>
                  <Field
                    label="骨头消失时长"
                    htmlFor="bone-lifetime"
                    hint={
                      config.boneLifetimeSec === 0
                        ? '一直保留，直到达到 100 根上限。'
                        : `${config.boneLifetimeSec} 秒后淡出，给新骨头腾位置。`
                    }
                  >
                    <div className="flex h-[38px] items-center gap-3">
                      <input
                        id="bone-lifetime"
                        type="range"
                        min={0}
                        max={120}
                        step={5}
                        value={config.boneLifetimeSec}
                        onChange={(event) => {
                          const boneLifetimeSec = Number(event.target.value)
                          setConfig((prev) => (prev ? { ...prev, boneLifetimeSec } : prev))
                          scheduleSave({ boneLifetimeSec })
                        }}
                        className="range-honey w-full min-w-0 flex-1"
                        aria-label="骨头消失时长"
                      />
                      <span className="w-14 shrink-0 text-right font-mono text-[11.5px] tabular-nums text-ink-soft">
                        {config.boneLifetimeSec === 0 ? '永不' : `${config.boneLifetimeSec}s`}
                      </span>
                    </div>
                  </Field>
                </div>
              </div>

              <div className="rounded-2xl border border-line bg-surface/65 p-5">
                <MicroLabel>obs setup</MicroLabel>
                <ol className="mt-4 flex flex-col gap-4">
                  {[
                    '场景里添加来源，选择「浏览器」',
                    '粘贴上方地址到 URL',
                    '宽高设为 1920 × 1080',
                    '勾选「场景激活时刷新浏览器」',
                    '有音效时勾选「通过 OBS 控制音频」'
                  ].map((step, index) => (
                    <li key={step} className="flex gap-3 text-[12.5px] leading-relaxed">
                      <span className="mt-0.5 font-mono text-[10px] text-ember">{String(index + 1).padStart(2, '0')}</span>
                      <span className="text-ink-soft">{step}</span>
                    </li>
                  ))}
                </ol>
                <div className="mt-5 border-t border-line/80 pt-4 text-[11.5px] leading-relaxed text-ink-soft">
                  页面背景透明，不需要色键。不要用窗口采集，避免 Electron 窗口黑屏。直播期间保持应用运行，最小化即可；关闭会断开叠加层。
                </div>
              </div>
            </div>
          </section>

          <section id="activity" className="mt-14 scroll-mt-8">
            <SectionHeading
              title="最近事件"
              description="最近十条礼物触发记录，用来确认映射是否生效。"
              aside={
                activity.length > 0 ? (
                  <Button variant="ghost" onClick={() => setActivity([])}>
                    清空
                  </Button>
                ) : undefined
              }
            />
            <div className="mt-7 rounded-2xl border border-line bg-surface/55">
              {activity.length === 0 ? (
                <div className="flex flex-col items-center px-6 py-14 text-center">
                  <span className="grid h-10 w-10 place-items-center rounded-xl border border-dashed border-[#f0d68f] text-ink-soft">
                    <Gift size={18} />
                  </span>
                  <p className="mt-3 text-[13px] font-medium">还没有收到礼物</p>
                  <p className="mt-1 text-[12px] text-ink-soft">连接直播间后，触发的礼物会出现在这里。</p>
              </div>
              ) : (
                <ul className="divide-y divide-line/70">
                  <AnimatePresence initial={false}>
                    {activity.map((gift) => (
                      <motion.li
                        key={`${gift.uid}-${gift.timestamp}-${gift.giftId}`}
                        layout
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        className="flex items-center gap-4 px-4 py-3"
                      >
                        <span className="font-mono text-[11px] tabular-nums text-[#b7a272]">
                          {formatClock(gift.timestamp)}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-[13px]">
                          <span className="font-medium">{gift.uname}</span>
                          <span className="text-ink-soft"> 投喂 </span>
                          <span className="font-medium">{gift.giftName}</span>
                        </span>
                        <span className="rounded-full bg-ember/10 px-2.5 py-1 font-mono text-[10.5px] text-ember">
                          +{gift.bones} 骨
                        </span>
                      </motion.li>
                    ))}
                  </AnimatePresence>
                </ul>
              )}
            </div>
          </section>

          <footer className="mt-16 flex flex-col gap-2 border-t border-line pt-6 font-mono text-[10px] tracking-wider text-[#b7a272] sm:flex-row sm:items-center sm:justify-between lg:hidden">
            <span>BoneBowl v{info.version}</span>
            <span>{info.isDev ? 'dev' : 'local'} · 更改自动保存在本机</span>
          </footer>
        </main>
      </div>

      <div className="pointer-events-none fixed right-4 bottom-4 z-50 flex flex-col gap-2">
        <AnimatePresence>
          {toasts.map((toast) => (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, y: 12, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 6 }}
              transition={{ type: 'spring', stiffness: 420, damping: 32 }}
              className={`pointer-events-auto max-w-[320px] rounded-xl px-4 py-2.5 text-[12.5px] shadow-[0_12px_30px_-12px_rgba(38,36,31,0.45)] ${
                toast.tone === 'error' ? 'bg-clay text-white' : 'bg-ink text-[#f7f3ea]'
              }`}
            >
              {toast.text}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {pickerOpen && activeRoomId && (
          <GiftPickerModal
            roomId={activeRoomId}
            existingNames={config.gifts.map((gift) => gift.name.trim()).filter(Boolean)}
            onPick={(item) => addGiftRules([item])}
            onPickAll={(items) => addGiftRules(items, true)}
            onClose={() => setPickerOpen(false)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {qr && (
          <LoginQrModal
            qr={qr}
            state={qrState}
            message={qrMessage}
            busy={qrBusy}
            onRefresh={() => void startQr()}
            onExpire={handleQrExpire}
            onClose={() => setQr(null)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

function StagePreview({
  rules,
  latest
}: {
  rules: GiftRule[]
  latest?: GiftEvent
}): React.JSX.Element {
  const enabled = rules.filter((rule) => rule.enabled).length
  return (
    <div className="relative overflow-hidden rounded-[32px] border border-line bg-surface/90 p-5 shadow-[0_30px_70px_-45px_rgba(120,86,26,0.45)]">
      <div className="flex items-center justify-between">
        <MicroLabel className="flex items-center gap-2 text-[9.5px] tracking-[0.2em]">
          <span className="h-1.5 w-1.5 animate-breathe rounded-full bg-ember" />
          stage preview
        </MicroLabel>
        <MicroLabel className="text-[9.5px] tracking-[0.2em]">{enabled} on</MicroLabel>
      </div>
      <svg viewBox="0 0 260 164" className="mt-2 w-full" aria-hidden="true">
        <ellipse cx="130" cy="150" rx="78" ry="9" fill="#3a2f1f" opacity="0.1" />
        <g transform="translate(118 46) rotate(-16)">
          <g className="animate-float" style={{ animationDelay: '-0.6s' }}>
            <path d={BONE_PATH} transform="scale(1.55)" fill="#f9f5ff" stroke="#b3a2c9" strokeWidth="1.1" strokeLinejoin="round" />
          </g>
        </g>
        <g transform="translate(88 96) rotate(24)">
          <g className="animate-float" style={{ animationDelay: '-2.1s' }}>
            <path d={BONE_PATH} transform="scale(1.35)" fill="#f5f0ff" stroke="#b3a2c9" strokeWidth="1.1" strokeLinejoin="round" />
          </g>
        </g>
        <g transform="translate(156 104) rotate(-38)">
          <g className="animate-float" style={{ animationDelay: '-3.4s' }}>
            <path d={BONE_PATH} transform="scale(1.45)" fill="#fbf8ff" stroke="#b3a2c9" strokeWidth="1.1" strokeLinejoin="round" />
          </g>
        </g>
        <path
          d="M36 90 C40 128 74 148 130 148 C186 148 220 128 224 90 Z"
          fill="#ffe8a5"
          stroke="#edc45f"
          strokeWidth="2.5"
        />
        <path d="M56 94 C60 122 90 136 130 136 C170 136 200 122 204 94 Z" fill="#e9d190" />
        <path
          d="M40 90 C44 128 78 148 130 148 C182 148 216 128 220 90 A 90 15 0 0 1 40 90 Z"
          fill="#fff4cc"
          opacity="0.65"
        />
        <ellipse cx="130" cy="90" rx="94" ry="15" fill="#fff8e2" stroke="#edc45f" strokeWidth="2.5" />
        <ellipse cx="130" cy="90" rx="78" ry="9" fill="#e3c46f" />
        <text
          x="130"
          y="124"
          textAnchor="middle"
          fontFamily="Ink Free, Comic Sans MS, Arial Rounded MT Bold, Segoe UI, sans-serif"
          fontWeight="700"
          fontSize="17"
          letterSpacing="1"
          fill="#5a4a26"
          opacity="0.85"
          transform="rotate(-3 130 124)"
        >
          FA
        </text>
      </svg>
      <div className="mt-1 flex items-end justify-between gap-4">
        <div>
          <MicroLabel className="text-[9px] tracking-[0.18em]">mapped gifts</MicroLabel>
          <div className="font-mono text-[22px] leading-tight tabular-nums">{rules.length}</div>
        </div>
        <div className="max-w-[150px] text-right text-[10.5px] leading-relaxed text-ink-soft">
          {latest ? (
            <>
              <span className="text-ink">{latest.uname}</span>
              <br />
              投喂 {latest.giftName}
            </>
          ) : (
            '等待第一次投喂'
          )}
        </div>
      </div>
    </div>
  )
}

function LoadingShell(): React.JSX.Element {
  return (
    <div
      className="min-h-full px-6 py-10 md:px-16"
      aria-busy="true"
      aria-label="正在读取配置"
    >
      <div className="mx-auto max-w-[1200px]">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 animate-pulse rounded-xl bg-[#f6efdd]" />
          <div className="h-4 w-24 animate-pulse rounded-full bg-[#f6efdd]" />
        </div>
        <div className="mt-14 h-3 w-40 animate-pulse rounded-full bg-[#f6efdd]" />
        <div className="mt-5 h-12 w-[440px] max-w-full animate-pulse rounded-xl bg-[#f6efdd]" />
        <div className="mt-4 h-4 w-[320px] max-w-full animate-pulse rounded-full bg-[#faf5e7]" />
        <div className="mt-14 grid gap-6 md:grid-cols-[minmax(0,1fr)_320px]">
          <div className="h-56 animate-pulse rounded-2xl bg-[#faf5e7]" />
          <div className="h-56 animate-pulse rounded-[26px] bg-[#faf5e7]" />
        </div>
        <div className="mt-12 h-72 animate-pulse rounded-2xl bg-[#faf5e7]" />
      </div>
    </div>
  )
}
