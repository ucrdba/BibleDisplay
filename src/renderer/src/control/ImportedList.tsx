interface Props {
  items: string[]
  problems: (string | null)[]
  activeIndex: number | null
  error: string | null
  onPick(index: number): void
  onImport(): void
  onClear(): void
}

export function ImportedList({ items, problems, activeIndex, error, onPick, onImport, onClear }: Props) {
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
        <ul>
          {items.map((item, i) => (
            <li key={i}>
              <button
                type="button"
                className={i === activeIndex ? 'link-btn is-active' : 'link-btn'}
                title={`Show ${item}`}
                onClick={() => onPick(i)}
              >
                {item}
              </button>
              {problems[i] && (
                <span className="warn" title={problems[i] ?? undefined}>
                  ⚠
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
