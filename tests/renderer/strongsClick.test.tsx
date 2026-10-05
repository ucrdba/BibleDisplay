// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { pointToVerseOffset, verseTextRange } from '../../src/renderer/src/control/selection'
import { VerseView } from '../../src/renderer/src/verse/VerseView'
import { DEFAULT_STYLES } from '../../src/shared/styles'
import type { DisplayGroup } from '../../src/shared/types'

// Red letters split the verse into two text nodes: "For God" and " so loved the world".
const groups: DisplayGroup[] = [
  {
    label: 'John 3:16',
    verses: [{ bookId: 43, chapter: 3, verse: 16, text: 'For God so loved the world', redLetter: [{ start: 0, end: 7 }], highlights: [] }],
  },
]

function setup(): HTMLElement {
  const root = document.createElement('div')
  root.innerHTML = renderToStaticMarkup(<VerseView groups={groups} styles={DEFAULT_STYLES} blank={false} />)
  document.body.replaceChildren(root)
  return root
}

const textNodes = (root: HTMLElement) => {
  const verse = root.querySelector('[data-verse-key="43.3.16"]')!
  const walker = document.createTreeWalker(verse, NodeFilter.SHOW_TEXT)
  const out: Text[] = []
  for (let n = walker.nextNode(); n; n = walker.nextNode()) out.push(n as Text)
  return out
}

describe('pointToVerseOffset', () => {
  it('maps a point in the first text node', () => {
    const root = setup()
    expect(pointToVerseOffset(root, textNodes(root)[0], 5)).toEqual({ bookId: 43, chapter: 3, verse: 16, offset: 5 })
  })

  it('counts earlier text nodes', () => {
    const root = setup()
    expect(pointToVerseOffset(root, textNodes(root)[1], 4)).toEqual({ bookId: 43, chapter: 3, verse: 16, offset: 11 })
  })

  it('ignores points outside verse text, such as the verse number', () => {
    const root = setup()
    const num = root.querySelector('.verse-num')!.firstChild!
    expect(pointToVerseOffset(root, num, 0)).toBeNull()
  })
})

describe('verseTextRange', () => {
  it('covers the given offsets across text nodes', () => {
    const root = setup()
    expect(verseTextRange(root, '43.3.16', 4, 7)?.toString()).toBe('God')
    expect(verseTextRange(root, '43.3.16', 4, 16)?.toString()).toBe('God so loved')
    expect(verseTextRange(root, '1.1.1', 0, 2)).toBeNull()
  })
})
