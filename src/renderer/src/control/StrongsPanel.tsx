import type { StrongsState } from './strongsState'
import { StrongsEntryView } from './StrongsEntryView'

interface Props {
  state: StrongsState
  collapsed: boolean
  onToggle(): void
  onLink(id: string): void
  onBack(): void
}

const DOT = '\u00b7'
const OPEN = '\u25be'
const CLOSED = '\u25b4'

function body(state: StrongsState, onLink: (id: string) => void) {
  const v = state.view
  switch (v.kind) {
    case 'empty':
      return <p className="muted">Click a word in the preview to see its Strong&apos;s entry.</p>
    case 'unavailable':
      return <p className="muted">Strong&apos;s data not installed {'\u2014'} run npm run import-strongs.</p>
    case 'untagged':
      return <p className="muted">{`No Strong's number for '${v.word}'.`}</p>
    case 'missing':
      return <p className="muted">{`No entry for ${v.id}.`}</p>
    case 'entry':
      return <StrongsEntryView entry={v.entry} onLink={onLink} />
  }
}

export function StrongsPanel({ state, collapsed, onToggle, onLink, onBack }: Props) {
  const v = state.view
  return (
    <section className={`strongs-panel${collapsed ? ' strongs-panel--collapsed' : ''}`}>
      <div className="strongs-panel__bar">
        <button
          type="button"
          className="link-btn strongs-panel__toggle"
          aria-expanded={!collapsed}
          title={collapsed ? "Show Strong's" : "Hide Strong's"}
          onClick={onToggle}
        >
          {collapsed ? CLOSED : OPEN} Strong&apos;s
        </button>
        {!collapsed && v.kind === 'entry' && (
          <span className="strongs-panel__title">
            {`${v.entry.id} ${DOT} ${v.entry.id.startsWith('H') ? 'Hebrew' : 'Greek'}`}
            {v.context && ` ${DOT} ${v.context}`}
          </span>
        )}
        {!collapsed && state.back.length > 0 && (
          <button type="button" className="btn strongs-panel__back" onClick={onBack}>
            Back
          </button>
        )}
      </div>
      {!collapsed && <div className="strongs-panel__body">{body(state, onLink)}</div>}
    </section>
  )
}
