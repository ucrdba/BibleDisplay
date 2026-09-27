import type { MonitorInfo } from '../../../shared/types'

interface Props {
  monitors: MonitorInfo[]
  chosenId: number | null
  onChange(id: number | null): void
}

export function MonitorSelect({ monitors, chosenId, onChange }: Props) {
  return (
    <label className="field">
      <span className="field-label">Display on</span>
      <select
        value={chosenId === null ? 'auto' : String(chosenId)}
        onChange={e => onChange(e.target.value === 'auto' ? null : Number(e.target.value))}
      >
        <option value="auto">Automatic (first extra monitor)</option>
        {monitors.map(m => (
          <option key={m.id} value={String(m.id)}>
            {m.label}
          </option>
        ))}
      </select>
    </label>
  )
}
