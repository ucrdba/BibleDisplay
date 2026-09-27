import { describe, expect, it } from 'vitest'
import { toVerseList, toVerseText } from '../../src/shared/exportVerses'
import { parseReferences } from '../../src/shared/parser'
import type { DisplayGroup } from '../../src/shared/types'
import { fakeIndex } from '../helpers/fakeIndex'

function verse(chapter: number, verseNum: number, text: string) {
  return { bookId: 43, chapter, verse: verseNum, text, redLetter: [], highlights: [] }
}

describe('toVerseList', () => {
  it('lists one heading per line, with CRLF endings', () => {
    const groups = [{ label: 'John 3:16' }, { label: 'Mark 3:1-3' }, { label: 'Psalms 23' }]
    expect(toVerseList(groups)).toBe('John 3:16\r\nMark 3:1-3\r\nPsalms 23\r\n')
  })

  it('returns an empty string for no groups', () => {
    expect(toVerseList([])).toBe('')
  })
})

describe('toVerseText', () => {
  it('shows chapter:verse when the chapter changes within a group', () => {
    const groups: DisplayGroup[] = [
      {
        label: 'John 1:50-2:1',
        verses: [verse(1, 50, 'Nathanael said'), verse(1, 51, 'And he said'), verse(2, 1, 'And the third day')],
      },
    ]
    expect(toVerseText(groups)).toBe(
      'John 1:50-2:1\r\n50 Nathanael said\r\n51 And he said\r\n2:1 And the third day\r\n',
    )
  })

  it('separates groups with a blank line', () => {
    const groups: DisplayGroup[] = [
      { label: 'John 3:16', verses: [verse(3, 16, 'For God so loved the world')] },
      { label: 'John 1:1', verses: [verse(1, 1, 'In the beginning was the Word')] },
    ]
    expect(toVerseText(groups)).toBe(
      'John 3:16\r\n16 For God so loved the world\r\n\r\nJohn 1:1\r\n1 In the beginning was the Word\r\n',
    )
  })

  it('returns an empty string for no groups', () => {
    expect(toVerseText([])).toBe('')
  })
})

describe('round trip through parseReferences', () => {
  it('gives back the same label for each line of toVerseList', () => {
    const labels = ['John 3:16', 'Mark 3:1-3', 'Psalms 23', 'John 1:50-2:3', 'Jude 1:5', '1 John 3:1']
    const list = toVerseList(labels.map(label => ({ label })))
    const lines = list.split('\r\n').filter(Boolean)
    expect(lines).toEqual(labels)
    for (const label of labels) {
      const result = parseReferences(label, fakeIndex)
      expect(result.errors).toEqual([])
      expect(result.groups).toHaveLength(1)
      expect(result.groups[0].label).toBe(label)
    }
  })
})
