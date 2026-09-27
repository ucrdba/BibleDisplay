export interface Book {
  id: number
  name: string
  abbrev3: string
  osis: string
  chapters: number
  aliases: string[]
}

export interface BibleIndex {
  /** Number of verses in the chapter, or 0 if the chapter does not exist. */
  verseCount(bookId: number, chapter: number): number
}

/** verseCounts[bookId][chapter - 1] = number of verses */
export type VerseCounts = Record<number, number[]>

export interface VerseSpan {
  bookId: number
  startChapter: number
  startVerse: number
  endChapter: number
  endVerse: number
}

export interface RefGroup extends VerseSpan {
  label: string
  inputStart: number
  inputEnd: number
}

export interface RefError {
  message: string
  inputStart: number
  inputEnd: number
}

export interface ParseResult {
  groups: RefGroup[]
  errors: RefError[]
}

export interface Span {
  start: number
  end: number
}

export interface Highlight extends Span {
  id: number
  color: string
}

export interface BibleVerse {
  bookId: number
  chapter: number
  verse: number
  text: string
  redLetter: Span[]
}

export interface VerseData extends BibleVerse {
  highlights: Highlight[]
}

export interface DisplayGroup {
  label: string
  verses: VerseData[]
}

export interface VerseRange {
  bookId: number
  chapter: number
  verse: number
  start: number
  end: number
}

export type ScrollCommand =
  | { kind: 'lineUp' | 'lineDown' | 'pageUp' | 'pageDown' | 'home' | 'end' }
  | { kind: 'by'; px: number }

export interface DisplayState {
  groups: DisplayGroup[]
  blank: boolean
}

export interface DisplayInfo {
  width: number
  height: number
  secondMonitor: boolean
}

export type ImportResult = { kind: 'ok'; lines: string[] } | { kind: 'canceled' } | { kind: 'error'; message: string }
