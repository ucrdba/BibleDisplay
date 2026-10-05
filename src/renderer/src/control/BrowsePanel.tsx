import { Fragment, useEffect, useState, type MouseEvent } from 'react'
import { BOOKS, bookById } from '../../../shared/books'
import {
  isSelected,
  pickerClick,
  selectedBooks,
  selectedChapters,
  wholeChapter,
  type Passage,
  type VerseRef,
} from '../../../shared/pickerSelection'
import type { BibleIndex } from '../../../shared/types'

const LAST_OT_BOOK = 39
const LOADING = 'Loading\u2026'
const MARK = '\u25cf'
const numbers = (n: number) => Array.from({ length: n }, (_, i) => i + 1)

interface Props {
  index: BibleIndex | null
  passages: Passage[]
  /** Changes whenever verses were shown some other way; the picker then jumps to them. */
  jumpSignal: number
  onChange(passages: Passage[]): void
}

export function BrowsePanel({ index, passages, jumpSignal, onChange }: Props) {
  const [bookId, setBookId] = useState(() => passages[0]?.bookId ?? 1)
  const [chapter, setChapter] = useState(() => passages[0]?.startChapter ?? 1)
  const [anchor, setAnchor] = useState<VerseRef | null>(null)

  useEffect(() => {
    setAnchor(null)
    const first = passages[0]
    if (first) {
      setBookId(first.bookId)
      setChapter(first.startChapter)
    }
  }, [jumpSignal])

  const markedBooks = selectedBooks(passages)
  const markedChapters = selectedChapters(passages, bookId)

  const pickBook = (id: number) => {
    setBookId(id)
    setChapter(1)
  }

  const showChapter = (c: number) => {
    if (!index) return
    setAnchor(null)
    onChange([wholeChapter(bookId, c, index)])
  }

  const clickVerse = (verse: number, e: MouseEvent) => {
    if (!index) return
    const mods = { ctrl: e.ctrlKey || e.metaKey, shift: e.shiftKey }
    const result = pickerClick(passages, { bookId, chapter, verse }, mods, anchor, index)
    setAnchor(result.anchor)
    onChange(result.passages)
  }

  return (
    <div className="browse">
      <div className="browse__col browse__col--books">
        <h4 className="browse__head">Books</h4>
        <ul className="browse__list">
          {BOOKS.map(b => (
            <Fragment key={b.id}>
              <li>
                <button
                  type="button"
                  data-book={b.id}
                  className={b.id === bookId ? 'browse-item is-current' : 'browse-item'}
                  onClick={() => pickBook(b.id)}
                >
                  {b.name}
                  {markedBooks.has(b.id) && <span className="browse-mark">{MARK}</span>}
                </button>
              </li>
              {b.id === LAST_OT_BOOK && <li className="browse-divider" role="separator" />}
            </Fragment>
          ))}
        </ul>
      </div>

      <div className="browse__col">
        <h4 className="browse__head">Chapters</h4>
        <ul className="browse__list">
          {!index ? (
            <li className="muted browse__loading">{LOADING}</li>
          ) : (
            numbers(bookById(bookId).chapters).map(c => (
              <li key={c}>
                <button
                  type="button"
                  data-chapter={c}
                  className={c === chapter ? 'browse-item is-current' : 'browse-item'}
                  title="Double-click to show the whole chapter"
                  onClick={() => setChapter(c)}
                  onDoubleClick={() => showChapter(c)}
                >
                  {c}
                  {markedChapters.has(c) && <span className="browse-mark">{MARK}</span>}
                </button>
              </li>
            ))
          )}
        </ul>
      </div>

      <div className="browse__col">
        <h4 className="browse__head">Verses</h4>
        <ul className="browse__list">
          {!index ? (
            <li className="muted browse__loading">{LOADING}</li>
          ) : (
            numbers(index.verseCount(bookId, chapter)).map(v => (
              <li key={v}>
                <button
                  type="button"
                  data-verse={v}
                  className={isSelected(passages, { bookId, chapter, verse: v }) ? 'browse-item is-selected' : 'browse-item'}
                  onClick={e => clickVerse(v, e)}
                >
                  {v}
                </button>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  )
}
