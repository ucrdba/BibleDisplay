export const QUICK_COLORS = [
  '#ffffff', '#f2f2f2', '#f0c040', '#ff4a4a', '#4aa3ff', '#6ad36a',
  '#c58bff', '#ff9f40', '#9a9a9a', '#111111', '#000000', '#1b2a4a',
]

export const HIGHLIGHT_COLORS = ['#ffffff', '#ffd84a', '#6ad36a', '#4aa3ff', '#ff9f40', '#c58bff', '#ff6fb5']

interface Props {
  label: string
  value: string
  onChange(color: string): void
  swatches?: string[]
}

export function ColorField({ label, value, onChange, swatches = QUICK_COLORS }: Props) {
  return (
    <div className="field">
      <span className="field-label">{label}</span>
      <div className="swatches">
        {swatches.map(c => (
          <button
            key={c}
            type="button"
            className={`swatch${c.toLowerCase() === value.toLowerCase() ? ' swatch--on' : ''}`}
            style={{ background: c }}
            title={c}
            onClick={() => onChange(c)}
          />
        ))}
        <input type="color" value={value} title="More colors" onChange={e => onChange(e.target.value)} />
      </div>
    </div>
  )
}
