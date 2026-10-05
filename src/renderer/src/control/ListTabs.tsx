export type ListTab = 'imported' | 'recent' | 'search'

const TABS: { id: ListTab; label: string }[] = [
  { id: 'imported', label: 'Imported' },
  { id: 'recent', label: 'Recent' },
  { id: 'search', label: 'Search' },
]

interface Props {
  active: ListTab
  onChange(tab: ListTab): void
}

export function ListTabs({ active, onChange }: Props) {
  return (
    <div className="list-tabs" role="tablist">
      {TABS.map(t => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={t.id === active}
          className={t.id === active ? 'list-tab is-active' : 'list-tab'}
          onClick={() => onChange(t.id)}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}
