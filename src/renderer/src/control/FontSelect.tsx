import { fontStack } from '../../../shared/styles'

export function fontOptions(fonts: string[], current: string): { value: string; label: string }[] {
  if (fonts.length === 0) return [{ value: current, label: current }]
  const options = fonts.map(f => ({ value: f, label: f }))
  if (!fonts.includes(current)) options.unshift({ value: current, label: `${current} (missing)` })
  return options
}

interface Props {
  label: string
  fonts: string[]
  value: string
  onChange(font: string): void
}

export function FontSelect({ label, fonts, value, onChange }: Props) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <select value={value} style={{ fontFamily: fontStack(value) }} onChange={e => onChange(e.target.value)}>
        {fontOptions(fonts, value).map(o => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  )
}
