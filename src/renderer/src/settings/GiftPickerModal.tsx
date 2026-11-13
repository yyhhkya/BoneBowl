import { useCallback, useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { ArrowClockwise, Check, Gift, MagnifyingGlass, WarningCircle, X } from '@phosphor-icons/react'
import type { GiftCatalogItem } from '../../../shared/types'
import { getApi } from '../lib/api'
import { Button } from './ui'

const api = getApi()

function priceLabel(item: GiftCatalogItem): string {
  if (!item.price) return '免费'
  if (item.coinType === 'silver') return `${item.price.toLocaleString('zh-CN')} 银瓜子`
  // 接口价格单位是金瓜子，1 电池 = 100 金瓜子
  const batteries = Math.round(item.price) / 100
  return `${batteries.toLocaleString('zh-CN', { maximumFractionDigits: 1 })} 电池`
}

export function GiftPickerModal({
  roomId,
  existingNames,
  onPick,
  onPickAll,
  onClose
}: {
  roomId: number
  existingNames: string[]
  onPick: (item: GiftCatalogItem) => void
  onPickAll: (items: GiftCatalogItem[]) => void
  onClose: () => void
}): React.JSX.Element {
  const [items, setItems] = useState<GiftCatalogItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [reloadKey, setReloadKey] = useState(0)
  const [added, setAdded] = useState<Set<string>>(() => new Set(existingNames))

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    api
      .fetchGifts(roomId)
      .then((catalog) => {
        if (cancelled) return
        const seen = new Set<string>()
        setItems(
          catalog.filter((item) => {
            const key = item.name.trim()
            if (!key || seen.has(key)) return false
            seen.add(key)
            return true
          })
        )
        setAdded(new Set(existingNames))
      })
      .catch((reason: unknown) => {
        if (cancelled) return
        setError(reason instanceof Error ? reason.message : '礼物列表加载失败')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
    // existingNames 只在打开时作为初始值，后续由本地 added 维护
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, reloadKey])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return items
    return items.filter((item) => item.name.toLowerCase().includes(q))
  }, [items, query])

  const remaining = useMemo(
    () => items.filter((item) => !added.has(item.name.trim())),
    [items, added]
  )

  const pick = useCallback(
    (item: GiftCatalogItem) => {
      const key = item.name.trim()
      if (added.has(key)) return
      onPick(item)
      setAdded((prev) => new Set(prev).add(key))
    },
    [added, onPick]
  )

  const pickAll = useCallback(() => {
    if (remaining.length === 0) return
    onPickAll(remaining)
    setAdded(new Set(items.map((item) => item.name.trim())))
  }, [remaining, items, onPickAll])

  return (
    <div className="fixed inset-0 z-50 grid place-items-center px-4">
      <motion.button
        type="button"
        aria-label="关闭礼物选择"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-[#3a2f1f]/30 backdrop-blur-[2px]"
      />
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label="选择礼物"
        initial={{ opacity: 0, y: 14, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 8, scale: 0.98 }}
        transition={{ type: 'spring', stiffness: 380, damping: 32 }}
        className="relative flex max-h-[min(84dvh,720px)] w-[min(94vw,560px)] flex-col overflow-hidden rounded-[32px] border border-line bg-surface p-6 shadow-[0_40px_90px_-40px_rgba(90,62,16,0.55)]"
      >
        <div className="flex items-start justify-between">
          <div>
            <div className="font-mono text-[9.5px] tracking-[0.24em] text-ink-soft uppercase">
              gift picker
            </div>
            <h2 className="mt-2 text-[22px] tracking-tight">选择礼物</h2>
            <p className="mt-1.5 text-[11.5px] leading-relaxed text-ink-soft">
              点击礼物加入映射，每份默认掉落 1 个骨头，之后可以再调。同名礼物自动合并。
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            className="focus-ring grid h-8 w-8 shrink-0 place-items-center rounded-full text-ink-soft transition-colors hover:bg-black/5 hover:text-ink"
          >
            <X size={16} />
          </button>
        </div>

        <div className="relative mt-5">
          <MagnifyingGlass
            size={15}
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-soft"
          />
          <input
            className="field-input !py-2.5 !pl-9 !text-[13px]"
            value={query}
            placeholder="搜索礼物名称"
            aria-label="搜索礼物"
            onChange={(event) => setQuery(event.target.value)}
            autoFocus
          />
        </div>

        <div className="-mx-1 mt-3 min-h-[220px] flex-1 overflow-y-auto px-1">
          {loading ? (
            <div className="flex flex-col gap-2" aria-hidden>
              {Array.from({ length: 6 }).map((_, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between rounded-2xl border border-line/70 bg-white/60 px-4 py-3.5"
                >
                  <div className="grid gap-2">
                    <span className="h-3 w-32 animate-pulse rounded-full bg-[#f3e7cb]" />
                    <span className="h-2.5 w-20 animate-pulse rounded-full bg-[#f7eeda]" />
                  </div>
                  <span className="h-6 w-16 animate-pulse rounded-full bg-[#f7eeda]" />
                </div>
              ))}
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
              <WarningCircle size={24} className="text-clay" />
              <p className="mt-3 text-[13px] font-medium">礼物列表加载失败</p>
              <p className="mt-1 max-w-[40ch] text-[11.5px] leading-relaxed text-ink-soft">{error}</p>
              <Button variant="ghost" className="mt-4" onClick={() => setReloadKey((key) => key + 1)}>
                <ArrowClockwise size={15} weight="bold" />
                重试
              </Button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
              <MagnifyingGlass size={22} className="text-ink-soft" />
              <p className="mt-3 text-[13px] font-medium">
                {items.length === 0 ? '这个直播间没有返回礼物' : '没有匹配的礼物'}
              </p>
              <p className="mt-1 text-[11.5px] text-ink-soft">
                {items.length === 0 ? '确认直播间号正确，或手动添加礼物名称。' : '换个关键词试试。'}
              </p>
            </div>
          ) : (
            <ul className="flex flex-col gap-2">
              {filtered.map((item) => {
                const name = item.name.trim()
                const picked = added.has(name)
                return (
                  <li key={name}>
                    <button
                      type="button"
                      onClick={() => pick(item)}
                      disabled={picked}
                      aria-label={`${picked ? '已添加' : '添加'} ${item.name}`}
                      className={`group flex w-full items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left transition-colors ${
                        picked
                          ? 'cursor-default border-line/70 bg-[#fbf6e9]/70'
                          : 'border-line bg-white hover:border-[#f0d68f] hover:bg-[#fffaf0] active:scale-[0.995]'
                      }`}
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="relative grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-xl bg-[#fff6df]">
                          <Gift size={17} className={picked ? 'text-[#d8c48f]' : 'text-[#d9b96a]'} />
                          {item.image ? (
                            <img
                              src={item.image}
                              alt=""
                              loading="lazy"
                              referrerPolicy="no-referrer"
                              className={`absolute inset-0 h-full w-full object-contain p-1 ${
                                picked ? 'opacity-55' : ''
                              }`}
                              onError={(event) => {
                                event.currentTarget.style.display = 'none'
                              }}
                            />
                          ) : null}
                        </span>
                        <div className="min-w-0">
                          <div className={`truncate text-[13px] font-medium ${picked ? 'text-ink-soft' : ''}`}>
                            {item.name}
                          </div>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2.5">
                        <span className="font-mono text-[10.5px] text-ink-soft tabular-nums">
                          {priceLabel(item)}
                        </span>
                        <span
                          className={`grid h-7 w-7 place-items-center rounded-full border transition-colors ${
                            picked
                              ? 'border-moss/40 bg-moss/12 text-moss'
                              : 'border-[#ecd9a8] text-ember group-hover:border-ember/50'
                          }`}
                        >
                          {picked ? <Check size={13} weight="bold" /> : <span className="text-[15px] leading-none">+</span>}
                        </span>
                      </div>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <div className="mt-4 flex items-center justify-between gap-3 border-t border-line/80 pt-4">
          <span className="font-mono text-[10.5px] text-ink-soft tabular-nums">
            {added.size} 个已添加 · 共 {items.length} 个
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              className="!px-3 !py-1.5 !text-[11.5px]"
              onClick={pickAll}
              disabled={remaining.length === 0}
            >
              全部添加
            </Button>
            <Button variant="accent" className="!px-4 !py-1.5 !text-[11.5px]" onClick={onClose}>
              完成
            </Button>
          </div>
        </div>
      </motion.div>
    </div>
  )
}
