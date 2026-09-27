import { describe, expect, it } from 'vitest'
import { decodeTextFile, IMPORT_LIMIT, IMPORT_MAX_BYTES, parseImportText } from '../../src/shared/importList'

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

describe('IMPORT_MAX_BYTES', () => {
  it('is 1 MB', () => {
    expect(IMPORT_MAX_BYTES).toBe(1_048_576)
  })
})

describe('decodeTextFile', () => {
  const TEXT = 'jn 3:16\r\nps 23'
  const EXPECTED = ['jn 3:16', 'ps 23']

  it('decodes UTF-8 without a BOM', () => {
    const buf = Buffer.from(TEXT, 'utf8')
    expect(parseImportText(decodeTextFile(buf))).toEqual(EXPECTED)
  })

  it('decodes UTF-8 with a BOM', () => {
    const buf = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(TEXT, 'utf8')])
    expect(parseImportText(decodeTextFile(buf))).toEqual(EXPECTED)
  })

  it('decodes UTF-16LE with a BOM', () => {
    const buf = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(TEXT, 'utf16le')])
    expect(parseImportText(decodeTextFile(buf))).toEqual(EXPECTED)
  })

  it('decodes UTF-16BE with a BOM', () => {
    const le = Buffer.from(TEXT, 'utf16le')
    const be = Buffer.alloc(le.length)
    for (let i = 0; i < le.length; i += 2) {
      be[i] = le[i + 1]
      be[i + 1] = le[i]
    }
    const buf = Buffer.concat([Buffer.from([0xfe, 0xff]), be])
    expect(parseImportText(decodeTextFile(buf))).toEqual(EXPECTED)
  })
})
