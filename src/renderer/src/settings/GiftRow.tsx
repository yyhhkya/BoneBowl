import { Flask, Trash } from '@phosphor-icons/react'
import type { GiftRule } from '../../../shared/types'
import { EditableNumber, Stepper, Toggle } from './ui'

export function GiftRow({
  rule,
  onChange,
  onTest,
  onRemove
}: {
  rule: GiftRule
  onChange: (patch: Partial<GiftRule>) => void
  onTest: () => void
  onRemove: () => void
}): React.JSX.Element {
  const invalid = !rule.name.trim()
  return (
    <div
      className={`group grid gap-3 px-4 py-3.5 transition-colors hover:bg-white/55 sm:grid-cols-[minmax(0,1fr)_108px_220px_44px_76px] sm:items-center ${
        rule.enabled ? '' : 'opacity-55'
      }`}
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <input
          className={`field-input w-full min-w-0 !py-2 !text-[13px] sm:w-1/3 ${invalid ? '!border-clay/60' : ''}`}
          value={rule.name}
          placeholder="礼物名称"
          aria-label="礼物名称"
          aria-invalid={invalid}
          onChange={(event) => onChange({ name: event.target.value })}
        />
      </div>

      <div>
        <Stepper
          value={rule.bones}
          max={40}
          onChange={(bones) => onChange({ bones })}
          label={`${rule.name || '礼物'} 骨头数量`}
        />
        <span className="sr-only">每份掉落 {rule.bones} 根骨头</span>
      </div>

      <div className="flex items-center gap-2">
        <input
          type="range"
          min={0.5}
          max={5}
          step={0.05}
          value={rule.scale}
          aria-label={`${rule.name || '礼物'} 骨头大小滑块`}
          className="range-honey min-w-0 flex-1"
          onChange={(event) => onChange({ scale: Number(event.target.value) })}
        />
        <div className="flex shrink-0 items-center gap-0.5">
          <EditableNumber
            value={rule.scale}
            min={0.5}
            max={5}
            decimals={2}
            onChange={(scale) => onChange({ scale })}
            label={`${rule.name || '礼物'} 骨头大小`}
            className="field-input h-8 !w-[58px] !rounded-lg !px-1 !py-0 text-center font-mono text-[11px] tabular-nums"
          />
          <span className="font-mono text-[10px] text-ink-soft">×</span>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 sm:justify-center">
        <Toggle
          checked={rule.enabled}
          onChange={(enabled) => onChange({ enabled })}
          label={`${rule.name || '该礼物'} 启用`}
        />
      </div>
      <div className="flex items-center justify-end gap-1">
        <button
          type="button"
          onClick={onTest}
          title="按当前设置试投一根"
          aria-label={`试投 ${rule.name || '该礼物'}`}
          className="focus-ring grid h-8 w-8 place-items-center rounded-lg text-ink-soft transition-colors hover:bg-sun/35 hover:text-[#7a5a10]"
        >
          <Flask size={15} />
        </button>
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
