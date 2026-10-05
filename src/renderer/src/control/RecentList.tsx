import { useState } from 'react'
import type { ClickMods } from './SelectableList'
import { SelectableList } from './SelectableList'

interface Props {
  items: string[]
  selected: number[]
  onClick(index: number, mods: ClickMods): void
  onContext(index: number): void
  onDelete(): void
  onClear(): void
}

export function RecentList({ items, selected, onClick, onContext, onDelete, onClear }: Props) {
  // Recent can't be brought back once cleared, so Clear list asks first (inline, not a pop-up dialog).
  const [confirming, setConfirming] = useState(false)
  const count = items.length

  return (
    <section className="list">
      <h3 className="panel__title">Recent</h3>
      {confirming ? (
        <div className="button-row confirm-row">
          <span>{`Clear all ${count} recent ${count === 1 ? 'entry' : 'entries'}?`}</span>
          <button
            type="button"
            className="btn btn--danger"
            onClick={() => {
              setConfirming(false)
              onClear()
            }}
          >
            Clear
          </button>
          <button type="button" className="btn" onClick={() => setConfirming(false)}>
            Cancel
          </button>
        </div>
      ) : (
        <div className="button-row">
          <button type="button" className="btn" disabled={count === 0} onClick={() => setConfirming(true)}>
            Clear list
          </button>
        </div>
      )}
      {count === 0 ? (
        <p className="muted">No recent verses</p>
      ) : (
        <SelectableList items={items} selected={selected} onClick={onClick} onContext={onContext} onDelete={onDelete} />
      )}
    </section>
  )
}
