# Verse Search — Design Spec

**Date:** 2026-10-05
**Status:** Approved in brainstorming; awaiting written-spec review

## 1. Purpose

Let the operator find verses by their words — live during a service ("something about still
waters") and while preparing a sermon's verse list — and show the results on the display through
the existing reference workflow. Searches can use plain words or a regular expression.

## 2. Scope

**In scope**
- Four search modes: All words, Exact phrase, Any word, Regex.
- Scope filter: Whole Bible, Old Testament, New Testament, Gospels, or one book.
- Search as you type; results list with matched words in bold; show results on the display.
- Shortcuts: Ctrl+F, and `?words` / `/regex/` typed in the main reference box.
- Remembering the last mode and scope.

**Out of scope**
- Marking matches on the display or in the live preview (results list only).
- Matches that span two verses.
- Saving searches, search history, or a typed (reference-syntax) scope.
- A full-text index; the KJV is small enough to scan in memory.

## 3. User interface

### 3.1 Layout

In the left panel, the Imported and Recent sections become one tabbed area:
**Imported | Recent | Search**. Each keeps its current content and behavior inside its tab. The
selected tab is local UI state (Imported by default).

The Search tab contains, top to bottom:
- A search text box with a clear (×) button.
- A **mode** dropdown: All words (default) · Exact phrase · Any word · Regex.
- A **scope** dropdown: Whole Bible (default) · Old Testament · New Testament · Gospels · then
  each of the 66 books in canonical order.
- A status line: match count (`1,284 matches — showing first 500`), or a hint / error note (§6).
- The results list. Each row: short reference (`Psa 23:2`, using the book's 3-letter code, which
  the reference parser accepts) followed by the verse text with every match in bold. Long verses
  are trimmed with `…` around the first match.

### 3.2 Showing results

The results list behaves like the Imported and Recent lists (reusing `SelectableList` selection
rules):
- **Click** shows that verse. **Ctrl+click** toggles a row; **Shift+click** selects a range; all
  selected rows show together.
- **Enter** in the search box shows the selected rows, or the first row if none are selected.
- Showing a result puts its references in the main reference box (e.g. `Psa 23:2, Isa 8:6`) and
  calls the existing `show(text, false)`, so the operator can add `..` or widen the range and press
  Enter. Like the other lists, it does not add to Recent.

### 3.3 Keyboard and shortcuts

- **Ctrl+F**: switch to the Search tab, focus the search box, and select its text.
- In the main reference box, pressing Enter on text starting with `?` opens the Search tab with
  the rest of the text in **All words** mode (e.g. `?still waters`). Text of the form `/pattern/`
  opens it in **Regex** mode with `pattern`. The reference box is not parsed as references in
  either case.
- **Esc** in the search box: if the box has text, clear it (and the results) and stop; if it is
  already empty, Esc keeps its global meaning (Clear). Esc elsewhere is unchanged.

### 3.4 Remembered settings

Mode and scope are saved in the user database `settings` table under key `search`
(`{ mode, scope }`) and restored at startup. Invalid or missing values fall back to All words /
Whole Bible. Search text and results are not saved.

## 4. Search behavior

All matching logic lives in `src/shared/search.ts` as pure functions.

### 4.1 Common rules

- A match lies within a single verse.
- Case-insensitive.
- Before matching, `’` and `‘` in verse text are replaced by `'` (and the same in the query). The
  replacement is one UTF-16 unit for one, so match offsets map directly onto the original text.
- Results are in canonical order (Genesis → Revelation, then chapter, then verse), restricted to
  the scope. `total` counts every matching verse; at most **500** rows are returned.
- An empty (or whitespace-only) query returns no results and the UI shows the hint.
- Scope book sets: Old Testament = books 1–39, New Testament = 40–66, Gospels = 40–43, a single
  book = that id.

### 4.2 Plain-mode query parsing (All words, Any word)

- The query is split into **terms**: each `"quoted phrase"` is one term; remaining text is split
  on whitespace into word terms. An unclosed quote runs to the end of the query.
- In a word term, characters other than letters, digits, `'` and `*` are removed (`shepherd;` →
  `shepherd`). Terms that become empty are dropped.
- A word matches **whole words** only: `faith` does not match `faithful`.
- `*` anywhere in a word matches zero or more letters: `faith*`, `*eth`, `bless*d`.
- A phrase term matches its words in order, separated by any run of non-word characters
  (spaces or punctuation), each word whole (with `*` allowed).
- **All words**: every term must match the verse. **Any word**: at least one term must match.

### 4.3 Exact phrase

- The whole query (after the same character cleanup, quotes ignored) is one sequence of words that
  must appear in order, separated by any run of non-word characters: `shepherd I shall` matches
  "shepherd; I shall".
- The first word may begin mid-word and the last word may end mid-word, so partial typing matches
  (`still wat` matches "still waters"). Inner words are whole. `*` still matches letters.

### 4.4 Regex

- The query is a JavaScript regular expression, compiled with flags `gi`, matched against each
  verse's (apostrophe-normalized) text.
- A pattern that only matches the empty string still counts the verse as a match; zero-length
  matches are not bolded.
- A pattern that fails to compile returns an error (message derived from the `SyntaxError`, e.g.
  `Unfinished pattern: missing )`).

### 4.5 Bold marks

For each result row, the marks are every non-empty match of every term (or of the regex) in that
verse, as `{start, end}` spans, sorted and merged where they overlap.

### 4.6 Interface

```ts
type SearchMode = 'all' | 'phrase' | 'any' | 'regex'
type SearchScope = 'bible' | 'ot' | 'nt' | 'gospels' | { bookId: number }
interface SearchQuery { text: string; mode: SearchMode; scope: SearchScope }
type VerseRow = [bookId: number, chapter: number, verse: number, text: string]
interface SearchHit { bookId: number; chapter: number; verse: number; text: string; marks: Span[] }
type SearchResult = { kind: 'ok'; total: number; hits: SearchHit[] } | { kind: 'error'; message: string }

function searchVerses(verses: VerseRow[], query: SearchQuery, limit?: number): SearchResult
```

`searchVerses` compiles the query once, then scans. Helpers (`parseTerms`, `compileQuery`,
`scopeBooks`) are exported for testing.

## 5. Architecture and data flow

### 5.1 Loading the text

- `BibleDb.allVerses(): VerseRow[]` returns every verse in canonical order.
- New IPC channel `bible:all-verses` (`IPC.allVerses`), exposed as `control.allVerses()`.
- The control window requests it in the background after startup (not on first search), and keeps
  the rows in memory for the session.

### 5.2 Worker

`src/renderer/src/control/search.worker.ts`, imported with Vite's `?worker` suffix. Messages:
- in: `{ type: 'init', verses: VerseRow[] }`, then `{ type: 'search', id: number, query: SearchQuery }`
- out: `{ id, result: SearchResult }`

The worker only calls `searchVerses`.

### 5.3 `useSearch` hook

`src/renderer/src/control/useSearch.ts` owns the worker and exposes
`{ status, total, hits, note }` for the current query.
- **Debounce:** a search starts 250 ms after the last change to text, mode, or scope.
- **Cancellation:** if a new search starts while one is in flight, the worker is terminated and a
  new one created and re-sent `init` before the new search.
- **Timeout:** no reply within **1.5 s** → terminate, restart, and set note "Search took too long —
  try a simpler pattern".
- **Staleness:** replies whose `id` is not the latest are ignored.
- **Worker `error` event:** handled like a timeout.
- On a regex error reply, the previous hits stay and the note shows the message.

The worker is created through an injectable factory so tests can supply a fake.

### 5.4 Files

**New**
- `src/shared/search.ts` — query parsing, compiling, scope, `searchVerses`.
- `src/renderer/src/control/search.worker.ts`
- `src/renderer/src/control/useSearch.ts`
- `src/renderer/src/control/SearchPanel.tsx` — box, dropdowns, status, results list.
- `src/renderer/src/control/ListTabs.tsx` — the Imported | Recent | Search tab strip.

**Changed**
- `src/main/bibleDb.ts` — `allVerses()`.
- `src/main/userDb.ts` — `getSearchPrefs()` / `setSearchPrefs()`.
- `src/main/ipc.ts`, `src/shared/ipc.ts`, `src/preload/index.ts`, `src/shared/api.ts` —
  `allVerses`, `getSearchPrefs`, `setSearchPrefs`.
- `src/shared/types.ts` — search types if shared beyond `search.ts`.
- `src/renderer/src/control/keys.ts` — Ctrl+F action (`{ type: 'search' }`).
- `src/renderer/src/control/ControlScreen.tsx` — tabs, Ctrl+F, `?`/`/` prefixes, showing hits.
- `src/renderer/src/control/control.css` — tabs, search panel, bold marks.
- `src/renderer/src/control/HelpPanel.tsx`, `README.md` — document search.

## 6. Errors and edge cases

| Situation | Behavior |
|---|---|
| Invalid regex | Note under the box with the message; previous results kept. |
| Search exceeds 1.5 s | Worker restarted; note "Search took too long — try a simpler pattern". Display unaffected. |
| Worker crashes | Same as timeout. |
| `allVerses` fails | Search tab shows "Search unavailable — couldn't load Bible text"; the rest of the app works. Opening the tab again retries. |
| Text not loaded yet | Search tab shows "Loading…"; the query runs once loaded. |
| No matches | "No matches in *<scope name>*". |
| Empty query | Hint: "Type words to find, e.g. *still waters*". |
| More than 500 matches | First 500 shown; status gives the total. |

## 7. Testing

- `tests/shared/search.test.ts` — term parsing (quotes, unclosed quote, `*`, punctuation
  stripping); each mode; whole vs partial words; exact-phrase punctuation tolerance and partial
  ends; apostrophe normalization; scopes (OT, NT, Gospels, single book); ordering; limit with
  correct total; marks (multiple, overlapping, zero-length regex); invalid regex error.
- `tests/main/bibleDb.test.ts` — `allVerses()` on the fixture Bible (order, contents).
- `tests/main/userDb.test.ts` — search prefs round-trip; defaults on missing/invalid stored value.
- `tests/renderer/keys.test.ts` — Ctrl+F maps to the search action.
- `tests/renderer/useSearch.test.ts` — debounce, stale replies ignored, timeout restart, error
  keeps previous hits (fake timers, fake worker factory).
- `tests/renderer/SearchPanel.test.tsx` — rendering, bold marks, click / Ctrl+click / Shift+click /
  Enter producing the right reference text, Esc behavior, notes and hints (fake worker that calls
  `searchVerses` directly).
- `tests/data/realBible.test.ts` — against the real KJV database: `"still waters"` finds Psalm
  23:2; a whole-Bible All-words search completes well under the timeout.
- Manual, in the running app: Ctrl+F, `?` and `/` prefixes, tabs, and a catastrophic-backtracking regex
  such as `^(\w+\s?)*$` over the whole Bible — the display and control window stay responsive and the timeout note appears.
