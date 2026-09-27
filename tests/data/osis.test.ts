import { describe, expect, it } from 'vitest'
import { decodeEntities, parseOsis } from '../../data/lib/osis'
import { FIXTURE } from '../helpers/osisFixture'

describe('decodeEntities', () => {
  it('decodes named and numeric entities', () => {
    expect(decodeEntities('a &amp; b &lt;c&gt; &quot;d&quot; &apos;e&apos; &#65;&#x42;')).toBe('a & b <c> "d" \'e\' AB')
  })
})

describe('parseOsis', () => {
  const verses = parseOsis(FIXTURE)

  it('finds every verse, in order', () => {
    expect(verses.map(v => `${v.osisBook}.${v.chapter}.${v.verse}`)).toEqual(['Mark.3.3', 'Mark.3.4', 'Ps.3.1', 'Tob.1.1'])
  })

  it('collapses whitespace and marks words of Jesus', () => {
    const v = verses[0]
    expect(v.text).toBe('And he saith unto the man which had the withered hand, Stand forth.')
    const start = v.text.indexOf('Stand')
    expect(v.redLetter).toEqual([{ start, end: v.text.length }])
  })

  it('ends a red span before trailing narration', () => {
    const v = verses[1]
    expect(v.text).toBe('And he saith unto them, Is it lawful to do good on the sabbath days? But they held their peace.')
    expect(v.text.slice(v.redLetter[0].start, v.redLetter[0].end)).toBe('Is it lawful to do good on the sabbath days?')
  })

  it('keeps italic words, skips titles, and has no red letters in narration', () => {
    expect(verses[2].text).toBe('LORD, how are they increased that trouble me! many are they that rise up against me.')
    expect(verses[2].redLetter).toEqual([])
  })

  it('decodes entities in text', () => {
    expect(verses[3].text).toBe('Apocrypha text & more')
  })
})
