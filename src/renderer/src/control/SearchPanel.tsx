import type { KeyboardEvent, RefObject } from 'react'
import {
  hitReference,
  markedPieces,
  scopeLabel,
  scopeOptions,
  SEARCH_MODES,
  type SearchMode,
  type SearchScope,
} from '../../../shared/search'
import type { SearchState } from './searchRunner'
import type { ClickMods } from './SelectableList'

export function searchStatus(text: string, state: SearchState, scope: SearchScope): string {
  if (state.status === 'unavailable') return 'Search unavailable \u2014 couldn\u2019t load Bible text'
  if (text.trim() === '') return 'Type words to find, e.g. still waters'
  if (state.status === 'loading') return 'Loading\u2026'
  if (state.status === 'idle' || (state.status === 'searching' && state.hits.length === 0)) return 'Searching\u2026'
  if (state.total === 0) return state.note ? '' : `No matches in ${scopeLabel(scope)}`
  const count = `${state.total.toLocaleString('en-US')} ${state.total === 1 ? 'match' : 'matches'}`
  return state.total > state.hits.length ? `${count} \u2014 showing first ${state.hits.length}` : count
}

export function searchKeyAction(key: string, text: string): 'submit' | 'clear' | null {
  if (key === 'Enter') return 'submit'
  if (key === 'Escape' && text !== '') return 'clear'
  return null
}

interface Props {
  inputRef: RefObject<HTMLInputElement | null>
  text: string
  mode: SearchMode
  scope: SearchScope
  state: SearchState
  selected: number[]
  onText(text: string): void
  onMode(mode: SearchMode): void
  onScope(scope: SearchScope): void
  onClick(index: number, mods: ClickMods): void
  onSubmit(): void
}

export function SearchPanel({ inputRef, text, mode, scope, state, selected, onText, onMode, onScope, onClick, onSubmit }: Props) {
  const status = searchStatus(text, state, scope)

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    const action = searchKeyAction(e.key, text)
    if (!action) return
    // preventDefault also tells the window-level shortcut handler to leave this key alone.
    e.preventDefault()
    if (action === 'submit') onSubmit()
    else onText('')
  }

  return (
    <section className="list search">
      <div className="search__box">
        <input
          ref={inputRef}
          className="search__input"
          placeholder="Find words\u2026"
          aria-label="Search text"
          value={text}
          onChange={e => onText(e.target.value)}
          onKeyDown={onKeyDown}
        />
        <button
          type="button"
          className="btn search__clear"
          title="Clear search"
          disabled={text === ''}
          onClick={() => {
            onText('')
            inputRef.current?.focus()
          }}
        >
          {'\u00d7'}
        </button>
      </div>
      <div className="search__options">
        <select aria-label="Search mode" value={mode} onChange={e => onMode(e.target.value as SearchMode)}>
          {SEARCH_MODES.map(m => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
        <select aria-label="Search in" value={scope} onChange={e => onScope(e.target.value as SearchScope)}>
          {scopeOptions().map(o => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      {status && <p className="muted search__status">{status}</p>}
      {state.note && <p className="error-text">{state.note}</p>}
      <ul className="selectable search__results" role="listbox" aria-multiselectable="true">
        {state.hits.map((hit, i) => {
          const ref = hitReference(hit)
          const isSel = selected.includes(i)
          return (
            <li key={ref} role="option" aria-selected={isSel}>
              <button
                type="button"
                className={isSel ? 'link-btn search-hit is-active' : 'link-btn search-hit'}
                title={`Show ${ref}`}
                onClick={e => onClick(i, { ctrl: e.ctrlKey || e.metaKey, shift: e.shiftKey })}
              >
                <span className="search-hit__ref">{ref}</span>{' '}
                <span className="search-hit__text">
                  {markedPieces(hit.text, hit.marks).map((p, j) => (p.bold ? <b key={j}>{p.text}</b> : <span key={j}>{p.text}</span>))}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
