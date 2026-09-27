# Bible Display Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Windows desktop app where the operator types Bible references (e.g. `jn 1:3-5, mk 3:1-3, luke 1:2`) on a control window and all those KJV verses appear on a second monitor, with red letters, styles, highlights, and scrolling.

**Architecture:** Electron app built with electron-vite. The main process owns two SQLite databases (read-only `bible.db`, per-user `user.db`) and two windows (control + fullscreen display on the second monitor), relaying messages over IPC. One React bundle serves both windows via hash routes. All parsing, type-ahead, and color-segment logic is pure TypeScript in `src/shared/` and unit-tested.

**Tech Stack:** Electron, electron-vite, React 18+, TypeScript, better-sqlite3, font-list, Vitest (+ jsdom), esbuild (import script), electron-builder (installer).

**Spec:** `docs/superpowers/specs/2026-09-26-bible-display-design.md`

## Global Constraints

- Platform: Windows 11. Shell commands below are for Git Bash; `npm` scripts work in any shell.
- Bible text: KJV only, from `eng-kjv.osis.xml` (https://github.com/seven1m/open-bibles). 66 books, **31,102 verses**. Apocrypha books in the source are skipped.
- `bible.db` lives at `resources/bible.db` (committed, read-only at runtime). `user.db` lives in `app.getPath('userData')` (`%APPDATA%\BibleDisplay`).
- Text offsets (`start`/`end`, DB columns `start_pos`/`end_pos`) are JavaScript string indices into the verse text, **end exclusive**.
- Color precedence when rendering a verse: **user highlight → red letter (Jesus' words) → normal verse-text color**.
- Recent inputs kept: **20**. Display scale: **0.5–3.0, step 0.1**. Font fallback: **Georgia**.
- better-sqlite3 is compiled for Electron's Node ABI. **Always run tests with `npm test`** (which runs Vitest inside Electron's Node via `ELECTRON_RUN_AS_NODE=1`). Never run plain `npx vitest` — it will fail to load the native module.
- Every commit message ends with the trailer line `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` (the commit commands below pass it as a second `-m`).

---

## File Structure

```
BibleDisplay/
  package.json, tsconfig.json, electron.vite.config.ts, vitest.config.ts, .gitignore, README.md
  resources/bible.db                     generated KJV database (committed)
  data/
    source/eng-kjv.osis.xml              downloaded source (git-ignored)
    lib/osis.ts                          OSIS XML → ParsedVerse[] (pure)
    lib/buildBibleDb.ts                  ParsedVerse[] → bible.db; chapter-count validation
    import-kjv.ts                        CLI entry: source → resources/bible.db
  src/shared/                            pure, no Electron/DOM imports
    types.ts                             all cross-process data types
    books.ts                             the 66 books: names, 3-letter codes, OSIS ids, chapters, aliases
    resolve.ts                           book-name normalization and resolution
    bibleIndex.ts                        VerseCounts → BibleIndex
    parser.ts                            reference parser
    suggest.ts                           type-ahead suggestions and hints
    segments.ts                          merge red-letter + highlight spans into colored segments
    styles.ts                            Styles type, defaults, normalize, scale, fontStack
    ipc.ts                               IPC channel names
    api.ts                               BibleApi interface exposed by preload
  src/main/
    index.ts                             app lifecycle, windows wiring
    windows.ts                           create/position windows
    displayPick.ts                       choose the second monitor (pure)
    bibleDb.ts                           read-only KJV access
    userDb.ts                            styles, highlights, recent inputs
    loadGroups.ts                        RefGroup[] → DisplayGroup[] (verses + highlights)
    fonts.ts                             installed font list
    ipc.ts                               IPC handlers
  src/preload/index.ts                   contextBridge API
  src/renderer/
    index.html
    src/main.tsx, src/env.d.ts, src/base.css
    src/verse/VerseView.tsx, verse.css   shared verse renderer (display + preview)
    src/display/DisplayScreen.tsx, scroll.ts, display.css
    src/control/ControlScreen.tsx, control.css, useBibleIndex.ts
    src/control/ReferenceInput.tsx, errorMarks.ts, SelectedList.tsx, RecentList.tsx
    src/control/PreviewPanel.tsx, selection.ts, keys.ts
    src/control/StylePanel.tsx, FontSelect.tsx, ColorField.tsx
  tests/                                 mirrors src/ and data/
```

---

### Task 1: Project scaffold and toolchain

**Files:**
- Create: `package.json`, `tsconfig.json`, `electron.vite.config.ts`, `vitest.config.ts`
- Create: `src/main/index.ts`, `src/preload/index.ts`, `src/renderer/index.html`, `src/renderer/src/main.tsx`
- Modify: `.gitignore`
- Test: `tests/smoke.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `npm test` (Vitest under Electron's Node), `npm run dev`, `npm run typecheck`, `npm run import-kjv` script entry (script file created in Task 7).

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "bible-display",
  "productName": "BibleDisplay",
  "version": "0.1.0",
  "private": true,
  "description": "Show Bible verses on a second monitor",
  "main": "out/main/index.js",
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "start": "electron-vite preview",
    "typecheck": "tsc --noEmit -p tsconfig.json",
    "test": "cross-env ELECTRON_RUN_AS_NODE=1 electron node_modules/vitest/vitest.mjs run",
    "test:watch": "cross-env ELECTRON_RUN_AS_NODE=1 electron node_modules/vitest/vitest.mjs",
    "import-kjv": "esbuild data/import-kjv.ts --bundle --platform=node --format=cjs --external:better-sqlite3 --outfile=out/import-kjv.cjs && cross-env ELECTRON_RUN_AS_NODE=1 electron out/import-kjv.cjs"
  }
}
```

- [ ] **Step 2: Install dependencies**

Run:
```bash
npm install better-sqlite3 font-list
npm install -D electron electron-vite vite @vitejs/plugin-react react react-dom @types/react @types/react-dom typescript @types/node @types/better-sqlite3 vitest jsdom cross-env @electron/rebuild esbuild
```
If npm reports an `ERESOLVE` peer conflict for `vite`, run `npm view electron-vite peerDependencies`, then install the newest `vite` major it allows (e.g. `npm install -D vite@6`) and repeat the second command.

Now that `@electron/rebuild` is installed, add this line to `"scripts"` in `package.json`:
```json
"postinstall": "electron-rebuild -f -w better-sqlite3"
```
and run it once: `npm run postinstall`. It rebuilds better-sqlite3 for Electron. If it fails with a compiler error, install "Visual Studio Build Tools" with the "Desktop development with C++" workload, then run `npm run postinstall` again.

- [ ] **Step 3: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "resolveJsonModule": true,
    "noEmit": true,
    "types": ["node"]
  },
  "include": ["src", "tests", "data/**/*.ts", "electron.vite.config.ts", "vitest.config.ts"]
}
```

- [ ] **Step 4: Create `electron.vite.config.ts` and `vitest.config.ts`**

`electron.vite.config.ts`:
```ts
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: { plugins: [externalizeDepsPlugin()] },
  preload: { plugins: [externalizeDepsPlugin()] },
  renderer: { plugins: [react()] },
})
```

`vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  esbuild: { jsx: 'automatic' },
  test: {
    include: ['tests/**/*.test.{ts,tsx}'],
    environment: 'node',
  },
})
```

- [ ] **Step 5: Create a minimal app so `npm run dev` opens a window**

`src/main/index.ts`:
```ts
import { app, BrowserWindow } from 'electron'
import { join } from 'node:path'

app.whenReady().then(() => {
  const win = new BrowserWindow({ width: 900, height: 600, autoHideMenuBar: true })
  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) void win.loadURL(devUrl)
  else void win.loadFile(join(__dirname, '../renderer/index.html'))
})

app.on('window-all-closed', () => app.quit())
```

`src/preload/index.ts`:
```ts
export {}
```

`src/renderer/index.html`:
```html
<!doctype html>
<html>
  <head>
    <meta charset="UTF-8" />
    <title>Bible Display</title>
    <meta
      http-equiv="Content-Security-Policy"
      content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:"
    />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`src/renderer/src/main.tsx`:
```tsx
import { createRoot } from 'react-dom/client'

createRoot(document.getElementById('root')!).render(<h1>Bible Display</h1>)
```

- [ ] **Step 6: Update `.gitignore`**

Replace its contents with:
```
node_modules/
out/
dist/
release/
.superpowers/
data/source/
*.db-journal
```

- [ ] **Step 7: Write the smoke test**

`tests/smoke.test.ts`:
```ts
import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'

describe('toolchain', () => {
  it("runs under Electron's Node", () => {
    expect(process.versions.electron).toBeTruthy()
  })

  it('loads better-sqlite3', () => {
    const db = new Database(':memory:')
    expect(db.prepare('SELECT 1 AS x').get()).toEqual({ x: 1 })
    db.close()
  })
})
```

- [ ] **Step 8: Run the tests**

Run: `npm test`
Expected: 2 passed. If Vitest fails to start its workers under Electron, add `pool: 'threads'` inside `test: { … }` in `vitest.config.ts` and re-run.

- [ ] **Step 9: Check the app and types**

Run: `npm run typecheck` → no errors.
Run: `npm run dev` → a window shows "Bible Display". Close it.
If the window is blank and DevTools (Ctrl+Shift+I) → Console shows a Content-Security-Policy error for an inline script (React fast-refresh preamble), change `script-src 'self'` to `script-src 'self' 'unsafe-inline'` in `src/renderer/index.html` and re-run.

- [ ] **Step 10: Commit**

```bash
git add package.json package-lock.json tsconfig.json electron.vite.config.ts vitest.config.ts .gitignore src tests
git commit -m "chore: scaffold Electron + React + TypeScript app with Vitest" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Shared types and the book table

**Files:**
- Create: `src/shared/types.ts`, `src/shared/books.ts`
- Test: `tests/shared/books.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: every type in `types.ts` (used by all later tasks); `BOOKS: Book[]` (ids 1–66, canonical order); `bookById(id: number): Book`.

- [ ] **Step 1: Create `src/shared/types.ts`**

```ts
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
```

- [ ] **Step 2: Write the failing test**

`tests/shared/books.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { BOOKS, bookById } from '../../src/shared/books'

describe('BOOKS', () => {
  it('has 66 books with ids 1..66 in order', () => {
    expect(BOOKS).toHaveLength(66)
    BOOKS.forEach((b, i) => expect(b.id).toBe(i + 1))
    expect(BOOKS[0].name).toBe('Genesis')
    expect(BOOKS[65].name).toBe('Revelation')
  })

  it('has unique 3-letter codes and OSIS ids', () => {
    const codes = BOOKS.map(b => b.abbrev3.toLowerCase())
    expect(new Set(codes).size).toBe(66)
    codes.forEach(c => expect(c).toHaveLength(3))
    expect(new Set(BOOKS.map(b => b.osis)).size).toBe(66)
  })

  it('has the KJV chapter counts', () => {
    expect(BOOKS.reduce((n, b) => n + b.chapters, 0)).toBe(1189)
    expect(bookById(19).chapters).toBe(150)
    expect(bookById(43).name).toBe('John')
    expect(bookById(43).abbrev3).toBe('Joh')
  })

  it('throws for an unknown id', () => {
    expect(() => bookById(67)).toThrow()
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- tests/shared/books.test.ts`
Expected: FAIL (cannot resolve `../../src/shared/books`).

- [ ] **Step 4: Create `src/shared/books.ts`**

```ts
import type { Book } from './types'

type Row = [name: string, abbrev3: string, osis: string, chapters: number, aliases: string[]]

const ROWS: Row[] = [
  ['Genesis', 'Gen', 'Gen', 50, ['ge', 'gn']],
  ['Exodus', 'Exo', 'Exod', 40, ['ex']],
  ['Leviticus', 'Lev', 'Lev', 27, ['lv']],
  ['Numbers', 'Num', 'Num', 36, ['nm', 'nb']],
  ['Deuteronomy', 'Deu', 'Deut', 34, ['dt']],
  ['Joshua', 'Jos', 'Josh', 24, ['jsh']],
  ['Judges', 'Jdg', 'Judg', 21, ['jg', 'jdgs']],
  ['Ruth', 'Rut', 'Ruth', 4, ['ru', 'rth']],
  ['1 Samuel', '1Sa', '1Sam', 31, ['1sm', '1s']],
  ['2 Samuel', '2Sa', '2Sam', 24, ['2sm', '2s']],
  ['1 Kings', '1Ki', '1Kgs', 22, ['1kg', '1kin']],
  ['2 Kings', '2Ki', '2Kgs', 25, ['2kg', '2kin']],
  ['1 Chronicles', '1Ch', '1Chr', 29, ['1chron']],
  ['2 Chronicles', '2Ch', '2Chr', 36, ['2chron']],
  ['Ezra', 'Ezr', 'Ezra', 10, []],
  ['Nehemiah', 'Neh', 'Neh', 13, []],
  ['Esther', 'Est', 'Esth', 10, []],
  ['Job', 'Job', 'Job', 42, ['jb']],
  ['Psalms', 'Psa', 'Ps', 150, ['psalm', 'pss', 'psm']],
  ['Proverbs', 'Pro', 'Prov', 31, ['pr', 'prv']],
  ['Ecclesiastes', 'Ecc', 'Eccl', 12, ['qoh']],
  ['Song of Solomon', 'Sng', 'Song', 8, ['sos', 'songofsongs', 'canticles']],
  ['Isaiah', 'Isa', 'Isa', 66, ['is']],
  ['Jeremiah', 'Jer', 'Jer', 52, ['jr']],
  ['Lamentations', 'Lam', 'Lam', 5, []],
  ['Ezekiel', 'Eze', 'Ezek', 48, ['ezk']],
  ['Daniel', 'Dan', 'Dan', 12, ['dn']],
  ['Hosea', 'Hos', 'Hos', 14, []],
  ['Joel', 'Joe', 'Joel', 3, ['jl']],
  ['Amos', 'Amo', 'Amos', 9, []],
  ['Obadiah', 'Oba', 'Obad', 1, ['ob']],
  ['Jonah', 'Jon', 'Jonah', 4, ['jnh']],
  ['Micah', 'Mic', 'Mic', 7, []],
  ['Nahum', 'Nah', 'Nah', 3, ['na']],
  ['Habakkuk', 'Hab', 'Hab', 3, ['hb']],
  ['Zephaniah', 'Zep', 'Zeph', 3, ['zp']],
  ['Haggai', 'Hag', 'Hag', 2, ['hg']],
  ['Zechariah', 'Zec', 'Zech', 14, ['zc']],
  ['Malachi', 'Mal', 'Mal', 4, ['ml']],
  ['Matthew', 'Mat', 'Matt', 28, ['mt']],
  ['Mark', 'Mar', 'Mark', 16, ['mk', 'mrk', 'mr']],
  ['Luke', 'Luk', 'Luke', 24, ['lk']],
  ['John', 'Joh', 'John', 21, ['jn', 'jhn']],
  ['Acts', 'Act', 'Acts', 28, ['ac']],
  ['Romans', 'Rom', 'Rom', 16, ['ro', 'rm']],
  ['1 Corinthians', '1Co', '1Cor', 16, []],
  ['2 Corinthians', '2Co', '2Cor', 13, []],
  ['Galatians', 'Gal', 'Gal', 6, ['ga']],
  ['Ephesians', 'Eph', 'Eph', 6, ['ephes']],
  ['Philippians', 'Phi', 'Phil', 4, ['php']],
  ['Colossians', 'Col', 'Col', 4, []],
  ['1 Thessalonians', '1Th', '1Thess', 5, ['1thes']],
  ['2 Thessalonians', '2Th', '2Thess', 3, ['2thes']],
  ['1 Timothy', '1Ti', '1Tim', 6, []],
  ['2 Timothy', '2Ti', '2Tim', 4, []],
  ['Titus', 'Tit', 'Titus', 3, []],
  ['Philemon', 'Phm', 'Phlm', 1, ['philem']],
  ['Hebrews', 'Heb', 'Heb', 13, []],
  ['James', 'Jam', 'Jas', 5, ['jm']],
  ['1 Peter', '1Pe', '1Pet', 5, ['1pt']],
  ['2 Peter', '2Pe', '2Pet', 3, ['2pt']],
  ['1 John', '1Jo', '1John', 5, ['1jn', '1jhn']],
  ['2 John', '2Jo', '2John', 1, ['2jn', '2jhn']],
  ['3 John', '3Jo', '3John', 1, ['3jn', '3jhn']],
  ['Jude', 'Jud', 'Jude', 1, ['jde']],
  ['Revelation', 'Rev', 'Rev', 22, ['re', 'rv', 'revelations']],
]

export const BOOKS: Book[] = ROWS.map(([name, abbrev3, osis, chapters, aliases], i) => ({
  id: i + 1,
  name,
  abbrev3,
  osis,
  chapters,
  aliases,
}))

export function bookById(id: number): Book {
  const book = BOOKS[id - 1]
  if (!book) throw new Error(`No book with id ${id}`)
  return book
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- tests/shared/books.test.ts`
Expected: 4 passed.

- [ ] **Step 6: Commit**

```bash
git add src/shared tests/shared
git commit -m "feat: add shared types and KJV book table" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Book-name resolution and the verse-count index

**Files:**
- Create: `src/shared/resolve.ts`, `src/shared/bibleIndex.ts`
- Create: `tests/helpers/fakeIndex.ts`
- Test: `tests/shared/resolve.test.ts`, `tests/shared/bibleIndex.test.ts`

**Interfaces:**
- Consumes: `BOOKS`, `Book`, `BibleIndex`, `VerseCounts` (Task 2).
- Produces:
  - `normalizeBookText(s: string): string` — lowercase, remove `.` and all whitespace.
  - `bookKeys(book: Book): string[]` — normalized name, 3-letter code, OSIS id, and aliases (deduplicated).
  - `type BookMatch = { kind: 'book'; book: Book } | { kind: 'ambiguous'; candidates: Book[] } | { kind: 'unknown' }`
  - `resolveBook(text: string): BookMatch`
  - `createIndex(counts: VerseCounts): BibleIndex`
  - Test helper `fakeIndex: BibleIndex` (real KJV counts for the chapters used in tests).

- [ ] **Step 1: Create the test helper `tests/helpers/fakeIndex.ts`**

```ts
import type { BibleIndex } from '../../src/shared/types'

// Real KJV verse counts for the chapters used in tests. Key: "bookId.chapter".
const COUNTS: Record<string, number> = {
  '1.1': 31, // Genesis 1
  '19.23': 6, // Psalms 23
  '19.24': 10,
  '19.25': 22,
  '41.3': 35, // Mark 3
  '42.1': 80, // Luke 1
  '43.1': 51, // John 1
  '43.2': 25,
  '43.3': 36,
  '43.4': 54,
  '62.3': 24, // 1 John 3
  '65.1': 25, // Jude 1
}

export const fakeIndex: BibleIndex = {
  verseCount: (bookId, chapter) => COUNTS[`${bookId}.${chapter}`] ?? 0,
}
```

- [ ] **Step 2: Write the failing tests**

`tests/shared/resolve.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { BOOKS } from '../../src/shared/books'
import { bookKeys, normalizeBookText, resolveBook } from '../../src/shared/resolve'

const nameOf = (text: string) => {
  const r = resolveBook(text)
  return r.kind === 'book' ? r.book.name : r.kind
}

describe('normalizeBookText', () => {
  it('lowercases and strips dots and spaces', () => {
    expect(normalizeBookText(' 1 Jn. ')).toBe('1jn')
    expect(normalizeBookText('Song of Solomon')).toBe('songofsolomon')
  })
})

describe('bookKeys', () => {
  it('never maps one key to two books', () => {
    const owner = new Map<string, string>()
    for (const b of BOOKS) {
      for (const k of bookKeys(b)) {
        expect(owner.get(k) ?? b.name, `key "${k}"`).toBe(b.name)
        owner.set(k, b.name)
      }
    }
  })
})

describe('resolveBook', () => {
  it('matches full names, 3-letter codes, and aliases case-insensitively', () => {
    expect(nameOf('genesis')).toBe('Genesis')
    expect(nameOf('GEN')).toBe('Genesis')
    expect(nameOf('jn')).toBe('John')
    expect(nameOf('mk')).toBe('Mark')
    expect(nameOf('ps')).toBe('Psalms')
    expect(nameOf('Luke')).toBe('Luke')
  })

  it('handles numbered books written several ways', () => {
    for (const t of ['1 john', '1john', '1jn', '1 joh', '1 Jn.']) expect(nameOf(t)).toBe('1 John')
  })

  it('accepts a unique prefix of a full name', () => {
    expect(nameOf('phile')).toBe('Philemon')
    expect(nameOf('lament')).toBe('Lamentations')
  })

  it('reports ambiguous prefixes with candidates in Bible order', () => {
    const r = resolveBook('jo')
    expect(r.kind).toBe('ambiguous')
    if (r.kind === 'ambiguous') {
      expect(r.candidates.map(b => b.name)).toEqual(['Joshua', 'Job', 'Joel', 'Jonah', 'John'])
    }
  })

  it('reports unknown and empty text', () => {
    expect(resolveBook('xyz').kind).toBe('unknown')
    expect(resolveBook('  ').kind).toBe('unknown')
  })
})
```

`tests/shared/bibleIndex.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { createIndex } from '../../src/shared/bibleIndex'

describe('createIndex', () => {
  it('returns verse counts and 0 for unknown chapters', () => {
    const index = createIndex({ 43: [51, 25, 36] })
    expect(index.verseCount(43, 3)).toBe(36)
    expect(index.verseCount(43, 4)).toBe(0)
    expect(index.verseCount(1, 1)).toBe(0)
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test -- tests/shared/resolve.test.ts tests/shared/bibleIndex.test.ts`
Expected: FAIL (modules not found).

- [ ] **Step 4: Implement `src/shared/resolve.ts`**

```ts
import { BOOKS } from './books'
import type { Book } from './types'

export function normalizeBookText(s: string): string {
  return s.toLowerCase().replace(/\./g, '').replace(/\s+/g, '')
}

export function bookKeys(book: Book): string[] {
  return [...new Set([book.name, book.abbrev3, book.osis, ...book.aliases].map(normalizeBookText))]
}

const KEY_TO_BOOK = new Map<string, Book>()
for (const book of BOOKS) for (const key of bookKeys(book)) KEY_TO_BOOK.set(key, book)

export type BookMatch =
  | { kind: 'book'; book: Book }
  | { kind: 'ambiguous'; candidates: Book[] }
  | { kind: 'unknown' }

export function resolveBook(text: string): BookMatch {
  const key = normalizeBookText(text)
  if (!key) return { kind: 'unknown' }
  const exact = KEY_TO_BOOK.get(key)
  if (exact) return { kind: 'book', book: exact }
  const candidates = BOOKS.filter(b => normalizeBookText(b.name).startsWith(key))
  if (candidates.length === 1) return { kind: 'book', book: candidates[0] }
  if (candidates.length > 1) return { kind: 'ambiguous', candidates }
  return { kind: 'unknown' }
}
```

- [ ] **Step 5: Implement `src/shared/bibleIndex.ts`**

```ts
import type { BibleIndex, VerseCounts } from './types'

export function createIndex(counts: VerseCounts): BibleIndex {
  return {
    verseCount: (bookId, chapter) => counts[bookId]?.[chapter - 1] ?? 0,
  }
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test -- tests/shared`
Expected: all passed.

- [ ] **Step 7: Commit**

```bash
git add src/shared tests
git commit -m "feat: resolve book names, codes, aliases, and prefixes" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Reference parser

**Files:**
- Create: `src/shared/parser.ts`
- Test: `tests/shared/parser.test.ts`

**Interfaces:**
- Consumes: `resolveBook`, `BookMatch` (Task 3); `Book`, `BibleIndex`, `ParseResult`, `RefGroup`, `RefError` (Task 2).
- Produces:
  - `parseReferences(input: string, index: BibleIndex): ParseResult`
  - `plural(n: number, word: string): string` — e.g. `plural(1,'chapter')` → `"1 chapter"`, `plural(24,'chapter')` → `"24 chapters"`.

**Rules (from spec §5):** items separated by `,` or `;`; forms `jn 3:16`, `jn 1:3-5`, `ps 23`, `ps 23-25`, `jn 1:50-2:3`; `jude 5` = Jude 1:5 for single-chapter books; with no book name, the previous book carries over — a bare number after a verse reference is a verse in the same chapter, after a chapter reference it is a chapter; `x:y` with no book uses the previous book. Only successful items update the carry-over state. Hyphen, en dash, or em dash are range separators.

- [ ] **Step 1: Write the failing test**

`tests/shared/parser.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { parseReferences } from '../../src/shared/parser'
import { fakeIndex } from '../helpers/fakeIndex'

const parse = (s: string) => parseReferences(s, fakeIndex)
const labels = (s: string) => parse(s).groups.map(g => g.label)
const messages = (s: string) => parse(s).errors.map(e => e.message)

describe('parseReferences', () => {
  it('parses a single verse with positions', () => {
    expect(parse('jn 3:16').groups).toEqual([
      { label: 'John 3:16', bookId: 43, startChapter: 3, startVerse: 16, endChapter: 3, endVerse: 16, inputStart: 0, inputEnd: 7 },
    ])
  })

  it('parses the example list', () => {
    expect(labels('jn 1:3-5, mk 3:1-3, luke 1:2')).toEqual(['John 1:3-5', 'Mark 3:1-3', 'Luke 1:2'])
  })

  it('parses a whole chapter', () => {
    const [g] = parse('ps 23').groups
    expect(g).toMatchObject({ label: 'Psalms 23', bookId: 19, startChapter: 23, startVerse: 1, endChapter: 23, endVerse: 6 })
  })

  it('parses a chapter range', () => {
    const [g] = parse('ps 23-25').groups
    expect(g).toMatchObject({ label: 'Psalms 23-25', startChapter: 23, startVerse: 1, endChapter: 25, endVerse: 22 })
  })

  it('parses a range across chapters', () => {
    const [g] = parse('jn 1:50-2:3').groups
    expect(g).toMatchObject({ label: 'John 1:50-2:3', startChapter: 1, startVerse: 50, endChapter: 2, endVerse: 3 })
  })

  it('accepts en and em dashes', () => {
    expect(labels('jn 1:3–5; jn 1:3—5')).toEqual(['John 1:3-5', 'John 1:3-5'])
  })

  it('carries the book and chapter to a bare verse number', () => {
    expect(labels('jn 3:16, 18')).toEqual(['John 3:16', 'John 3:18'])
    expect(labels('jn 3:16, 18-20')).toEqual(['John 3:16', 'John 3:18-20'])
  })

  it('carries the book to chapter:verse', () => {
    expect(labels('jn 3:16, 4:2')).toEqual(['John 3:16', 'John 4:2'])
  })

  it('carries a chapter reference as a chapter', () => {
    expect(labels('ps 23, 24')).toEqual(['Psalms 23', 'Psalms 24'])
  })

  it('handles numbered books', () => {
    for (const t of ['1 jn 3:1', '1jn 3:1', '1 john 3:1', '1 Joh 3:1']) expect(labels(t)).toEqual(['1 John 3:1'])
  })

  it('treats a bare number in a single-chapter book as a verse', () => {
    expect(parse('jude 5').groups[0]).toMatchObject({ label: 'Jude 1:5', startChapter: 1, startVerse: 5, endVerse: 5 })
  })

  it('handles semicolons and extra whitespace with correct positions', () => {
    const { groups } = parse('  mk 3:1 ;luke 1:2 ')
    expect(groups.map(g => [g.label, g.inputStart, g.inputEnd])).toEqual([
      ['Mark 3:1', 2, 8],
      ['Luke 1:2', 10, 18],
    ])
  })

  it('reports unknown and ambiguous books', () => {
    expect(parse('xyz 2:1').errors).toEqual([{ message: 'Unknown book "xyz"', inputStart: 0, inputEnd: 7 }])
    expect(messages('jo 3:16')).toEqual(['"jo" matches Joshua, Job, Joel, Jonah, John'])
  })

  it('reports out-of-range chapters and verses', () => {
    expect(messages('mk 3:99')).toEqual(['Mark 3 has only 35 verses'])
    expect(messages('mk 17:1')).toEqual(['Mark has only 16 chapters'])
    expect(messages('jn 3:0')).toEqual(['Chapter and verse numbers start at 1'])
  })

  it('keeps valid items when others fail', () => {
    const r = parse('jn 1:3-5, xyz 2:1, mk 3:99')
    expect(r.groups.map(g => g.label)).toEqual(['John 1:3-5'])
    expect(r.errors.map(e => [e.inputStart, e.inputEnd])).toEqual([
      [10, 17],
      [19, 26],
    ])
  })

  it('reports a missing book or chapter', () => {
    expect(messages('3:16')).toEqual(['Missing book name'])
    expect(messages('luke')).toEqual(['Missing chapter after "Luke"'])
  })

  it('reports a reversed range', () => {
    expect(messages('jn 3:18-16')).toEqual(['Range ends before it starts'])
  })

  it('ignores empty input and empty items', () => {
    expect(parse('')).toEqual({ groups: [], errors: [] })
    expect(parse(' , ; ')).toEqual({ groups: [], errors: [] })
  })

  it('does not carry over from a failed item', () => {
    expect(labels('jn 3:16, xyz 1:1, 18')).toEqual(['John 3:16', 'John 3:18'])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/shared/parser.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `src/shared/parser.ts`**

```ts
import { resolveBook, type BookMatch } from './resolve'
import type { BibleIndex, Book, ParseResult, RefError, RefGroup } from './types'

// book text (lazy), then chapter[:verse][-chapter-or-verse[:verse]]
const ITEM_RE = /^(.*?)\s*(\d+)(?:\s*:\s*(\d+))?(?:\s*[-–—]\s*(\d+)(?:\s*:\s*(\d+))?)?\s*$/

interface Item {
  text: string
  start: number
  end: number
}

export function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}

function splitItems(input: string): Item[] {
  const items: Item[] = []
  for (const m of input.matchAll(/[^,;]+/g)) {
    const raw = m[0]
    const text = raw.trim()
    if (!text) continue
    const start = (m.index ?? 0) + (raw.length - raw.trimStart().length)
    items.push({ text, start, end: start + text.length })
  }
  return items
}

function bookError(text: string, match: BookMatch): string {
  if (match.kind === 'ambiguous') return `"${text}" matches ${match.candidates.map(b => b.name).join(', ')}`
  return `Unknown book "${text}"`
}

function formatLabel(book: Book, sc: number, sv: number, ec: number, ev: number, whole: boolean): string {
  if (whole) return sc === ec ? `${book.name} ${sc}` : `${book.name} ${sc}-${ec}`
  if (sc === ec) return sv === ev ? `${book.name} ${sc}:${sv}` : `${book.name} ${sc}:${sv}-${ev}`
  return `${book.name} ${sc}:${sv}-${ec}:${ev}`
}

function validate(book: Book, sc: number, sv: number, ec: number, ev: number, index: BibleIndex): string | null {
  if ([sc, sv, ec, ev].some(n => n < 1)) return 'Chapter and verse numbers start at 1'
  for (const ch of [sc, ec]) {
    if (ch > book.chapters) return `${book.name} has only ${plural(book.chapters, 'chapter')}`
  }
  for (const [ch, v] of [
    [sc, sv],
    [ec, ev],
  ]) {
    const count = index.verseCount(book.id, ch)
    if (v > count) return `${book.name} ${ch} has only ${plural(count, 'verse')}`
  }
  if (ec < sc || (ec === sc && ev < sv)) return 'Range ends before it starts'
  return null
}

export function parseReferences(input: string, index: BibleIndex): ParseResult {
  const groups: RefGroup[] = []
  const errors: RefError[] = []
  let lastBook: Book | null = null
  let lastChapter = 0
  let lastWasVerse = false

  for (const item of splitItems(input)) {
    const fail = (message: string) => errors.push({ message, inputStart: item.start, inputEnd: item.end })
    const m = ITEM_RE.exec(item.text)
    if (!m) {
      const r = resolveBook(item.text)
      fail(r.kind === 'book' ? `Missing chapter after "${r.book.name}"` : bookError(item.text, r))
      continue
    }

    const [, bookText, a, b, c, d] = m
    let book: Book
    if (bookText) {
      const r = resolveBook(bookText)
      if (r.kind !== 'book') {
        fail(bookError(bookText, r))
        continue
      }
      book = r.book
    } else {
      if (!lastBook) {
        fail('Missing book name')
        continue
      }
      book = lastBook
    }

    const n1 = Number(a)
    const n2 = b === undefined ? undefined : Number(b)
    const n3 = c === undefined ? undefined : Number(c)
    const n4 = d === undefined ? undefined : Number(d)
    let sc: number, sv: number, ec: number, ev: number
    let whole = false

    const bareVerse = n2 === undefined && ((!bookText && lastWasVerse) || (!!bookText && book.chapters === 1))
    if (bareVerse) {
      // "18", "18-20", "18-4:2" after a verse reference; or "jude 5"
      sc = bookText ? 1 : lastChapter
      sv = n1
      ec = sc
      ev = n3 ?? n1
      if (n3 !== undefined && n4 !== undefined) {
        ec = n3
        ev = n4
      }
    } else if (n2 === undefined) {
      // "23", "23-25", or "1-2:3"
      sc = n1
      sv = 1
      if (n3 !== undefined && n4 !== undefined) {
        ec = n3
        ev = n4
      } else {
        whole = true
        ec = n3 ?? n1
        ev = ec >= 1 && ec <= book.chapters ? index.verseCount(book.id, ec) : 1
      }
    } else {
      // "3:16", "1:3-5", "1:50-2:3"
      sc = n1
      sv = n2
      if (n3 === undefined) {
        ec = sc
        ev = sv
      } else if (n4 === undefined) {
        ec = sc
        ev = n3
      } else {
        ec = n3
        ev = n4
      }
    }

    const problem = validate(book, sc, sv, ec, ev, index)
    if (problem) {
      fail(problem)
      continue
    }

    groups.push({
      label: formatLabel(book, sc, sv, ec, ev, whole),
      bookId: book.id,
      startChapter: sc,
      startVerse: sv,
      endChapter: ec,
      endVerse: ev,
      inputStart: item.start,
      inputEnd: item.end,
    })
    lastBook = book
    lastChapter = ec
    lastWasVerse = !whole
  }

  return { groups, errors }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/shared/parser.test.ts`
Expected: all passed.

- [ ] **Step 5: Commit**

```bash
git add src/shared/parser.ts tests/shared/parser.test.ts
git commit -m "feat: parse verse references, ranges, lists, and carry-over" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Type-ahead suggestions and hints

**Files:**
- Create: `src/shared/suggest.ts`
- Test: `tests/shared/suggest.test.ts`

**Interfaces:**
- Consumes: `BOOKS` (Task 2); `normalizeBookText`, `bookKeys`, `resolveBook` (Task 3); `plural` (Task 4); `Book`, `BibleIndex`.
- Produces:
  - `type Suggestion = { kind: 'books'; books: Book[]; replaceStart: number; replaceEnd: number } | { kind: 'hint'; text: string } | { kind: 'none' }`
  - `matchBooks(text: string, limit?: number): Book[]` — exact key matches first, then full-name prefix matches, then other key-prefix matches; each tier in Bible order; max 8.
  - `suggest(input: string, caret: number, index: BibleIndex): Suggestion`
  - `applyBook(input: string, range: { replaceStart: number; replaceEnd: number }, book: Book): { value: string; caret: number }` — inserts `"<Full Name> "`.

**Rules (from spec §6.2):** only the current item (text after the last `,`/`;` before the caret) is considered. Book mode when that text is letters (optionally preceded by 1–3). A bare `1`/`2`/`3` suggests numbered books **only for the first item** (after a comma it is a carried-over verse number). Hint mode when the text is a resolvable book followed by whitespace and optionally `chapter` or `chapter:verse`: no colon → `"N chapters"`; with colon → `"N verses"` for that chapter, or `"<Book> has only N chapters"` if the chapter doesn't exist.

- [ ] **Step 1: Write the failing test**

`tests/shared/suggest.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { bookById } from '../../src/shared/books'
import { applyBook, matchBooks, suggest } from '../../src/shared/suggest'
import { fakeIndex } from '../helpers/fakeIndex'

const at = (input: string, caret = input.length) => suggest(input, caret, fakeIndex)
const names = (input: string, caret?: number) => {
  const s = at(input, caret)
  return s.kind === 'books' ? s.books.map(b => b.name) : s.kind
}
const hint = (input: string) => {
  const s = at(input)
  return s.kind === 'hint' ? s.text : s.kind
}

describe('matchBooks', () => {
  it('ranks exact key matches before prefix matches', () => {
    expect(matchBooks('jn').map(b => b.name)).toEqual(['John', 'Jonah'])
  })
})

describe('suggest', () => {
  it('suggests books starting with a letter, in Bible order', () => {
    expect(names('l')).toEqual(['Leviticus', 'Lamentations', 'Luke'])
    const s = at('l')
    expect(s).toMatchObject({ kind: 'books', replaceStart: 0, replaceEnd: 1 })
  })

  it('suggests numbered books for a leading digit', () => {
    const list = names('1') as string[]
    expect(list).toHaveLength(8)
    expect(list[0]).toBe('1 Samuel')
    expect(list[7]).toBe('1 John')
    expect(names('1 c')).toEqual(['1 Chronicles', '1 Corinthians'])
  })

  it('works on the item after the last comma', () => {
    expect(names('jn 3:16, l')).toEqual(['Leviticus', 'Lamentations', 'Luke'])
    expect(at('jn 3:16, l')).toMatchObject({ replaceStart: 9, replaceEnd: 10 })
  })

  it('does not treat a carried-over verse number as a book', () => {
    expect(names('jn 3:16, 1')).toBe('none')
  })

  it('uses the caret position, not the end of the input', () => {
    expect(names('lu, jn 3:16', 2)).toEqual(['Luke'])
  })

  it('returns none for no match or empty input', () => {
    expect(names('xyzzy')).toBe('none')
    expect(names('')).toBe('none')
  })

  it('shows chapter and verse hints', () => {
    expect(hint('Luke ')).toBe('24 chapters')
    expect(hint('Luke 1')).toBe('24 chapters')
    expect(hint('Luke 1:')).toBe('80 verses')
    expect(hint('Luke 1:5')).toBe('80 verses')
    expect(hint('Luke 99:')).toBe('Luke has only 24 chapters')
    expect(hint('jude ')).toBe('1 chapter')
  })
})

describe('applyBook', () => {
  it('replaces the typed text with the full name and a space', () => {
    expect(applyBook('jn 3:16, l', { replaceStart: 9, replaceEnd: 10 }, bookById(42))).toEqual({
      value: 'jn 3:16, Luke ',
      caret: 14,
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/shared/suggest.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `src/shared/suggest.ts`**

```ts
import { BOOKS } from './books'
import { plural } from './parser'
import { bookKeys, normalizeBookText, resolveBook } from './resolve'
import type { BibleIndex, Book } from './types'

export type Suggestion =
  | { kind: 'books'; books: Book[]; replaceStart: number; replaceEnd: number }
  | { kind: 'hint'; text: string }
  | { kind: 'none' }

const NONE: Suggestion = { kind: 'none' }
const BOOK_TEXT_RE = /^[1-3]?\s*[a-z][a-z .]*$/i
const HINT_RE = /^(.*[a-z.])\s+(?:(\d+)(:\d*)?)?$/i

export function matchBooks(text: string, limit = 8): Book[] {
  const key = normalizeBookText(text)
  if (!key) return []
  const exact: Book[] = []
  const namePrefix: Book[] = []
  const keyPrefix: Book[] = []
  for (const book of BOOKS) {
    const keys = bookKeys(book)
    if (keys.includes(key)) exact.push(book)
    else if (normalizeBookText(book.name).startsWith(key)) namePrefix.push(book)
    else if (keys.some(k => k.startsWith(key))) keyPrefix.push(book)
  }
  return [...exact, ...namePrefix, ...keyPrefix].slice(0, limit)
}

export function suggest(input: string, caret: number, index: BibleIndex): Suggestion {
  const before = input.slice(0, caret)
  const itemStart = Math.max(before.lastIndexOf(','), before.lastIndexOf(';')) + 1
  const raw = input.slice(itemStart, caret)
  const text = raw.trimStart()
  if (!text) return NONE
  const replaceStart = itemStart + (raw.length - text.length)

  const h = HINT_RE.exec(text)
  if (h) {
    const r = resolveBook(h[1])
    if (r.kind === 'book') {
      const book = r.book
      if (h[2] && h[3]) {
        const count = index.verseCount(book.id, Number(h[2]))
        return {
          kind: 'hint',
          text: count > 0 ? plural(count, 'verse') : `${book.name} has only ${plural(book.chapters, 'chapter')}`,
        }
      }
      return { kind: 'hint', text: plural(book.chapters, 'chapter') }
    }
  }

  const bareDigitFirst = itemStart === 0 && /^[1-3]$/.test(text)
  if (BOOK_TEXT_RE.test(text) || bareDigitFirst) {
    const books = matchBooks(text)
    if (books.length > 0) return { kind: 'books', books, replaceStart, replaceEnd: caret }
  }
  return NONE
}

export function applyBook(
  input: string,
  range: { replaceStart: number; replaceEnd: number },
  book: Book,
): { value: string; caret: number } {
  const insert = `${book.name} `
  return {
    value: input.slice(0, range.replaceStart) + insert + input.slice(range.replaceEnd),
    caret: range.replaceStart + insert.length,
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/shared/suggest.test.ts`
Expected: all passed.

- [ ] **Step 5: Commit**

```bash
git add src/shared/suggest.ts tests/shared/suggest.test.ts
git commit -m "feat: add book type-ahead and chapter/verse hints" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Colored text segments

**Files:**
- Create: `src/shared/segments.ts`
- Test: `tests/shared/segments.test.ts`

**Interfaces:**
- Consumes: `Span`, `Highlight` (Task 2).
- Produces:
  - `type SegmentKind = 'normal' | 'jesus' | 'highlight'`
  - `interface Segment { start: number; end: number; text: string; kind: SegmentKind; color?: string }`
  - `buildSegments(text: string, redLetter: Span[], highlights: Highlight[]): Segment[]` — precedence highlight → red → normal; later highlights (higher array index) win over earlier ones; spans outside the text (`start < 0`, `end > text.length`, or `start >= end`) are ignored.

- [ ] **Step 1: Write the failing test**

`tests/shared/segments.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { buildSegments } from '../../src/shared/segments'

const TEXT = 'And he saith, Stand forth.' // "Stand forth." = 14..26
const brief = (segs: ReturnType<typeof buildSegments>) => segs.map(s => [s.text, s.kind, s.color ?? null])

describe('buildSegments', () => {
  it('returns one normal segment when there are no spans', () => {
    expect(buildSegments('abc', [], [])).toEqual([{ start: 0, end: 3, text: 'abc', kind: 'normal' }])
  })

  it('returns nothing for empty text', () => {
    expect(buildSegments('', [], [])).toEqual([])
  })

  it('marks red-letter spans', () => {
    const segs = buildSegments(TEXT, [{ start: 14, end: 26 }], [])
    expect(brief(segs)).toEqual([
      ['And he saith, ', 'normal', null],
      ['Stand forth.', 'jesus', null],
    ])
    expect(segs[1].start).toBe(14)
  })

  it('lets a highlight override red letters only where they overlap', () => {
    const segs = buildSegments(TEXT, [{ start: 14, end: 26 }], [{ id: 1, start: 10, end: 19, color: '#ff0' }])
    expect(brief(segs)).toEqual([
      ['And he sai', 'normal', null],
      ['th, Stand', 'highlight', '#ff0'],
      [' forth.', 'jesus', null],
    ])
  })

  it('lets a later highlight win over an earlier one', () => {
    const segs = buildSegments('abcdef', [], [
      { id: 1, start: 0, end: 4, color: 'red' },
      { id: 2, start: 2, end: 6, color: 'blue' },
    ])
    expect(brief(segs)).toEqual([
      ['ab', 'highlight', 'red'],
      ['cdef', 'highlight', 'blue'],
    ])
  })

  it('merges adjacent spans of the same kind', () => {
    const segs = buildSegments('abcdef', [{ start: 0, end: 3 }, { start: 3, end: 6 }], [])
    expect(brief(segs)).toEqual([['abcdef', 'jesus', null]])
  })

  it('ignores spans that do not fit the text', () => {
    const segs = buildSegments('abc', [{ start: 2, end: 9 }], [{ id: 1, start: -1, end: 2, color: 'red' }])
    expect(brief(segs)).toEqual([['abc', 'normal', null]])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/shared/segments.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `src/shared/segments.ts`**

```ts
import type { Highlight, Span } from './types'

export type SegmentKind = 'normal' | 'jesus' | 'highlight'

export interface Segment {
  start: number
  end: number
  text: string
  kind: SegmentKind
  color?: string
}

export function buildSegments(text: string, redLetter: Span[], highlights: Highlight[]): Segment[] {
  const n = text.length
  if (n === 0) return []
  const kind: SegmentKind[] = new Array(n).fill('normal')
  const color: (string | undefined)[] = new Array(n).fill(undefined)
  const fits = (s: Span) => s.start >= 0 && s.end <= n && s.start < s.end

  for (const s of redLetter) {
    if (!fits(s)) continue
    for (let i = s.start; i < s.end; i++) kind[i] = 'jesus'
  }
  for (const h of highlights) {
    if (!fits(h)) continue
    for (let i = h.start; i < h.end; i++) {
      kind[i] = 'highlight'
      color[i] = h.color
    }
  }

  const out: Segment[] = []
  let start = 0
  for (let i = 1; i <= n; i++) {
    if (i === n || kind[i] !== kind[start] || color[i] !== color[start]) {
      const seg: Segment = { start, end: i, text: text.slice(start, i), kind: kind[start] }
      if (color[start] !== undefined) seg.color = color[start]
      out.push(seg)
      start = i
    }
  }
  return out
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/shared/segments.test.ts`
Expected: all passed.

- [ ] **Step 5: Commit**

```bash
git add src/shared/segments.ts tests/shared/segments.test.ts
git commit -m "feat: merge red-letter and highlight spans into colored segments" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: KJV import → `resources/bible.db`

**Files:**
- Create: `data/lib/osis.ts`, `data/lib/buildBibleDb.ts`, `data/import-kjv.ts`
- Create (generated): `resources/bible.db`
- Create: `tests/helpers/osisFixture.ts`
- Test: `tests/data/osis.test.ts`, `tests/data/buildBibleDb.test.ts`, `tests/data/realBible.test.ts`

**Interfaces:**
- Consumes: `BOOKS` (Task 2), `bookKeys` (Task 3), `Span` (Task 2).
- Produces:
  - `interface ParsedVerse { osisBook: string; chapter: number; verse: number; text: string; redLetter: Span[] }`
  - `parseOsis(xml: string): ParsedVerse[]` (all books in the file, including Apocrypha)
  - `decodeEntities(s: string): string`
  - `buildBibleDb(verses: ParsedVerse[], outPath: string): void` — writes tables `books`, `book_aliases`, `verses`, `red_letter` (skips verses whose `osisBook` is not one of the 66). Used by later tests to build fixture DBs.
  - `validateChapterCounts(verses: ParsedVerse[]): string[]` — one message per book whose highest chapter ≠ `Book.chapters`.
  - `resources/bible.db`.

**Source format (verified 2026-09-26):** verses are milestones `<verse osisID="John.3.16" sID="…"/>` … `<verse eID="…"/>`; words of Jesus are `<q who="Jesus" sID="…"/>` … `<q eID="…"/>` restarted at every verse; Psalm titles are `<title type="psalm">…</title>` outside verses; `<transChange>` wraps italic words (keep the text); poetry uses `<lg>`/`<l>`.

- [ ] **Step 1: Get the source file**

The source is `https://raw.githubusercontent.com/seven1m/open-bibles/master/eng-kjv.osis.xml` (about 10 MB, public domain). A copy was saved during planning at `C:\Users\Bob\AppData\Local\Temp\claude\D--Source-repos\eb3aa435-e8f6-4496-aadf-dcae00efb09e\scratchpad\kjv.osis.xml`. If that file exists, copy it:
```bash
mkdir -p data/source
cp "/c/Users/Bob/AppData/Local/Temp/claude/D--Source-repos/eb3aa435-e8f6-4496-aadf-dcae00efb09e/scratchpad/kjv.osis.xml" data/source/eng-kjv.osis.xml
```
If it does not exist, **ask the user for permission** to download it (state name, source URL, and ~10 MB size), then:
```bash
mkdir -p data/source
curl -L -o data/source/eng-kjv.osis.xml https://raw.githubusercontent.com/seven1m/open-bibles/master/eng-kjv.osis.xml
```

- [ ] **Step 2: Write the fixture and the failing OSIS parser test**

`tests/helpers/osisFixture.ts`:
```ts
export const FIXTURE = `<?xml version="1.0" encoding="utf-8"?>
<osis><osisText>
<div type="book" osisID="Mark"><chapter osisRef="Mark.3" sID="Mark.3.seID.1" n="3" />
<p><verse osisID="Mark.3.3" sID="Mark.3.3.seID.2" n="3" />And he saith unto the man which had the withered hand,
<q who="Jesus" sID="Mark.3.3.seID.3" marker="" />Stand forth.
<q eID="Mark.3.3.seID.3" /><verse eID="Mark.3.3.seID.2" /><verse osisID="Mark.3.4" sID="Mark.3.4.seID.4" n="4" />And he saith unto them,
<q who="Jesus" sID="Mark.3.4.seID.5" marker="" />Is it lawful to do good on the sabbath days?<q eID="Mark.3.4.seID.5" /> But they held their peace.
<verse eID="Mark.3.4.seID.4" /></p></div>
<div type="book" osisID="Ps"><chapter osisRef="Ps.3" sID="Ps.3.seID.6" n="3" />
<title type="psalm" canonical="true">A Psalm of David.</title>
<p><verse osisID="Ps.3.1" sID="Ps.3.1.seID.7" n="1" />LORD, how are they increased that trouble me! many
<transChange type="added">are</transChange> they that rise up against me.
<verse eID="Ps.3.1.seID.7" /></p></div>
<div type="book" osisID="Tob"><verse osisID="Tob.1.1" sID="t1" n="1" />Apocrypha text &amp; more<verse eID="t1" /></div>
</osisText></osis>`
```

`tests/data/osis.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { decodeEntities, parseOsis } from '../../data/lib/osis'
import { FIXTURE } from '../helpers/osisFixture'

describe('decodeEntities', () => {
  it('decodes named and numeric entities', () => {
    expect(decodeEntities('a &amp; b &lt;c&gt; &quot;d&quot; &apos;e&apos; &#65;&#x42;')).toBe('a & b <c> "d" \'e\' AB')
  })
})

describe('parseOsis', () => {
  const verses = parseOsis(FIXTURE)

  it('finds every verse, in order', () => {
    expect(verses.map(v => `${v.osisBook}.${v.chapter}.${v.verse}`)).toEqual(['Mark.3.3', 'Mark.3.4', 'Ps.3.1', 'Tob.1.1'])
  })

  it('collapses whitespace and marks words of Jesus', () => {
    const v = verses[0]
    expect(v.text).toBe('And he saith unto the man which had the withered hand, Stand forth.')
    const start = v.text.indexOf('Stand')
    expect(v.redLetter).toEqual([{ start, end: v.text.length }])
  })

  it('ends a red span before trailing narration', () => {
    const v = verses[1]
    expect(v.text).toBe('And he saith unto them, Is it lawful to do good on the sabbath days? But they held their peace.')
    expect(v.text.slice(v.redLetter[0].start, v.redLetter[0].end)).toBe('Is it lawful to do good on the sabbath days?')
  })

  it('keeps italic words, skips titles, and has no red letters in narration', () => {
    expect(verses[2].text).toBe('LORD, how are they increased that trouble me! many are they that rise up against me.')
    expect(verses[2].redLetter).toEqual([])
  })

  it('decodes entities in text', () => {
    expect(verses[3].text).toBe('Apocrypha text & more')
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- tests/data/osis.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 4: Implement `data/lib/osis.ts`**

```ts
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
```

- [ ] **Step 5: Run the OSIS test to verify it passes**

Run: `npm test -- tests/data/osis.test.ts`
Expected: all passed.

- [ ] **Step 6: Write the failing DB builder test**

`tests/data/buildBibleDb.test.ts`:
```ts
import Database from 'better-sqlite3'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildBibleDb, validateChapterCounts } from '../../data/lib/buildBibleDb'
import type { ParsedVerse } from '../../data/lib/osis'
import { parseOsis } from '../../data/lib/osis'
import { BOOKS } from '../../src/shared/books'
import { FIXTURE } from '../helpers/osisFixture'

describe('buildBibleDb', () => {
  it('writes books, aliases, verses, and red-letter spans, skipping Apocrypha', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'bible-')), 'bible.db')
    buildBibleDb(parseOsis(FIXTURE), path)
    const db = new Database(path, { readonly: true })
    expect(db.prepare('SELECT count(*) AS n FROM books').get()).toEqual({ n: 66 })
    expect(db.prepare("SELECT book_id FROM book_aliases WHERE alias = 'jn'").get()).toEqual({ book_id: 43 })
    expect(db.prepare('SELECT count(*) AS n FROM verses').get()).toEqual({ n: 3 })
    expect(db.prepare('SELECT count(*) AS n FROM red_letter').get()).toEqual({ n: 2 })
    const row = db.prepare('SELECT text FROM verses WHERE book_id = 41 AND chapter = 3 AND verse = 3').get() as { text: string }
    expect(row.text).toContain('Stand forth.')
    db.close()
  })
})

describe('validateChapterCounts', () => {
  it('accepts a Bible with every chapter present', () => {
    const verses: ParsedVerse[] = BOOKS.flatMap(b =>
      Array.from({ length: b.chapters }, (_, i) => ({ osisBook: b.osis, chapter: i + 1, verse: 1, text: 'x', redLetter: [] })),
    )
    expect(validateChapterCounts(verses)).toEqual([])
  })

  it('reports books with missing chapters', () => {
    const problems = validateChapterCounts(parseOsis(FIXTURE))
    expect(problems).toContain('Genesis: expected 50 chapters, found 0')
    expect(problems).toContain('Mark: expected 16 chapters, found 3')
  })
})
```

- [ ] **Step 7: Run test to verify it fails**

Run: `npm test -- tests/data/buildBibleDb.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 8: Implement `data/lib/buildBibleDb.ts`**

```ts
import Database from 'better-sqlite3'
import { BOOKS } from '../../src/shared/books'
import { bookKeys } from '../../src/shared/resolve'
import type { ParsedVerse } from './osis'

const SCHEMA = `
CREATE TABLE books (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  abbrev3 TEXT NOT NULL UNIQUE,
  osis TEXT NOT NULL UNIQUE,
  chapters INTEGER NOT NULL
);
CREATE TABLE book_aliases (
  alias TEXT PRIMARY KEY,
  book_id INTEGER NOT NULL REFERENCES books(id)
);
CREATE TABLE verses (
  book_id INTEGER NOT NULL,
  chapter INTEGER NOT NULL,
  verse INTEGER NOT NULL,
  text TEXT NOT NULL,
  PRIMARY KEY (book_id, chapter, verse)
) WITHOUT ROWID;
CREATE TABLE red_letter (
  book_id INTEGER NOT NULL,
  chapter INTEGER NOT NULL,
  verse INTEGER NOT NULL,
  start_pos INTEGER NOT NULL,
  end_pos INTEGER NOT NULL
);
CREATE INDEX red_letter_verse ON red_letter (book_id, chapter, verse);
`

export function buildBibleDb(verses: ParsedVerse[], outPath: string): void {
  const bookByOsis = new Map(BOOKS.map(b => [b.osis, b]))
  const db = new Database(outPath)
  try {
    db.exec(SCHEMA)
    const insertBook = db.prepare('INSERT INTO books (id, name, abbrev3, osis, chapters) VALUES (?, ?, ?, ?, ?)')
    const insertAlias = db.prepare('INSERT INTO book_aliases (alias, book_id) VALUES (?, ?)')
    const insertVerse = db.prepare('INSERT INTO verses (book_id, chapter, verse, text) VALUES (?, ?, ?, ?)')
    const insertRed = db.prepare(
      'INSERT INTO red_letter (book_id, chapter, verse, start_pos, end_pos) VALUES (?, ?, ?, ?, ?)',
    )
    db.transaction(() => {
      for (const b of BOOKS) {
        insertBook.run(b.id, b.name, b.abbrev3, b.osis, b.chapters)
        for (const key of bookKeys(b)) insertAlias.run(key, b.id)
      }
      for (const v of verses) {
        const book = bookByOsis.get(v.osisBook)
        if (!book) continue
        insertVerse.run(book.id, v.chapter, v.verse, v.text)
        for (const s of v.redLetter) insertRed.run(book.id, v.chapter, v.verse, s.start, s.end)
      }
    })()
  } finally {
    db.close()
  }
}

export function validateChapterCounts(verses: ParsedVerse[]): string[] {
  const maxChapter = new Map<string, number>()
  for (const v of verses) maxChapter.set(v.osisBook, Math.max(maxChapter.get(v.osisBook) ?? 0, v.chapter))
  const problems: string[] = []
  for (const b of BOOKS) {
    const found = maxChapter.get(b.osis) ?? 0
    if (found !== b.chapters) problems.push(`${b.name}: expected ${b.chapters} chapters, found ${found}`)
  }
  return problems
}
```

- [ ] **Step 9: Run the builder test to verify it passes**

Run: `npm test -- tests/data/buildBibleDb.test.ts`
Expected: all passed.

- [ ] **Step 10: Implement the CLI `data/import-kjv.ts`**

```ts
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { BOOKS } from '../src/shared/books'
import { buildBibleDb, validateChapterCounts } from './lib/buildBibleDb'
import { parseOsis } from './lib/osis'

const EXPECTED_VERSES = 31102
const SOURCE = join(process.cwd(), 'data', 'source', 'eng-kjv.osis.xml')
const OUT = join(process.cwd(), 'resources', 'bible.db')

if (!existsSync(SOURCE)) {
  console.error(`Source not found: ${SOURCE}`)
  process.exit(1)
}

const canonical = new Set(BOOKS.map(b => b.osis))
const verses = parseOsis(readFileSync(SOURCE, 'utf8')).filter(v => canonical.has(v.osisBook))

const problems = validateChapterCounts(verses)
if (problems.length > 0) {
  console.error(problems.join('\n'))
  process.exit(1)
}
if (verses.length !== EXPECTED_VERSES) {
  console.error(`Expected ${EXPECTED_VERSES} verses, found ${verses.length}`)
  process.exit(1)
}

rmSync(OUT, { force: true })
mkdirSync(dirname(OUT), { recursive: true })
buildBibleDb(verses, OUT)
const spans = verses.reduce((n, v) => n + v.redLetter.length, 0)
console.log(`Wrote ${verses.length} verses and ${spans} red-letter spans to ${OUT}`)
```

- [ ] **Step 11: Run the import**

Run: `npm run import-kjv`
Expected: `Wrote 31102 verses and <N> red-letter spans to …\resources\bible.db` (N should be about 2,000).
If it prints a verse count other than 31102 or chapter problems, **stop and report the output to the user** — do not change `EXPECTED_VERSES` to make it pass.

- [ ] **Step 12: Write the real-data test**

`tests/data/realBible.test.ts`:
```ts
import Database from 'better-sqlite3'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const PATH = join(process.cwd(), 'resources', 'bible.db')

describe.skipIf(!existsSync(PATH))('resources/bible.db', () => {
  let db: Database.Database
  beforeAll(() => {
    db = new Database(PATH, { readonly: true })
  })
  afterAll(() => db.close())
  const text = (b: number, c: number, v: number) =>
    (db.prepare('SELECT text FROM verses WHERE book_id = ? AND chapter = ? AND verse = ?').get(b, c, v) as { text: string }).text
  const reds = (b: number, c: number, v: number) =>
    db
      .prepare('SELECT start_pos AS start, end_pos AS end FROM red_letter WHERE book_id = ? AND chapter = ? AND verse = ?')
      .all(b, c, v) as { start: number; end: number }[]

  it('has all 31,102 KJV verses', () => {
    expect(db.prepare('SELECT count(*) AS n FROM verses').get()).toEqual({ n: 31102 })
  })

  it('has the expected text', () => {
    expect(text(1, 1, 1)).toBe('In the beginning God created the heaven and the earth.')
  })

  it('marks words of Jesus', () => {
    const [r] = reds(41, 3, 3)
    expect(text(41, 3, 3).slice(r.start, r.end)).toBe('Stand forth.')
    expect(reds(43, 3, 16).length).toBeGreaterThan(0)
  })

  it('does not mark narration', () => {
    expect(reds(43, 1, 1)).toEqual([])
  })
})
```

- [ ] **Step 13: Run all tests**

Run: `npm test`
Expected: all passed, including the 4 real-data tests (not skipped).

- [ ] **Step 14: Commit (the DB is committed; the source is ignored)**

```bash
git add data/lib data/import-kjv.ts tests/data tests/helpers/osisFixture.ts resources/bible.db
git commit -m "feat: import red-letter KJV from OSIS into resources/bible.db" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Read-only Bible database access

**Files:**
- Create: `src/main/bibleDb.ts`
- Create: `tests/helpers/fixtureBible.ts`
- Test: `tests/main/bibleDb.test.ts`

**Interfaces:**
- Consumes: `buildBibleDb`, `ParsedVerse` (Task 7); `BibleVerse`, `Span`, `VerseCounts`, `VerseSpan` (Task 2).
- Produces:
  - `class BibleDbError extends Error`
  - `class BibleDb { static open(path: string): BibleDb; verseCounts(): VerseCounts; getVerses(span: VerseSpan): BibleVerse[]; close(): void }` — `open` throws `BibleDbError` with message starting `Bible database not found` or `Bible database is damaged`.
  - Test helper `makeFixtureBible(): string` — builds a small bible.db in a temp dir and returns its path. Contents: John 3:16 (fully red), 3:17, 3:18, John 4:1, Mark 3:3 (red "Stand forth.").

- [ ] **Step 1: Create the fixture helper `tests/helpers/fixtureBible.ts`**

```ts
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildBibleDb } from '../../data/lib/buildBibleDb'
import type { ParsedVerse } from '../../data/lib/osis'

export const JOHN_3_16 = 'For God so loved the world, that he gave his only begotten Son.'
export const MARK_3_3 = 'And he saith unto the man which had the withered hand, Stand forth.'

export const FIXTURE_VERSES: ParsedVerse[] = [
  { osisBook: 'John', chapter: 3, verse: 16, text: JOHN_3_16, redLetter: [{ start: 0, end: JOHN_3_16.length }] },
  { osisBook: 'John', chapter: 3, verse: 17, text: 'For God sent not his Son into the world to condemn the world.', redLetter: [] },
  { osisBook: 'John', chapter: 3, verse: 18, text: 'He that believeth on him is not condemned.', redLetter: [] },
  { osisBook: 'John', chapter: 4, verse: 1, text: 'When therefore the Lord knew how the Pharisees had heard.', redLetter: [] },
  { osisBook: 'Mark', chapter: 3, verse: 3, text: MARK_3_3, redLetter: [{ start: MARK_3_3.indexOf('Stand'), end: MARK_3_3.length }] },
]

export function makeFixtureBible(): string {
  const path = join(mkdtempSync(join(tmpdir(), 'bible-')), 'bible.db')
  buildBibleDb(FIXTURE_VERSES, path)
  return path
}
```

- [ ] **Step 2: Write the failing test**

`tests/main/bibleDb.test.ts`:
```ts
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { BibleDb, BibleDbError } from '../../src/main/bibleDb'
import { JOHN_3_16, makeFixtureBible } from '../helpers/fixtureBible'

let db: BibleDb | null = null
afterEach(() => {
  db?.close()
  db = null
})

describe('BibleDb.open', () => {
  it('throws a clear error when the file is missing', () => {
    expect(() => BibleDb.open(join(tmpdir(), 'no-such-bible.db'))).toThrow(BibleDbError)
    expect(() => BibleDb.open(join(tmpdir(), 'no-such-bible.db'))).toThrow(/not found/)
  })

  it('throws a clear error when the file is not a database', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'bible-')), 'bible.db')
    writeFileSync(path, 'this is not a database, just some text that is long enough to be read')
    expect(() => BibleDb.open(path)).toThrow(/damaged/)
  })
})

describe('BibleDb queries', () => {
  it('returns verse counts per chapter', () => {
    db = BibleDb.open(makeFixtureBible())
    const counts = db.verseCounts()
    expect(counts[43][2]).toBe(18)
    expect(counts[43][3]).toBe(1)
    expect(counts[41][2]).toBe(3)
  })

  it('returns verses in a range, across chapters, in order', () => {
    db = BibleDb.open(makeFixtureBible())
    const verses = db.getVerses({ bookId: 43, startChapter: 3, startVerse: 17, endChapter: 4, endVerse: 1 })
    expect(verses.map(v => `${v.chapter}:${v.verse}`)).toEqual(['3:17', '3:18', '4:1'])
    expect(verses[0].bookId).toBe(43)
  })

  it('attaches red-letter spans to their verse only', () => {
    db = BibleDb.open(makeFixtureBible())
    const [v16, v17] = db.getVerses({ bookId: 43, startChapter: 3, startVerse: 16, endChapter: 3, endVerse: 17 })
    expect(v16.text).toBe(JOHN_3_16)
    expect(v16.redLetter).toEqual([{ start: 0, end: JOHN_3_16.length }])
    expect(v17.redLetter).toEqual([])
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- tests/main/bibleDb.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 4: Implement `src/main/bibleDb.ts`**

```ts
import Database from 'better-sqlite3'
import { existsSync } from 'node:fs'
import type { BibleVerse, Span, VerseCounts, VerseSpan } from '../shared/types'

export class BibleDbError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BibleDbError'
  }
}

const key = (chapter: number, verse: number) => chapter * 1000 + verse

export class BibleDb {
  private constructor(private readonly db: Database.Database) {}

  static open(path: string): BibleDb {
    if (!existsSync(path)) throw new BibleDbError(`Bible database not found: ${path}`)
    let db: Database.Database | undefined
    try {
      db = new Database(path, { readonly: true, fileMustExist: true })
      const row = db.prepare('SELECT count(*) AS n FROM verses').get() as { n: number }
      if (row.n === 0) throw new Error('it contains no verses')
      return new BibleDb(db)
    } catch (e) {
      db?.close()
      throw new BibleDbError(`Bible database is damaged (${(e as Error).message}): ${path}`)
    }
  }

  verseCounts(): VerseCounts {
    const rows = this.db
      .prepare('SELECT book_id AS b, chapter AS c, max(verse) AS n FROM verses GROUP BY book_id, chapter')
      .all() as { b: number; c: number; n: number }[]
    const out: VerseCounts = {}
    for (const r of rows) (out[r.b] ??= [])[r.c - 1] = r.n
    return out
  }

  getVerses(span: VerseSpan): BibleVerse[] {
    const lo = key(span.startChapter, span.startVerse)
    const hi = key(span.endChapter, span.endVerse)
    const rows = this.db
      .prepare(
        'SELECT chapter, verse, text FROM verses WHERE book_id = ? AND chapter * 1000 + verse BETWEEN ? AND ? ORDER BY chapter, verse',
      )
      .all(span.bookId, lo, hi) as { chapter: number; verse: number; text: string }[]
    const reds = this.db
      .prepare(
        'SELECT chapter, verse, start_pos AS start, end_pos AS end FROM red_letter WHERE book_id = ? AND chapter * 1000 + verse BETWEEN ? AND ? ORDER BY start_pos',
      )
      .all(span.bookId, lo, hi) as { chapter: number; verse: number; start: number; end: number }[]
    const byVerse = new Map<number, Span[]>()
    for (const r of reds) {
      const list = byVerse.get(key(r.chapter, r.verse)) ?? []
      list.push({ start: r.start, end: r.end })
      byVerse.set(key(r.chapter, r.verse), list)
    }
    return rows.map(r => ({
      bookId: span.bookId,
      chapter: r.chapter,
      verse: r.verse,
      text: r.text,
      redLetter: byVerse.get(key(r.chapter, r.verse)) ?? [],
    }))
  }

  close(): void {
    this.db.close()
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- tests/main/bibleDb.test.ts`
Expected: all passed.

- [ ] **Step 6: Commit**

```bash
git add src/main/bibleDb.ts tests/main tests/helpers/fixtureBible.ts
git commit -m "feat: read verses and red-letter spans from bible.db" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Styles and the user database

**Files:**
- Create: `src/shared/styles.ts`, `src/main/userDb.ts`
- Test: `tests/shared/styles.test.ts`, `tests/main/userDb.test.ts`

**Interfaces:**
- Consumes: `Highlight`, `VerseRange`, `VerseSpan` (Task 2).
- Produces:
  - `interface TextStyle { font: string; size: number; color: string }`
  - `interface Styles { heading: TextStyle & { bold: boolean }; verse: TextStyle; jesusColor: string; verseNumbers: { show: boolean; color: string }; background: string; scale: number; layout: 'paragraph' | 'lines' }`
  - `DEFAULT_STYLES: Styles`, `SCALE_MIN = 0.5`, `SCALE_MAX = 3`, `SCALE_STEP = 0.1`
  - `clampScale(s: number): number`, `stepScale(s: number, dir: 1 | -1): number`, `normalizeStyles(raw: unknown): Styles`, `fontStack(font: string): string` (e.g. `"Segoe UI", Georgia, serif`)
  - `type StoredHighlight = Highlight & { chapter: number; verse: number }`
  - `class UserDb { static open(path: string): UserDb; getStyles(): Styles; setStyles(s: Styles): void; highlightsFor(span: VerseSpan): StoredHighlight[]; addHighlights(ranges: VerseRange[], color: string): void; removeHighlights(ranges: VerseRange[]): void; addRecent(input: string): void; listRecent(): string[]; close(): void }`

- [ ] **Step 1: Write the failing styles test**

`tests/shared/styles.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { DEFAULT_STYLES, clampScale, fontStack, normalizeStyles, stepScale } from '../../src/shared/styles'

describe('normalizeStyles', () => {
  it('returns defaults for missing or invalid input', () => {
    expect(normalizeStyles(undefined)).toEqual(DEFAULT_STYLES)
    expect(normalizeStyles('nonsense')).toEqual(DEFAULT_STYLES)
  })

  it('keeps valid fields and fills the rest from defaults', () => {
    const s = normalizeStyles({ verse: { size: 50 }, jesusColor: '#f00', layout: 'lines' })
    expect(s.verse).toEqual({ ...DEFAULT_STYLES.verse, size: 50 })
    expect(s.jesusColor).toBe('#f00')
    expect(s.layout).toBe('lines')
    expect(s.heading).toEqual(DEFAULT_STYLES.heading)
  })

  it('ignores values of the wrong type', () => {
    const s = normalizeStyles({ heading: { bold: 'yes', size: 'big' }, layout: 'grid', background: 7 })
    expect(s.heading.bold).toBe(DEFAULT_STYLES.heading.bold)
    expect(s.heading.size).toBe(DEFAULT_STYLES.heading.size)
    expect(s.layout).toBe('paragraph')
    expect(s.background).toBe(DEFAULT_STYLES.background)
  })

  it('clamps the scale', () => {
    expect(normalizeStyles({ scale: 10 }).scale).toBe(3)
  })
})

describe('scale helpers', () => {
  it('steps by 0.1 and stays in range', () => {
    expect(stepScale(1, 1)).toBe(1.1)
    expect(stepScale(1.1, -1)).toBe(1)
    expect(stepScale(3, 1)).toBe(3)
    expect(stepScale(0.5, -1)).toBe(0.5)
    expect(clampScale(0.123)).toBe(0.5)
  })
})

describe('fontStack', () => {
  it('quotes the font and falls back to Georgia', () => {
    expect(fontStack('Segoe UI')).toBe('"Segoe UI", Georgia, serif')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/shared/styles.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `src/shared/styles.ts`**

```ts
export interface TextStyle {
  font: string
  size: number
  color: string
}

export interface Styles {
  heading: TextStyle & { bold: boolean }
  verse: TextStyle
  jesusColor: string
  verseNumbers: { show: boolean; color: string }
  background: string
  scale: number
  layout: 'paragraph' | 'lines'
}

export const SCALE_MIN = 0.5
export const SCALE_MAX = 3
export const SCALE_STEP = 0.1

export const DEFAULT_STYLES: Styles = {
  heading: { font: 'Georgia', size: 44, color: '#f0c040', bold: true },
  verse: { font: 'Georgia', size: 40, color: '#f2f2f2' },
  jesusColor: '#ff4a4a',
  verseNumbers: { show: true, color: '#9a9a9a' },
  background: '#111111',
  scale: 1,
  layout: 'paragraph',
}

type Obj = Record<string, unknown>
const obj = (v: unknown): Obj => (typeof v === 'object' && v !== null ? (v as Obj) : {})
const str = (v: unknown, d: string) => (typeof v === 'string' && v.length > 0 ? v : d)
const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d)
const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d)

export function clampScale(s: number): number {
  return Math.min(SCALE_MAX, Math.max(SCALE_MIN, Math.round(s * 10) / 10))
}

export function stepScale(s: number, dir: 1 | -1): number {
  return clampScale(s + dir * SCALE_STEP)
}

export function normalizeStyles(raw: unknown): Styles {
  const D = DEFAULT_STYLES
  const r = obj(raw)
  const h = obj(r.heading)
  const v = obj(r.verse)
  const n = obj(r.verseNumbers)
  return {
    heading: {
      font: str(h.font, D.heading.font),
      size: num(h.size, D.heading.size),
      color: str(h.color, D.heading.color),
      bold: bool(h.bold, D.heading.bold),
    },
    verse: {
      font: str(v.font, D.verse.font),
      size: num(v.size, D.verse.size),
      color: str(v.color, D.verse.color),
    },
    jesusColor: str(r.jesusColor, D.jesusColor),
    verseNumbers: { show: bool(n.show, D.verseNumbers.show), color: str(n.color, D.verseNumbers.color) },
    background: str(r.background, D.background),
    scale: clampScale(num(r.scale, D.scale)),
    layout: r.layout === 'lines' ? 'lines' : 'paragraph',
  }
}

export function fontStack(font: string): string {
  return `"${font.replace(/"/g, '')}", Georgia, serif`
}
```

- [ ] **Step 4: Run the styles test to verify it passes**

Run: `npm test -- tests/shared/styles.test.ts`
Expected: all passed.

- [ ] **Step 5: Write the failing user DB test**

`tests/main/userDb.test.ts`:
```ts
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { UserDb } from '../../src/main/userDb'
import { DEFAULT_STYLES } from '../../src/shared/styles'

const opened: UserDb[] = []
const newPath = () => join(mkdtempSync(join(tmpdir(), 'user-')), 'user.db')
const open = (path: string) => {
  const db = UserDb.open(path)
  opened.push(db)
  return db
}
afterEach(() => {
  while (opened.length) opened.pop()!.close()
})

const JOHN_3 = { bookId: 43, startChapter: 3, startVerse: 1, endChapter: 3, endVerse: 36 }
const brief = (db: UserDb) => db.highlightsFor(JOHN_3).map(h => [h.verse, h.start, h.end, h.color])

describe('UserDb styles', () => {
  it('starts with default styles', () => {
    expect(open(newPath()).getStyles()).toEqual(DEFAULT_STYLES)
  })

  it('saves styles and keeps them after reopening', () => {
    const path = newPath()
    const db = open(path)
    db.setStyles({ ...DEFAULT_STYLES, jesusColor: '#cc0000', scale: 1.5 })
    db.close()
    opened.pop()
    const again = open(path).getStyles()
    expect(again.jesusColor).toBe('#cc0000')
    expect(again.scale).toBe(1.5)
  })

  it('replaces a corrupt file with a fresh one and keeps the old one as .bad', () => {
    const path = newPath()
    writeFileSync(path, 'this is not a database, just some text that is long enough to be read')
    const db = open(path)
    expect(existsSync(`${path}.bad`)).toBe(true)
    expect(db.getStyles()).toEqual(DEFAULT_STYLES)
  })
})

describe('UserDb highlights', () => {
  it('adds highlights and returns only those in the span', () => {
    const db = open(newPath())
    db.addHighlights(
      [
        { bookId: 43, chapter: 3, verse: 16, start: 0, end: 10 },
        { bookId: 43, chapter: 3, verse: 17, start: 4, end: 8 },
        { bookId: 43, chapter: 4, verse: 1, start: 0, end: 5 },
        { bookId: 43, chapter: 3, verse: 18, start: 5, end: 5 },
      ],
      '#ffd84a',
    )
    expect(brief(db)).toEqual([
      [16, 0, 10, '#ffd84a'],
      [17, 4, 8, '#ffd84a'],
    ])
  })

  it('removes only the selected part of a highlight', () => {
    const db = open(newPath())
    db.addHighlights([{ bookId: 43, chapter: 3, verse: 16, start: 0, end: 20 }], 'gold')
    db.removeHighlights([{ bookId: 43, chapter: 3, verse: 16, start: 5, end: 10 }])
    expect(brief(db)).toEqual([
      [16, 0, 5, 'gold'],
      [16, 10, 20, 'gold'],
    ])
  })

  it('removes a highlight completely when the selection covers it', () => {
    const db = open(newPath())
    db.addHighlights([{ bookId: 43, chapter: 3, verse: 16, start: 3, end: 8 }], 'gold')
    db.removeHighlights([{ bookId: 43, chapter: 3, verse: 16, start: 0, end: 30 }])
    expect(brief(db)).toEqual([])
  })
})

describe('UserDb recent inputs', () => {
  it('lists newest first, removes duplicates, and keeps 20', () => {
    const db = open(newPath())
    for (let i = 1; i <= 22; i++) db.addRecent(`jn 3:${i}`)
    db.addRecent('  jn 3:5  ')
    db.addRecent('   ')
    const list = db.listRecent()
    expect(list).toHaveLength(20)
    expect(list[0]).toBe('jn 3:5')
    expect(list[1]).toBe('jn 3:22')
    expect(list.filter(x => x === 'jn 3:5')).toHaveLength(1)
    expect(list).not.toContain('jn 3:1')
  })
})
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npm test -- tests/main/userDb.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 7: Implement `src/main/userDb.ts`**

```ts
import Database from 'better-sqlite3'
import { existsSync, renameSync, rmSync } from 'node:fs'
import { normalizeStyles, type Styles } from '../shared/styles'
import type { Highlight, VerseRange, VerseSpan } from '../shared/types'

export type StoredHighlight = Highlight & { chapter: number; verse: number }

const RECENT_LIMIT = 20

const SCHEMA = `
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS highlights (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  book_id INTEGER NOT NULL,
  chapter INTEGER NOT NULL,
  verse INTEGER NOT NULL,
  start_pos INTEGER NOT NULL,
  end_pos INTEGER NOT NULL,
  color TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS highlights_verse ON highlights (book_id, chapter, verse);
CREATE TABLE IF NOT EXISTS recent (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  input TEXT NOT NULL,
  used_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`

function connect(path: string): Database.Database {
  let db: Database.Database | undefined
  try {
    db = new Database(path)
    const check = db.pragma('quick_check', { simple: true })
    if (check !== 'ok') throw new Error(`quick_check: ${String(check)}`)
    db.exec(SCHEMA)
    return db
  } catch (e) {
    db?.close()
    throw e
  }
}

export class UserDb {
  private constructor(private readonly db: Database.Database) {}

  static open(path: string): UserDb {
    try {
      return new UserDb(connect(path))
    } catch {
      const bad = `${path}.bad`
      rmSync(bad, { force: true })
      if (existsSync(path)) renameSync(path, bad)
      return new UserDb(connect(path))
    }
  }

  getStyles(): Styles {
    const row = this.db.prepare('SELECT value FROM settings WHERE key = ?').get('styles') as { value: string } | undefined
    if (!row) return normalizeStyles(undefined)
    try {
      return normalizeStyles(JSON.parse(row.value))
    } catch {
      return normalizeStyles(undefined)
    }
  }

  setStyles(styles: Styles): void {
    this.db
      .prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
      .run('styles', JSON.stringify(normalizeStyles(styles)))
  }

  highlightsFor(span: VerseSpan): StoredHighlight[] {
    return this.db
      .prepare(
        `SELECT id, chapter, verse, start_pos AS start, end_pos AS end, color FROM highlights
         WHERE book_id = ? AND chapter * 1000 + verse BETWEEN ? AND ? ORDER BY id`,
      )
      .all(
        span.bookId,
        span.startChapter * 1000 + span.startVerse,
        span.endChapter * 1000 + span.endVerse,
      ) as StoredHighlight[]
  }

  addHighlights(ranges: VerseRange[], color: string): void {
    const insert = this.db.prepare(
      'INSERT INTO highlights (book_id, chapter, verse, start_pos, end_pos, color) VALUES (?, ?, ?, ?, ?, ?)',
    )
    this.db.transaction(() => {
      for (const r of ranges) if (r.end > r.start) insert.run(r.bookId, r.chapter, r.verse, r.start, r.end, color)
    })()
  }

  removeHighlights(ranges: VerseRange[]): void {
    const find = this.db.prepare(
      `SELECT id, start_pos AS start, end_pos AS end, color FROM highlights
       WHERE book_id = ? AND chapter = ? AND verse = ? AND start_pos < ? AND end_pos > ?`,
    )
    const del = this.db.prepare('DELETE FROM highlights WHERE id = ?')
    const insert = this.db.prepare(
      'INSERT INTO highlights (book_id, chapter, verse, start_pos, end_pos, color) VALUES (?, ?, ?, ?, ?, ?)',
    )
    this.db.transaction(() => {
      for (const r of ranges) {
        const hits = find.all(r.bookId, r.chapter, r.verse, r.end, r.start) as Highlight[]
        for (const h of hits) {
          del.run(h.id)
          if (h.start < r.start) insert.run(r.bookId, r.chapter, r.verse, h.start, r.start, h.color)
          if (r.end < h.end) insert.run(r.bookId, r.chapter, r.verse, r.end, h.end, h.color)
        }
      }
    })()
  }

  addRecent(input: string): void {
    const text = input.trim()
    if (!text) return
    this.db.transaction(() => {
      this.db.prepare('DELETE FROM recent WHERE input = ?').run(text)
      this.db.prepare('INSERT INTO recent (input) VALUES (?)').run(text)
      this.db
        .prepare('DELETE FROM recent WHERE id NOT IN (SELECT id FROM recent ORDER BY id DESC LIMIT ?)')
        .run(RECENT_LIMIT)
    })()
  }

  listRecent(): string[] {
    const rows = this.db.prepare('SELECT input FROM recent ORDER BY id DESC LIMIT ?').all(RECENT_LIMIT) as {
      input: string
    }[]
    return rows.map(r => r.input)
  }

  close(): void {
    this.db.close()
  }
}
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `npm test -- tests/shared/styles.test.ts tests/main/userDb.test.ts`
Expected: all passed.

- [ ] **Step 9: Commit**

```bash
git add src/shared/styles.ts src/main/userDb.ts tests/shared/styles.test.ts tests/main/userDb.test.ts
git commit -m "feat: add styles model and user database for styles, highlights, recent" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Main process, IPC, preload, and windows

**Files:**
- Create: `src/shared/ipc.ts`, `src/shared/api.ts`
- Create: `src/main/displayPick.ts`, `src/main/fonts.ts`, `src/main/font-list.d.ts`, `src/main/loadGroups.ts`, `src/main/windows.ts`, `src/main/ipc.ts`
- Modify (replace): `src/main/index.ts`, `src/preload/index.ts`, `src/renderer/src/main.tsx`
- Create: `src/renderer/src/env.d.ts`, `src/renderer/src/base.css`, `src/renderer/src/display/DisplayScreen.tsx` (stub), `src/renderer/src/control/ControlScreen.tsx` (stub)
- Test: `tests/main/displayPick.test.ts`, `tests/main/fonts.test.ts`, `tests/main/loadGroups.test.ts`

**Interfaces:**
- Consumes: `BibleDb` (Task 8), `UserDb`, `Styles` (Task 9), all types (Task 2).
- Produces:
  - `IPC` channel-name constants (below).
  - `interface ControlApi`, `interface DisplayApi`, `interface BibleApi { control: ControlApi; display: DisplayApi }` and global `window.bible: BibleApi`.
  - `pickDisplay<T extends DisplayLike>(displays: T[], primaryId: number): T | null`
  - `cleanFontNames(raw: string[]): string[]`, `listFonts(): Promise<string[]>`
  - `loadGroups(bible: Pick<BibleDb, 'getVerses'>, user: Pick<UserDb, 'highlightsFor'>, groups: RefGroup[]): DisplayGroup[]`
  - Two windows: control (`#/control`) and display (`#/display`, fullscreen on the second monitor, moves on monitor hot-plug).

- [ ] **Step 1: Write the failing tests**

`tests/main/displayPick.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { pickDisplay } from '../../src/main/displayPick'

const d = (id: number, x: number) => ({ id, bounds: { x, y: 0, width: 1920, height: 1080 } })

describe('pickDisplay', () => {
  it('picks the first non-primary display', () => {
    expect(pickDisplay([d(1, 0), d(2, 1920), d(3, 3840)], 1)?.id).toBe(2)
    expect(pickDisplay([d(2, 1920), d(1, 0)], 1)?.id).toBe(2)
  })

  it('returns null with only one display', () => {
    expect(pickDisplay([d(1, 0)], 1)).toBeNull()
  })
})
```

`tests/main/fonts.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { cleanFontNames } from '../../src/main/fonts'

describe('cleanFontNames', () => {
  it('strips quotes, removes duplicates and blanks, and sorts', () => {
    expect(cleanFontNames(['"Segoe UI"', 'Arial', ' Georgia ', '', 'Arial'])).toEqual(['Arial', 'Georgia', 'Segoe UI'])
  })
})
```

`tests/main/loadGroups.test.ts`:
```ts
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { BibleDb } from '../../src/main/bibleDb'
import { loadGroups } from '../../src/main/loadGroups'
import { UserDb } from '../../src/main/userDb'
import type { RefGroup } from '../../src/shared/types'
import { makeFixtureBible } from '../helpers/fixtureBible'

describe('loadGroups', () => {
  it('returns labeled groups of verses with their own highlights', () => {
    const bible = BibleDb.open(makeFixtureBible())
    const user = UserDb.open(join(mkdtempSync(join(tmpdir(), 'user-')), 'user.db'))
    user.addHighlights([{ bookId: 43, chapter: 3, verse: 17, start: 0, end: 7 }], 'gold')
    const group: RefGroup = {
      label: 'John 3:16-18', bookId: 43, startChapter: 3, startVerse: 16, endChapter: 3, endVerse: 18, inputStart: 0, inputEnd: 10,
    }

    const [g] = loadGroups(bible, user, [group])

    expect(g.label).toBe('John 3:16-18')
    expect(g.verses.map(v => v.verse)).toEqual([16, 17, 18])
    expect(g.verses[0].highlights).toEqual([])
    expect(g.verses[1].highlights).toEqual([{ id: 1, start: 0, end: 7, color: 'gold' }])
    expect(g.verses[0].redLetter.length).toBe(1)
    bible.close()
    user.close()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/main/displayPick.test.ts tests/main/fonts.test.ts tests/main/loadGroups.test.ts`
Expected: FAIL (modules not found).

- [ ] **Step 3: Implement the three pure main-process modules**

`src/main/font-list.d.ts` (font-list ships no TypeScript types):
```ts
declare module 'font-list'
```

`src/main/displayPick.ts`:
```ts
export interface DisplayLike {
  id: number
  bounds: { x: number; y: number; width: number; height: number }
}

export function pickDisplay<T extends DisplayLike>(displays: T[], primaryId: number): T | null {
  return displays.find(d => d.id !== primaryId) ?? null
}
```

`src/main/fonts.ts`:
```ts
const FALLBACK_FONTS = ['Arial', 'Calibri', 'Cambria', 'Georgia', 'Segoe UI', 'Tahoma', 'Times New Roman', 'Verdana']

export function cleanFontNames(raw: string[]): string[] {
  const names = raw.map(n => n.trim().replace(/^"(.*)"$/, '$1').trim()).filter(n => n.length > 0)
  return [...new Set(names)].sort((a, b) => a.localeCompare(b))
}

export async function listFonts(): Promise<string[]> {
  try {
    const mod = (await import('font-list')) as {
      getFonts?: (o?: object) => Promise<string[]>
      default?: { getFonts: (o?: object) => Promise<string[]> }
    }
    const getFonts = mod.getFonts ?? mod.default?.getFonts
    if (!getFonts) return FALLBACK_FONTS
    const fonts = cleanFontNames(await getFonts({ disableQuoting: true }))
    return fonts.length > 0 ? fonts : FALLBACK_FONTS
  } catch {
    return FALLBACK_FONTS
  }
}
```

`src/main/loadGroups.ts`:
```ts
import type { DisplayGroup, RefGroup } from '../shared/types'
import type { BibleDb } from './bibleDb'
import type { UserDb } from './userDb'

export function loadGroups(
  bible: Pick<BibleDb, 'getVerses'>,
  user: Pick<UserDb, 'highlightsFor'>,
  groups: RefGroup[],
): DisplayGroup[] {
  return groups.map(g => {
    const highlights = user.highlightsFor(g)
    return {
      label: g.label,
      verses: bible.getVerses(g).map(v => ({
        ...v,
        highlights: highlights
          .filter(h => h.chapter === v.chapter && h.verse === v.verse)
          .map(({ id, start, end, color }) => ({ id, start, end, color })),
      })),
    }
  })
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/main`
Expected: all passed.

- [ ] **Step 5: Create `src/shared/ipc.ts` and `src/shared/api.ts`**

`src/shared/ipc.ts`:
```ts
export const IPC = {
  verseCounts: 'bible:verse-counts',
  loadGroups: 'bible:load-groups',
  getStyles: 'styles:get',
  setStyles: 'styles:set',
  addHighlights: 'highlights:add',
  removeHighlights: 'highlights:remove',
  addRecent: 'recent:add',
  listRecent: 'recent:list',
  listFonts: 'fonts:list',
  getDisplayInfo: 'display:get-info',
  present: 'display:present',
  scroll: 'display:scroll',
  displayReady: 'display:ready',
  reportScroll: 'display:report-scroll',
  evtState: 'event:state',
  evtStyles: 'event:styles',
  evtScroll: 'event:scroll',
  evtScrollPos: 'event:scroll-pos',
  evtDisplayInfo: 'event:display-info',
} as const
```

`src/shared/api.ts`:
```ts
import type { Styles } from './styles'
import type {
  DisplayGroup,
  DisplayInfo,
  DisplayState,
  RefGroup,
  ScrollCommand,
  VerseCounts,
  VerseRange,
} from './types'

export type Unsubscribe = () => void

export interface ControlApi {
  verseCounts(): Promise<VerseCounts>
  loadGroups(groups: RefGroup[]): Promise<DisplayGroup[]>
  getStyles(): Promise<Styles>
  setStyles(styles: Styles): Promise<void>
  addHighlights(ranges: VerseRange[], color: string): Promise<void>
  removeHighlights(ranges: VerseRange[]): Promise<void>
  addRecent(input: string): Promise<void>
  listRecent(): Promise<string[]>
  listFonts(): Promise<string[]>
  getDisplayInfo(): Promise<DisplayInfo>
  present(state: DisplayState): void
  scroll(cmd: ScrollCommand): void
  onDisplayInfo(cb: (info: DisplayInfo) => void): Unsubscribe
  onScrollPos(cb: (top: number) => void): Unsubscribe
}

export interface DisplayApi {
  ready(): Promise<{ state: DisplayState; styles: Styles }>
  onState(cb: (state: DisplayState) => void): Unsubscribe
  onStyles(cb: (styles: Styles) => void): Unsubscribe
  onScroll(cb: (cmd: ScrollCommand) => void): Unsubscribe
  reportScroll(top: number): void
}

export interface BibleApi {
  control: ControlApi
  display: DisplayApi
}
```

- [ ] **Step 6: Replace `src/preload/index.ts`**

```ts
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { BibleApi, Unsubscribe } from '../shared/api'
import { IPC } from '../shared/ipc'

function subscribe<T>(channel: string, cb: (value: T) => void): Unsubscribe {
  const handler = (_e: IpcRendererEvent, value: T) => cb(value)
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

const api: BibleApi = {
  control: {
    verseCounts: () => ipcRenderer.invoke(IPC.verseCounts),
    loadGroups: groups => ipcRenderer.invoke(IPC.loadGroups, groups),
    getStyles: () => ipcRenderer.invoke(IPC.getStyles),
    setStyles: styles => ipcRenderer.invoke(IPC.setStyles, styles),
    addHighlights: (ranges, color) => ipcRenderer.invoke(IPC.addHighlights, ranges, color),
    removeHighlights: ranges => ipcRenderer.invoke(IPC.removeHighlights, ranges),
    addRecent: input => ipcRenderer.invoke(IPC.addRecent, input),
    listRecent: () => ipcRenderer.invoke(IPC.listRecent),
    listFonts: () => ipcRenderer.invoke(IPC.listFonts),
    getDisplayInfo: () => ipcRenderer.invoke(IPC.getDisplayInfo),
    present: state => ipcRenderer.send(IPC.present, state),
    scroll: cmd => ipcRenderer.send(IPC.scroll, cmd),
    onDisplayInfo: cb => subscribe(IPC.evtDisplayInfo, cb),
    onScrollPos: cb => subscribe(IPC.evtScrollPos, cb),
  },
  display: {
    ready: () => ipcRenderer.invoke(IPC.displayReady),
    onState: cb => subscribe(IPC.evtState, cb),
    onStyles: cb => subscribe(IPC.evtStyles, cb),
    onScroll: cb => subscribe(IPC.evtScroll, cb),
    reportScroll: top => ipcRenderer.send(IPC.reportScroll, top),
  },
}

contextBridge.exposeInMainWorld('bible', api)
```

- [ ] **Step 7: Create `src/main/windows.ts`**

```ts
import { BrowserWindow, screen } from 'electron'
import { join } from 'node:path'
import { pickDisplay } from './displayPick'

const PRELOAD = join(__dirname, '../preload/index.js')

function load(win: BrowserWindow, route: 'control' | 'display'): void {
  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) void win.loadURL(`${devUrl}#/${route}`)
  else void win.loadFile(join(__dirname, '../renderer/index.html'), { hash: `/${route}` })
}

export function createControlWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1400,
    height: 860,
    title: 'Bible Display — Control',
    autoHideMenuBar: true,
    webPreferences: { preload: PRELOAD },
  })
  load(win, 'control')
  return win
}

export function createDisplayWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1024,
    height: 640,
    title: 'Bible Display',
    autoHideMenuBar: true,
    backgroundColor: '#111111',
    show: false,
    webPreferences: { preload: PRELOAD },
  })
  load(win, 'display')
  return win
}

/** Puts the display window fullscreen on the second monitor. Returns false if there is none. */
export function placeDisplayWindow(win: BrowserWindow): boolean {
  const primary = screen.getPrimaryDisplay()
  const target = pickDisplay(screen.getAllDisplays(), primary.id)
  if (win.isFullScreen()) win.setFullScreen(false)
  if (target) {
    win.setBounds(target.bounds)
    win.setFullScreen(true)
    win.showInactive()
    return true
  }
  const { x, y, width, height } = primary.workArea
  win.setBounds({
    x: x + Math.round(width * 0.2),
    y: y + Math.round(height * 0.15),
    width: Math.round(width * 0.6),
    height: Math.round(height * 0.6),
  })
  win.showInactive()
  return false
}
```

- [ ] **Step 8: Create `src/main/ipc.ts`**

```ts
import { ipcMain, type BrowserWindow } from 'electron'
import { IPC } from '../shared/ipc'
import type { Styles } from '../shared/styles'
import type { DisplayInfo, DisplayState, RefGroup, ScrollCommand, VerseRange } from '../shared/types'
import type { BibleDb } from './bibleDb'
import { listFonts } from './fonts'
import { loadGroups } from './loadGroups'
import type { UserDb } from './userDb'

export interface MainContext {
  bible: BibleDb
  user: UserDb
  getControl(): BrowserWindow | null
  getDisplay(): BrowserWindow | null
  displayInfo(): DisplayInfo
}

export function registerIpc(ctx: MainContext): void {
  let state: DisplayState = { groups: [], blank: false }
  const toDisplay = (channel: string, payload: unknown) => ctx.getDisplay()?.webContents.send(channel, payload)

  ipcMain.handle(IPC.verseCounts, () => ctx.bible.verseCounts())
  ipcMain.handle(IPC.loadGroups, (_e, groups: RefGroup[]) => loadGroups(ctx.bible, ctx.user, groups))
  ipcMain.handle(IPC.getStyles, () => ctx.user.getStyles())
  ipcMain.handle(IPC.setStyles, (_e, styles: Styles) => {
    ctx.user.setStyles(styles)
    toDisplay(IPC.evtStyles, ctx.user.getStyles())
  })
  ipcMain.handle(IPC.addHighlights, (_e, ranges: VerseRange[], color: string) => ctx.user.addHighlights(ranges, color))
  ipcMain.handle(IPC.removeHighlights, (_e, ranges: VerseRange[]) => ctx.user.removeHighlights(ranges))
  ipcMain.handle(IPC.addRecent, (_e, input: string) => ctx.user.addRecent(input))
  ipcMain.handle(IPC.listRecent, () => ctx.user.listRecent())
  ipcMain.handle(IPC.listFonts, () => listFonts())
  ipcMain.handle(IPC.getDisplayInfo, () => ctx.displayInfo())
  ipcMain.handle(IPC.displayReady, () => ({ state, styles: ctx.user.getStyles() }))

  ipcMain.on(IPC.present, (_e, next: DisplayState) => {
    state = next
    toDisplay(IPC.evtState, next)
  })
  ipcMain.on(IPC.scroll, (_e, cmd: ScrollCommand) => toDisplay(IPC.evtScroll, cmd))
  ipcMain.on(IPC.reportScroll, (_e, top: number) => ctx.getControl()?.webContents.send(IPC.evtScrollPos, top))
}
```

- [ ] **Step 9: Replace `src/main/index.ts`**

```ts
import { app, dialog, screen, type BrowserWindow } from 'electron'
import { join } from 'node:path'
import { IPC } from '../shared/ipc'
import type { DisplayInfo } from '../shared/types'
import { BibleDb } from './bibleDb'
import { registerIpc } from './ipc'
import { UserDb } from './userDb'
import { createControlWindow, createDisplayWindow, placeDisplayWindow } from './windows'

let control: BrowserWindow | null = null
let display: BrowserWindow | null = null
let secondMonitor = false

function bibleDbPath(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'bible.db')
    : join(app.getAppPath(), 'resources', 'bible.db')
}

function displayInfo(): DisplayInfo {
  const [width, height] = display?.getContentSize() ?? [1920, 1080]
  return { width, height, secondMonitor }
}

function sendDisplayInfo(): void {
  control?.webContents.send(IPC.evtDisplayInfo, displayInfo())
}

function reposition(): void {
  if (!display) return
  secondMonitor = placeDisplayWindow(display)
  sendDisplayInfo()
}

app.whenReady().then(() => {
  let bible: BibleDb
  try {
    bible = BibleDb.open(bibleDbPath())
  } catch (e) {
    dialog.showErrorBox('Bible Display', (e as Error).message)
    app.quit()
    return
  }
  const user = UserDb.open(join(app.getPath('userData'), 'user.db'))

  registerIpc({ bible, user, getControl: () => control, getDisplay: () => display, displayInfo })

  control = createControlWindow()
  display = createDisplayWindow()
  display.once('ready-to-show', reposition)
  display.on('resize', sendDisplayInfo)
  display.on('closed', () => {
    display = null
  })
  control.on('closed', () => {
    control = null
    app.quit()
  })

  screen.on('display-added', reposition)
  screen.on('display-removed', reposition)
  screen.on('display-metrics-changed', reposition)

  app.on('will-quit', () => {
    bible.close()
    user.close()
  })
})

app.on('window-all-closed', () => app.quit())
```

- [ ] **Step 10: Renderer entry, global typing, base CSS, and stub screens**

`src/renderer/src/env.d.ts`:
```ts
import type { BibleApi } from '../../shared/api'

declare global {
  interface Window {
    bible: BibleApi
  }
}

export {}
```

`src/renderer/src/base.css`:
```css
html,
body,
#root {
  height: 100%;
  margin: 0;
}

body {
  font-family: 'Segoe UI', system-ui, sans-serif;
}
```

`src/renderer/src/main.tsx`:
```tsx
import { createRoot } from 'react-dom/client'
import './base.css'
import { ControlScreen } from './control/ControlScreen'
import { DisplayScreen } from './display/DisplayScreen'

const route = window.location.hash.replace(/^#\/?/, '')

createRoot(document.getElementById('root')!).render(route === 'display' ? <DisplayScreen /> : <ControlScreen />)
```

`src/renderer/src/control/ControlScreen.tsx` (stub, replaced in Task 15):
```tsx
export function ControlScreen() {
  return <h1>Control</h1>
}
```

`src/renderer/src/display/DisplayScreen.tsx` (stub, replaced in Task 11):
```tsx
export function DisplayScreen() {
  return <h1 style={{ color: '#fff' }}>Display</h1>
}
```

- [ ] **Step 11: Typecheck and run**

Run: `npm run typecheck` → no errors.
Run: `npm test` → all passed.
Run: `npm run dev` → a "Control" window opens. A "Display" window opens fullscreen on the second monitor (or as a centered window if there is only one monitor). Closing the control window quits the app.
Then test the missing-database error: temporarily rename `resources/bible.db` to `resources/bible.db.x`, run `npm run dev`, confirm an error box says "Bible database not found: …", then rename it back.

- [ ] **Step 12: Commit**

```bash
git add src tests
git commit -m "feat: wire main process, IPC, preload, and control/display windows" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Verse renderer and the display window

**Files:**
- Create: `src/renderer/src/verse/VerseView.tsx`, `src/renderer/src/verse/verse.css`
- Create: `src/renderer/src/display/scroll.ts`, `src/renderer/src/display/display.css`
- Modify (replace): `src/renderer/src/display/DisplayScreen.tsx`
- Test: `tests/renderer/VerseView.test.tsx`, `tests/renderer/scroll.test.ts`

**Interfaces:**
- Consumes: `buildSegments` (Task 6); `Styles`, `DEFAULT_STYLES`, `fontStack` (Task 9); `DisplayGroup`, `DisplayState`, `ScrollCommand` (Task 2); `window.bible.display` (Task 10).
- Produces:
  - `VerseView({ groups, styles, blank }: { groups: DisplayGroup[]; styles: Styles; blank: boolean })` — used by the display and by the preview (Task 13). Each verse's text is wrapped in `<span class="verse-text" data-verse-key="bookId.chapter.verse">` whose children are one `<span data-offset="N">` per segment (Task 13's selection mapping depends on this).
  - `scrollTarget(cmd: ScrollCommand, m: ScrollMetrics): number`, `lineHeightPx(styles: Styles): number`, `interface ScrollMetrics { top: number; clientHeight: number; scrollHeight: number; lineHeight: number }`

- [ ] **Step 1: Write the failing tests**

`tests/renderer/VerseView.test.tsx`:
```tsx
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { VerseView } from '../../src/renderer/src/verse/VerseView'
import { DEFAULT_STYLES, type Styles } from '../../src/shared/styles'
import type { DisplayGroup } from '../../src/shared/types'

const TEXT = 'And he saith, Stand forth.'
const groups: DisplayGroup[] = [
  {
    label: 'Mark 3:3',
    verses: [
      { bookId: 41, chapter: 3, verse: 3, text: TEXT, redLetter: [{ start: 14, end: 26 }], highlights: [{ id: 1, start: 0, end: 3, color: '#00ff00' }] },
    ],
  },
]
const html = (g: DisplayGroup[], styles: Styles = DEFAULT_STYLES, blank = false) =>
  renderToStaticMarkup(<VerseView groups={g} styles={styles} blank={blank} />)

describe('VerseView', () => {
  it('shows the heading, verse number, and colored segments', () => {
    const out = html(groups)
    expect(out).toContain('Mark 3:3')
    expect(out).toContain('class="verse-num"')
    expect(out).toContain('data-verse-key="41.3.3"')
    expect(out).toContain(`color:${DEFAULT_STYLES.jesusColor}`)
    expect(out).toContain('color:#00ff00')
    expect(out).toContain('data-offset="14"')
  })

  it('applies sizes multiplied by scale and the font stack', () => {
    const out = html(groups, { ...DEFAULT_STYLES, scale: 2 })
    expect(out).toContain(`font-size:${DEFAULT_STYLES.verse.size * 2}px`)
    expect(out).toContain('Georgia, serif')
  })

  it('hides verse numbers when turned off and supports line layout', () => {
    const out = html(groups, { ...DEFAULT_STYLES, verseNumbers: { show: false, color: '#999' }, layout: 'lines' })
    expect(out).not.toContain('verse-num')
    expect(out).toContain('verse-body--lines')
  })

  it('shows nothing but the background when blank', () => {
    const out = html(groups, DEFAULT_STYLES, true)
    expect(out).not.toContain('Mark 3:3')
    expect(out).toContain(`background:${DEFAULT_STYLES.background}`)
  })

  it('shows chapter:verse at a chapter change inside one group', () => {
    const cross: DisplayGroup[] = [
      {
        label: 'John 1:51-2:1',
        verses: [
          { bookId: 43, chapter: 1, verse: 51, text: 'a', redLetter: [], highlights: [] },
          { bookId: 43, chapter: 2, verse: 1, text: 'b', redLetter: [], highlights: [] },
        ],
      },
    ]
    expect(html(cross)).toContain('>2:1</sup>')
  })
})
```

`tests/renderer/scroll.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { lineHeightPx, scrollTarget } from '../../src/renderer/src/display/scroll'
import { DEFAULT_STYLES } from '../../src/shared/styles'

const m = { top: 500, clientHeight: 1000, scrollHeight: 3000, lineHeight: 50 }

describe('scrollTarget', () => {
  it('moves by two lines, a page, or to the ends', () => {
    expect(scrollTarget({ kind: 'lineDown' }, m)).toBe(600)
    expect(scrollTarget({ kind: 'lineUp' }, m)).toBe(400)
    expect(scrollTarget({ kind: 'pageDown' }, m)).toBe(1400)
    expect(scrollTarget({ kind: 'pageUp' }, m)).toBe(0)
    expect(scrollTarget({ kind: 'home' }, m)).toBe(0)
    expect(scrollTarget({ kind: 'end' }, m)).toBe(2000)
    expect(scrollTarget({ kind: 'by', px: 120 }, m)).toBe(620)
  })

  it('stays within bounds', () => {
    expect(scrollTarget({ kind: 'by', px: 99999 }, m)).toBe(2000)
    expect(scrollTarget({ kind: 'end' }, { ...m, scrollHeight: 800 })).toBe(0)
  })
})

describe('lineHeightPx', () => {
  it('is 1.4 × verse size × scale', () => {
    expect(lineHeightPx({ ...DEFAULT_STYLES, scale: 2 })).toBeCloseTo(DEFAULT_STYLES.verse.size * 2 * 1.4)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/renderer`
Expected: FAIL (modules not found).

- [ ] **Step 3: Implement `src/renderer/src/verse/VerseView.tsx` and `verse.css`**

`src/renderer/src/verse/VerseView.tsx`:
```tsx
import type { CSSProperties } from 'react'
import { buildSegments, type Segment } from '../../../shared/segments'
import { fontStack, type Styles } from '../../../shared/styles'
import type { DisplayGroup, VerseData } from '../../../shared/types'
import './verse.css'

interface Props {
  groups: DisplayGroup[]
  styles: Styles
  blank: boolean
}

function segmentStyle(seg: Segment, styles: Styles): CSSProperties | undefined {
  if (seg.kind === 'highlight') return { color: seg.color }
  if (seg.kind === 'jesus') return { color: styles.jesusColor }
  return undefined
}

function Verse({ v, styles, showChapter }: { v: VerseData; styles: Styles; showChapter: boolean }) {
  return (
    <span className="verse">
      {styles.verseNumbers.show && (
        <sup className="verse-num" style={{ color: styles.verseNumbers.color }}>
          {showChapter ? `${v.chapter}:${v.verse}` : v.verse}
        </sup>
      )}
      <span className="verse-text" data-verse-key={`${v.bookId}.${v.chapter}.${v.verse}`}>
        {buildSegments(v.text, v.redLetter, v.highlights).map(seg => (
          <span key={seg.start} data-offset={seg.start} style={segmentStyle(seg, styles)}>
            {seg.text}
          </span>
        ))}
      </span>{' '}
    </span>
  )
}

export function VerseView({ groups, styles, blank }: Props) {
  const scale = styles.scale
  const headingStyle: CSSProperties = {
    fontFamily: fontStack(styles.heading.font),
    fontSize: styles.heading.size * scale,
    color: styles.heading.color,
    fontWeight: styles.heading.bold ? 700 : 400,
  }
  const bodyStyle: CSSProperties = {
    fontFamily: fontStack(styles.verse.font),
    fontSize: styles.verse.size * scale,
    color: styles.verse.color,
  }
  return (
    <div className="verse-view" style={{ background: styles.background }}>
      {!blank &&
        groups.map((g, gi) => (
          <section className="verse-group" key={`${gi}-${g.label}`}>
            <h2 className="verse-heading" style={headingStyle}>
              {g.label}
            </h2>
            <div className={`verse-body verse-body--${styles.layout}`} style={bodyStyle}>
              {g.verses.map((v, i) => (
                <Verse
                  key={`${v.chapter}:${v.verse}`}
                  v={v}
                  styles={styles}
                  showChapter={i > 0 && v.chapter !== g.verses[i - 1].chapter}
                />
              ))}
            </div>
          </section>
        ))}
    </div>
  )
}
```

`src/renderer/src/verse/verse.css`:
```css
.verse-view {
  min-height: 100%;
  box-sizing: border-box;
  padding: 2.5% 5%;
}

.verse-group + .verse-group {
  margin-top: 0.8em;
}

.verse-heading {
  margin: 0 0 0.2em;
  line-height: 1.2;
}

.verse-body {
  line-height: 1.4;
}

.verse-body--lines .verse {
  display: block;
  margin-bottom: 0.2em;
}

.verse-num {
  font-size: 0.55em;
  font-weight: 400;
  line-height: 0;
  margin-right: 0.15em;
  vertical-align: super;
}
```

- [ ] **Step 4: Implement `src/renderer/src/display/scroll.ts`**

```ts
import type { Styles } from '../../../shared/styles'
import type { ScrollCommand } from '../../../shared/types'

export interface ScrollMetrics {
  top: number
  clientHeight: number
  scrollHeight: number
  lineHeight: number
}

export function lineHeightPx(styles: Styles): number {
  return styles.verse.size * styles.scale * 1.4
}

export function scrollTarget(cmd: ScrollCommand, m: ScrollMetrics): number {
  const max = Math.max(0, m.scrollHeight - m.clientHeight)
  const page = Math.max(m.lineHeight, m.clientHeight - m.lineHeight * 2)
  let target: number
  switch (cmd.kind) {
    case 'lineUp':
      target = m.top - m.lineHeight * 2
      break
    case 'lineDown':
      target = m.top + m.lineHeight * 2
      break
    case 'pageUp':
      target = m.top - page
      break
    case 'pageDown':
      target = m.top + page
      break
    case 'home':
      target = 0
      break
    case 'end':
      target = max
      break
    case 'by':
      target = m.top + cmd.px
      break
  }
  return Math.min(max, Math.max(0, target))
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- tests/renderer`
Expected: all passed.

- [ ] **Step 6: Replace `src/renderer/src/display/DisplayScreen.tsx` and add `display.css`**

`src/renderer/src/display/DisplayScreen.tsx`:
```tsx
import { useEffect, useRef, useState } from 'react'
import { DEFAULT_STYLES, type Styles } from '../../../shared/styles'
import type { DisplayState } from '../../../shared/types'
import { VerseView } from '../verse/VerseView'
import './display.css'
import { lineHeightPx, scrollTarget } from './scroll'

export function DisplayScreen() {
  const [state, setState] = useState<DisplayState>({ groups: [], blank: false })
  const [styles, setStyles] = useState<Styles>(DEFAULT_STYLES)
  const scroller = useRef<HTMLDivElement>(null)
  const stylesRef = useRef(styles)
  stylesRef.current = styles

  useEffect(() => {
    const api = window.bible.display
    void api.ready().then(r => {
      setState(r.state)
      setStyles(r.styles)
    })
    const offs = [
      api.onState(setState),
      api.onStyles(setStyles),
      api.onScroll(cmd => {
        const el = scroller.current
        if (!el) return
        const top = scrollTarget(cmd, {
          top: el.scrollTop,
          clientHeight: el.clientHeight,
          scrollHeight: el.scrollHeight,
          lineHeight: lineHeightPx(stylesRef.current),
        })
        el.scrollTo({ top, behavior: cmd.kind === 'by' ? 'auto' : 'smooth' })
      }),
    ]
    return () => offs.forEach(off => off())
  }, [])

  useEffect(() => {
    const el = scroller.current
    if (!el) return
    let frame = 0
    const onScroll = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => window.bible.display.reportScroll(el.scrollTop))
    }
    el.addEventListener('scroll', onScroll)
    return () => {
      el.removeEventListener('scroll', onScroll)
      cancelAnimationFrame(frame)
    }
  }, [])

  // New selection of verses → start at the top. (Re-sends with the same labels, e.g. after a highlight, keep the position.)
  const contentKey = state.groups.map(g => g.label).join('|')
  useEffect(() => {
    scroller.current?.scrollTo({ top: 0 })
  }, [contentKey])

  return (
    <div className="display" ref={scroller} style={{ background: styles.background }}>
      <VerseView groups={state.groups} styles={styles} blank={state.blank} />
    </div>
  )
}
```

`src/renderer/src/display/display.css`:
```css
.display {
  height: 100vh;
  overflow-y: auto;
  cursor: none;
  scrollbar-width: none;
}

.display::-webkit-scrollbar {
  display: none;
}
```

- [ ] **Step 7: Typecheck, test, commit**

Run: `npm run typecheck` → no errors. Run: `npm test` → all passed.
```bash
git add src/renderer tests/renderer
git commit -m "feat: render verses with colors and scroll the display window" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Control widgets — reference input, selected list, recent list

**Files:**
- Create: `src/renderer/src/control/errorMarks.ts`, `ReferenceInput.tsx`, `SelectedList.tsx`, `RecentList.tsx`
- Test: `tests/renderer/errorMarks.test.ts`, `tests/renderer/ReferenceInput.test.tsx`, `tests/renderer/lists.test.tsx`

**Interfaces:**
- Consumes: `suggest`, `applyBook`, `Suggestion` (Task 5); `Book`, `BibleIndex`, `RefError`, `RefGroup` (Task 2).
- Produces:
  - `markErrors(input: string, errors: RefError[]): { text: string; error?: string }[]`
  - `ReferenceInput(props: { value: string; onChange(value: string): void; onSubmit(): void; errors: RefError[]; index: BibleIndex | null })`
  - `SelectedList(props: { groups: RefGroup[]; onRemove(index: number): void })`
  - `RecentList(props: { items: string[]; onPick(input: string): void })`

**Behavior:** the input has a transparent background over a "mirror" div with identical font/padding that repeats the text in transparent color, with error ranges given a red wavy underline — so bad items look underlined in the input itself. Error messages are listed below. Keys when the book menu is open: ↑/↓ move, Tab/Enter accept, Esc closes; otherwise Enter submits.

- [ ] **Step 1: Write the failing tests**

`tests/renderer/errorMarks.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { markErrors } from '../../src/renderer/src/control/errorMarks'

describe('markErrors', () => {
  it('splits the input into plain and error pieces', () => {
    const input = 'jn 1:3-5, xyz 2:1, mk 3:99'
    expect(
      markErrors(input, [
        { message: 'B', inputStart: 19, inputEnd: 26 },
        { message: 'A', inputStart: 10, inputEnd: 17 },
      ]),
    ).toEqual([
      { text: 'jn 1:3-5, ' },
      { text: 'xyz 2:1', error: 'A' },
      { text: ', ' },
      { text: 'mk 3:99', error: 'B' },
    ])
  })

  it('returns the whole input when there are no errors', () => {
    expect(markErrors('jn 3:16', [])).toEqual([{ text: 'jn 3:16' }])
    expect(markErrors('', [])).toEqual([])
  })
})
```

`tests/renderer/ReferenceInput.test.tsx`:
```tsx
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ReferenceInput } from '../../src/renderer/src/control/ReferenceInput'
import type { RefError } from '../../src/shared/types'
import { fakeIndex } from '../helpers/fakeIndex'

const render = (value: string, errors: RefError[] = []) =>
  renderToStaticMarkup(<ReferenceInput value={value} onChange={() => {}} onSubmit={() => {}} errors={errors} index={fakeIndex} />)

describe('ReferenceInput', () => {
  it('shows matching books as you type', () => {
    const out = render('l')
    expect(out).toContain('ref-input__menu')
    for (const name of ['Leviticus', 'Lamentations', 'Luke']) expect(out).toContain(name)
    expect(out).toContain('Luk')
  })

  it('shows a verse-count hint after a chapter and colon', () => {
    expect(render('Luke 1:')).toContain('80 verses')
  })

  it('underlines and lists errors', () => {
    const out = render('xyz 2:1', [{ message: 'Unknown book "xyz"', inputStart: 0, inputEnd: 7 }])
    expect(out).toContain('ref-input__error')
    expect(out).toContain('Unknown book')
  })

  it('shows no menu without an index', () => {
    const out = renderToStaticMarkup(<ReferenceInput value="l" onChange={() => {}} onSubmit={() => {}} errors={[]} index={null} />)
    expect(out).not.toContain('ref-input__menu')
  })
})
```

`tests/renderer/lists.test.tsx`:
```tsx
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { RecentList } from '../../src/renderer/src/control/RecentList'
import { SelectedList } from '../../src/renderer/src/control/SelectedList'
import type { RefGroup } from '../../src/shared/types'

const group: RefGroup = { label: 'John 1:3-5', bookId: 43, startChapter: 1, startVerse: 3, endChapter: 1, endVerse: 5, inputStart: 0, inputEnd: 8 }

describe('SelectedList', () => {
  it('lists groups with remove buttons', () => {
    const out = renderToStaticMarkup(<SelectedList groups={[group]} onRemove={() => {}} />)
    expect(out).toContain('John 1:3-5')
    expect(out).toContain('Remove John 1:3-5')
  })

  it('says when nothing is on screen', () => {
    expect(renderToStaticMarkup(<SelectedList groups={[]} onRemove={() => {}} />)).toContain('Nothing on screen')
  })
})

describe('RecentList', () => {
  it('lists recent inputs', () => {
    const out = renderToStaticMarkup(<RecentList items={['jn 3:16', 'ps 23']} onPick={() => {}} />)
    expect(out).toContain('jn 3:16')
    expect(out).toContain('ps 23')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/renderer/errorMarks.test.ts tests/renderer/ReferenceInput.test.tsx tests/renderer/lists.test.tsx`
Expected: FAIL (modules not found).

- [ ] **Step 3: Implement `src/renderer/src/control/errorMarks.ts`**

```ts
import type { RefError } from '../../../shared/types'

export interface MarkPiece {
  text: string
  error?: string
}

export function markErrors(input: string, errors: RefError[]): MarkPiece[] {
  const out: MarkPiece[] = []
  let pos = 0
  for (const e of [...errors].sort((a, b) => a.inputStart - b.inputStart)) {
    if (e.inputStart < pos) continue
    if (e.inputStart > pos) out.push({ text: input.slice(pos, e.inputStart) })
    out.push({ text: input.slice(e.inputStart, e.inputEnd), error: e.message })
    pos = e.inputEnd
  }
  if (pos < input.length) out.push({ text: input.slice(pos) })
  return out
}
```

- [ ] **Step 4: Implement `src/renderer/src/control/ReferenceInput.tsx`**

```tsx
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
```

- [ ] **Step 5: Implement the two lists**

`src/renderer/src/control/SelectedList.tsx`:
```tsx
import type { RefGroup } from '../../../shared/types'

interface Props {
  groups: RefGroup[]
  onRemove(index: number): void
}

export function SelectedList({ groups, onRemove }: Props) {
  return (
    <section className="list">
      <h3 className="panel__title">Selected</h3>
      {groups.length === 0 ? (
        <p className="muted">Nothing on screen</p>
      ) : (
        <ul>
          {groups.map((g, i) => (
            <li key={`${i}-${g.label}`} className="list__row">
              <span>{g.label}</span>
              <button type="button" className="icon-btn" title={`Remove ${g.label}`} onClick={() => onRemove(i)}>
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
```

`src/renderer/src/control/RecentList.tsx`:
```tsx
interface Props {
  items: string[]
  onPick(input: string): void
}

export function RecentList({ items, onPick }: Props) {
  return (
    <section className="list">
      <h3 className="panel__title">Recent</h3>
      {items.length === 0 ? (
        <p className="muted">No recent verses</p>
      ) : (
        <ul>
          {items.map(item => (
            <li key={item}>
              <button type="button" className="link-btn" title={`Show ${item}`} onClick={() => onPick(item)}>
                {item}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test -- tests/renderer`
Expected: all passed.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/control tests/renderer
git commit -m "feat: add reference input with type-ahead, error underlines, and lists" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Preview panel, selection mapping, keyboard shortcuts

**Files:**
- Create: `src/renderer/src/control/selection.ts`, `keys.ts`, `PreviewPanel.tsx`
- Test: `tests/renderer/selection.test.tsx`, `tests/renderer/keys.test.ts`, `tests/renderer/previewScale.test.ts`

**Interfaces:**
- Consumes: `VerseView` and its `data-verse-key` markup (Task 11); `Styles` (Task 9); `DisplayGroup`, `DisplayInfo`, `ScrollCommand`, `VerseRange` (Task 2).
- Produces:
  - `selectionToRanges(root: HTMLElement, range: Range): VerseRange[]`
  - `type KeyAction = { type: 'scroll'; cmd: ScrollCommand } | { type: 'scale'; dir: 1 | -1 } | { type: 'toggleBlank' }`
  - `keyToAction(k: { key: string; ctrlKey: boolean; inputFocused: boolean }): KeyAction | null` — PgUp/PgDn always scroll; Ctrl+`=`/`+` and Ctrl+`-` scale; Home/End/↑/↓/`B` only when no text field is focused.
  - `previewScale(panel: { width: number; height: number }, display: { width: number; height: number }): number`
  - `PreviewPanel(props: { groups: DisplayGroup[]; styles: Styles; blank: boolean; info: DisplayInfo; scrollTop: number; onScroll(cmd: ScrollCommand): void; onSelect(ranges: VerseRange[]): void })`

- [ ] **Step 1: Write the failing tests**

`tests/renderer/selection.test.tsx`:
```tsx
// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { selectionToRanges } from '../../src/renderer/src/control/selection'
import { VerseView } from '../../src/renderer/src/verse/VerseView'
import { DEFAULT_STYLES } from '../../src/shared/styles'
import type { DisplayGroup } from '../../src/shared/types'

const groups: DisplayGroup[] = [
  {
    label: 'John 3:16-17',
    verses: [
      { bookId: 43, chapter: 3, verse: 16, text: 'For God so loved the world', redLetter: [{ start: 0, end: 26 }], highlights: [] },
      { bookId: 43, chapter: 3, verse: 17, text: 'For God sent not his Son', redLetter: [], highlights: [] },
    ],
  },
]

function setup(): HTMLElement {
  const root = document.createElement('div')
  root.innerHTML = renderToStaticMarkup(<VerseView groups={groups} styles={DEFAULT_STYLES} blank={false} />)
  document.body.replaceChildren(root)
  return root
}

const textOf = (root: HTMLElement, verse: number) =>
  root.querySelector(`[data-verse-key="43.3.${verse}"] span`)!.firstChild as Text

describe('selectionToRanges', () => {
  it('maps a selection inside one verse to character offsets', () => {
    const root = setup()
    const r = document.createRange()
    r.setStart(textOf(root, 16), 4)
    r.setEnd(textOf(root, 16), 7)
    expect(selectionToRanges(root, r)).toEqual([{ bookId: 43, chapter: 3, verse: 16, start: 4, end: 7 }])
  })

  it('splits a selection across verses', () => {
    const root = setup()
    const r = document.createRange()
    r.setStart(textOf(root, 16), 18)
    r.setEnd(textOf(root, 17), 7)
    expect(selectionToRanges(root, r)).toEqual([
      { bookId: 43, chapter: 3, verse: 16, start: 18, end: 26 },
      { bookId: 43, chapter: 3, verse: 17, start: 0, end: 7 },
    ])
  })

  it('ignores a selection of only a verse number', () => {
    const root = setup()
    const r = document.createRange()
    r.selectNodeContents(root.querySelectorAll('.verse-num')[1])
    expect(selectionToRanges(root, r)).toEqual([])
  })
})
```

`tests/renderer/keys.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { keyToAction } from '../../src/renderer/src/control/keys'

const k = (key: string, inputFocused = false, ctrlKey = false) => keyToAction({ key, ctrlKey, inputFocused })

describe('keyToAction', () => {
  it('scrolls a page with PgUp/PgDn even while typing', () => {
    expect(k('PageDown', true)).toEqual({ type: 'scroll', cmd: { kind: 'pageDown' } })
    expect(k('PageUp', true)).toEqual({ type: 'scroll', cmd: { kind: 'pageUp' } })
  })

  it('uses arrows, Home, End, and B only when not typing', () => {
    expect(k('ArrowDown')).toEqual({ type: 'scroll', cmd: { kind: 'lineDown' } })
    expect(k('ArrowUp')).toEqual({ type: 'scroll', cmd: { kind: 'lineUp' } })
    expect(k('Home')).toEqual({ type: 'scroll', cmd: { kind: 'home' } })
    expect(k('End')).toEqual({ type: 'scroll', cmd: { kind: 'end' } })
    expect(k('b')).toEqual({ type: 'toggleBlank' })
    expect(k('B')).toEqual({ type: 'toggleBlank' })
    expect(k('ArrowDown', true)).toBeNull()
    expect(k('b', true)).toBeNull()
  })

  it('scales with Ctrl + and Ctrl -', () => {
    expect(k('=', true, true)).toEqual({ type: 'scale', dir: 1 })
    expect(k('+', false, true)).toEqual({ type: 'scale', dir: 1 })
    expect(k('-', true, true)).toEqual({ type: 'scale', dir: -1 })
  })

  it('ignores other keys', () => {
    expect(k('x')).toBeNull()
    expect(k('b', false, true)).toBeNull()
  })
})
```

`tests/renderer/previewScale.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { previewScale } from '../../src/renderer/src/control/PreviewPanel'

describe('previewScale', () => {
  it('fits the display inside the panel, keeping its shape', () => {
    expect(previewScale({ width: 960, height: 540 }, { width: 1920, height: 1080 })).toBe(0.5)
    expect(previewScale({ width: 960, height: 270 }, { width: 1920, height: 1080 })).toBe(0.25)
  })

  it('returns 0 for empty sizes', () => {
    expect(previewScale({ width: 0, height: 500 }, { width: 1920, height: 1080 })).toBe(0)
    expect(previewScale({ width: 500, height: 500 }, { width: 0, height: 0 })).toBe(0)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/renderer/selection.test.tsx tests/renderer/keys.test.ts tests/renderer/previewScale.test.ts`
Expected: FAIL (modules not found).

- [ ] **Step 3: Implement `src/renderer/src/control/selection.ts`**

```ts
import type { VerseRange } from '../../../shared/types'

function offsetWithin(el: HTMLElement, node: Node, offset: number): number {
  const r = el.ownerDocument.createRange()
  r.setStart(el, 0)
  r.setEnd(node, offset)
  return r.toString().length
}

export function selectionToRanges(root: HTMLElement, range: Range): VerseRange[] {
  const out: VerseRange[] = []
  for (const el of Array.from(root.querySelectorAll<HTMLElement>('[data-verse-key]'))) {
    if (!range.intersectsNode(el)) continue
    const [bookId, chapter, verse] = (el.dataset.verseKey ?? '').split('.').map(Number)
    const length = el.textContent?.length ?? 0
    const start = el.contains(range.startContainer) ? offsetWithin(el, range.startContainer, range.startOffset) : 0
    const end = el.contains(range.endContainer) ? offsetWithin(el, range.endContainer, range.endOffset) : length
    if (end > start) out.push({ bookId, chapter, verse, start, end })
  }
  return out
}
```

- [ ] **Step 4: Implement `src/renderer/src/control/keys.ts`**

```ts
import type { ScrollCommand } from '../../../shared/types'

export type KeyAction =
  | { type: 'scroll'; cmd: ScrollCommand }
  | { type: 'scale'; dir: 1 | -1 }
  | { type: 'toggleBlank' }

export interface KeyInfo {
  key: string
  ctrlKey: boolean
  inputFocused: boolean
}

const scroll = (kind: 'lineUp' | 'lineDown' | 'pageUp' | 'pageDown' | 'home' | 'end'): KeyAction => ({
  type: 'scroll',
  cmd: { kind },
})

export function keyToAction(k: KeyInfo): KeyAction | null {
  if (k.ctrlKey) {
    if (k.key === '=' || k.key === '+') return { type: 'scale', dir: 1 }
    if (k.key === '-' || k.key === '_') return { type: 'scale', dir: -1 }
    return null
  }
  if (k.key === 'PageUp') return scroll('pageUp')
  if (k.key === 'PageDown') return scroll('pageDown')
  if (k.inputFocused) return null
  switch (k.key) {
    case 'Home':
      return scroll('home')
    case 'End':
      return scroll('end')
    case 'ArrowUp':
      return scroll('lineUp')
    case 'ArrowDown':
      return scroll('lineDown')
    case 'b':
    case 'B':
      return { type: 'toggleBlank' }
    default:
      return null
  }
}
```

- [ ] **Step 5: Implement `src/renderer/src/control/PreviewPanel.tsx`**

```tsx
import { useEffect, useRef, useState } from 'react'
import type { Styles } from '../../../shared/styles'
import type { DisplayGroup, DisplayInfo, ScrollCommand, VerseRange } from '../../../shared/types'
import { VerseView } from '../verse/VerseView'
import { selectionToRanges } from './selection'

interface Size {
  width: number
  height: number
}

interface Props {
  groups: DisplayGroup[]
  styles: Styles
  blank: boolean
  info: DisplayInfo
  scrollTop: number
  onScroll(cmd: ScrollCommand): void
  onSelect(ranges: VerseRange[]): void
}

export function previewScale(panel: Size, display: Size): number {
  if (!panel.width || !panel.height || !display.width || !display.height) return 0
  return Math.min(panel.width / display.width, panel.height / display.height)
}

export function PreviewPanel({ groups, styles, blank, info, scrollTop, onScroll, onSelect }: Props) {
  const outer = useRef<HTMLDivElement>(null)
  const viewport = useRef<HTMLDivElement>(null)
  const [panel, setPanel] = useState<Size>({ width: 0, height: 0 })

  useEffect(() => {
    const el = outer.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      setPanel({ width: entry.contentRect.width, height: entry.contentRect.height })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    if (viewport.current) viewport.current.scrollTop = scrollTop
  }, [scrollTop, groups])

  const k = previewScale(panel, info)

  const handleMouseUp = () => {
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed || !viewport.current) {
      onSelect([])
      return
    }
    onSelect(selectionToRanges(viewport.current, sel.getRangeAt(0)))
  }

  return (
    <div className="preview" ref={outer} onWheel={e => onScroll({ kind: 'by', px: e.deltaY / Math.max(k, 0.1) })}>
      <div className="preview__frame" style={{ width: info.width * k, height: info.height * k }}>
        <div
          className="preview__viewport"
          ref={viewport}
          onMouseUp={handleMouseUp}
          style={{ width: info.width, height: info.height, transform: `scale(${k})` }}
        >
          <VerseView groups={groups} styles={styles} blank={blank} />
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test -- tests/renderer`
Expected: all passed.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/control tests/renderer
git commit -m "feat: add live preview, selection-to-verse mapping, and keyboard shortcuts" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: Style panel

**Files:**
- Create: `src/renderer/src/control/ColorField.tsx`, `FontSelect.tsx`, `StylePanel.tsx`
- Test: `tests/renderer/StylePanel.test.tsx`

**Interfaces:**
- Consumes: `Styles`, `TextStyle`, `stepScale`, `fontStack` (Task 9).
- Produces:
  - `QUICK_COLORS: string[]`, `HIGHLIGHT_COLORS: string[]`, `ColorField(props: { label: string; value: string; onChange(color: string): void; swatches?: string[] })`
  - `fontOptions(fonts: string[], current: string): { value: string; label: string }[]` — adds `"<font> (missing)"` first when the fonts list is loaded and doesn't contain the saved font.
  - `FontSelect(props: { label: string; fonts: string[]; value: string; onChange(font: string): void })`
  - `StylePanel(props: { styles: Styles; fonts: string[]; onChange(styles: Styles): void; blank: boolean; onToggleBlank(): void; hasSelection: boolean; onHighlight(color: string): void; onRemoveHighlight(): void })`

- [ ] **Step 1: Write the failing test**

`tests/renderer/StylePanel.test.tsx`:
```tsx
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { fontOptions } from '../../src/renderer/src/control/FontSelect'
import { StylePanel } from '../../src/renderer/src/control/StylePanel'
import { DEFAULT_STYLES } from '../../src/shared/styles'

const noop = () => {}
const render = (hasSelection: boolean, fonts = ['Arial', 'Georgia']) =>
  renderToStaticMarkup(
    <StylePanel
      styles={DEFAULT_STYLES}
      fonts={fonts}
      onChange={noop}
      blank={false}
      onToggleBlank={noop}
      hasSelection={hasSelection}
      onHighlight={noop}
      onRemoveHighlight={noop}
    />,
  )

describe('fontOptions', () => {
  it('marks a saved font that is not installed', () => {
    expect(fontOptions(['Arial'], 'Georgia')).toEqual([
      { value: 'Georgia', label: 'Georgia (missing)' },
      { value: 'Arial', label: 'Arial' },
    ])
  })

  it('does not mark fonts as missing before the list has loaded', () => {
    expect(fontOptions([], 'Georgia')).toEqual([{ value: 'Georgia', label: 'Georgia' }])
  })

  it('lists installed fonts as they are', () => {
    expect(fontOptions(['Arial', 'Georgia'], 'Georgia')).toEqual([
      { value: 'Arial', label: 'Arial' },
      { value: 'Georgia', label: 'Georgia' },
    ])
  })
})

describe('StylePanel', () => {
  it('shows every style section and the current scale', () => {
    const out = render(false)
    for (const text of ['Reference heading', 'Verse text', 'Jesus&#x27; words', 'Verse numbers', 'Background', 'A−', 'A+', '100%', 'Blank']) {
      expect(out).toContain(text)
    }
  })

  it('disables highlight tools until words are selected', () => {
    expect(render(false)).toContain('Select words in the preview first.')
    expect(render(false)).toMatch(/<button[^>]*disabled=""[^>]*>Remove highlight/)
    expect(render(true)).toContain('Pick a color for the selected words.')
    expect(render(true)).not.toMatch(/<button[^>]*disabled=""[^>]*>Remove highlight/)
  })

  it('shows a missing saved font', () => {
    expect(render(false, ['Arial'])).toContain('Georgia (missing)')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/renderer/StylePanel.test.tsx`
Expected: FAIL (modules not found).

- [ ] **Step 3: Implement `src/renderer/src/control/ColorField.tsx`**

```tsx
export const QUICK_COLORS = [
  '#ffffff', '#f2f2f2', '#f0c040', '#ff4a4a', '#4aa3ff', '#6ad36a',
  '#c58bff', '#ff9f40', '#9a9a9a', '#111111', '#000000', '#1b2a4a',
]

export const HIGHLIGHT_COLORS = ['#ffd84a', '#6ad36a', '#4aa3ff', '#ff9f40', '#c58bff', '#ff6fb5']

interface Props {
  label: string
  value: string
  onChange(color: string): void
  swatches?: string[]
}

export function ColorField({ label, value, onChange, swatches = QUICK_COLORS }: Props) {
  return (
    <div className="field">
      <span className="field-label">{label}</span>
      <div className="swatches">
        {swatches.map(c => (
          <button
            key={c}
            type="button"
            className={`swatch${c.toLowerCase() === value.toLowerCase() ? ' swatch--on' : ''}`}
            style={{ background: c }}
            title={c}
            onClick={() => onChange(c)}
          />
        ))}
        <input type="color" value={value} title="More colors" onChange={e => onChange(e.target.value)} />
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Implement `src/renderer/src/control/FontSelect.tsx`**

```tsx
import { fontStack } from '../../../shared/styles'

export function fontOptions(fonts: string[], current: string): { value: string; label: string }[] {
  if (fonts.length === 0) return [{ value: current, label: current }]
  const options = fonts.map(f => ({ value: f, label: f }))
  if (!fonts.includes(current)) options.unshift({ value: current, label: `${current} (missing)` })
  return options
}

interface Props {
  label: string
  fonts: string[]
  value: string
  onChange(font: string): void
}

export function FontSelect({ label, fonts, value, onChange }: Props) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <select value={value} style={{ fontFamily: fontStack(value) }} onChange={e => onChange(e.target.value)}>
        {fontOptions(fonts, value).map(o => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  )
}
```

- [ ] **Step 5: Implement `src/renderer/src/control/StylePanel.tsx`**

```tsx
import { useEffect, useState } from 'react'
import { stepScale, type Styles, type TextStyle } from '../../../shared/styles'
import { ColorField, HIGHLIGHT_COLORS } from './ColorField'
import { FontSelect } from './FontSelect'

interface Props {
  styles: Styles
  fonts: string[]
  onChange(styles: Styles): void
  blank: boolean
  onToggleBlank(): void
  hasSelection: boolean
  onHighlight(color: string): void
  onRemoveHighlight(): void
}

function SizeField({ value, onChange }: { value: number; onChange(size: number): void }) {
  const [draft, setDraft] = useState(String(value))
  useEffect(() => setDraft(String(value)), [value])
  return (
    <label className="field">
      <span className="field-label">Size</span>
      <input
        type="number"
        min={8}
        max={200}
        value={draft}
        onChange={e => {
          setDraft(e.target.value)
          const n = Number(e.target.value)
          if (Number.isInteger(n) && n >= 8 && n <= 200) onChange(n)
        }}
      />
    </label>
  )
}

export function StylePanel({ styles, fonts, onChange, blank, onToggleBlank, hasSelection, onHighlight, onRemoveHighlight }: Props) {
  const [customHighlight, setCustomHighlight] = useState(HIGHLIGHT_COLORS[0])
  const set = (patch: Partial<Styles>) => onChange({ ...styles, ...patch })
  const setHeading = (patch: Partial<Styles['heading']>) => set({ heading: { ...styles.heading, ...patch } })
  const setVerse = (patch: Partial<TextStyle>) => set({ verse: { ...styles.verse, ...patch } })

  return (
    <div className="style-panel">
      <section>
        <h3 className="panel__title">Display</h3>
        <div className="button-row">
          <button type="button" className="btn" title="Smaller (Ctrl −)" onClick={() => set({ scale: stepScale(styles.scale, -1) })}>
            A−
          </button>
          <span className="scale-value">{Math.round(styles.scale * 100)}%</span>
          <button type="button" className="btn" title="Bigger (Ctrl +)" onClick={() => set({ scale: stepScale(styles.scale, 1) })}>
            A+
          </button>
          <button type="button" className={`btn${blank ? ' btn--active' : ''}`} title="Blank the display (B)" onClick={onToggleBlank}>
            {blank ? 'Unblank' : 'Blank'}
          </button>
        </div>
        <label className="field">
          <span className="field-label">Layout</span>
          <select value={styles.layout} onChange={e => set({ layout: e.target.value === 'lines' ? 'lines' : 'paragraph' })}>
            <option value="paragraph">Verses as a paragraph</option>
            <option value="lines">Each verse on its own line</option>
          </select>
        </label>
        <ColorField label="Background" value={styles.background} onChange={background => set({ background })} />
      </section>

      <section>
        <h3 className="panel__title">Reference heading</h3>
        <FontSelect label="Font" fonts={fonts} value={styles.heading.font} onChange={font => setHeading({ font })} />
        <SizeField value={styles.heading.size} onChange={size => setHeading({ size })} />
        <ColorField label="Color" value={styles.heading.color} onChange={color => setHeading({ color })} />
        <label className="field field--inline">
          <input type="checkbox" checked={styles.heading.bold} onChange={e => setHeading({ bold: e.target.checked })} /> Bold
        </label>
      </section>

      <section>
        <h3 className="panel__title">Verse text</h3>
        <FontSelect label="Font" fonts={fonts} value={styles.verse.font} onChange={font => setVerse({ font })} />
        <SizeField value={styles.verse.size} onChange={size => setVerse({ size })} />
        <ColorField label="Color" value={styles.verse.color} onChange={color => setVerse({ color })} />
      </section>

      <section>
        <h3 className="panel__title">Jesus&apos; words</h3>
        <ColorField label="Color" value={styles.jesusColor} onChange={jesusColor => set({ jesusColor })} />
      </section>

      <section>
        <h3 className="panel__title">Verse numbers</h3>
        <label className="field field--inline">
          <input
            type="checkbox"
            checked={styles.verseNumbers.show}
            onChange={e => set({ verseNumbers: { ...styles.verseNumbers, show: e.target.checked } })}
          />{' '}
          Show verse numbers
        </label>
        <ColorField
          label="Color"
          value={styles.verseNumbers.color}
          onChange={color => set({ verseNumbers: { ...styles.verseNumbers, color } })}
        />
      </section>

      <section>
        <h3 className="panel__title">Highlight</h3>
        <p className="muted">{hasSelection ? 'Pick a color for the selected words.' : 'Select words in the preview first.'}</p>
        <div className="swatches">
          {HIGHLIGHT_COLORS.map(c => (
            <button
              key={c}
              type="button"
              className="swatch"
              style={{ background: c }}
              title={c}
              disabled={!hasSelection}
              onClick={() => onHighlight(c)}
            />
          ))}
        </div>
        <div className="button-row">
          <input type="color" value={customHighlight} title="Custom color" onChange={e => setCustomHighlight(e.target.value)} />
          <button type="button" className="btn" disabled={!hasSelection} onClick={() => onHighlight(customHighlight)}>
            Apply color
          </button>
          <button type="button" className="btn" disabled={!hasSelection} onClick={onRemoveHighlight}>
            Remove highlight
          </button>
        </div>
      </section>
    </div>
  )
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm test -- tests/renderer/StylePanel.test.tsx`
Expected: all passed.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/control tests/renderer/StylePanel.test.tsx
git commit -m "feat: add style panel with fonts, sizes, colors, and highlight tools" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 15: Wire up the control window and verify end to end

**Files:**
- Create: `src/renderer/src/control/useBibleIndex.ts`, `src/renderer/src/control/control.css`
- Modify (replace): `src/renderer/src/control/ControlScreen.tsx`

**Interfaces:**
- Consumes: everything from Tasks 3–14; `window.bible.control` (Task 10).
- Produces: the finished control window (layout A).

- [ ] **Step 1: Create `src/renderer/src/control/useBibleIndex.ts`**

```ts
import { useEffect, useState } from 'react'
import { createIndex } from '../../../shared/bibleIndex'
import type { BibleIndex } from '../../../shared/types'

export function useBibleIndex(): BibleIndex | null {
  const [index, setIndex] = useState<BibleIndex | null>(null)
  useEffect(() => {
    void window.bible.control.verseCounts().then(counts => setIndex(createIndex(counts)))
  }, [])
  return index
}
```

- [ ] **Step 2: Replace `src/renderer/src/control/ControlScreen.tsx`**

```tsx
import { useCallback, useEffect, useRef, useState } from 'react'
import { parseReferences } from '../../../shared/parser'
import { stepScale, type Styles } from '../../../shared/styles'
import type { DisplayGroup, DisplayInfo, RefError, RefGroup, VerseRange } from '../../../shared/types'
import './control.css'
import { keyToAction } from './keys'
import { PreviewPanel } from './PreviewPanel'
import { RecentList } from './RecentList'
import { ReferenceInput } from './ReferenceInput'
import { SelectedList } from './SelectedList'
import { StylePanel } from './StylePanel'
import { useBibleIndex } from './useBibleIndex'

const api = () => window.bible.control

export function ControlScreen() {
  const index = useBibleIndex()
  const [input, setInput] = useState('')
  const [errors, setErrors] = useState<RefError[]>([])
  const [refGroups, setRefGroups] = useState<RefGroup[]>([])
  const [groups, setGroups] = useState<DisplayGroup[]>([])
  const [blank, setBlank] = useState(false)
  const [recent, setRecent] = useState<string[]>([])
  const [styles, setStyles] = useState<Styles | null>(null)
  const [fonts, setFonts] = useState<string[]>([])
  const [info, setInfo] = useState<DisplayInfo>({ width: 1920, height: 1080, secondMonitor: true })
  const [scrollTop, setScrollTop] = useState(0)
  const [selection, setSelection] = useState<VerseRange[]>([])

  useEffect(() => {
    const a = api()
    void a.getStyles().then(setStyles)
    void a.listRecent().then(setRecent)
    void a.listFonts().then(setFonts)
    void a.getDisplayInfo().then(setInfo)
    const offs = [a.onDisplayInfo(setInfo), a.onScrollPos(setScrollTop)]
    return () => offs.forEach(off => off())
  }, [])

  const present = useCallback(async (next: RefGroup[], nextBlank: boolean) => {
    const loaded = await api().loadGroups(next)
    setRefGroups(next)
    setGroups(loaded)
    setSelection([])
    api().present({ groups: loaded, blank: nextBlank })
  }, [])

  const show = async (text: string) => {
    if (!index) return
    const result = parseReferences(text, index)
    setErrors(result.errors)
    if (result.groups.length === 0) return
    await present(result.groups, blank)
    await api().addRecent(text)
    setRecent(await api().listRecent())
  }

  const clear = () => {
    setInput('')
    setErrors([])
    void present([], blank)
  }

  const removeGroup = (i: number) => void present(refGroups.filter((_, j) => j !== i), blank)

  const toggleBlank = () => {
    const next = !blank
    setBlank(next)
    api().present({ groups, blank: next })
  }

  const updateStyles = (next: Styles) => {
    setStyles(next)
    void api().setStyles(next)
  }

  const highlight = async (color: string) => {
    if (selection.length === 0) return
    await api().addHighlights(selection, color)
    window.getSelection()?.removeAllRanges()
    await present(refGroups, blank)
  }

  const removeHighlight = async () => {
    if (selection.length === 0) return
    await api().removeHighlights(selection)
    window.getSelection()?.removeAllRanges()
    await present(refGroups, blank)
  }

  const latest = useRef({ styles, toggleBlank, updateStyles })
  latest.current = { styles, toggleBlank, updateStyles }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement
      const inputFocused = !!el && ['INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName)
      const action = keyToAction({ key: e.key, ctrlKey: e.ctrlKey, inputFocused })
      if (!action) return
      e.preventDefault()
      const cur = latest.current
      if (action.type === 'scroll') api().scroll(action.cmd)
      else if (action.type === 'scale') {
        if (cur.styles) cur.updateStyles({ ...cur.styles, scale: stepScale(cur.styles.scale, action.dir) })
      } else cur.toggleBlank()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="control">
      {!info.secondMonitor && (
        <div className="banner">No second monitor detected — the display is showing in a window on this screen.</div>
      )}
      <div className="control__panels">
        <aside className="panel panel--left">
          <h3 className="panel__title">Enter verses</h3>
          <ReferenceInput
            value={input}
            onChange={v => {
              setInput(v)
              setErrors([])
            }}
            onSubmit={() => void show(input)}
            errors={errors}
            index={index}
          />
          <div className="button-row">
            <button type="button" className="btn btn--primary" onClick={() => void show(input)}>
              Show ▶
            </button>
            <button type="button" className="btn" onClick={clear}>
              Clear
            </button>
          </div>
          <SelectedList groups={refGroups} onRemove={removeGroup} />
          <RecentList
            items={recent}
            onPick={text => {
              setInput(text)
              setErrors([])
              void show(text)
            }}
          />
        </aside>

        <main className="panel panel--middle">
          <h3 className="panel__title">Live preview</h3>
          {styles && (
            <PreviewPanel
              groups={groups}
              styles={styles}
              blank={blank}
              info={info}
              scrollTop={scrollTop}
              onScroll={cmd => api().scroll(cmd)}
              onSelect={setSelection}
            />
          )}
        </main>

        <aside className="panel panel--right">
          {styles && (
            <StylePanel
              styles={styles}
              fonts={fonts}
              onChange={updateStyles}
              blank={blank}
              onToggleBlank={toggleBlank}
              hasSelection={selection.length > 0}
              onHighlight={c => void highlight(c)}
              onRemoveHighlight={() => void removeHighlight()}
            />
          )}
        </aside>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Create `src/renderer/src/control/control.css`**

```css
.control {
  --bg: #eef0f3;
  --panel: #ffffff;
  --border: #c9ced6;
  --text: #1f2328;
  --muted: #6b7280;
  --accent: #2f6fdb;
  --error: #d33a3a;
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--bg);
  color: var(--text);
  font-size: 14px;
}

.banner {
  background: #fff4d6;
  border-bottom: 1px solid #e6c65c;
  padding: 6px 12px;
}

.control__panels {
  display: grid;
  grid-template-columns: 300px 1fr 300px;
  gap: 8px;
  padding: 8px;
  flex: 1;
  min-height: 0;
}

.panel {
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 10px;
  min-height: 0;
  overflow-y: auto;
}

.panel--middle {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.panel__title {
  margin: 12px 0 6px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--muted);
}

.panel__title:first-child {
  margin-top: 0;
}

.muted {
  color: var(--muted);
  margin: 4px 0;
}

.button-row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 8px 0;
  flex-wrap: wrap;
}

.btn {
  border: 1px solid var(--border);
  background: #f7f8fa;
  border-radius: 4px;
  padding: 5px 10px;
  cursor: pointer;
  font: inherit;
}

.btn:disabled {
  opacity: 0.45;
  cursor: default;
}

.btn--primary {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
}

.btn--active {
  background: #333;
  color: #fff;
}

.icon-btn,
.link-btn {
  border: none;
  background: none;
  cursor: pointer;
  font: inherit;
  padding: 2px 4px;
}

.link-btn {
  color: var(--accent);
  text-align: left;
}

.list ul {
  list-style: none;
  margin: 0;
  padding: 0;
}

.list__row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid #eceef1;
  padding: 3px 0;
}

/* Reference input: transparent input over a mirror that draws error underlines */
.ref-input__field {
  position: relative;
  background: #fff;
  border-radius: 4px;
}

.ref-input__mirror,
.ref-input__input {
  box-sizing: border-box;
  width: 100%;
  font: 15px/1.4 Consolas, 'Cascadia Mono', monospace;
  padding: 7px 9px;
  border: 1px solid transparent;
  border-radius: 4px;
  white-space: pre;
}

.ref-input__mirror {
  position: absolute;
  inset: 0;
  color: transparent;
  overflow: hidden;
  pointer-events: none;
}

.ref-input__input {
  position: relative;
  background: transparent;
  border-color: var(--border);
  color: var(--text);
  outline-color: var(--accent);
}

.ref-input__error {
  text-decoration: underline wavy var(--error);
  text-decoration-skip-ink: none;
}

.ref-input__menu {
  position: absolute;
  z-index: 10;
  top: 100%;
  left: 0;
  right: 0;
  margin: 2px 0 0;
  padding: 2px 0;
  list-style: none;
  background: #fff;
  border: 1px solid var(--border);
  border-radius: 4px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
}

.ref-input__menu li {
  padding: 4px 9px;
  cursor: pointer;
}

.ref-input__menu li.is-active {
  background: var(--accent);
  color: #fff;
}

.ref-input__abbr {
  float: right;
  opacity: 0.6;
}

.ref-input__hint {
  color: var(--muted);
  font-size: 12px;
  margin-top: 3px;
}

.ref-input__errors {
  color: var(--error);
  margin: 4px 0 0;
  padding-left: 18px;
  font-size: 12px;
}

/* Preview */
.preview {
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.preview__frame {
  overflow: hidden;
  box-shadow: 0 0 0 1px #000, 0 4px 16px rgba(0, 0, 0, 0.25);
}

.preview__viewport {
  transform-origin: 0 0;
  overflow: hidden;
  user-select: text;
}

/* Style panel */
.style-panel section + section {
  border-top: 1px solid #eceef1;
  margin-top: 10px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 3px;
  margin: 6px 0;
}

.field--inline {
  flex-direction: row;
  align-items: center;
  gap: 6px;
}

.field-label {
  font-size: 12px;
  color: var(--muted);
}

.field select,
.field input[type='number'] {
  font: inherit;
  padding: 3px 5px;
}

.scale-value {
  min-width: 42px;
  text-align: center;
}

.swatches {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  align-items: center;
}

.swatch {
  width: 20px;
  height: 20px;
  border: 1px solid #888;
  border-radius: 3px;
  padding: 0;
  cursor: pointer;
}

.swatch:disabled {
  opacity: 0.35;
  cursor: default;
}

.swatch--on {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}

input[type='color'] {
  width: 28px;
  height: 22px;
  padding: 0;
  border: 1px solid #888;
}
```

- [ ] **Step 4: Typecheck and run all tests**

Run: `npm run typecheck` → no errors.
Run: `npm test` → all passed.

- [ ] **Step 5: Manual end-to-end check (two monitors connected)**

Run: `npm run dev`, then check each item and note any failure:
1. The display window is fullscreen on the second monitor with a dark background; the control window is on the main monitor.
2. Type `l` → menu shows Leviticus, Lamentations, Luke. ↓ then Enter → input becomes `Lamentations `. Esc closes the menu.
3. Type `Luke 1:` → gray hint "80 verses".
4. Enter `jn 1:3-5, mk 3:1-3, luke 1:2` and press Enter → the display and preview show three headings (John 1:3-5, Mark 3:1-3, Luke 1:2) with verse numbers; "Stand forth." in Mark 3:3 is red. The Selected list shows three rows; Recent shows the input.
5. Enter `jn 1:3-5, xyz 2:1, mk 3:99` → `xyz 2:1` and `mk 3:99` are underlined in red in the input, the reasons are listed below, and John 1:3-5 is displayed.
6. Press A+ several times (or Ctrl +) → text grows on the display and preview. When it overflows, PgDn / mouse wheel on the preview scroll the display, and the preview follows.
7. Change the verse font, the Jesus' words color, and the background → the display updates immediately. Restart the app → the styles are still applied.
8. Drag-select a few words in the preview → "Pick a color…" appears; click a highlight color → those words change color on both screens. Select part of them and click Remove highlight → only that part goes back. Restart → highlights remain.
9. Click an item in Recent → it is shown again. Click ✕ on a Selected row → that group disappears from the display.
10. Press B (with focus outside the input) → the display shows only the background; press B again → verses return.
11. Unplug the second monitor (or use Windows "Show only on 1") → the display becomes a window on the main screen and the yellow "No second monitor detected" banner appears. Reconnect → the display returns fullscreen to the second monitor and the banner disappears.
12. Switch "Each verse on its own line" and turn verse numbers off → the display updates accordingly.

If any item fails, fix it (with a test when the logic is in `src/shared` or a pure helper), then re-run the check.

- [ ] **Step 6: Commit**

```bash
git add src/renderer
git commit -m "feat: complete the control window (layout A) and wire all panels" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 16: Windows installer and README

**Files:**
- Modify: `package.json` (add `build` config and `dist` script)
- Create: `README.md`

**Interfaces:**
- Consumes: the finished app; `resources/bible.db`; `bibleDbPath()` in `src/main/index.ts` (reads `process.resourcesPath/bible.db` when packaged).
- Produces: `npm run dist` → `release/BibleDisplay Setup <version>.exe`.

- [ ] **Step 1: Install electron-builder**

Run: `npm install -D electron-builder`

- [ ] **Step 2: Add the script and build config to `package.json`**

Add to `"scripts"`:
```json
"dist": "npm run build && electron-builder --win"
```
Add a top-level `"build"` key:
```json
"build": {
  "appId": "com.local.bibledisplay",
  "productName": "BibleDisplay",
  "directories": { "output": "release" },
  "files": [
    "!**/.vscode/*",
    "!{src,data,tests,docs,resources,.superpowers,release}/**",
    "!{tsconfig.json,electron.vite.config.ts,vitest.config.ts,README.md}"
  ],
  "extraResources": [{ "from": "resources/bible.db", "to": "bible.db" }],
  "asarUnpack": ["**/*.node"],
  "win": { "target": "nsis" },
  "nsis": { "oneClick": false, "allowToChangeInstallationDirectory": true }
}
```

- [ ] **Step 3: Build the installer**

Run: `npm run dist`
Expected: `release/BibleDisplay Setup 0.1.0.exe` is created with no errors.

- [ ] **Step 4: Install and smoke-test the packaged app**

Run the installer, start "BibleDisplay" from the Start menu, and confirm: the display window opens on the second monitor, `jn 3:16` shows John 3:16 in red, and styles persist after restarting (they are stored in `%APPDATA%\BibleDisplay\user.db`).

- [ ] **Step 5: Create `README.md`**

````markdown
# Bible Display

Show KJV Bible verses on a second monitor. Type references on the control window; every verse appears on the second screen with Jesus' words in red, your fonts and colors, and your saved highlights.

## Using it

- Type references and press **Enter**: `jn 1:3-5, mk 3:1-3, luke 1:2`, `ps 23`, `jn 1:50-2:3`, `jn 3:16, 18`, `jude 5`.
- Books: full names, 3-letter codes (`gen`, `mar`, `joh`), common short forms (`jn`, `mk`, `ps`), or any unique start of a name. Numbered books: `1 john`, `1jn`, `1 joh`.
- Type-ahead: start typing a book; ↑/↓ to choose, Tab or Enter to accept, Esc to close.
- **A− / A+** or **Ctrl − / Ctrl +**: text size. **PgUp/PgDn**, **↑/↓**, **Home/End**, or the mouse wheel over the preview: scroll the display. **B**: blank the display.
- Highlight: select words in the preview, then pick a color. **Remove highlight** clears the selected part.

## Development

```bash
npm install          # also rebuilds better-sqlite3 for Electron
npm run dev          # run the app
npm test             # run tests (inside Electron's Node)
npm run typecheck
npm run dist         # build the Windows installer into release/
```

### Rebuilding the Bible database

`resources/bible.db` is generated from the public-domain KJV OSIS file at
https://github.com/seven1m/open-bibles (`eng-kjv.osis.xml`). To regenerate it, save that file as
`data/source/eng-kjv.osis.xml` and run `npm run import-kjv`.
````

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json README.md
git commit -m "chore: add Windows installer build and README" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
