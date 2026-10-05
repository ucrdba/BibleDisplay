import { createRef } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ListTabs } from '../../src/renderer/src/control/ListTabs'
import { SearchPanel, searchKeyAction, searchStatus } from '../../src/renderer/src/control/SearchPanel'
import type { SearchState } from '../../src/renderer/src/control/searchRunner'
import type { SearchHit, SearchMode, SearchScope } from '../../src/shared/search'

const noop = () => {}
const PS_23_2 = 'He maketh me to lie down in green pastures: he leadeth me beside the still waters.'
const s = PS_23_2.indexOf('still')
const HITS: SearchHit[] = [
  { bookId: 19, chapter: 23, verse: 2, text: PS_23_2, marks: [{ start: s, end: s + 12 }] },
  { bookId: 23, chapter: 8, verse: 6, text: 'the waters of Shiloah that go softly', marks: [{ start: 4, end: 10 }] },
]
const state = (patch: Partial<SearchState> = {}): SearchState => ({ status: 'done', total: 0, hits: [], note: null, ...patch })

const render = (opts: { text?: string; mode?: SearchMode; scope?: SearchScope; st?: SearchState; selected?: number[] } = {}) =>
  renderToStaticMarkup(
    <SearchPanel
      inputRef={createRef<HTMLInputElement>()}
      text={opts.text ?? 'still waters'}
      mode={opts.mode ?? 'all'}
      scope={opts.scope ?? 'bible'}
      state={opts.st ?? state({ total: 2, hits: HITS })}
      selected={opts.selected ?? []}
      onText={noop}
      onMode={noop}
      onScope={noop}
      onClick={noop}
      onSubmit={noop}
    />,
  )

describe('ListTabs', () => {
  it('shows the three tabs and marks the active one', () => {
    const out = renderToStaticMarkup(<ListTabs active="search" onChange={noop} />)
    expect(out.indexOf('Imported')).toBeLessThan(out.indexOf('Recent'))
    expect(out.indexOf('Recent')).toBeLessThan(out.indexOf('Search'))
    expect(out).toMatch(/aria-selected="true" class="list-tab is-active"[^>]*>Search/)
    expect(out).toMatch(/aria-selected="false" class="list-tab"[^>]*>Imported/)
  })
})

describe('SearchPanel', () => {
  it('shows the chosen mode and scope', () => {
    const out = render({ mode: 'regex', scope: 'book:19' })
    expect(out).toMatch(/<option value="regex" selected="">Regex/)
    expect(out).toMatch(/<option value="book:19" selected="">Psalms/)
    expect(out).toContain('All words')
    expect(out).toContain('New Testament')
  })

  it('lists hits with short references and bold matches', () => {
    const out = render()
    expect(out).toContain('Psa 23:2')
    expect(out).toContain('Isa 8:6')
    expect(out).toContain('<b>still waters</b>')
    expect(out).toContain('<b>waters</b>')
  })

  it('marks selected hits', () => {
    const out = render({ selected: [1] })
    expect(out).toMatch(/class="link-btn search-hit is-active"[^>]*title="Show Isa 8:6"/)
    expect(out).toMatch(/class="link-btn search-hit"[^>]*title="Show Psa 23:2"/)
  })

  it('shows a note under the box', () => {
    const out = render({ st: state({ total: 2, hits: HITS, note: 'Invalid pattern: Unterminated group' }) })
    expect(out).toContain('class="error-text"')
    expect(out).toContain('Invalid pattern: Unterminated group')
    expect(out).toContain('Psa 23:2')
  })
})

describe('searchStatus', () => {
  it('hints when the box is empty', () => {
    expect(searchStatus('', state(), 'bible')).toBe('Type words to find, e.g. still waters')
  })

  it('reports loading, searching, and unavailable', () => {
    expect(searchStatus('x', state({ status: 'loading' }), 'bible')).toBe('Loading\u2026')
    expect(searchStatus('x', state({ status: 'idle' }), 'bible')).toBe('Searching\u2026')
    expect(searchStatus('x', state({ status: 'searching' }), 'bible')).toBe('Searching\u2026')
    expect(searchStatus('x', state({ status: 'unavailable' }), 'bible')).toBe('Search unavailable \u2014 couldn\u2019t load Bible text')
  })

  it('names the scope when nothing matches', () => {
    expect(searchStatus('x', state(), 'ot')).toBe('No matches in Old Testament')
  })

  it('stays quiet when a note explains the empty result', () => {
    expect(searchStatus('(x', state({ note: 'Invalid pattern: Unterminated group' }), 'bible')).toBe('')
  })

  it('counts matches and says when the list is cut short', () => {
    expect(searchStatus('x', state({ total: 1, hits: HITS.slice(0, 1) }), 'bible')).toBe('1 match')
    expect(searchStatus('x', state({ total: 2, hits: HITS }), 'bible')).toBe('2 matches')
    const many = Array.from({ length: 500 }, () => HITS[0])
    expect(searchStatus('x', state({ total: 1284, hits: many }), 'bible')).toBe('1,284 matches \u2014 showing first 500')
  })
})

describe('searchKeyAction', () => {
  it('submits on Enter', () => {
    expect(searchKeyAction('Enter', '')).toBe('submit')
  })

  it('clears with Esc only when there is text', () => {
    expect(searchKeyAction('Escape', 'faith')).toBe('clear')
    expect(searchKeyAction('Escape', '')).toBeNull()
  })

  it('ignores other keys', () => {
    expect(searchKeyAction('a', 'faith')).toBeNull()
  })
})
