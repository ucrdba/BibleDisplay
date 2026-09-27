import type { ClickMods } from './SelectableList'
import { SelectableList } from './SelectableList'

interface Props {
  items: string[]
  problems: (string | null)[]
  selected: number[]
  error: string | null
  onClick(index: number, mods: ClickMods): void
  onContext(index: number): void
  onDelete(): void
  onImport(): void
  onClear(): void
}

export function ImportedList({ items, problems, selected, error, onClick, onContext, onDelete, onImport, onClear }: Props) {
  return (
    <section className="list">
      <h3 className="panel__title">Imported</h3>
      <div className="button-row">
        <button type="button" className="btn" onClick={onImport}>
          Import list…
        </button>
        <button type="button" className="btn" disabled={items.length === 0} onClick={onClear}>
          Clear list
        </button>
      </div>
      {error && <p className="error-text">{error}</p>}
      {items.length === 0 ? (
        <p className="muted">No list imported</p>
      ) : (
        <SelectableList items={items} selected={selected} problems={problems} onClick={onClick} onContext={onContext} onDelete={onDelete} />
      )}
    </section>
  )
}
