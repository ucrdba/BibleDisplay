import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { VerseView } from '../../src/renderer/src/verse/VerseView'
import { DEFAULT_STYLES, type Styles } from '../../src/shared/styles'
import type { DisplayGroup } from '../../src/shared/types'

const TEXT = 'And he saith, Stand forth.'
const groups: DisplayGroup[] = [
  {
    label: 'Mark 3:3',
    verses: [
      { bookId: 41, chapter: 3, verse: 3, text: TEXT, redLetter: [{ start: 14, end: 26 }], highlights: [{ id: 1, start: 0, end: 3, color: '#00ff00' }] },
    ],
  },
]
const html = (g: DisplayGroup[], styles: Styles = DEFAULT_STYLES, blank = false) =>
  renderToStaticMarkup(<VerseView groups={g} styles={styles} blank={blank} />)

describe('VerseView', () => {
  it('shows the heading, verse number, and colored segments', () => {
    const out = html(groups)
    expect(out).toContain('Mark 3:3')
    expect(out).toContain('class="verse-num"')
    expect(out).toContain('data-verse-key="41.3.3"')
    expect(out).toContain(`color:${DEFAULT_STYLES.jesusColor}`)
    expect(out).toContain('color:#00ff00')
    expect(out).toContain('data-offset="14"')
  })

  it('applies sizes multiplied by scale and the font stack', () => {
    const out = html(groups, { ...DEFAULT_STYLES, scale: 2 })
    expect(out).toContain(`font-size:${DEFAULT_STYLES.verse.size * 2}px`)
    expect(out).toContain('Georgia, serif')
  })

  it('hides verse numbers when turned off and supports line layout', () => {
    const out = html(groups, { ...DEFAULT_STYLES, verseNumbers: { show: false, color: '#999' }, layout: 'lines' })
    expect(out).not.toContain('verse-num')
    expect(out).toContain('verse-body--lines')
  })

  it('shows nothing but the background when blank', () => {
    const out = html(groups, DEFAULT_STYLES, true)
    expect(out).not.toContain('Mark 3:3')
    expect(out).toContain(`background:${DEFAULT_STYLES.background}`)
  })

  it('shows chapter:verse at a chapter change inside one group', () => {
    const cross: DisplayGroup[] = [
      {
        label: 'John 1:51-2:1',
        verses: [
          { bookId: 43, chapter: 1, verse: 51, text: 'a', redLetter: [], highlights: [] },
          { bookId: 43, chapter: 2, verse: 1, text: 'b', redLetter: [], highlights: [] },
        ],
      },
    ]
    expect(html(cross)).toContain('>2:1</sup>')
  })
})
