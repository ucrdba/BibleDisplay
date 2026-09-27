// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { selectionToRanges } from '../../src/renderer/src/control/selection'
import { VerseView } from '../../src/renderer/src/verse/VerseView'
import { DEFAULT_STYLES } from '../../src/shared/styles'
import type { DisplayGroup } from '../../src/shared/types'

const groups: DisplayGroup[] = [
  {
    label: 'John 3:16-17',
    verses: [
      { bookId: 43, chapter: 3, verse: 16, text: 'For God so loved the world', redLetter: [{ start: 0, end: 26 }], highlights: [] },
      { bookId: 43, chapter: 3, verse: 17, text: 'For God sent not his Son', redLetter: [], highlights: [] },
    ],
  },
]

function setup(): HTMLElement {
  const root = document.createElement('div')
  root.innerHTML = renderToStaticMarkup(<VerseView groups={groups} styles={DEFAULT_STYLES} blank={false} />)
  document.body.replaceChildren(root)
  return root
}

const textOf = (root: HTMLElement, verse: number) =>
  root.querySelector(`[data-verse-key="43.3.${verse}"] span`)!.firstChild as Text

describe('selectionToRanges', () => {
  it('maps a selection inside one verse to character offsets', () => {
    const root = setup()
    const r = document.createRange()
    r.setStart(textOf(root, 16), 4)
    r.setEnd(textOf(root, 16), 7)
    expect(selectionToRanges(root, r)).toEqual([{ bookId: 43, chapter: 3, verse: 16, start: 4, end: 7 }])
  })

  it('splits a selection across verses', () => {
    const root = setup()
    const r = document.createRange()
    r.setStart(textOf(root, 16), 18)
    r.setEnd(textOf(root, 17), 7)
    expect(selectionToRanges(root, r)).toEqual([
      { bookId: 43, chapter: 3, verse: 16, start: 18, end: 26 },
      { bookId: 43, chapter: 3, verse: 17, start: 0, end: 7 },
    ])
  })

  it('ignores a selection of only a verse number', () => {
    const root = setup()
    const r = document.createRange()
    r.selectNodeContents(root.querySelectorAll('.verse-num')[1])
    expect(selectionToRanges(root, r)).toEqual([])
  })
})
