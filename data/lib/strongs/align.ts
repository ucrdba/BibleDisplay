import { WORD_RE, type Token } from './usfm'

export interface WordPos {
  word: string
  start: number
  end: number
}

export interface PlacedSpan {
  start: number
  end: number
  strongs: string
}

export const ourWords = (text: string): WordPos[] =>
  [...text.matchAll(WORD_RE)].map(m => ({ word: m[0], start: m.index, end: m.index + m[0].length }))

/** Compares words across editions: ignores case, punctuation, hyphens, accents, and the ae ligature. */
export function normalizeWord(word: string): string {
  return word
    .replace(/\u00e6/g, 'ae')
    .replace(/\u00c6/g, 'Ae')
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z]/g, '')
}

/** Index pairs of a longest common subsequence of a and b. */
function lcsPairs(a: string[], b: string[]): [number, number][] {
  const n = a.length
  const m = b.length
  const L = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) L[i][j] = a[i] === b[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1])
  }
  const pairs: [number, number][] = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      pairs.push([i, j])
      i++
      j++
    } else if (L[i + 1][j] >= L[i][j + 1]) i++
    else j++
  }
  return pairs
}

/**
 * Places the tagged tokens of one verse onto our verse text. Matching words pair up; a gap between
 * matches pairs one-for-one when both sides have the same number of words, otherwise its tags are unplaced.
 */
export function alignStrongs(text: string, tokens: Token[]): { spans: PlacedSpan[]; unplaced: string[] } {
  const ours = ourWords(text)
  const a = ours.map(w => normalizeWord(w.word))
  const b = tokens.map(tk => normalizeWord(tk.word))
  const spans: PlacedSpan[] = []
  const unplaced: string[] = []
  const place = (i: number, j: number) => {
    const id = tokens[j].strongs
    if (id) spans.push({ start: ours[i].start, end: ours[i].end, strongs: id })
  }
  let pi = 0
  let pj = 0
  const gap = (i1: number, j1: number) => {
    if (i1 - pi === j1 - pj) {
      for (let k = 0; k < i1 - pi; k++) place(pi + k, pj + k)
    } else {
      for (let j = pj; j < j1; j++) if (tokens[j].strongs) unplaced.push(tokens[j].word)
    }
  }
  for (const [i, j] of lcsPairs(a, b)) {
    gap(i, j)
    place(i, j)
    pi = i + 1
    pj = j + 1
  }
  gap(ours.length, tokens.length)
  return { spans, unplaced }
}
