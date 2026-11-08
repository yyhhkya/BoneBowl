import { useEffect, useMemo, useRef, useState } from 'react'
import type { GiftEvent } from '../../../shared/types'
import { BoneScene } from './game'

const TEST_NAMES = ['月见里的兔子', '芥末章鱼烧', '半糖去冰', '麦田里的收音机']
const TEST_SCALES = [0.8, 1, 1.3]

export function OverlayPage(): React.JSX.Element {
  const mountRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<BoneScene | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [socketReady, setSocketReady] = useState(false)
  const [boneCount, setBoneCount] = useState(0)

  const params = useMemo(() => new URLSearchParams(window.location.search), [])
  const debug = params.get('debug') === '1'
  const testMode = params.get('test') === '1'

  useEffect(() => {
    let cancelled = false
    const timers: number[] = []
    const scene = new BoneScene()
    sceneRef.current = scene

    const socketHostPort = (): string => {
      const explicit = params.get('ws')
      if (explicit) return explicit
      const port = window.location.port
      if (!port || port === '5173' || port === '4173' || port === '5199') return '17800'
      return port
    }

    let socket: WebSocket | null = null
    let reconnectTimer: number | undefined
    let channel: BroadcastChannel | null = null

    const handleGift = (gift: GiftEvent): void => {
      try {
        void scene.drop(gift)
        socket?.send(
          JSON.stringify({ type: 'gift-ack', giftName: gift.giftName, bones: gift.bones })
        )
      } catch (error) {
        socket?.send(
          JSON.stringify({
            type: 'gift-ack',
            giftName: gift.giftName,
            error: error instanceof Error ? error.message : String(error)
          })
        )
      }
    }

    const connectSocket = (): void => {
      if (cancelled) return
      try {
        socket = new WebSocket(`ws://127.0.0.1:${socketHostPort()}/ws`)
      } catch {
        reconnectTimer = window.setTimeout(connectSocket, 2500)
        return
      }
      socket.onopen = () => {
        if (!cancelled) setSocketReady(true)
        socket?.send(
          JSON.stringify({
            type: 'ready',
            href: window.location.href,
            source: params.get('source') ?? ''
          })
        )
      }
      socket.onmessage = (event) => {
        try {
          const payload = JSON.parse(String(event.data)) as {
            type?: string
            gift?: GiftEvent
            config?: { boneLifetimeSec?: number }
          }
          if (payload.type === 'gift' && payload.gift) handleGift(payload.gift)
          if (payload.type === 'config') {
            if (typeof payload.config?.boneLifetimeSec === 'number') {
              scene.setBoneLifetime(payload.config.boneLifetimeSec)
            }
          }
        } catch {
          // 忽略非 JSON 消息
        }
      }
      socket.onclose = () => {
        if (cancelled) return
        setSocketReady(false)
        reconnectTimer = window.setTimeout(connectSocket, 2500)
      }
      socket.onerror = () => socket?.close()
    }

    scene
      .init(mountRef.current as HTMLElement)
      .then(() => {
        if (cancelled) {
          scene.destroy()
          return
        }
        connectSocket()

        const lifetimeParam = Number(params.get('lifetime') ?? Number.NaN)
        if (Number.isFinite(lifetimeParam) && lifetimeParam >= 0) {
          scene.setBoneLifetime(lifetimeParam)
        }

        if (typeof BroadcastChannel !== 'undefined') {
          channel = new BroadcastChannel('bonebowl-mock')
          channel.onmessage = (event: MessageEvent) => {
            const payload = event.data as { type?: string; gift?: GiftEvent }
            if (payload?.type === 'gift' && payload.gift) handleGift(payload.gift)
          }
        }

        if (testMode) {
          let tick = 0
          const timer = window.setInterval(() => {
            const scale = TEST_SCALES[tick % TEST_SCALES.length]
            const name = TEST_NAMES[tick % TEST_NAMES.length]
            tick += 1
            handleGift({
              giftId: 31036,
              giftName: '小花花',
              uid: 1000 + tick,
              uname: name,
              num: 1,
              bones: scale > 1.2 ? 5 : scale < 0.9 ? 2 : 3,
              scale,
              timestamp: Date.now()
            })
          }, 1500)
          timers.push(timer)
        }

        if (debug) {
          const timer = window.setInterval(() => setBoneCount(scene.getBoneCount()), 400)
          timers.push(timer)
        }
      })
      .catch((initError: unknown) => {
        if (!cancelled) {
          setError(initError instanceof Error ? initError.message : '渲染初始化失败')
        }
      })

    return () => {
      cancelled = true
      timers.forEach((timer) => window.clearInterval(timer))
      if (reconnectTimer) window.clearTimeout(reconnectTimer)
      socket?.close()
      channel?.close()
      scene.destroy()
    }
  }, [debug, params, testMode])

  return (
    <div className="fixed inset-0 overflow-hidden bg-transparent">
      <div ref={mountRef} className="absolute inset-0" />
      {debug && (
        <div className="pointer-events-none absolute top-3 left-3 rounded-lg bg-black/65 px-3 py-2 font-mono text-[12px] text-white">
          ws {socketReady ? 'on' : 'off'} · bones {boneCount}
        </div>
      )}
      {error && (
        <div className="absolute inset-0 grid place-items-center bg-black/55">
          <div className="max-w-sm rounded-xl bg-white/95 px-5 py-4 text-[13px] text-[#26241f]">
            叠加层初始化失败：{error}
          </div>
        </div>
      )}
    </div>
  )
}
