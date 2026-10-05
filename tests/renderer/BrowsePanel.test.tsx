import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { BrowsePanel } from '../../src/renderer/src/control/BrowsePanel'
import type { Passage } from '../../src/shared/pickerSelection'
import type { BibleIndex } from '../../src/shared/types'
import { fakeIndex } from '../helpers/fakeIndex'

const noop = () => {}
const JOHN_3_16_18: Passage = { bookId: 43, startChapter: 3, startVerse: 16, endChapter: 3, endVerse: 18, whole: false }
const render = (passages: Passage[], index: BibleIndex | null = fakeIndex) =>
  renderToStaticMarkup(<BrowsePanel index={index} passages={passages} jumpSignal={0} onChange={noop} />)

describe('BrowsePanel', () => {
  it('lists all 66 books with a divider between the testaments', () => {
    const out = render([])
    expect(out.match(/data-book="/g)).toHaveLength(66)
    expect(out.indexOf('Malachi')).toBeLessThan(out.indexOf('browse-divider'))
    expect(out.indexOf('browse-divider')).toBeLessThan(out.indexOf('Matthew'))
  })

  it('starts at Genesis 1 when nothing is shown', () => {
    const out = render([])
    expect(out).toMatch(/data-book="1" class="browse-item is-current"/)
    expect(out.match(/data-chapter="/g)).toHaveLength(50)
    expect(out).toMatch(/data-chapter="1" class="browse-item is-current"/)
    expect(out.match(/data-verse="/g)).toHaveLength(31)
  })

  it('opens at the first shown passage and highlights the shown verses', () => {
    const out = render([JOHN_3_16_18])
    expect(out).toMatch(/data-book="43" class="browse-item is-current"/)
    expect(out).toMatch(/data-chapter="3" class="browse-item is-current"/)
    expect(out.match(/data-verse="/g)).toHaveLength(36)
    expect(out).toMatch(/data-verse="16" class="browse-item is-selected"/)
    expect(out).toMatch(/data-verse="18" class="browse-item is-selected"/)
    expect(out).toMatch(/data-verse="15" class="browse-item"/)
    expect(out).toMatch(/data-verse="19" class="browse-item"/)
  })

  it('marks books and chapters that contain shown verses', () => {
    const out = render([JOHN_3_16_18])
    expect(out).toMatch(/data-book="43"[^>]*>John<span class="browse-mark"/)
    expect(out).toMatch(/data-book="42"[^>]*>Luke<\/button>/)
    expect(out).toMatch(/data-chapter="3"[^>]*>3<span class="browse-mark"/)
    expect(out).toMatch(/data-chapter="2"[^>]*>2<\/button>/)
    expect(out).toContain('\u25cf')
  })

  it('says Loading until verse counts arrive', () => {
    const out = render([], null)
    expect(out).toContain('Genesis')
    expect(out.match(/Loading\u2026/g)).toHaveLength(2)
    expect(out).not.toContain('data-chapter="')
  })
})
