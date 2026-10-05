export interface Token {
  word: string
  strongs: string | null
}

const L = 'A-Za-z\u00c0-\u024f'
/** A word: letters, with inner apostrophes or hyphens allowed. */
export const WORD_RE = new RegExp(`[${L}](?:[${L}'\u2019-]*[${L}])?`, 'g')

export const wordsOf = (text: string): string[] => text.match(WORD_RE) ?? []

export function normalizeStrongs(raw: string): string {
  const m = /^([HG])0*(\d+)$/.exec(raw.trim())
  if (!m) throw new Error(`Bad Strong's number: ${raw}`)
  return `${m[1]}${m[2]}`
}

/** eBible file prefixes: 02-40 are Genesis-Malachi, 70-96 are Matthew-Revelation. */
export function usfmBookId(fileName: string): number | null {
  const m = /^(\d{2})-/.exec(fileName)
  if (!m) return null
  const n = Number(m[1])
  if (n >= 2 && n <= 40) return n - 1
  if (n >= 70 && n <= 96) return n - 30
  return null
}

// Lines that are never verse text: headings, titles (including Psalm titles), and book metadata.
const SKIP_LINE = /^\\(s\d?|ms\d?|mt\d?|mr|h|toc\d?|id|ide|rem|d|sp|r|cl|ip|is\d?)(\s|$)/
const FOOTNOTE = /\\(f|x)\s[\s\S]*?\\\1\*/g
const TAGGED = /\\\+?w\s+([^|\\]*)\|([^\\]*?)\\\+?w\*/g
const CLOSE_MARKER = /\\\+?[a-z]+\d*\*/g
const OPEN_MARKER = /\\\+?[a-z]+\d*/g

/** Text with markers removed: a closing marker vanishes (so "LORD\nd*'s" stays one word); an opening one becomes a space. */
const stripMarkers = (s: string) => s.replace(CLOSE_MARKER, '').replace(OPEN_MARKER, ' ').replace(/\u00b6/g, ' ')

function tokenize(raw: string): Token[] {
  const text = raw.replace(FOOTNOTE, '')
  const out: Token[] = []
  let pos = 0
  for (const m of text.matchAll(TAGGED)) {
    for (const w of wordsOf(stripMarkers(text.slice(pos, m.index)))) out.push({ word: w, strongs: null })
    const attr = /strong="([^"]+)"/.exec(m[2])
    const id = attr ? normalizeStrongs(attr[1]) : null
    for (const w of wordsOf(stripMarkers(m[1]))) out.push({ word: w, strongs: id })
    pos = m.index + m[0].length
  }
  for (const w of wordsOf(stripMarkers(text.slice(pos)))) out.push({ word: w, strongs: null })
  return out
}

/** The tagged words of every verse in one USFM book, keyed "chapter:verse". */
export function parseUsfmBook(usfm: string): Map<string, Token[]> {
  const raw = new Map<string, string>()
  let chapter = 0
  let key: string | null = null
  for (const line of usfm.split(/\r?\n/)) {
    if (SKIP_LINE.test(line)) continue
    for (const piece of line.split(/(?=\\c\s+\d)|(?=\\v\s+\d)/)) {
      const c = /^\\c\s+(\d+)/.exec(piece)
      if (c) {
        chapter = Number(c[1])
        key = null
        continue
      }
      const v = /^\\v\s+(\d+)\s?([\s\S]*)$/.exec(piece)
      if (v) {
        key = `${chapter}:${Number(v[1])}`
        raw.set(key, v[2])
        continue
      }
      if (key) raw.set(key, `${raw.get(key)} ${piece}`)
    }
  }
  const out = new Map<string, Token[]>()
  for (const [k, text] of raw) out.set(k, tokenize(text))
  return out
}
