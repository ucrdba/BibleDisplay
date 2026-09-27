import type { Span } from '../../src/shared/types'

export interface ParsedVerse {
  osisBook: string
  chapter: number
  verse: number
  text: string
  redLetter: Span[]
}

interface Current {
  osisBook: string
  chapter: number
  verse: number
  text: string
  red: Span[]
  redStart: number | null
}

const TOKEN_RE = /<[^>]+>|[^<]+/g
const ATTR_RE = /([\w:]+)="([^"]*)"/g

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_m, e: string) => {
    const k = e.toLowerCase()
    if (k === 'amp') return '&'
    if (k === 'lt') return '<'
    if (k === 'gt') return '>'
    if (k === 'quot') return '"'
    if (k === 'apos') return "'"
    return String.fromCodePoint(k.startsWith('#x') ? parseInt(k.slice(2), 16) : parseInt(k.slice(1), 10))
  })
}

function attrs(tag: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const m of tag.matchAll(ATTR_RE)) out[m[1]] = m[2]
  return out
}

export function parseOsis(xml: string): ParsedVerse[] {
  const verses: ParsedVerse[] = []
  const openJesusQuotes = new Set<string>()
  let cur: Current | null = null
  let skipDepth = 0 // inside <title> or <note>

  const append = (s: string) => {
    if (!cur) return
    let t = s.replace(/\s+/g, ' ')
    if (cur.text === '' || cur.text.endsWith(' ')) t = t.replace(/^ /, '')
    cur.text += t
  }

  const closeRed = () => {
    if (!cur || cur.redStart === null) return
    let end = cur.text.length
    while (end > cur.redStart && cur.text[end - 1] === ' ') end--
    if (end > cur.redStart) cur.red.push({ start: cur.redStart, end })
    cur.redStart = null
  }

  const finish = () => {
    if (!cur) return
    closeRed()
    const text = cur.text.trimEnd()
    const redLetter = cur.red
      .map(s => ({ start: s.start, end: Math.min(s.end, text.length) }))
      .filter(s => s.end > s.start)
    verses.push({ osisBook: cur.osisBook, chapter: cur.chapter, verse: cur.verse, text, redLetter })
    cur = null
  }

  for (const [tok] of xml.matchAll(TOKEN_RE)) {
    if (tok[0] !== '<') {
      if (skipDepth === 0) append(decodeEntities(tok))
      continue
    }
    if (tok.startsWith('<?') || tok.startsWith('<!')) continue
    const closing = tok.startsWith('</')
    const selfClosing = tok.endsWith('/>')
    const name = /^<\/?\s*([\w:]+)/.exec(tok)?.[1] ?? ''
    const a = closing ? {} : attrs(tok)

    switch (name) {
      case 'verse':
        if (a.sID && a.osisID) {
          finish()
          const parts = a.osisID.split('.')
          const verse = Number(parts.pop())
          const chapter = Number(parts.pop())
          cur = { osisBook: parts.join('.'), chapter, verse, text: '', red: [], redStart: null }
          if (openJesusQuotes.size > 0) cur.redStart = 0
        } else if (a.eID) {
          finish()
        }
        break
      case 'q':
        if (a.sID && a.who === 'Jesus') {
          openJesusQuotes.add(a.sID)
          if (cur && cur.redStart === null) cur.redStart = cur.text.length
        } else if (a.eID && openJesusQuotes.delete(a.eID) && openJesusQuotes.size === 0) {
          closeRed()
        }
        break
      case 'title':
      case 'note':
        if (closing) skipDepth = Math.max(0, skipDepth - 1)
        else if (!selfClosing) skipDepth++
        break
      case 'lb':
      case 'l':
      case 'lg':
      case 'p':
        append(' ')
        break
    }
  }
  finish()
  return verses
}
