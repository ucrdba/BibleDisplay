import type { RefGroup } from '../../../shared/types'

interface Props {
  groups: RefGroup[]
  onRemove(index: number): void
}

export function SelectedList({ groups, onRemove }: Props) {
  return (
    <section className="list">
      <h3 className="panel__title">Selected</h3>
      {groups.length === 0 ? (
        <p className="muted">Nothing on screen</p>
      ) : (
        <ul>
          {groups.map((g, i) => (
            <li key={`${i}-${g.label}`} className="list__row">
              <span>{g.label}</span>
              <button type="button" className="icon-btn" title={`Remove ${g.label}`} onClick={() => onRemove(i)}>
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
