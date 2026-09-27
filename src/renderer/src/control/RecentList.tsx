import type { ClickMods } from './SelectableList'
import { SelectableList } from './SelectableList'

interface Props {
  items: string[]
  selected: number[]
  onClick(index: number, mods: ClickMods): void
  onContext(index: number): void
  onDelete(): void
}

export function RecentList({ items, selected, onClick, onContext, onDelete }: Props) {
  return (
    <section className="list">
      <h3 className="panel__title">Recent</h3>
      {items.length === 0 ? (
        <p className="muted">No recent verses</p>
      ) : (
        <SelectableList items={items} selected={selected} onClick={onClick} onContext={onContext} onDelete={onDelete} />
      )}
    </section>
  )
}
