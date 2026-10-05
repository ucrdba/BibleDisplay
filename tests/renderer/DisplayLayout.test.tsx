import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { bandStyle, DisplayLayout } from '../../src/renderer/src/verse/DisplayLayout'
import { DEFAULT_STYLES } from '../../src/shared/styles'
import type { DisplayGroup, DisplayStrongs } from '../../src/shared/types'

const GROUPS: DisplayGroup[] = [
  {
    label: 'Genesis 1:1',
    verses: [{ bookId: 1, chapter: 1, verse: 1, text: 'In the beginning God created the heaven and the earth.', redLetter: [], highlights: [] }],
  },
]
const STRONGS: DisplayStrongs = {
  entry: { id: 'H430', lemma: 'x', xlit: 'elohiym', pron: "el-o-heem'", derivation: 'plural of H433;', definition: 'gods', kjvDef: 'God' },
  mark: { bookId: 1, chapter: 1, verse: 1, start: 17, end: 20 },
}
const render = (opts: { groups?: DisplayGroup[]; blank?: boolean; strongs?: DisplayStrongs | null } = {}) =>
  renderToStaticMarkup(
    <DisplayLayout groups={opts.groups ?? GROUPS} styles={DEFAULT_STYLES} blank={opts.blank ?? false} strongs={opts.strongs ?? null} />,
  )

describe('DisplayLayout', () => {
  it('shows only the verses when there is no Strong\u2019s entry', () => {
    const out = render()
    expect(out).toContain('class="display-layout__verses"')
    expect(out).toContain('Genesis 1:1')
    expect(out).not.toContain('strongs-band')
  })

  it('shows the band with the entry under the verses', () => {
    const out = render({ strongs: STRONGS })
    expect(out.indexOf('display-layout__verses')).toBeLessThan(out.indexOf('strongs-band'))
    expect(out).toContain('H430 \u00b7 Hebrew')
    expect(out).toContain('elohiym')
    expect(out).toContain('<span class="strongs-ref">H433</span>')
    expect(out).not.toContain('<button')
  })

  it('hides the band when blank or when no verses are shown', () => {
    expect(render({ strongs: STRONGS, blank: true })).not.toContain('strongs-band')
    expect(render({ strongs: STRONGS, groups: [] })).not.toContain('strongs-band')
  })
})

describe('bandStyle', () => {
  it('builds the band from the display styles', () => {
    const s = bandStyle({ ...DEFAULT_STYLES, scale: 1.5 })
    expect(s.fontSize).toBe(Math.round(DEFAULT_STYLES.verse.size * 1.5 * 0.6))
    expect(s.color).toBe(DEFAULT_STYLES.verse.color)
    expect(s.fontFamily).toContain(DEFAULT_STYLES.verse.font)
    expect(s.background).toBe(`color-mix(in srgb, ${DEFAULT_STYLES.background} 90%, white)`)
    expect(s.borderTop).toBe(`2px solid ${DEFAULT_STYLES.heading.color}`)
    expect((s as Record<string, unknown>)['--strongs-label-color']).toBe(DEFAULT_STYLES.heading.color)
  })
})
