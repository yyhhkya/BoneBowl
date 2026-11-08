import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { ArrowClockwise, X } from '@phosphor-icons/react'
import type { QrLoginInfo, QrLoginState } from '../../../shared/types'
import { Button } from './ui'

const STATE_META: Record<QrLoginState, { label: string; color: string }> = {
  waiting: { label: '等待扫码', color: 'text-ink-soft' },
  scanned: { label: '已扫码，等待确认', color: 'text-ember' },
  success: { label: '登录成功', color: 'text-moss' },
  expired: { label: '二维码已过期', color: 'text-clay' },
  error: { label: '登录失败', color: 'text-clay' }
}

export function LoginQrModal({
  qr,
  state,
  message,
  busy,
  onRefresh,
  onExpire,
  onClose
}: {
  qr: QrLoginInfo
  state: QrLoginState
  message?: string
  busy: boolean
  onRefresh: () => void
  onExpire: () => void
  onClose: () => void
}): React.JSX.Element {
  const meta = STATE_META[state]
  const expired = state === 'expired' || state === 'error'
  const [remaining, setRemaining] = useState(qr.expiresIn)

  useEffect(() => {
    setRemaining(qr.expiresIn)
    const deadline = Date.now() + qr.expiresIn * 1000
    const timer = window.setInterval(() => {
      const left = Math.max(0, Math.ceil((deadline - Date.now()) / 1000))
      setRemaining(left)
      if (left === 0) {
        window.clearInterval(timer)
        onExpire()
      }
    }, 500)
    return () => window.clearInterval(timer)
  }, [qr.key, qr.expiresIn, onExpire])

  const minutes = Math.floor(remaining / 60)
  const seconds = String(remaining % 60).padStart(2, '0')
  return (
    <div className="fixed inset-0 z-50 grid place-items-center px-4">
      <motion.button
        type="button"
        aria-label="关闭扫码登录"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-[#3a2f1f]/30 backdrop-blur-[2px]"
      />
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label="B站扫码登录"
        initial={{ opacity: 0, y: 14, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 8, scale: 0.98 }}
        transition={{ type: 'spring', stiffness: 380, damping: 32 }}
        className="relative w-[min(92vw,392px)] overflow-hidden rounded-[32px] border border-line bg-surface p-6 shadow-[0_40px_90px_-40px_rgba(90,62,16,0.55)]"
      >
        <div className="flex items-start justify-between">
          <div>
            <div className="font-mono text-[9.5px] tracking-[0.24em] text-ink-soft uppercase">
              bilibili login
            </div>
            <h2 className="mt-2 text-[22px] tracking-tight">扫码登录</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            className="focus-ring grid h-8 w-8 place-items-center rounded-full text-ink-soft transition-colors hover:bg-black/5 hover:text-ink"
          >
            <X size={16} />
          </button>
        </div>

        <div className="mt-5 flex justify-center rounded-3xl border border-line bg-white p-4">
          <img src={qr.image} alt="B站登录二维码" width={232} height={232} className="rounded-xl" />
        </div>

        <div className="mt-4 flex items-center justify-center gap-2 text-[12.5px]">
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              state === 'scanned' ? 'animate-breathe bg-ember' : state === 'success' ? 'bg-moss' : 'bg-[#c2b086]'
            }`}
          />
          <span className={meta.color}>{message || meta.label}</span>
        </div>

        <p className="mt-2 text-center text-[11.5px] leading-relaxed text-ink-soft">
          打开 B站手机客户端，扫一扫二维码，并在手机上确认登录。
        </p>
        <p className="mt-1.5 text-center font-mono text-[11px] tracking-wide text-ink-soft tabular-nums">
          {expired || remaining === 0
            ? '二维码已过期'
            : `有效期 ${minutes}:${seconds}`}
        </p>

        {expired && (
          <Button variant="accent" className="mt-4 w-full" onClick={onRefresh} loading={busy}>
            <ArrowClockwise size={15} weight="bold" />
            刷新二维码
          </Button>
        )}
      </motion.div>
    </div>
  )
}
