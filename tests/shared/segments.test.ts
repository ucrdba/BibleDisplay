import { describe, expect, it } from 'vitest'
import { buildSegments } from '../../src/shared/segments'

const TEXT = 'And he saith, Stand forth.' // "Stand forth." = 14..26
const brief = (segs: ReturnType<typeof buildSegments>) => segs.map(s => [s.text, s.kind, s.color ?? null])

describe('buildSegments', () => {
  it('returns one normal segment when there are no spans', () => {
    expect(buildSegments('abc', [], [])).toEqual([{ start: 0, end: 3, text: 'abc', kind: 'normal' }])
  })

  it('returns nothing for empty text', () => {
    expect(buildSegments('', [], [])).toEqual([])
  })

  it('marks red-letter spans', () => {
    const segs = buildSegments(TEXT, [{ start: 14, end: 26 }], [])
    expect(brief(segs)).toEqual([
      ['And he saith, ', 'normal', null],
      ['Stand forth.', 'jesus', null],
    ])
    expect(segs[1].start).toBe(14)
  })

  it('lets a highlight override red letters only where they overlap', () => {
    const segs = buildSegments(TEXT, [{ start: 14, end: 26 }], [{ id: 1, start: 10, end: 19, color: '#ff0' }])
    expect(brief(segs)).toEqual([
      ['And he sai', 'normal', null],
      ['th, Stand', 'highlight', '#ff0'],
      [' forth.', 'jesus', null],
    ])
  })

  it('lets a later highlight win over an earlier one', () => {
    const segs = buildSegments('abcdef', [], [
      { id: 1, start: 0, end: 4, color: 'red' },
      { id: 2, start: 2, end: 6, color: 'blue' },
    ])
    expect(brief(segs)).toEqual([
      ['ab', 'highlight', 'red'],
      ['cdef', 'highlight', 'blue'],
    ])
  })

  it('merges adjacent spans of the same kind', () => {
    const segs = buildSegments('abcdef', [{ start: 0, end: 3 }, { start: 3, end: 6 }], [])
    expect(brief(segs)).toEqual([['abcdef', 'jesus', null]])
  })

  it('ignores spans that do not fit the text', () => {
    const segs = buildSegments('abc', [{ start: 2, end: 9 }], [{ id: 1, start: -1, end: 2, color: 'red' }])
    expect(brief(segs)).toEqual([['abc', 'normal', null]])
  })
})
