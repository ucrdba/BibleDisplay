import { useEffect, useState } from 'react'
import { stepScale, type Styles, type TextStyle } from '../../../shared/styles'
import { ColorField, HIGHLIGHT_COLORS } from './ColorField'
import { FontSelect } from './FontSelect'

interface Props {
  styles: Styles
  fonts: string[]
  onChange(styles: Styles): void
  blank: boolean
  onToggleBlank(): void
  hasSelection: boolean
  onHighlight(color: string): void
  onRemoveHighlight(): void
}

function SizeField({ value, onChange }: { value: number; onChange(size: number): void }) {
  const [draft, setDraft] = useState(String(value))
  useEffect(() => setDraft(String(value)), [value])
  return (
    <label className="field">
      <span className="field-label">Size</span>
      <input
        type="number"
        min={8}
        max={200}
        value={draft}
        onChange={e => {
          setDraft(e.target.value)
          const n = Number(e.target.value)
          if (Number.isInteger(n) && n >= 8 && n <= 200) onChange(n)
        }}
        onBlur={() => setDraft(String(value))}
      />
    </label>
  )
}

export function StylePanel({ styles, fonts, onChange, blank, onToggleBlank, hasSelection, onHighlight, onRemoveHighlight }: Props) {
  const [customHighlight, setCustomHighlight] = useState(HIGHLIGHT_COLORS[0])
  const set = (patch: Partial<Styles>) => onChange({ ...styles, ...patch })
  const setHeading = (patch: Partial<Styles['heading']>) => set({ heading: { ...styles.heading, ...patch } })
  const setVerse = (patch: Partial<TextStyle>) => set({ verse: { ...styles.verse, ...patch } })

  return (
    <div className="style-panel">
      <section>
        <h3 className="panel__title">Display</h3>
        <div className="button-row">
          <button type="button" className="btn" title="Smaller (Ctrl −)" onClick={() => set({ scale: stepScale(styles.scale, -1) })}>
            A−
          </button>
          <span className="scale-value">{Math.round(styles.scale * 100)}%</span>
          <button type="button" className="btn" title="Bigger (Ctrl +)" onClick={() => set({ scale: stepScale(styles.scale, 1) })}>
            A+
          </button>
          <button type="button" className={`btn${blank ? ' btn--active' : ''}`} title="Blank the display (B)" onClick={onToggleBlank}>
            {blank ? 'Unblank' : 'Blank'}
          </button>
        </div>
        <label className="field">
          <span className="field-label">Layout</span>
          <select value={styles.layout} onChange={e => set({ layout: e.target.value === 'lines' ? 'lines' : 'paragraph' })}>
            <option value="paragraph">Verses as a paragraph</option>
            <option value="lines">Each verse on its own line</option>
          </select>
        </label>
        <ColorField label="Background" value={styles.background} onChange={background => set({ background })} />
      </section>

      <section>
        <h3 className="panel__title">Reference heading</h3>
        <FontSelect label="Font" fonts={fonts} value={styles.heading.font} onChange={font => setHeading({ font })} />
        <SizeField value={styles.heading.size} onChange={size => setHeading({ size })} />
        <ColorField label="Color" value={styles.heading.color} onChange={color => setHeading({ color })} />
        <label className="field field--inline">
          <input type="checkbox" checked={styles.heading.bold} onChange={e => setHeading({ bold: e.target.checked })} /> Bold
        </label>
      </section>

      <section>
        <h3 className="panel__title">Verse text</h3>
        <FontSelect label="Font" fonts={fonts} value={styles.verse.font} onChange={font => setVerse({ font })} />
        <SizeField value={styles.verse.size} onChange={size => setVerse({ size })} />
        <ColorField label="Color" value={styles.verse.color} onChange={color => setVerse({ color })} />
      </section>

      <section>
        <h3 className="panel__title">Jesus&apos; words</h3>
        <ColorField label="Color" value={styles.jesusColor} onChange={jesusColor => set({ jesusColor })} />
      </section>

      <section>
        <h3 className="panel__title">Verse numbers</h3>
        <label className="field field--inline">
          <input
            type="checkbox"
            checked={styles.verseNumbers.show}
            onChange={e => set({ verseNumbers: { ...styles.verseNumbers, show: e.target.checked } })}
          />{' '}
          Show verse numbers
        </label>
        <ColorField
          label="Color"
          value={styles.verseNumbers.color}
          onChange={color => set({ verseNumbers: { ...styles.verseNumbers, color } })}
        />
      </section>

      <section>
        <h3 className="panel__title">Highlight</h3>
        <p className="muted">{hasSelection ? 'Pick a color for the selected words.' : 'Select words in the preview first.'}</p>
        <div className="swatches">
          {HIGHLIGHT_COLORS.map(c => (
            <button
              key={c}
              type="button"
              className="swatch"
              style={{ background: c }}
              title={c}
              disabled={!hasSelection}
              onClick={() => onHighlight(c)}
            />
          ))}
        </div>
        <div className="button-row">
          <input type="color" value={customHighlight} title="Custom color" onChange={e => setCustomHighlight(e.target.value)} />
          <button type="button" className="btn" disabled={!hasSelection} onClick={() => onHighlight(customHighlight)}>
            Apply color
          </button>
          <button type="button" className="btn" disabled={!hasSelection} onClick={onRemoveHighlight}>
            Remove highlight
          </button>
        </div>
      </section>
    </div>
  )
}
