import { Trash } from '@phosphor-icons/react'
import { SIZES, SIZE_LABEL, type GiftRule } from '../../../shared/types'
import { Segmented, Stepper, Toggle } from './ui'

export function GiftRow({
  rule,
  onChange,
  onRemove
}: {
  rule: GiftRule
  onChange: (patch: Partial<GiftRule>) => void
  onRemove: () => void
}): React.JSX.Element {
  const invalid = !Number.isFinite(rule.giftId) || rule.giftId <= 0
  return (
    <div
      className={`group grid gap-3 px-4 py-3.5 transition-colors hover:bg-white/55 sm:grid-cols-[minmax(0,1fr)_108px_132px_44px_32px] sm:items-center ${
        rule.enabled ? '' : 'opacity-55'
      }`}
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <div className="relative w-[86px] shrink-0">
          <input
            className={`field-input !px-2.5 !py-2 font-mono !text-[12.5px] tabular-nums ${
              invalid ? '!border-clay/60' : ''
            }`}
            value={rule.giftId > 0 ? String(rule.giftId) : ''}
            placeholder="ID"
            aria-label="礼物 ID"
            aria-invalid={invalid}
            inputMode="numeric"
            onChange={(event) => {
              const digits = event.target.value.replace(/\D/g, '').slice(0, 10)
              onChange({ giftId: digits ? Number(digits) : 0 })
            }}
          />
        </div>
        <input
          className="field-input min-w-0 flex-1 !py-2 !text-[13px]"
          value={rule.name}
          placeholder="礼物名称"
          aria-label="礼物名称"
          onChange={(event) => onChange({ name: event.target.value })}
        />
      </div>

      <div>
        <Stepper
          value={rule.bones}
          onChange={(bones) => onChange({ bones })}
          label={`${rule.name || '礼物'} 骨头数量`}
        />
        <span className="sr-only">每份掉落 {rule.bones} 根骨头</span>
      </div>

      <Segmented
        value={rule.size}
        layoutId={`size-${rule.id}`}
        onChange={(size) => onChange({ size })}
        options={SIZES.map((size) => ({ value: size, label: SIZE_LABEL[size] }))}
      />

      <div className="flex items-center justify-between gap-3 sm:justify-center">
        <Toggle
          checked={rule.enabled}
          onChange={(enabled) => onChange({ enabled })}
          label={`${rule.name || '该礼物'} 启用`}
        />
        <button
          type="button"
          onClick={onRemove}
          aria-label={`删除 ${rule.name || '该礼物'}`}
          className="focus-ring grid h-8 w-8 place-items-center rounded-lg text-ink-soft transition-colors hover:bg-clay/10 hover:text-clay sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
        >
          <Trash size={15} />
        </button>
      </div>
    </div>
  )
}
