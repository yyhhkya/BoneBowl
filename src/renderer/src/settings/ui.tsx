import { motion } from 'framer-motion'
import { CircleNotch, Minus, Plus } from '@phosphor-icons/react'
import type { RoomStatus } from '../../../shared/types'

type Variant = 'primary' | 'accent' | 'ghost' | 'soft'

const VARIANT_CLASS: Record<Variant, string> = {
  primary:
    'bg-ink text-[#fff9e9] hover:bg-[#4a3c28] border border-transparent shadow-[0_10px_20px_-12px_rgba(58,47,31,0.6)]',
  accent:
    'bg-sun text-[#2f2a22] hover:bg-[#f7cb3f] border border-transparent shadow-[0_10px_22px_-12px_rgba(230,170,20,0.8)]',
  ghost: 'bg-transparent text-ink border border-line hover:border-[#e0cf9f] hover:bg-white/70',
  soft: 'bg-[#00000008] text-ink border border-transparent hover:bg-[#00000012]'
}

export function Button({
  variant = 'primary',
  loading = false,
  children,
  className = '',
  disabled,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant
  loading?: boolean
}): React.JSX.Element {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={`focus-ring inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-[13px] font-medium tracking-tight transition-[background,transform,border-color,opacity] duration-200 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-45 ${VARIANT_CLASS[variant]} ${className}`}
    >
      {loading && <CircleNotch size={15} weight="bold" className="animate-spin" />}
      {children}
    </button>
  )
}

export function Toggle({
  checked,
  onChange,
  label
}: {
  checked: boolean
  onChange: (next: boolean) => void
  label: string
}): React.JSX.Element {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`focus-ring relative h-6 w-10 shrink-0 rounded-full transition-colors duration-300 ${
        checked ? 'bg-sun' : 'bg-[#eee5d2]'
      }`}
    >
      <span
        className={`absolute top-1 left-1 block h-4 w-4 rounded-full bg-white shadow-[0_1px_2px_rgba(38,36,31,0.28)] transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${
          checked ? 'translate-x-4' : 'translate-x-0'
        }`}
      />
    </button>
  )
}

export function Stepper({
  value,
  onChange,
  min = 1,
  max = 50,
  label
}: {
  value: number
  onChange: (next: number) => void
  min?: number
  max?: number
  label: string
}): React.JSX.Element {
  const clamp = (n: number): number => Math.min(max, Math.max(min, n))
  return (
    <div className="flex h-[38px] items-center justify-between rounded-xl border border-line bg-white/45 px-1">
      <button
        type="button"
        aria-label={`${label} 减少`}
        onClick={() => onChange(clamp(value - 1))}
        disabled={value <= min}
        className="focus-ring grid h-7 w-7 place-items-center rounded-lg text-ink-soft transition-colors hover:bg-black/5 disabled:opacity-30"
      >
        <Minus size={13} weight="bold" />
      </button>
      <span className="min-w-7 text-center font-mono text-[13px] tabular-nums">{value}</span>
      <button
        type="button"
        aria-label={`${label} 增加`}
        onClick={() => onChange(clamp(value + 1))}
        disabled={value >= max}
        className="focus-ring grid h-7 w-7 place-items-center rounded-lg text-ink-soft transition-colors hover:bg-black/5 disabled:opacity-30"
      >
        <Plus size={13} weight="bold" />
      </button>
    </div>
  )
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  layoutId
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (next: T) => void
  layoutId: string
}): React.JSX.Element {
  return (
    <div className="flex h-[38px] items-center gap-0.5 rounded-xl bg-[#faf2df] p-1">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={`focus-ring relative flex-1 rounded-lg px-2 py-1 text-[12px] font-medium transition-colors ${
            value === option.value ? 'text-ink' : 'text-ink-soft hover:text-ink'
          }`}
        >
          {value === option.value && (
            <motion.span
              layoutId={layoutId}
              transition={{ type: 'spring', stiffness: 420, damping: 34 }}
              className="absolute inset-0 rounded-lg bg-surface shadow-[0_1px_3px_rgba(38,36,31,0.12)]"
            />
          )}
          <span className="relative">{option.label}</span>
        </button>
      ))}
    </div>
  )
}

export function Field({
  label,
  hint,
  error,
  htmlFor,
  children,
  className = '',
  action
}: {
  label: string
  hint?: string
  error?: string | null
  htmlFor?: string
  children: React.ReactNode
  className?: string
  action?: React.ReactNode
}): React.JSX.Element {
  return (
    <div className={`flex min-w-0 flex-col gap-2 ${className}`}>
      <div className="flex min-h-6 items-center justify-between gap-3">
        <label htmlFor={htmlFor} className="text-[13px] font-medium tracking-tight text-ink">
          {label}
        </label>
        {action}
      </div>
      {children}
      {error ? (
        <p className="text-[12px] leading-relaxed text-clay">{error}</p>
      ) : hint ? (
        <p className="text-[12px] leading-relaxed text-ink-soft">{hint}</p>
      ) : null}
    </div>
  )
}

export function SectionHeading({
  title,
  description,
  aside
}: {
  title: string
  description?: string
  aside?: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="flex flex-col gap-4 border-t border-line pt-8 md:flex-row md:items-start md:justify-between md:gap-8">
      <div className="max-w-[58ch]">
        <h2 className="text-[22px] font-medium tracking-tight text-ink md:text-[24px]">{title}</h2>
        {description && (
          <p className="mt-2 max-w-[52ch] text-[13px] leading-relaxed text-ink-soft">{description}</p>
        )}
      </div>
      {aside && <div className="shrink-0 md:pt-1">{aside}</div>}
    </div>
  )
}

export const STATUS_META: Record<
  RoomStatus['state'],
  { label: string; dot: string; text: string; ring: string }
> = {
  idle: { label: '未连接', dot: 'bg-[#a8a196]', text: 'text-ink-soft', ring: 'bg-[#a8a196]' },
  connecting: { label: '连接中', dot: 'bg-ember animate-breathe', text: 'text-ember', ring: 'bg-ember/20' },
  connected: { label: '直播中', dot: 'bg-moss animate-breathe', text: 'text-moss', ring: 'bg-moss/20' },
  error: { label: '连接异常', dot: 'bg-clay', text: 'text-clay', ring: 'bg-clay/20' }
}

export function StatusPill({
  status,
  compact = false
}: {
  status: RoomStatus
  compact?: boolean
}): React.JSX.Element {
  const meta = STATUS_META[status.state]
  if (compact) {
    return (
      <span
        className="inline-flex items-center gap-1.5 rounded-full border border-line/80 bg-surface/70 px-2 py-[3px] text-[10.5px] text-ink-soft"
        title={status.state === 'error' ? status.message : meta.label}
      >
        <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
        <span className={meta.text}>{meta.label}</span>
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface/80 px-3 py-1.5 text-[12px] font-medium">
      <span className="relative flex h-2 w-2">
        <span className={`absolute inline-flex h-full w-full rounded-full ${meta.ring}`} />
        <span className={`relative inline-flex h-2 w-2 rounded-full ${meta.dot}`} />
      </span>
      <span className={meta.text}>{meta.label}</span>
      {status.state === 'error' && (
        <span className="max-w-[240px] truncate text-ink-soft" title={status.message}>
          · {status.message}
        </span>
      )}
    </span>
  )
}

export function MicroLabel({
  children,
  className = ''
}: {
  children: React.ReactNode
  className?: string
}): React.JSX.Element {
  return (
    <span
      className={`font-mono text-[10px] tracking-[0.22em] text-ink-soft uppercase ${className}`}
    >
      {children}
    </span>
  )
}

export function Grain(): React.JSX.Element {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-50 opacity-[0.035]"
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='160' height='160' filter='url(%23n)'/%3E%3C/svg%3E\")"
      }}
    />
  )
}

export function BoneMark({ className = '' }: { className?: string }): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d={BONE_PATH} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export const BONE_PATH =
  'M17 10c.7-.7 1.69 0 2.5 0a2.5 2.5 0 1 0 0-5 .5.5 0 0 1-.5-.5 2.5 2.5 0 1 0-5 0c0 .81.7 1.8 0 2.5l-7 7c-.7.7-1.69 0-2.5 0a2.5 2.5 0 0 0 0 5c.28 0 .5.22.5.5a2.5 2.5 0 1 0 5 0c0-.81-.7-1.8 0-2.5Z'
