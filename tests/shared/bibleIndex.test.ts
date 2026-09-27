import { describe, expect, it } from 'vitest'
import { createIndex } from '../../src/shared/bibleIndex'

describe('createIndex', () => {
  it('returns verse counts and 0 for unknown chapters', () => {
    const index = createIndex({ 43: [51, 25, 36] })
    expect(index.verseCount(43, 3)).toBe(36)
    expect(index.verseCount(43, 4)).toBe(0)
    expect(index.verseCount(1, 1)).toBe(0)
  })
})
