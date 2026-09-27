import { buildSegments } from './segments'
import { fontStack } from './styles'
import type { DisplayGroup, VerseData } from './types'

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function verseHtml(v: VerseData, showChapter: boolean): string {
  const num = showChapter ? `${v.chapter}:${v.verse}` : `${v.verse}`
  const body = buildSegments(v.text, v.redLetter, [])
    .map(seg => {
      const text = escapeHtml(seg.text)
      return seg.kind === 'jesus' ? `<span style="color:#c00000">${text}</span>` : text
    })
    .join('')
  return `<sup class="vn">${escapeHtml(num)}</sup>${body} `
}

/**
 * Builds a complete, standalone HTML document for printing a set of displayed passages:
 * black text on white, headings in the heading font, verses flowing as a paragraph in the
 * verse font with small superscript verse numbers. Highlights are not printed (segments are
 * built with an empty highlight list), only Jesus' words in red.
 */
export function buildPrintHtml(groups: DisplayGroup[], fonts: { heading: string; verse: string }): string {
  const sections = groups
    .map(g => {
      const verses = g.verses
        .map((v, i) => verseHtml(v, i > 0 && v.chapter !== g.verses[i - 1].chapter))
        .join('')
      return `<section><h2>${escapeHtml(g.label)}</h2><p>${verses}</p></section>`
    })
    .join('')

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
  @page { margin: 18mm; }
  * { box-sizing: border-box; }
  body { margin: 0; color: #000; background: #fff; font-family: ${fontStack(fonts.verse)}; font-size: 12pt; line-height: 1.4; }
  h2 { font-family: ${fontStack(fonts.heading)}; font-size: 14pt; font-weight: bold; margin: 0 0 0.3em; }
  section { margin-bottom: 1.2em; }
  section p { margin: 0; }
  .vn { font-size: 0.7em; vertical-align: super; margin-right: 0.15em; }
</style>
</head>
<body>${sections}</body>
</html>
`
}
