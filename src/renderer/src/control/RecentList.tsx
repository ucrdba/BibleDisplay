interface Props {
  items: string[]
  onPick(input: string): void
}

export function RecentList({ items, onPick }: Props) {
  return (
    <section className="list">
      <h3 className="panel__title">Recent</h3>
      {items.length === 0 ? (
        <p className="muted">No recent verses</p>
      ) : (
        <ul>
          {items.map(item => (
            <li key={item}>
              <button type="button" className="link-btn" title={`Show ${item}`} onClick={() => onPick(item)}>
                {item}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
