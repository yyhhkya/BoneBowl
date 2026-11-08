import { useEffect, useState } from 'react'
import { Minus, X } from '@phosphor-icons/react'
import type { RoomStatus } from '../../../shared/types'
import { getApi } from '../lib/api'
import { BoneMark, STATUS_META } from './ui'

const api = getApi()

export function TitleBar(): React.JSX.Element {
  const [status, setStatus] = useState<RoomStatus>({ state: 'idle' })

  useEffect(() => {
    let alive = true
    api
      .getStatus()
      .then((next) => {
        if (alive) setStatus(next)
      })
      .catch(() => undefined)
    const off = api.onStatus((next) => setStatus(next))
    return () => {
      alive = false
      off()
    }
  }, [])

  const meta = STATUS_META[status.state]
  const room =
    status.state === 'connected'
      ? `房间 ${status.realRoomId}`
      : status.state === 'connecting'
        ? `房间 ${status.roomId}`
        : status.state === 'error'
          ? status.message
          : '未连接直播间'

  return (
    <header className="app-drag sticky top-0 z-40 flex h-11 shrink-0 items-center gap-2.5 border-b border-line/70 bg-paper/85 px-3 backdrop-blur-md">
      <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md border border-line bg-surface text-ember shadow-[inset_0_1px_0_rgba(255,255,255,0.85)]">
        <BoneMark className="h-3.5 w-3.5 -rotate-12" />
      </span>
      <span className="text-[12.5px] font-medium tracking-tight text-ink">BoneBowl</span>
      <span className="font-mono text-[9.5px] tracking-[0.24em] text-ink-soft/60 uppercase sm:inline">
        设置
      </span>
      <span
        className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-line/80 bg-surface/70 px-2 py-[3px] text-[10.5px] text-ink-soft"
        title={room}
      >
        <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
        <span className={meta.text}>{meta.label}</span>
        {status.state === 'connected' && (
          <span className="font-mono text-[10px] tabular-nums text-ink-soft/70">
            {status.realRoomId}
          </span>
        )}
      </span>
      <span className="mx-0.5 h-4 w-px bg-line" aria-hidden="true" />
      <button
        type="button"
        aria-label="最小化"
        title="最小化"
        onClick={() => api.minimizeWindow()}
        className="app-no-drag focus-ring grid h-7 w-7 place-items-center rounded-md text-ink-soft transition-[background-color,color,transform] duration-200 hover:bg-[#f3ead6] hover:text-ink active:scale-[0.94]"
      >
        <Minus size={13} weight="bold" />
      </button>
      <button
        type="button"
        aria-label="关闭窗口"
        title="关闭窗口"
        onClick={() => api.closeWindow()}
        className="app-no-drag focus-ring grid h-7 w-7 place-items-center rounded-md text-ink-soft transition-[background-color,color,transform] duration-200 hover:bg-clay/10 hover:text-clay active:scale-[0.94]"
      >
        <X size={13} weight="bold" />
      </button>
    </header>
  )
}
