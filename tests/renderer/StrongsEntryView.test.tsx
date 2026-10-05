import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { StrongsEntryView } from '../../src/renderer/src/control/StrongsEntryView'
import type { StrongsEntry } from '../../src/shared/types'

const H430: StrongsEntry = {
  id: 'H430',
  lemma: '\u05d0\u05b1\u05dc\u05b9\u05d4\u05b4\u05d9\u05dd',
  xlit: 'elohiym',
  pron: "el-o-heem'",
  derivation: 'plural of H433;',
  definition: 'gods in the ordinary sense',
  kjvDef: 'angels, God (gods).',
}
const G26: StrongsEntry = { id: 'G26', lemma: '\u1f00\u03b3\u03ac\u03c0\u03b7', xlit: 'agape', pron: '', derivation: '', definition: 'love', kjvDef: '' }
const render = (entry: StrongsEntry) => renderToStaticMarkup(<StrongsEntryView entry={entry} onLink={() => {}} />)

describe('StrongsEntryView', () => {
  it('shows a Hebrew entry right to left with every part', () => {
    const out = render(H430)
    expect(out).toContain('lang="he"')
    expect(out).toContain('dir="rtl"')
    for (const s of ['elohiym', 'el-o-heem&#x27;', 'Derivation', 'Definition', 'gods in the ordinary sense', 'KJV', 'angels, God (gods).']) {
      expect(out).toContain(s)
    }
  })

  it('turns Strong\u2019s numbers into links', () => {
    expect(render(H430)).toMatch(/<button[^>]*class="link-btn strongs-ref"[^>]*>H433<\/button>/)
  })

  it('shows a Greek entry and leaves out empty parts', () => {
    const out = render(G26)
    expect(out).toContain('lang="grc"')
    expect(out).not.toContain('dir="rtl"')
    expect(out).not.toContain('Derivation')
    expect(out).not.toContain('KJV')
    expect(out).not.toContain('()')
  })
})
