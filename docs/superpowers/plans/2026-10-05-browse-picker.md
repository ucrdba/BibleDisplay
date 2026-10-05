# Browse Picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an e-Sword-style **Books | Chapters | Verses** column to the control window where clicking verses shows them, with Windows-style Ctrl/Shift multi-select across chapters and books, always mirroring what is on screen.

**Architecture:** The on-screen passage list (`refGroups`) is the single source of truth. Pure functions in `src/shared/pickerSelection.ts` turn a click + modifiers into a new passage list; `ControlScreen` writes it to the verse box as reference text and calls the existing `show()`. A presentational `BrowsePanel` renders the three lists from the passages and keeps only its navigation and Shift anchor. The collapsible column reuses a generalized `SidePanel`.

**Tech Stack:** Electron + React 19 + TypeScript (electron-vite), better-sqlite3, Vitest (runs inside Electron's Node via `npm test`).

**Spec:** `docs/superpowers/specs/2026-10-05-browse-picker-design.md`

## Global Constraints

- Browse column: **260px** wide, collapses to **28px**; grid `300px 260px 1fr 300px` (Settings also collapses to `28px`).
- Browse toggle: **«** hides, **»** shows; tooltips `Hide Browse` / `Show Browse`. Settings toggle unchanged: **»** hides, **«** shows; tooltips `Hide settings` / `Show settings`.
- Saved keys: Settings keeps `rightPanelCollapsed`; Browse uses `browsePanelCollapsed`. Default expanded.
- Picker-built reference text always includes the 3-letter book code, joined by `, ` (e.g. `Joh 3:16-18, Joh 3:20, Psa 23`).
- Picker changes show immediately, in picked order, and do **not** add to Recent.
- Shift ranges never cross books.
- Non-ASCII characters in `.ts/.tsx` are written as `\u` escapes inside JS strings/expressions (`'\u2026'` for the ellipsis, `'\u25cf'` for the dot, `'\u00ab'` / `'\u00bb'` for the arrows). JSX attribute strings and JSX text do **not** process escapes — use `{'\u2026'}` / `title={'...'}`. Literal characters are fine in Markdown and CSS.
- Working-tree files use CRLF line endings (git `autocrlf`); keep them. No UTF-8 BOM.
- Tests: `npm test -- <path>`; before each commit `npm run typecheck`.
- Commit messages end with a `Co-Authored-By:` trailer naming the model that wrote the commit.
- **Branch:** create `feat/browse-picker` from `main`.

## File Structure

| File | Responsibility |
|---|---|
| `src/shared/types.ts` | `RefGroup.whole: boolean`. |
| `src/shared/parser.ts` | Sets `whole` on every group. |
| `src/shared/pickerSelection.ts` (new) | Passage model + all selection rules + `toReferenceText`. Pure. |
| `src/shared/panels.ts` (new) | `PanelName`, `PANEL_NAMES`, `isPanelName`. |
| `src/main/userDb.ts`, `src/main/ipc.ts`, `src/shared/api.ts`, `src/preload/index.ts` | Panel-collapse API takes a panel name. |
| `src/renderer/src/control/SidePanel.tsx` | Generic collapsible side panel (`side`, `label`, `className`). |
| `src/renderer/src/control/BrowsePanel.tsx` (new) | The three lists; navigation + anchor state; calls `pickerClick`. |
| `src/renderer/src/control/ControlScreen.tsx` | Browse column, collapse state, jump signal, `pickVerses`. |
| `src/renderer/src/control/control.css` | Grid columns, browse styles. |
| `src/renderer/src/control/HelpPanel.tsx`, `README.md` | Document the picker. |

---

### Task 1: Parser marks whole-chapter references

**Files:**
- Modify: `src/shared/types.ts` (`RefGroup`)
- Modify: `src/shared/parser.ts` (the `groups.push({...})` near the end of `parseReferences`)
- Modify: `tests/shared/parser.test.ts`, `tests/main/loadGroups.test.ts`, `tests/renderer/lists.test.tsx` (RefGroup literals)

**Interfaces:**
- Produces: `RefGroup` gains `whole: boolean` — true only for chapter-only references (`ps 23`, `ps 23-24`), false otherwise.

- [ ] **Step 1: Write the failing test**

In `tests/shared/parser.test.ts`, add inside `describe('parseReferences', …)`:

```ts
  it('marks chapter-only references as whole', () => {
    const whole = (s: string) => parse(s).groups.map(g => g.whole)
    expect(whole('ps 23')).toEqual([true])
    expect(whole('ps 23-24')).toEqual([true])
    expect(whole('ps 23, 24')).toEqual([true, true])
    expect(whole('jn 3:16')).toEqual([false])
    expect(whole('jn 3:16-4:2')).toEqual([false])
    expect(whole('luke 1:18..')).toEqual([false])
    expect(whole('jude 5')).toEqual([false])
    expect(whole('jn 3:16, 18')).toEqual([false, false])
  })
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- tests/shared/parser.test.ts`
Expected: FAIL — `whole` is `undefined`.

- [ ] **Step 3: Implement**

`src/shared/types.ts` — in `interface RefGroup extends VerseSpan`, add after `label: string`:

```ts
  /** A chapter-only reference such as "ps 23" or "ps 23-24". */
  whole: boolean
```

`src/shared/parser.ts` — in the `groups.push({ … })` call, add `whole,` after `endVerse: ev,`:

```ts
    groups.push({
      label: formatLabel(book, sc, sv, ec, ev, whole),
      bookId: book.id,
      startChapter: sc,
      startVerse: sv,
      endChapter: ec,
      endVerse: ev,
      whole,
      inputStart: item.start,
      inputEnd: item.end,
    })
```

Update the RefGroup object literals so they typecheck and still match:
- `tests/shared/parser.test.ts`, the first test's `toEqual` object: add `whole: false,` after `endVerse: 16,`.
- `tests/main/loadGroups.test.ts`: in the RefGroup literal, add `whole: false,` after `endVerse: 18,`.
- `tests/renderer/lists.test.tsx`: in `const group: RefGroup = {…}`, add `whole: false,` after `endVerse: 5,`.

- [ ] **Step 4: Run tests and typecheck**

Run: `npm test -- tests/shared/parser.test.ts tests/main/loadGroups.test.ts tests/renderer/lists.test.tsx`
Expected: PASS.
Run: `npm run typecheck` — Expected: no errors (if another file builds a `RefGroup` literal, add `whole: false` there too).

- [ ] **Step 5: Commit**

```bash
git add src/shared/types.ts src/shared/parser.ts tests/shared/parser.test.ts tests/main/loadGroups.test.ts tests/renderer/lists.test.tsx
git commit -m "feat: mark whole-chapter references in parsed groups"
```

---

### Task 2: Picker selection model

**Files:**
- Create: `src/shared/pickerSelection.ts`
- Test: `tests/shared/pickerSelection.test.ts`

**Interfaces:**
- Consumes: `RefGroup.whole` (Task 1); `bookById` from `src/shared/books.ts`; `BibleIndex` (`verseCount(bookId, chapter)`, 0 if the chapter does not exist); `parseReferences` (tests only).
- Produces (exported from `src/shared/pickerSelection.ts`):
  - `interface Passage { bookId: number; startChapter: number; startVerse: number; endChapter: number; endVerse: number; whole: boolean }` (a `RefGroup` is assignable to it)
  - `interface VerseRef { bookId: number; chapter: number; verse: number }`
  - `interface ClickMods { ctrl: boolean; shift: boolean }`
  - `isSelected(passages: Passage[], v: VerseRef): boolean`
  - `selectedBooks(passages: Passage[]): Set<number>`
  - `selectedChapters(passages: Passage[], bookId: number): Set<number>`
  - `toggleVerse(passages: Passage[], v: VerseRef, index: BibleIndex): Passage[]`
  - `rangeOf(a: VerseRef, b: VerseRef): Passage` (same book)
  - `addRange(passages: Passage[], range: Passage, index: BibleIndex): Passage[]`
  - `wholeChapter(bookId: number, chapter: number, index: BibleIndex): Passage`
  - `pickerClick(passages: Passage[], v: VerseRef, mods: ClickMods, anchor: VerseRef | null, index: BibleIndex): { passages: Passage[]; anchor: VerseRef | null }`
  - `toReferenceText(passages: Passage[]): string`

- [ ] **Step 1: Write the failing tests**

Create `tests/shared/pickerSelection.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { parseReferences } from '../../src/shared/parser'
import {
  addRange,
  isSelected,
  pickerClick,
  rangeOf,
  selectedBooks,
  selectedChapters,
  toggleVerse,
  toReferenceText,
  wholeChapter,
  type Passage,
  type VerseRef,
} from '../../src/shared/pickerSelection'
import { fakeIndex } from '../helpers/fakeIndex'

// fakeIndex: John 1-4 have 51, 25, 36, 54 verses; Psalms 23-25 have 6, 10, 22; 1 John 3 has 24; Jude 1 has 25.
const J = (chapter: number, verse: number): VerseRef => ({ bookId: 43, chapter, verse })
const P = (sc: number, sv: number, ec: number, ev: number, bookId = 43, whole = false): Passage => ({
  bookId,
  startChapter: sc,
  startVerse: sv,
  endChapter: ec,
  endVerse: ev,
  whole,
})
const PS23 = P(23, 1, 23, 6, 19, true)
const PS24 = P(24, 1, 24, 10, 19, true)
const none = { ctrl: false, shift: false }
const ctrl = { ctrl: true, shift: false }
const shift = { ctrl: false, shift: true }
const ctrlShift = { ctrl: true, shift: true }

describe('isSelected and markers', () => {
  const ps = [P(3, 35, 4, 2), PS23]
  it('knows which verses are shown', () => {
    expect(isSelected(ps, J(3, 36))).toBe(true)
    expect(isSelected(ps, J(4, 1))).toBe(true)
    expect(isSelected(ps, J(4, 3))).toBe(false)
    expect(isSelected(ps, { bookId: 19, chapter: 23, verse: 4 })).toBe(true)
    expect(isSelected(ps, { bookId: 19, chapter: 24, verse: 1 })).toBe(false)
  })

  it('lists books and chapters that contain shown verses', () => {
    expect([...selectedBooks(ps)].sort((a, b) => a - b)).toEqual([19, 43])
    expect([...selectedChapters(ps, 43)].sort((a, b) => a - b)).toEqual([3, 4])
    expect([...selectedChapters(ps, 19)]).toEqual([23])
    expect([...selectedChapters(ps, 1)]).toEqual([])
  })
})

describe('toggleVerse — adding', () => {
  it('adds to an empty selection', () => {
    expect(toggleVerse([], J(3, 16), fakeIndex)).toEqual([P(3, 16, 3, 16)])
  })

  it('appends a verse that touches nothing', () => {
    expect(toggleVerse([P(3, 16, 3, 16)], J(3, 20), fakeIndex)).toEqual([P(3, 16, 3, 16), P(3, 20, 3, 20)])
  })

  it('joins a passage it touches, before or after', () => {
    expect(toggleVerse([P(3, 16, 3, 18)], J(3, 19), fakeIndex)).toEqual([P(3, 16, 3, 19)])
    expect(toggleVerse([P(3, 16, 3, 18)], J(3, 15), fakeIndex)).toEqual([P(3, 15, 3, 18)])
  })

  it('joins across a chapter boundary', () => {
    expect(toggleVerse([P(3, 30, 3, 36)], J(4, 1), fakeIndex)).toEqual([P(3, 30, 4, 1)])
    expect(toggleVerse([P(4, 1, 4, 3)], J(3, 36), fakeIndex)).toEqual([P(3, 36, 4, 3)])
  })

  it('bridges two passages into the earlier position', () => {
    expect(toggleVerse([P(3, 16, 3, 16), PS23, P(3, 18, 3, 18)], J(3, 17), fakeIndex)).toEqual([P(3, 16, 3, 18), PS23])
  })

  it('leaves passages it does not touch alone, even if they touch each other', () => {
    expect(toggleVerse([PS23, PS24], J(3, 16), fakeIndex)).toEqual([PS23, PS24, P(3, 16, 3, 16)])
  })
})

describe('toggleVerse — removing', () => {
  it('removes a single verse', () => {
    expect(toggleVerse([P(3, 16, 3, 16)], J(3, 16), fakeIndex)).toEqual([])
  })

  it('splits a passage in place', () => {
    expect(toggleVerse([PS23, P(3, 16, 3, 18)], J(3, 17), fakeIndex)).toEqual([PS23, P(3, 16, 3, 16), P(3, 18, 3, 18)])
  })

  it('trims an end', () => {
    expect(toggleVerse([P(3, 16, 3, 18)], J(3, 18), fakeIndex)).toEqual([P(3, 16, 3, 17)])
    expect(toggleVerse([P(3, 16, 3, 18)], J(3, 16), fakeIndex)).toEqual([P(3, 17, 3, 18)])
  })

  it('splits across a chapter boundary', () => {
    expect(toggleVerse([P(3, 35, 4, 2)], J(4, 1), fakeIndex)).toEqual([P(3, 35, 3, 36), P(4, 2, 4, 2)])
  })

  it('turns an edited whole chapter into verse ranges', () => {
    expect(toggleVerse([PS23], { bookId: 19, chapter: 23, verse: 3 }, fakeIndex)).toEqual([P(23, 1, 23, 2, 19), P(23, 4, 23, 6, 19)])
  })
})

describe('ranges', () => {
  it('builds a range in either direction, across chapters', () => {
    expect(rangeOf(J(3, 18), J(3, 16))).toEqual(P(3, 16, 3, 18))
    expect(rangeOf(J(3, 35), J(4, 2))).toEqual(P(3, 35, 4, 2))
  })

  it('appends a range that touches nothing', () => {
    expect(addRange([P(3, 16, 3, 16)], P(3, 20, 3, 22), fakeIndex)).toEqual([P(3, 16, 3, 16), P(3, 20, 3, 22)])
  })

  it('merges a range into the passages it touches, keeping their position', () => {
    expect(addRange([P(4, 1, 4, 1), P(3, 16, 3, 16)], P(3, 17, 3, 20), fakeIndex)).toEqual([P(4, 1, 4, 1), P(3, 16, 3, 20)])
  })

  it('changes nothing when the range is already shown', () => {
    expect(addRange([PS23], P(23, 2, 23, 3, 19), fakeIndex)).toEqual([PS23])
  })

  it('builds a whole chapter', () => {
    expect(wholeChapter(19, 23, fakeIndex)).toEqual(PS23)
  })
})

describe('pickerClick', () => {
  it('click shows only that verse', () => {
    expect(pickerClick([P(3, 16, 3, 18)], J(4, 2), none, null, fakeIndex)).toEqual({ passages: [P(4, 2, 4, 2)], anchor: J(4, 2) })
  })

  it('Ctrl+click adds or removes a verse', () => {
    expect(pickerClick([P(3, 16, 3, 16)], J(3, 20), ctrl, J(3, 16), fakeIndex)).toEqual({
      passages: [P(3, 16, 3, 16), P(3, 20, 3, 20)],
      anchor: J(3, 20),
    })
    expect(pickerClick([P(3, 16, 3, 16), P(3, 20, 3, 20)], J(3, 16), ctrl, J(3, 20), fakeIndex)).toEqual({
      passages: [P(3, 20, 3, 20)],
      anchor: J(3, 16),
    })
  })

  it('Shift+click replaces everything with the range from the anchor', () => {
    expect(pickerClick([P(3, 16, 3, 16), P(3, 20, 3, 20)], J(4, 2), shift, J(3, 16), fakeIndex)).toEqual({
      passages: [P(3, 16, 4, 2)],
      anchor: J(3, 16),
    })
    expect(pickerClick([P(3, 20, 3, 20)], J(3, 18), shift, J(3, 20), fakeIndex)).toEqual({
      passages: [P(3, 18, 3, 20)],
      anchor: J(3, 20),
    })
  })

  it('Ctrl+Shift+click adds the range', () => {
    const ps23v1 = P(23, 1, 23, 1, 19)
    expect(pickerClick([ps23v1, P(3, 16, 3, 16)], J(3, 18), ctrlShift, J(3, 16), fakeIndex)).toEqual({
      passages: [ps23v1, P(3, 16, 3, 18)],
      anchor: J(3, 16),
    })
  })

  it('Shift without a usable anchor acts like a click', () => {
    expect(pickerClick([P(3, 16, 3, 16)], J(3, 20), shift, null, fakeIndex)).toEqual({ passages: [P(3, 20, 3, 20)], anchor: J(3, 20) })
    const psAnchor = { bookId: 19, chapter: 23, verse: 1 }
    expect(pickerClick([P(3, 16, 3, 16)], J(3, 20), shift, psAnchor, fakeIndex)).toEqual({ passages: [P(3, 20, 3, 20)], anchor: J(3, 20) })
  })

  it('Ctrl+Shift without a usable anchor acts like Ctrl+click', () => {
    const psAnchor = { bookId: 19, chapter: 23, verse: 1 }
    expect(pickerClick([P(3, 16, 3, 16)], J(3, 20), ctrlShift, psAnchor, fakeIndex)).toEqual({
      passages: [P(3, 16, 3, 16), P(3, 20, 3, 20)],
      anchor: J(3, 20),
    })
  })
})

describe('toReferenceText', () => {
  const JUDE = wholeChapter(65, 1, fakeIndex)
  const ALL = [P(3, 16, 3, 16), P(3, 16, 3, 18), P(3, 36, 4, 2), PS23, P(23, 1, 24, 10, 19, true), P(3, 1, 3, 2, 62), JUDE]

  it('writes every passage with its book code', () => {
    expect(toReferenceText(ALL)).toBe('Joh 3:16, Joh 3:16-18, Joh 3:36-4:2, Psa 23, Psa 23-24, 1Jo 3:1-2, Jud 1:1-25')
    expect(toReferenceText([])).toBe('')
  })

  it('reads back through the parser to the same passages', () => {
    const back = parseReferences(toReferenceText(ALL), fakeIndex)
    expect(back.errors).toEqual([])
    expect(
      back.groups.map(g => ({
        bookId: g.bookId,
        startChapter: g.startChapter,
        startVerse: g.startVerse,
        endChapter: g.endChapter,
        endVerse: g.endVerse,
        whole: g.whole,
      })),
    ).toEqual([...ALL.slice(0, 6), { ...JUDE, whole: false }])
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- tests/shared/pickerSelection.test.ts`
Expected: FAIL — cannot resolve `../../src/shared/pickerSelection`.

- [ ] **Step 3: Implement `src/shared/pickerSelection.ts`**

```ts
import { bookById } from './books'
import type { BibleIndex } from './types'

/** A shown passage; a RefGroup is assignable to it. */
export interface Passage {
  bookId: number
  startChapter: number
  startVerse: number
  endChapter: number
  endVerse: number
  /** A whole chapter (or chapters) as typed, e.g. "ps 23". */
  whole: boolean
}

export interface VerseRef {
  bookId: number
  chapter: number
  verse: number
}

export interface ClickMods {
  ctrl: boolean
  shift: boolean
}

type Point = { chapter: number; verse: number }

const cmp = (a: Point, b: Point) => a.chapter - b.chapter || a.verse - b.verse
const startOf = (p: Passage): VerseRef => ({ bookId: p.bookId, chapter: p.startChapter, verse: p.startVerse })
const endOf = (p: Passage): VerseRef => ({ bookId: p.bookId, chapter: p.endChapter, verse: p.endVerse })
const sameVerse = (a: VerseRef | null, b: VerseRef) => !!a && a.chapter === b.chapter && a.verse === b.verse

function span(bookId: number, from: Point, to: Point): Passage {
  return { bookId, startChapter: from.chapter, startVerse: from.verse, endChapter: to.chapter, endVerse: to.verse, whole: false }
}

function nextVerse(v: VerseRef, index: BibleIndex): VerseRef | null {
  if (v.verse < index.verseCount(v.bookId, v.chapter)) return { ...v, verse: v.verse + 1 }
  if (v.chapter < bookById(v.bookId).chapters) return { ...v, chapter: v.chapter + 1, verse: 1 }
  return null
}

function prevVerse(v: VerseRef, index: BibleIndex): VerseRef | null {
  if (v.verse > 1) return { ...v, verse: v.verse - 1 }
  if (v.chapter > 1) return { ...v, chapter: v.chapter - 1, verse: index.verseCount(v.bookId, v.chapter - 1) }
  return null
}

const contains = (p: Passage, v: VerseRef) => p.bookId === v.bookId && cmp(startOf(p), v) <= 0 && cmp(v, endOf(p)) <= 0

const containsPassage = (p: Passage, r: Passage) =>
  p.bookId === r.bookId && cmp(startOf(p), startOf(r)) <= 0 && cmp(endOf(r), endOf(p)) <= 0

/** Same book and overlapping, or one starts on the verse right after the other ends. */
function touches(a: Passage, b: Passage, index: BibleIndex): boolean {
  if (a.bookId !== b.bookId) return false
  const gap = (x: Passage, y: Passage) =>
    cmp(endOf(x), startOf(y)) < 0 && !sameVerse(nextVerse(endOf(x), index), startOf(y))
  return !gap(a, b) && !gap(b, a)
}

function hull(a: Passage, b: Passage): Passage {
  const from = cmp(startOf(a), startOf(b)) <= 0 ? startOf(a) : startOf(b)
  const to = cmp(endOf(a), endOf(b)) >= 0 ? endOf(a) : endOf(b)
  return span(a.bookId, from, to)
}

export const isSelected = (passages: Passage[], v: VerseRef) => passages.some(p => contains(p, v))

export function selectedBooks(passages: Passage[]): Set<number> {
  return new Set(passages.map(p => p.bookId))
}

export function selectedChapters(passages: Passage[], bookId: number): Set<number> {
  const out = new Set<number>()
  for (const p of passages) {
    if (p.bookId !== bookId) continue
    for (let c = p.startChapter; c <= p.endChapter; c++) out.add(c)
  }
  return out
}

export function rangeOf(a: VerseRef, b: VerseRef): Passage {
  return cmp(a, b) <= 0 ? span(a.bookId, a, b) : span(a.bookId, b, a)
}

export function wholeChapter(bookId: number, chapter: number, index: BibleIndex): Passage {
  return { ...span(bookId, { chapter, verse: 1 }, { chapter, verse: index.verseCount(bookId, chapter) }), whole: true }
}

/**
 * Adds a range: it absorbs every passage it overlaps or touches (repeatedly, as it grows) and takes
 * the position of the earliest one; otherwise it is appended. Other passages are left untouched.
 */
export function addRange(passages: Passage[], range: Passage, index: BibleIndex): Passage[] {
  if (passages.some(p => containsPassage(p, range))) return passages
  let merged = range
  let position = -1
  const absorbed = new Set<number>()
  for (let changed = true; changed; ) {
    changed = false
    passages.forEach((p, i) => {
      if (absorbed.has(i) || !touches(p, merged, index)) return
      absorbed.add(i)
      position = position === -1 ? i : Math.min(position, i)
      merged = hull(p, merged)
      changed = true
    })
  }
  if (position === -1) return [...passages, range]
  const out: Passage[] = []
  passages.forEach((p, i) => {
    if (i === position) out.push(merged)
    else if (!absorbed.has(i)) out.push(p)
  })
  return out
}

/** Removes a shown verse (splitting its passage in place) or adds one (joining a passage it touches). */
export function toggleVerse(passages: Passage[], v: VerseRef, index: BibleIndex): Passage[] {
  const i = passages.findIndex(p => contains(p, v))
  if (i === -1) return addRange(passages, span(v.bookId, v, v), index)
  const p = passages[i]
  const pieces: Passage[] = []
  const before = prevVerse(v, index)
  const after = nextVerse(v, index)
  if (before && cmp(startOf(p), before) <= 0) pieces.push(span(p.bookId, startOf(p), before))
  if (after && cmp(after, endOf(p)) <= 0) pieces.push(span(p.bookId, after, endOf(p)))
  return [...passages.slice(0, i), ...pieces, ...passages.slice(i + 1)]
}

/** Windows list rules: click, Ctrl+click, Shift+click, Ctrl+Shift+click. Shift ranges stay in one book. */
export function pickerClick(
  passages: Passage[],
  v: VerseRef,
  mods: ClickMods,
  anchor: VerseRef | null,
  index: BibleIndex,
): { passages: Passage[]; anchor: VerseRef | null } {
  const usable = anchor && anchor.bookId === v.bookId ? anchor : null
  if (mods.shift && usable) {
    const range = rangeOf(usable, v)
    return { passages: mods.ctrl ? addRange(passages, range, index) : [range], anchor: usable }
  }
  if (mods.ctrl) return { passages: toggleVerse(passages, v, index), anchor: v }
  return { passages: [span(v.bookId, v, v)], anchor: v }
}

/** Reference text the parser reads back to the same passages, e.g. "Joh 3:16-18, Psa 23". */
export function toReferenceText(passages: Passage[]): string {
  return passages
    .map(p => {
      const book = bookById(p.bookId)
      const code = book.abbrev3
      // "Jud 1" would be read as verse 1, so whole one-chapter books are written as verse ranges.
      if (p.whole && book.chapters > 1) {
        return p.startChapter === p.endChapter ? `${code} ${p.startChapter}` : `${code} ${p.startChapter}-${p.endChapter}`
      }
      if (p.startChapter === p.endChapter) {
        return p.startVerse === p.endVerse
          ? `${code} ${p.startChapter}:${p.startVerse}`
          : `${code} ${p.startChapter}:${p.startVerse}-${p.endVerse}`
      }
      return `${code} ${p.startChapter}:${p.startVerse}-${p.endChapter}:${p.endVerse}`
    })
    .join(', ')
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- tests/shared/pickerSelection.test.ts`
Expected: PASS (all).

- [ ] **Step 5: Typecheck and commit**

```bash
npm run typecheck
git add src/shared/pickerSelection.ts tests/shared/pickerSelection.test.ts
git commit -m "feat: picker selection model with Windows-style click rules"
```

---

### Task 3: Named panel-collapse settings and a generic SidePanel

**Files:**
- Create: `src/shared/panels.ts`
- Modify: `src/main/userDb.ts` (`getPanelCollapsed` / `setPanelCollapsed`)
- Modify: `src/main/ipc.ts`, `src/shared/api.ts`, `src/preload/index.ts`
- Modify: `src/renderer/src/control/SidePanel.tsx`
- Modify: `src/renderer/src/control/ControlScreen.tsx` (settings-panel call sites only)
- Modify: `src/renderer/src/control/control.css` (rename the collapsed-grid class)
- Test: `tests/main/userDb.test.ts`, `tests/renderer/SidePanel.test.tsx`

**Interfaces:**
- Produces:
  - `src/shared/panels.ts`: `PANEL_NAMES = ['settings', 'browse'] as const`, `type PanelName = 'settings' | 'browse'`, `isPanelName(x: unknown): x is PanelName`
  - `UserDb.getPanelCollapsed(panel: PanelName): boolean`, `UserDb.setPanelCollapsed(panel: PanelName, collapsed: boolean): void`
  - `ControlApi.getPanelCollapsed(panel: PanelName): Promise<boolean>`, `ControlApi.setPanelCollapsed(panel: PanelName, collapsed: boolean): Promise<void>`
  - `SidePanel` props: `{ side: 'left' | 'right'; label: string; className: string; collapsed: boolean; onToggle(): void; children: ReactNode }`
  - CSS classes `control__panels--settings-collapsed` (replaces `control__panels--collapsed`) and `control__panels--browse-collapsed`

- [ ] **Step 1: Write the failing tests**

In `tests/main/userDb.test.ts`, replace the whole `describe('UserDb right panel', …)` block with:

```ts
describe('UserDb panel collapse', () => {
  it('starts expanded and remembers each panel separately across reopening', () => {
    const path = newPath()
    const db = open(path)
    expect(db.getPanelCollapsed('settings')).toBe(false)
    expect(db.getPanelCollapsed('browse')).toBe(false)
    db.setPanelCollapsed('browse', true)
    db.close()
    opened.pop()
    const again = open(path)
    expect(again.getPanelCollapsed('browse')).toBe(true)
    expect(again.getPanelCollapsed('settings')).toBe(false)
    again.setPanelCollapsed('settings', true)
    again.setPanelCollapsed('browse', false)
    expect(again.getPanelCollapsed('settings')).toBe(true)
    expect(again.getPanelCollapsed('browse')).toBe(false)
  })

  it('keeps using the existing key for the settings panel', () => {
    const path = newPath()
    open(path).close()
    opened.pop()
    const raw = new Database(path)
    raw.prepare("INSERT INTO settings (key, value) VALUES ('rightPanelCollapsed', 'true')").run()
    raw.close()
    expect(open(path).getPanelCollapsed('settings')).toBe(true)
  })
})
```

(`Database` from `better-sqlite3` is already imported at the top of this file.)

Replace the contents of `tests/renderer/SidePanel.test.tsx` with:

```tsx
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { SidePanel } from '../../src/renderer/src/control/SidePanel'

const noop = () => {}
const render = (side: 'left' | 'right', collapsed: boolean, label = 'settings') =>
  renderToStaticMarkup(
    <SidePanel side={side} label={label} className="panel--x" collapsed={collapsed} onToggle={noop}>
      <p>contents here</p>
    </SidePanel>,
  )

describe('SidePanel', () => {
  it('shows its contents and a Hide button when expanded', () => {
    const out = render('right', false)
    expect(out).toContain('contents here')
    expect(out).toContain('title="Hide settings"')
    expect(out).toContain('class="panel panel--x"')
    expect(out).not.toContain('panel--collapsed')
  })

  it('hides its contents and shows a Show button when collapsed', () => {
    const out = render('right', true)
    expect(out).not.toContain('contents here')
    expect(out).toContain('title="Show settings"')
    expect(out).toContain('panel--collapsed')
  })

  it('points the arrows outward for each side', () => {
    expect(render('right', false)).toContain('>\u00bb</button>')
    expect(render('right', true)).toContain('>\u00ab</button>')
    expect(render('left', false, 'Browse')).toContain('>\u00ab</button>')
    expect(render('left', true, 'Browse')).toContain('>\u00bb</button>')
    expect(render('left', false, 'Browse')).toContain('title="Hide Browse"')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- tests/main/userDb.test.ts tests/renderer/SidePanel.test.tsx`
Expected: FAIL — `getPanelCollapsed('browse')` reads the settings key; SidePanel has no `side`/`label`/`className`.

- [ ] **Step 3: Implement**

Create `src/shared/panels.ts`:

```ts
export const PANEL_NAMES = ['settings', 'browse'] as const
export type PanelName = (typeof PANEL_NAMES)[number]

export const isPanelName = (x: unknown): x is PanelName => (PANEL_NAMES as readonly unknown[]).includes(x)
```

`src/main/userDb.ts` — add `import type { PanelName } from '../shared/panels'`, add above the class:

```ts
// "settings" keeps its original key so existing saved choices survive.
const PANEL_KEYS: Record<PanelName, string> = { settings: 'rightPanelCollapsed', browse: 'browsePanelCollapsed' }
```

and replace `getPanelCollapsed` / `setPanelCollapsed` with:

```ts
  getPanelCollapsed(panel: PanelName): boolean {
    const row = this.db.prepare('SELECT value FROM settings WHERE key = ?').get(PANEL_KEYS[panel]) as { value: string } | undefined
    return row?.value === 'true'
  }

  setPanelCollapsed(panel: PanelName, collapsed: boolean): void {
    this.db
      .prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
      .run(PANEL_KEYS[panel], JSON.stringify(collapsed))
  }
```

`src/main/ipc.ts` — add `import { isPanelName } from '../shared/panels'` and replace the two panel handlers with:

```ts
  ipcMain.handle(IPC.getPanelCollapsed, (_e, panel: unknown) => (isPanelName(panel) ? ctx.user.getPanelCollapsed(panel) : false))
  ipcMain.handle(IPC.setPanelCollapsed, (_e, panel: unknown, collapsed: unknown) => {
    if (isPanelName(panel)) ctx.user.setPanelCollapsed(panel, collapsed === true)
  })
```

`src/shared/api.ts` — add `import type { PanelName } from './panels'` and change the two methods to:

```ts
  getPanelCollapsed(panel: PanelName): Promise<boolean>
  setPanelCollapsed(panel: PanelName, collapsed: boolean): Promise<void>
```

`src/preload/index.ts` — change the two lines to:

```ts
    getPanelCollapsed: panel => ipcRenderer.invoke(IPC.getPanelCollapsed, panel),
    setPanelCollapsed: (panel, collapsed) => ipcRenderer.invoke(IPC.setPanelCollapsed, panel, collapsed),
```

Replace `src/renderer/src/control/SidePanel.tsx` with:

```tsx
import type { ReactNode } from 'react'

interface Props {
  /** Which edge of the window the panel sits against; its arrows point outward to hide. */
  side: 'left' | 'right'
  /** Used in the tooltips: "Hide <label>" / "Show <label>". */
  label: string
  className: string
  collapsed: boolean
  onToggle(): void
  children: ReactNode
}

const LEFT = '\u00ab'
const RIGHT = '\u00bb'

export function SidePanel({ side, label, className, collapsed, onToggle, children }: Props) {
  const hideArrow = side === 'right' ? RIGHT : LEFT
  const showArrow = side === 'right' ? LEFT : RIGHT
  return (
    <aside className={`panel ${className}${collapsed ? ' panel--collapsed' : ''}`}>
      <button
        type="button"
        className="btn panel__toggle"
        title={`${collapsed ? 'Show' : 'Hide'} ${label}`}
        aria-expanded={!collapsed}
        onClick={onToggle}
      >
        {collapsed ? showArrow : hideArrow}
      </button>
      {!collapsed && children}
    </aside>
  )
}
```

`src/renderer/src/control/ControlScreen.tsx` (settings panel only — the Browse column comes in Task 5):
- In the mount effect: `void a.getPanelCollapsed().then(setPanelCollapsed)` → `void a.getPanelCollapsed('settings').then(setPanelCollapsed)`.
- In `togglePanel`: `void api().setPanelCollapsed(next)` → `void api().setPanelCollapsed('settings', next)`.
- The panels `<div>` class: `control__panels--collapsed` → `control__panels--settings-collapsed`.
- `<SidePanel collapsed={panelCollapsed} onToggle={togglePanel}>` → `<SidePanel side="right" label="settings" className="panel--right" collapsed={panelCollapsed} onToggle={togglePanel}>`.

`src/renderer/src/control/control.css` — rename the selector `.control__panels--collapsed` to `.control__panels--settings-collapsed` (its body `grid-template-columns: 300px 1fr 28px;` is unchanged for now; Task 5 changes the grid).

- [ ] **Step 4: Run tests, typecheck, build**

Run: `npm test -- tests/main/userDb.test.ts tests/renderer/SidePanel.test.tsx`
Expected: PASS.
Run: `npm run typecheck` and `npm run build` — Expected: clean / succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/shared/panels.ts src/main/userDb.ts src/main/ipc.ts src/shared/api.ts src/preload/index.ts src/renderer/src/control/SidePanel.tsx src/renderer/src/control/ControlScreen.tsx src/renderer/src/control/control.css tests/main/userDb.test.ts tests/renderer/SidePanel.test.tsx
git commit -m "refactor: named panel-collapse settings and a two-sided SidePanel"
```

---

### Task 4: BrowsePanel component

**Files:**
- Create: `src/renderer/src/control/BrowsePanel.tsx`
- Modify: `src/renderer/src/control/control.css` (append browse styles)
- Test: `tests/renderer/BrowsePanel.test.tsx`

**Interfaces:**
- Consumes: from Task 2 — `Passage`, `VerseRef`, `isSelected`, `pickerClick`, `selectedBooks`, `selectedChapters`, `wholeChapter`; `BOOKS`, `bookById` from `src/shared/books.ts`; `BibleIndex`.
- Produces: `BrowsePanel(props: { index: BibleIndex | null; passages: Passage[]; jumpSignal: number; onChange(passages: Passage[]): void })`. Initial navigation = the first passage's book/chapter, else Genesis 1. Markup hooks used by tests: `data-book`, `data-chapter`, `data-verse` attributes (written before `className`), classes `browse-item`, `is-current`, `is-selected`, `browse-mark`, `browse-divider`.

- [ ] **Step 1: Write the failing tests**

Create `tests/renderer/BrowsePanel.test.tsx`:

```tsx
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { BrowsePanel } from '../../src/renderer/src/control/BrowsePanel'
import type { Passage } from '../../src/shared/pickerSelection'
import type { BibleIndex } from '../../src/shared/types'
import { fakeIndex } from '../helpers/fakeIndex'

const noop = () => {}
const JOHN_3_16_18: Passage = { bookId: 43, startChapter: 3, startVerse: 16, endChapter: 3, endVerse: 18, whole: false }
const render = (passages: Passage[], index: BibleIndex | null = fakeIndex) =>
  renderToStaticMarkup(<BrowsePanel index={index} passages={passages} jumpSignal={0} onChange={noop} />)

describe('BrowsePanel', () => {
  it('lists all 66 books with a divider between the testaments', () => {
    const out = render([])
    expect(out.match(/data-book="/g)).toHaveLength(66)
    expect(out.indexOf('Malachi')).toBeLessThan(out.indexOf('browse-divider'))
    expect(out.indexOf('browse-divider')).toBeLessThan(out.indexOf('Matthew'))
  })

  it('starts at Genesis 1 when nothing is shown', () => {
    const out = render([])
    expect(out).toMatch(/data-book="1" class="browse-item is-current"/)
    expect(out.match(/data-chapter="/g)).toHaveLength(50)
    expect(out).toMatch(/data-chapter="1" class="browse-item is-current"/)
    expect(out.match(/data-verse="/g)).toHaveLength(31)
  })

  it('opens at the first shown passage and highlights the shown verses', () => {
    const out = render([JOHN_3_16_18])
    expect(out).toMatch(/data-book="43" class="browse-item is-current"/)
    expect(out).toMatch(/data-chapter="3" class="browse-item is-current"/)
    expect(out.match(/data-verse="/g)).toHaveLength(36)
    expect(out).toMatch(/data-verse="16" class="browse-item is-selected"/)
    expect(out).toMatch(/data-verse="18" class="browse-item is-selected"/)
    expect(out).toMatch(/data-verse="15" class="browse-item"/)
    expect(out).toMatch(/data-verse="19" class="browse-item"/)
  })

  it('marks books and chapters that contain shown verses', () => {
    const out = render([JOHN_3_16_18])
    expect(out).toMatch(/data-book="43"[^>]*>John<span class="browse-mark"/)
    expect(out).toMatch(/data-book="42"[^>]*>Luke<\/button>/)
    expect(out).toMatch(/data-chapter="3"[^>]*>3<span class="browse-mark"/)
    expect(out).toMatch(/data-chapter="2"[^>]*>2<\/button>/)
    expect(out).toContain('\u25cf')
  })

  it('says Loading until verse counts arrive', () => {
    const out = render([], null)
    expect(out).toContain('Genesis')
    expect(out.match(/Loading\u2026/g)).toHaveLength(2)
    expect(out).not.toContain('data-chapter="')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- tests/renderer/BrowsePanel.test.tsx`
Expected: FAIL — cannot resolve `BrowsePanel`.

- [ ] **Step 3: Implement `src/renderer/src/control/BrowsePanel.tsx`**

```tsx
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
```

- [ ] **Step 4: Append styles to `src/renderer/src/control/control.css`**

```css
.panel--browse {
  position: relative;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.browse {
  display: flex;
  gap: 4px;
  flex: 1;
  min-height: 0;
}

.browse__col {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
}

.browse__col--books {
  flex: 2.2;
}

.browse__head {
  margin: 0 0 4px;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--muted);
}

.browse__list {
  list-style: none;
  margin: 0;
  padding: 0;
  flex: 1;
  overflow-y: auto;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: #fff;
  user-select: none;
}

.browse__loading {
  padding: 4px 6px;
  font-size: 12px;
}

.browse-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
  border: none;
  background: none;
  padding: 2px 6px;
  font: inherit;
  font-size: 12px;
  text-align: left;
  cursor: pointer;
}

.browse-item:hover {
  background: #f0f3f8;
}

.browse-item.is-current {
  background: #e3ecfb;
  font-weight: 600;
}

.browse-item.is-selected {
  background: var(--accent);
  color: #fff;
}

.browse-mark {
  color: var(--accent);
  font-size: 9px;
  margin-left: 4px;
}

.browse-divider {
  border-top: 1px solid var(--border);
  margin: 3px 0;
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test -- tests/renderer/BrowsePanel.test.tsx`
Expected: PASS.

- [ ] **Step 6: Typecheck and commit**

```bash
npm run typecheck
git add src/renderer/src/control/BrowsePanel.tsx src/renderer/src/control/control.css tests/renderer/BrowsePanel.test.tsx
git commit -m "feat: Books | Chapters | Verses browse panel"
```

---

### Task 5: Wire the Browse column into the control window

**Files:**
- Modify: `src/renderer/src/control/ControlScreen.tsx`
- Modify: `src/renderer/src/control/control.css` (grid columns)
- Modify: `src/renderer/src/control/HelpPanel.tsx`, `README.md`
- Test: `tests/renderer/HelpPanel.test.tsx`

**Interfaces:**
- Consumes: `BrowsePanel` (Task 4); `toReferenceText`, `Passage` (Task 2); `SidePanel` with `side`/`label`/`className` and `getPanelCollapsed('browse')` / `setPanelCollapsed('browse', …)` (Task 3); `RefGroup.whole` (Task 1) — `refGroups` are passed as `passages` directly.
- Produces: nothing new for other tasks.

- [ ] **Step 1: Write the failing test**

In `tests/renderer/HelpPanel.test.tsx`, add inside `describe('HelpPanel', …)`:

```tsx
  it('explains the Browse picker', () => {
    const out = renderToStaticMarkup(<HelpPanel version="1.2.3" onClose={() => {}} />)
    for (const text of ['Browse', 'Books', 'Chapters', 'Verses', 'Ctrl+click', 'Shift+click', 'Double-click a chapter']) {
      expect(out).toContain(text)
    }
  })
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- tests/renderer/HelpPanel.test.tsx`
Expected: FAIL — Help has no "Double-click a chapter".

- [ ] **Step 3: Wire `ControlScreen.tsx`**

Imports — add:

```ts
import { toReferenceText, type Passage } from '../../../shared/pickerSelection'
import { BrowsePanel } from './BrowsePanel'
```

State — add after `const [panelCollapsed, setPanelCollapsed] = useState(false)`:

```ts
  const [browseCollapsed, setBrowseCollapsed] = useState(false)
  // Bumped whenever verses are shown some way other than the picker, so the picker jumps to them.
  const [browseJump, setBrowseJump] = useState(0)
```

Mount effect — add after the `getPanelCollapsed('settings')` line:

```ts
    void a.getPanelCollapsed('browse').then(setBrowseCollapsed)
```

Replace `show` with (adds a `fromPicker` flag and bumps the jump signal):

```ts
  const show = async (text: string, recordRecent = true, fromPicker = false) => {
    if (!index) return
    const result = parseReferences(text, index)
    setErrors(result.errors)
    if (result.groups.length === 0) return
    await present(result.groups, blank)
    if (!fromPicker) setBrowseJump(n => n + 1)
    if (!recordRecent) return
    resetListSel()
    await api().addRecent(text)
    setRecent(await api().listRecent())
  }
```

Replace `clear` and `removeGroup` with:

```ts
  const clear = () => {
    setInput('')
    setErrors([])
    resetListSel()
    void present([], blank)
    setBrowseJump(n => n + 1)
  }

  const removeGroup = (i: number) => {
    void present(refGroups.filter((_, j) => j !== i), blank)
    setBrowseJump(n => n + 1)
  }
```

Add after `togglePanel`:

```ts
  const toggleBrowse = () => {
    const next = !browseCollapsed
    setBrowseCollapsed(next)
    void api().setPanelCollapsed('browse', next)
  }

  // The picker produced a new selection: write it to the verse box and show it (not added to Recent).
  const pickVerses = (next: Passage[]) => {
    if (next.length === 0) {
      clear()
      return
    }
    const text = toReferenceText(next)
    resetListSel()
    setInput(text)
    setErrors([])
    void show(text, false, true)
  }
```

Panels `<div>` — replace its `className` with:

```tsx
      <div
        className={`control__panels${panelCollapsed ? ' control__panels--settings-collapsed' : ''}${
          browseCollapsed ? ' control__panels--browse-collapsed' : ''
        }`}
      >
```

Insert the Browse column between the closing `</aside>` of the left panel and `<main className="panel panel--middle">`:

```tsx
        <SidePanel side="left" label="Browse" className="panel--browse" collapsed={browseCollapsed} onToggle={toggleBrowse}>
          <h3 className="panel__title">Browse</h3>
          <BrowsePanel index={index} passages={refGroups} jumpSignal={browseJump} onChange={pickVerses} />
        </SidePanel>
```

- [ ] **Step 4: Update the grid in `control.css`**

Replace the `grid-template-columns` line in `.control__panels` and the `.control__panels--settings-collapsed` rule with these four rules (keep the other `.control__panels` properties):

```css
.control__panels {
  grid-template-columns: 300px 260px 1fr 300px;
}

.control__panels--browse-collapsed {
  grid-template-columns: 300px 28px 1fr 300px;
}

.control__panels--settings-collapsed {
  grid-template-columns: 300px 260px 1fr 28px;
}

.control__panels--browse-collapsed.control__panels--settings-collapsed {
  grid-template-columns: 300px 28px 1fr 28px;
}
```

(i.e. in the existing `.control__panels { display: grid; … }` rule, change only the `grid-template-columns` value to `300px 260px 1fr 300px`, and add the three modifier rules after it, replacing the old `--settings-collapsed` rule.)

- [ ] **Step 5: Document it**

`src/renderer/src/control/HelpPanel.tsx` — add after the "Search" section:

```tsx
        <h3>Browse</h3>
        <p>
          The Browse column lists Books, Chapters, and Verses. Click a book, then a chapter, then a verse to show it.{' '}
          <kbd>Ctrl+click</kbd> adds or removes verses (even in other chapters or books); <kbd>Shift+click</kbd> selects
          the range from the last verse you clicked; <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+click adds that range. Double-click a
          chapter to show the whole chapter. Verses you show any other way are highlighted here too, and a dot marks the
          books and chapters that contain them. Click the arrow at the top to hide or show the column.
        </p>
```

`README.md` — after the Search bullet, add:

```markdown
- Browse: the **Books | Chapters | Verses** column lets you point and click. Click a verse to show it; **Ctrl+click** adds or removes verses (across chapters and books); **Shift+click** selects a range from the last verse clicked; **Ctrl+Shift+click** adds a range. Double-click a chapter to show all of it. Whatever is on screen is highlighted in the picker. The arrow at the top hides or shows the column.
```

- [ ] **Step 6: Run all tests, typecheck, build**

Run: `npm test` — Expected: all pass.
Run: `npm run typecheck` — Expected: no errors.
Run: `npm run build` — Expected: succeeds.

- [ ] **Step 7: Manual check in the running app**

Run `npm run dev` and check:
1. The Browse column sits between the left panel and the preview; Books/Chapters/Verses scroll independently.
2. Click John → 3 → 16: John 3:16 shows; the verse box says `Joh 3:16`; Recent is unchanged.
3. Ctrl+click 18 and 20 → `Joh 3:16, Joh 3:18, Joh 3:20`; Ctrl+click 17 → `Joh 3:16-18, Joh 3:20`. Ctrl+click 17 again → split.
4. Go to chapter 4, Shift+click 5 → `Joh 3:16-4:5` only. Ctrl+Shift+click elsewhere adds a range.
5. Go to Romans 5, Ctrl+click 8 → Romans appears after John on screen; John and Romans show ●.
6. Double-click Psalms 23 → `Psa 23` whole chapter with heading "Psalms 23".
7. Type `jn 1:1-3` + Enter → the picker jumps to John 1 with 1–3 highlighted. Pick a Recent line → it jumps there.
8. Esc → highlights clear.
9. Click « on Browse → it collapses to a strip; restart the app → still collapsed; » reopens. The settings panel's » / « still work and are remembered separately.

- [ ] **Step 8: Commit**

```bash
git add src/renderer/src/control/ControlScreen.tsx src/renderer/src/control/control.css src/renderer/src/control/HelpPanel.tsx README.md tests/renderer/HelpPanel.test.tsx
git commit -m "feat: Browse column for picking verses with Ctrl/Shift"
```
