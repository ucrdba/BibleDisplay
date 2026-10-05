import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { StrongsPanel } from '../../src/renderer/src/control/StrongsPanel'
import {
  followLink,
  goBack,
  INITIAL_STRONGS,
  showLookup,
  type StrongsState,
  type StrongsView,
} from '../../src/renderer/src/control/strongsState'
import type { StrongsEntry } from '../../src/shared/types'

const entry = (id: string): StrongsEntry => ({ id, lemma: 'x', xlit: `x${id}`, pron: '', derivation: '', definition: `meaning ${id.slice(1)}`, kjvDef: '' })
const view = (id: string, context: string | null = null): StrongsView => ({ kind: 'entry', entry: entry(id), context })
const noop = () => {}
const render = (state: StrongsState, collapsed = false) =>
  renderToStaticMarkup(<StrongsPanel state={state} collapsed={collapsed} onToggle={noop} onLink={noop} onBack={noop} />)

describe('strongsState', () => {
  it('starts empty', () => {
    expect(INITIAL_STRONGS).toEqual({ view: { kind: 'empty' }, back: [] })
  })

  it('a lookup clears the history', () => {
    const s = followLink(showLookup(view('H430')), view('H433'))
    expect(showLookup(view('G25'))).toEqual({ view: view('G25'), back: [] })
    expect(s.back).toHaveLength(1)
  })

  it('following links builds history and Back walks it', () => {
    const a = showLookup(view('H430', '"God" in Genesis 1:1'))
    const b = followLink(a, view('H433'))
    const c = followLink(b, view('H410'))
    expect(c.back.map(v => (v.kind === 'entry' ? v.entry.id : v.kind))).toEqual(['H430', 'H433'])
    expect(goBack(c)).toEqual(b)
    expect(goBack(goBack(c))).toEqual(a)
    expect(goBack(a)).toEqual(a)
  })

  it('following a link to the entry already shown changes nothing', () => {
    const a = showLookup(view('H430'))
    expect(followLink(a, view('H430'))).toBe(a)
  })
})

describe('StrongsPanel', () => {
  it('invites a click before any lookup', () => {
    expect(render(INITIAL_STRONGS)).toContain("Click a word in the preview to see its Strong&#x27;s entry.")
  })

  it('shows the messages', () => {
    expect(render(showLookup({ kind: 'untagged', word: 'the' }))).toContain('No Strong&#x27;s number for &#x27;the&#x27;.')
    expect(render(showLookup({ kind: 'missing', id: 'H9999' }))).toContain('No entry for H9999.')
    expect(render(showLookup({ kind: 'unavailable' }))).toContain('Strong&#x27;s data not installed')
  })

  it('shows an entry with its header and context', () => {
    const out = render(showLookup(view('H430', '"God" in Genesis 1:1')))
    expect(out).toContain('H430')
    expect(out).toContain('Hebrew')
    expect(out).toContain('&quot;God&quot; in Genesis 1:1')
    expect(out).toContain('meaning 430')
    expect(out).not.toContain('>Back<')
  })

  it('offers Back after following a link', () => {
    const out = render(followLink(showLookup(view('H430')), view('G25')))
    expect(out).toContain('>Back<')
    expect(out).toContain('Greek')
  })

  it('collapses to its bar', () => {
    const out = render(showLookup(view('H430')), true)
    expect(out).toContain('strongs-panel--collapsed')
    expect(out).not.toContain('meaning 430')
    expect(out).toContain('aria-expanded="false"')
  })
})
