import { describe, expect, it } from 'vitest'
import { normalizeStrongs, parseUsfmBook, usfmBookId, wordsOf } from '../../data/lib/strongs/usfm'

const PILCROW = '\u00b6'
const RSQUO = '\u2019'
const BOOK = String.raw`\id GEN
\h Genesis
\c 1
\p
\v 1 In the \w beginning|strong="H7225"\w* \w God|strong="H0430"\w* created.
\v 2 And the \w earth|strong="H0776"\w* was \add without\add* form\f + \fr 1:2 \ft a note\f*.
\s1 A heading
\v 3 \w shall surely|strong="H4191"\w* \nd LORD\nd*${RSQUO}s ${PILCROW} end.
\c 2
\d A Psalm title that is not verse text.
\q1 \v 1 Thus \w the heavens|strong="H8064"\w*. \v 2 Two \+w on|strong="H5921"\+w* one line.`

const brief = (tokens: { word: string; strongs: string | null }[] | undefined) =>
  (tokens ?? []).map(t => (t.strongs ? `${t.word}=${t.strongs}` : t.word))

describe('normalizeStrongs', () => {
  it('drops leading zeros', () => {
    expect(normalizeStrongs('H0430')).toBe('H430')
    expect(normalizeStrongs('G0025')).toBe('G25')
    expect(normalizeStrongs('H7225')).toBe('H7225')
  })

  it('rejects anything else', () => {
    expect(() => normalizeStrongs('X12')).toThrow(/Bad Strong's number/)
  })
})

describe('usfmBookId', () => {
  it('maps eBible file numbers to our book ids', () => {
    expect(usfmBookId('02-GENeng-kjv2006.usfm')).toBe(1)
    expect(usfmBookId('40-MALeng-kjv2006.usfm')).toBe(39)
    expect(usfmBookId('70-MATeng-kjv2006.usfm')).toBe(40)
    expect(usfmBookId('96-REVeng-kjv2006.usfm')).toBe(66)
    expect(usfmBookId('00-FRTeng-kjv2006.usfm')).toBeNull()
    expect(usfmBookId('copr.htm')).toBeNull()
  })
})

describe('wordsOf', () => {
  it('keeps inner apostrophes and hyphens, drops punctuation', () => {
    expect(wordsOf(`Beth-el, the LORD${RSQUO}s house; fathers${RSQUO} sins.`)).toEqual([
      'Beth-el',
      'the',
      `LORD${RSQUO}s`,
      'house',
      'fathers',
      'sins',
    ])
  })
})

describe('parseUsfmBook', () => {
  const book = parseUsfmBook(BOOK)

  it('finds every verse', () => {
    expect([...book.keys()]).toEqual(['1:1', '1:2', '1:3', '2:1', '2:2'])
  })

  it('reads tagged and untagged words in order', () => {
    expect(brief(book.get('1:1'))).toEqual(['In', 'the', 'beginning=H7225', 'God=H430', 'created'])
  })

  it('drops footnotes and keeps the text of other markers', () => {
    expect(brief(book.get('1:2'))).toEqual(['And', 'the', 'earth=H776', 'was', 'without', 'form'])
  })

  it('gives every word of a multi-word tag the same number, skips headings, joins marker-split words', () => {
    expect(brief(book.get('1:3'))).toEqual(['shall=H4191', 'surely=H4191', `LORD${RSQUO}s`, 'end'])
  })

  it('skips Psalm titles and handles several verses on one line and nested word tags', () => {
    expect(brief(book.get('2:1'))).toEqual(['Thus', 'the=H8064', 'heavens=H8064'])
    expect(brief(book.get('2:2'))).toEqual(['Two', 'on=H5921', 'one', 'line'])
  })
})
