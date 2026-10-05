import { describe, expect, it } from 'vitest'
import { parseReferences } from '../../src/shared/parser'
import {
  addRange,
  isSelected,
  pickerClick,
  rangeOf,
  selectedBooks,
  selectedChapters,
  toggleVerse,
  toReferenceText,
  wholeChapter,
  type Passage,
  type VerseRef,
} from '../../src/shared/pickerSelection'
import { fakeIndex } from '../helpers/fakeIndex'

// fakeIndex: John 1-4 have 51, 25, 36, 54 verses; Psalms 23-25 have 6, 10, 22; 1 John 3 has 24; Jude 1 has 25.
const J = (chapter: number, verse: number): VerseRef => ({ bookId: 43, chapter, verse })
const P = (sc: number, sv: number, ec: number, ev: number, bookId = 43, whole = false): Passage => ({
  bookId,
  startChapter: sc,
  startVerse: sv,
  endChapter: ec,
  endVerse: ev,
  whole,
})
const PS23 = P(23, 1, 23, 6, 19, true)
const PS24 = P(24, 1, 24, 10, 19, true)
const none = { ctrl: false, shift: false }
const ctrl = { ctrl: true, shift: false }
const shift = { ctrl: false, shift: true }
const ctrlShift = { ctrl: true, shift: true }

describe('isSelected and markers', () => {
  const ps = [P(3, 35, 4, 2), PS23]
  it('knows which verses are shown', () => {
    expect(isSelected(ps, J(3, 36))).toBe(true)
    expect(isSelected(ps, J(4, 1))).toBe(true)
    expect(isSelected(ps, J(4, 3))).toBe(false)
    expect(isSelected(ps, { bookId: 19, chapter: 23, verse: 4 })).toBe(true)
    expect(isSelected(ps, { bookId: 19, chapter: 24, verse: 1 })).toBe(false)
  })

  it('lists books and chapters that contain shown verses', () => {
    expect([...selectedBooks(ps)].sort((a, b) => a - b)).toEqual([19, 43])
    expect([...selectedChapters(ps, 43)].sort((a, b) => a - b)).toEqual([3, 4])
    expect([...selectedChapters(ps, 19)]).toEqual([23])
    expect([...selectedChapters(ps, 1)]).toEqual([])
  })
})

describe('toggleVerse \u2014 adding', () => {
  it('adds to an empty selection', () => {
    expect(toggleVerse([], J(3, 16), fakeIndex)).toEqual([P(3, 16, 3, 16)])
  })

  it('appends a verse that touches nothing', () => {
    expect(toggleVerse([P(3, 16, 3, 16)], J(3, 20), fakeIndex)).toEqual([P(3, 16, 3, 16), P(3, 20, 3, 20)])
  })

  it('joins a passage it touches, before or after', () => {
    expect(toggleVerse([P(3, 16, 3, 18)], J(3, 19), fakeIndex)).toEqual([P(3, 16, 3, 19)])
    expect(toggleVerse([P(3, 16, 3, 18)], J(3, 15), fakeIndex)).toEqual([P(3, 15, 3, 18)])
  })

  it('joins across a chapter boundary', () => {
    expect(toggleVerse([P(3, 30, 3, 36)], J(4, 1), fakeIndex)).toEqual([P(3, 30, 4, 1)])
    expect(toggleVerse([P(4, 1, 4, 3)], J(3, 36), fakeIndex)).toEqual([P(3, 36, 4, 3)])
  })

  it('bridges two passages into the earlier position', () => {
    expect(toggleVerse([P(3, 16, 3, 16), PS23, P(3, 18, 3, 18)], J(3, 17), fakeIndex)).toEqual([P(3, 16, 3, 18), PS23])
  })

  it('leaves passages it does not touch alone, even if they touch each other', () => {
    expect(toggleVerse([PS23, PS24], J(3, 16), fakeIndex)).toEqual([PS23, PS24, P(3, 16, 3, 16)])
  })
})

describe('toggleVerse \u2014 removing', () => {
  it('removes a single verse', () => {
    expect(toggleVerse([P(3, 16, 3, 16)], J(3, 16), fakeIndex)).toEqual([])
  })

  it('splits a passage in place', () => {
    expect(toggleVerse([PS23, P(3, 16, 3, 18)], J(3, 17), fakeIndex)).toEqual([PS23, P(3, 16, 3, 16), P(3, 18, 3, 18)])
  })

  it('trims an end', () => {
    expect(toggleVerse([P(3, 16, 3, 18)], J(3, 18), fakeIndex)).toEqual([P(3, 16, 3, 17)])
    expect(toggleVerse([P(3, 16, 3, 18)], J(3, 16), fakeIndex)).toEqual([P(3, 17, 3, 18)])
  })

  it('splits across a chapter boundary', () => {
    expect(toggleVerse([P(3, 35, 4, 2)], J(4, 1), fakeIndex)).toEqual([P(3, 35, 3, 36), P(4, 2, 4, 2)])
  })

  it('turns an edited whole chapter into verse ranges', () => {
    expect(toggleVerse([PS23], { bookId: 19, chapter: 23, verse: 3 }, fakeIndex)).toEqual([P(23, 1, 23, 2, 19), P(23, 4, 23, 6, 19)])
  })
})

describe('ranges', () => {
  it('builds a range in either direction, across chapters', () => {
    expect(rangeOf(J(3, 18), J(3, 16))).toEqual(P(3, 16, 3, 18))
    expect(rangeOf(J(3, 35), J(4, 2))).toEqual(P(3, 35, 4, 2))
  })

  it('appends a range that touches nothing', () => {
    expect(addRange([P(3, 16, 3, 16)], P(3, 20, 3, 22), fakeIndex)).toEqual([P(3, 16, 3, 16), P(3, 20, 3, 22)])
  })

  it('merges a range into the passages it touches, keeping their position', () => {
    expect(addRange([P(4, 1, 4, 1), P(3, 16, 3, 16)], P(3, 17, 3, 20), fakeIndex)).toEqual([P(4, 1, 4, 1), P(3, 16, 3, 20)])
  })

  it('changes nothing when the range is already shown', () => {
    expect(addRange([PS23], P(23, 2, 23, 3, 19), fakeIndex)).toEqual([PS23])
  })

  it('builds a whole chapter', () => {
    expect(wholeChapter(19, 23, fakeIndex)).toEqual(PS23)
  })
})

describe('pickerClick', () => {
  it('click shows only that verse', () => {
    expect(pickerClick([P(3, 16, 3, 18)], J(4, 2), none, null, fakeIndex)).toEqual({ passages: [P(4, 2, 4, 2)], anchor: J(4, 2) })
  })

  it('Ctrl+click adds or removes a verse', () => {
    expect(pickerClick([P(3, 16, 3, 16)], J(3, 20), ctrl, J(3, 16), fakeIndex)).toEqual({
      passages: [P(3, 16, 3, 16), P(3, 20, 3, 20)],
      anchor: J(3, 20),
    })
    expect(pickerClick([P(3, 16, 3, 16), P(3, 20, 3, 20)], J(3, 16), ctrl, J(3, 20), fakeIndex)).toEqual({
      passages: [P(3, 20, 3, 20)],
      anchor: J(3, 16),
    })
  })

  it('Shift+click replaces everything with the range from the anchor', () => {
    expect(pickerClick([P(3, 16, 3, 16), P(3, 20, 3, 20)], J(4, 2), shift, J(3, 16), fakeIndex)).toEqual({
      passages: [P(3, 16, 4, 2)],
      anchor: J(3, 16),
    })
    expect(pickerClick([P(3, 20, 3, 20)], J(3, 18), shift, J(3, 20), fakeIndex)).toEqual({
      passages: [P(3, 18, 3, 20)],
      anchor: J(3, 20),
    })
  })

  it('Ctrl+Shift+click adds the range', () => {
    const ps23v1 = P(23, 1, 23, 1, 19)
    expect(pickerClick([ps23v1, P(3, 16, 3, 16)], J(3, 18), ctrlShift, J(3, 16), fakeIndex)).toEqual({
      passages: [ps23v1, P(3, 16, 3, 18)],
      anchor: J(3, 16),
    })
  })

  it('Shift without a usable anchor acts like a click', () => {
    expect(pickerClick([P(3, 16, 3, 16)], J(3, 20), shift, null, fakeIndex)).toEqual({ passages: [P(3, 20, 3, 20)], anchor: J(3, 20) })
    const psAnchor = { bookId: 19, chapter: 23, verse: 1 }
    expect(pickerClick([P(3, 16, 3, 16)], J(3, 20), shift, psAnchor, fakeIndex)).toEqual({ passages: [P(3, 20, 3, 20)], anchor: J(3, 20) })
  })

  it('Ctrl+Shift without a usable anchor acts like Ctrl+click', () => {
    const psAnchor = { bookId: 19, chapter: 23, verse: 1 }
    expect(pickerClick([P(3, 16, 3, 16)], J(3, 20), ctrlShift, psAnchor, fakeIndex)).toEqual({
      passages: [P(3, 16, 3, 16), P(3, 20, 3, 20)],
      anchor: J(3, 20),
    })
  })
})

describe('toReferenceText', () => {
  const JUDE = wholeChapter(65, 1, fakeIndex)
  const ALL = [P(3, 16, 3, 16), P(3, 16, 3, 18), P(3, 36, 4, 2), PS23, P(23, 1, 24, 10, 19, true), P(3, 1, 3, 2, 62), JUDE]

  it('writes every passage with its book code', () => {
    expect(toReferenceText(ALL)).toBe('Joh 3:16, Joh 3:16-18, Joh 3:36-4:2, Psa 23, Psa 23-24, 1Jo 3:1-2, Jud 1:1-25')
    expect(toReferenceText([])).toBe('')
  })

  it('reads back through the parser to the same passages', () => {
    const back = parseReferences(toReferenceText(ALL), fakeIndex)
    expect(back.errors).toEqual([])
    expect(
      back.groups.map(g => ({
        bookId: g.bookId,
        startChapter: g.startChapter,
        startVerse: g.startVerse,
        endChapter: g.endChapter,
        endVerse: g.endVerse,
        whole: g.whole,
      })),
    ).toEqual([...ALL.slice(0, 6), { ...JUDE, whole: false }])
  })
})
