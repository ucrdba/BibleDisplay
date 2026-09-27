import { describe, expect, it } from 'vitest'
import { IMPORT_LIMIT, parseImportText } from '../../src/shared/importList'

describe('parseImportText', () => {
  it('returns one trimmed line per non-blank line, in order', () => {
    expect(parseImportText('jn 3:16\n\n  ps 23  \nmk 3:1-3, luke 1:2\n')).toEqual(['jn 3:16', 'ps 23', 'mk 3:1-3, luke 1:2'])
  })

  it('handles Windows, old Mac, and Unix line endings', () => {
    expect(parseImportText('a\r\nb\rc\nd')).toEqual(['a', 'b', 'c', 'd'])
  })

  it('ignores a leading byte-order mark', () => {
    expect(parseImportText('﻿jn 3:16\r\nps 23')).toEqual(['jn 3:16', 'ps 23'])
  })

  it('returns nothing for empty or blank text', () => {
    expect(parseImportText('')).toEqual([])
    expect(parseImportText(' \n\t\r\n ')).toEqual([])
  })

  it('keeps at most IMPORT_LIMIT lines', () => {
    const text = Array.from({ length: IMPORT_LIMIT + 5 }, (_, i) => `ps ${i + 1}`).join('\n')
    const lines = parseImportText(text)
    expect(IMPORT_LIMIT).toBe(500)
    expect(lines).toHaveLength(500)
    expect(lines[499]).toBe('ps 500')
  })
})
