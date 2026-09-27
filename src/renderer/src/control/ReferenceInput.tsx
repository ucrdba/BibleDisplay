import { useRef, useState, type KeyboardEvent } from 'react'
import { applyBook, suggest, type Suggestion } from '../../../shared/suggest'
import type { BibleIndex, Book, RefError } from '../../../shared/types'
import { markErrors } from './errorMarks'

interface Props {
  value: string
  onChange(value: string): void
  onSubmit(): void
  errors: RefError[]
  index: BibleIndex | null
}

const NONE: Suggestion = { kind: 'none' }

export function ReferenceInput({ value, onChange, onSubmit, errors, index }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const mirrorRef = useRef<HTMLDivElement>(null)
  const [caret, setCaret] = useState(value.length)
  const [active, setActive] = useState(0)
  const [dismissed, setDismissed] = useState(false)

  const s = index ? suggest(value, Math.min(caret, value.length), index) : NONE
  const books = s.kind === 'books' && !dismissed ? s.books : []
  const activeIdx = Math.min(active, Math.max(0, books.length - 1))

  const syncCaret = () => setCaret(inputRef.current?.selectionStart ?? value.length)

  const accept = (book: Book) => {
    if (s.kind !== 'books') return
    const next = applyBook(value, s, book)
    onChange(next.value)
    setActive(0)
    setCaret(next.caret)
    requestAnimationFrame(() => inputRef.current?.setSelectionRange(next.caret, next.caret))
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (books.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActive((activeIdx + 1) % books.length)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActive((activeIdx - 1 + books.length) % books.length)
        return
      }
      if (e.key === 'Tab' || e.key === 'Enter') {
        e.preventDefault()
        accept(books[activeIdx])
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setDismissed(true)
        return
      }
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      onSubmit()
    }
  }

  return (
    <div className="ref-input">
      <div className="ref-input__field">
        <div className="ref-input__mirror" ref={mirrorRef} aria-hidden="true">
          {markErrors(value, errors).map((p, i) => (
            <span key={i} className={p.error ? 'ref-input__error' : undefined}>
              {p.text}
            </span>
          ))}
        </div>
        <input
          ref={inputRef}
          className="ref-input__input"
          value={value}
          placeholder="e.g. jn 3:16, mk 3:1-3, ps 23"
          spellCheck={false}
          autoFocus
          onChange={e => {
            onChange(e.target.value)
            setCaret(e.target.selectionStart ?? e.target.value.length)
            setDismissed(false)
            setActive(0)
          }}
          onKeyDown={onKeyDown}
          onSelect={syncCaret}
          onScroll={e => {
            if (mirrorRef.current) mirrorRef.current.scrollLeft = e.currentTarget.scrollLeft
          }}
          onFocus={() => setDismissed(false)}
          onBlur={() => setDismissed(true)}
        />
        {books.length > 0 && (
          <ul className="ref-input__menu" role="listbox">
            {books.map((b, i) => (
              <li
                key={b.id}
                role="option"
                aria-selected={i === activeIdx}
                className={i === activeIdx ? 'is-active' : undefined}
                onMouseDown={e => {
                  e.preventDefault()
                  accept(b)
                }}
              >
                {b.name} <span className="ref-input__abbr">{b.abbrev3}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      {s.kind === 'hint' && <div className="ref-input__hint">{s.text}</div>}
      {errors.length > 0 && (
        <ul className="ref-input__errors">
          {errors.map((e, i) => (
            <li key={i}>{e.message}</li>
          ))}
        </ul>
      )}
    </div>
  )
}
