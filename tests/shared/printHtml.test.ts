import { describe, expect, it } from 'vitest'
import { buildPrintHtml } from '../../src/shared/printHtml'
import type { DisplayGroup, Highlight, Span } from '../../src/shared/types'

const fonts = { heading: 'Georgia', verse: 'Georgia' }

function verse(chapter: number, verseNum: number, text: string, redLetter: Span[] = [], highlights: Highlight[] = []) {
  return { bookId: 43, chapter, verse: verseNum, text, redLetter, highlights }
}

describe('buildPrintHtml', () => {
  it('includes an escaped heading for each group', () => {
    const groups: DisplayGroup[] = [
      { label: 'John 3:16 & <love>', verses: [verse(3, 16, 'For God so loved the world')] },
    ]
    const html = buildPrintHtml(groups, fonts)
    expect(html).toContain('John 3:16 &amp; &lt;love&gt;')
    expect(html).not.toContain('<love>')
  })

  it('shows the verse number, and chapter:verse when the chapter changes within a group', () => {
    const groups: DisplayGroup[] = [
      {
        label: 'John 1:50-2:1',
        verses: [verse(1, 50, 'Nathanael said'), verse(1, 51, 'And he said'), verse(2, 1, 'the third day')],
      },
    ]
    const html = buildPrintHtml(groups, fonts)
    expect(html).toMatch(/>50</)
    expect(html).toMatch(/>51</)
    expect(html).toMatch(/>2:1</)
  })

  it('wraps red-letter text in an element with the red color, leaving narration plain', () => {
    const groups: DisplayGroup[] = [
      { label: 'John 3:16', verses: [verse(3, 16, 'Jesus said hello world', [{ start: 0, end: 10 }])] },
    ]
    const html = buildPrintHtml(groups, fonts)
    expect(html).toContain('#c00000')
    expect(html).toMatch(/color:\s*#c00000[^>]*>Jesus said</)
    // narration is not wrapped in the red-color element
    expect(html).not.toMatch(/color:\s*#c00000[^>]*>[^<]*hello world/)
    expect(html).toContain('hello world')
  })

  it('ignores highlights: jesus/normal segments still render, no highlight color appears', () => {
    const groups: DisplayGroup[] = [
      {
        label: 'John 3:16',
        verses: [
          verse(3, 16, 'Jesus wept', [{ start: 0, end: 5 }], [{ id: 1, start: 0, end: 10, color: '#ffff00' }]),
        ],
      },
    ]
    const html = buildPrintHtml(groups, fonts)
    expect(html).not.toContain('#ffff00')
    expect(html).toContain('#c00000')
    expect(html).toMatch(/color:\s*#c00000[^>]*>Jesus</)
    expect(html).toContain('wept')
  })

  it('escapes special characters in verse text', () => {
    const groups: DisplayGroup[] = [{ label: 'Test', verses: [verse(1, 1, 'He said <b>&"quote"</b>')] }]
    const html = buildPrintHtml(groups, fonts)
    expect(html).not.toContain('<b>')
    expect(html).toContain('&lt;b&gt;')
    expect(html).toContain('&amp;')
    expect(html).toContain('&quot;quote&quot;')
  })

  it('produces a document with no sections for empty groups', () => {
    const html = buildPrintHtml([], fonts)
    expect(html).toContain('<!doctype html>')
    expect(html).not.toContain('<section')
  })
})
