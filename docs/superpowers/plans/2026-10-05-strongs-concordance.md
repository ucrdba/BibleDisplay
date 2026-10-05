# Strong's Concordance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Click a word in the live preview to see its Strong's Hebrew/Greek dictionary entry in a collapsible panel under the preview.

**Architecture:** A one-time import (`npm run import-strongs`) parses the public-domain eBible KJV-with-Strong's USFM, places each tagged word onto **our unchanged** verse text, parses the two public-domain Strong's XML dictionaries, and writes two tables into `resources/bible.db`. Verses then carry `strongs` spans like red letters do. A click in the preview maps the caret to `(verse, offset)`, finds the span, fetches the entry over IPC, and the control window shows it in `StrongsPanel` (rendered by a pure `StrongsEntryView`).

**Tech Stack:** Electron + React 19 + TypeScript (electron-vite), better-sqlite3, esbuild (import scripts), Vitest (inside Electron's Node via `npm test`), CSS Custom Highlight API.

**Spec:** `docs/superpowers/specs/2026-10-05-strongs-concordance-design.md`

## Global Constraints

- Verse text in `resources/bible.db` must never change. Current checksum (SHA-256 over lines `${book_id}.${chapter}.${verse}\t${text}\n` in canonical order, UTF-8): **31102 verses, `b089fd537dd81d5ec186689dec27aa0b083e07421e3a5160f0975dc8e903970d`**.
- Strong's ids are a letter plus a number with **no leading zeros**: `H430`, `G25`. Valid id pattern: `/^[HG]\d+$/`.
- Data sources (downloaded by hand into git-ignored `data/source/`): `eng-kjv2006_usfm/` (unzipped from https://ebible.org/Scriptures/eng-kjv2006_usfm.zip), `StrongHebrewG.xml` (https://raw.githubusercontent.com/openscriptures/strongs/master/hebrew/StrongHebrewG.xml), `strongsgreek.xml` (extracted from https://raw.githubusercontent.com/openscriptures/strongs/master/greek/StrongsGreekDictionaryXML_1.4.zip). **Never** use Open Scriptures' `.js`/JSON dictionaries (CC-BY-SA).
- Tables: `word_strongs(book_id, chapter, verse, start_pos, end_pos, strongs)` with index `word_strongs_verse` on `(book_id, chapter, verse)`; `strongs_entries(id PRIMARY KEY, lemma, xlit, pron, derivation, definition, kjv_def)`.
- Panel copy, verbatim: `Click a word in the preview to see its Strong's entry.` · `No Strong's number for '<word>'.` · `No entry for <id>.` · `Strong's data not installed — run npm run import-strongs.` · header `<id> · Hebrew|Greek · "<word>" in <Book> <c>:<v>`.
- Strong's panel: in the middle column under the live preview, about **200px** tall, collapses to a thin bar; remembered under panel name `'strongs'` (settings key `strongsPanelCollapsed`, default expanded). A lookup while collapsed expands it.
- Preview-only marking via CSS Custom Highlight API names `strongs-hover` (faint underline, pointer cursor) and `strongs-current` (soft tint). Silently skipped if `CSS.highlights` is missing. The display window and `VerseView` markup are unchanged.
- Non-ASCII in `.ts/.tsx`: write as `\u` escapes inside JS strings/regex (tooling here has corrupted escapes — verify bytes after editing). JSX attribute strings and JSX text don't process escapes: use `{'\u00b7'}` / `title={'...'}`. No BOM. Keep each file's existing line endings.
- Tests: `npm test -- <path>`; `npm run typecheck` before each commit. Commit messages end with a `Co-Authored-By:` trailer naming the committing model.
- **Branch:** `feat/strongs` from `main`.

## File Structure

| File | Responsibility |
|---|---|
| `data/lib/strongs/usfm.ts` (new) | USFM book → tagged word tokens per verse; book-file → book id; id normalizing. |
| `data/lib/strongs/align.ts` (new) | Places tagged tokens onto our verse text (word offsets). |
| `data/lib/strongs/dictionary.ts` (new) | Parses the Hebrew (OSIS) and Greek XML dictionaries into entries. |
| `data/lib/strongs/buildStrongs.ts` (new) | Writes the tables into a Bible db with the verse-checksum safety check; report. |
| `data/import-strongs.ts` (new) | CLI: reads `data/source/*`, runs the above on `resources/bible.db`. |
| `src/shared/types.ts` | `StrongsSpan`, `StrongsEntry`; `BibleVerse.strongs?`. |
| `src/main/bibleDb.ts` | `hasStrongs`, spans in `getVerses`, `strongsEntry`. |
| IPC files, `src/shared/panels.ts`, `src/main/userDb.ts` | `hasStrongs`, `getStrongsEntry`; `'strongs'` panel. |
| `src/shared/strongs.ts` (new) | Pure: `strongsAt`, `wordAt`, `lookupTarget`, `splitStrongsRefs`. |
| `src/renderer/src/control/selection.ts` | `pointToVerseOffset`, `verseTextRange`. |
| `src/renderer/src/control/StrongsEntryView.tsx` (new) | Pure entry markup with `H…`/`G…` links. |
| `src/renderer/src/control/strongsState.ts` (new) | Pure panel state: view + Back stack. |
| `src/renderer/src/control/StrongsPanel.tsx` (new) | Collapsible panel: header, Back, body/messages. |
| `src/renderer/src/control/PreviewPanel.tsx`, `ControlScreen.tsx`, `control.css` | Click → lookup, hover/current highlights, panel placement. |
| `HelpPanel.tsx`, `README.md` | Docs. |

---

### Task 1: USFM parser

**Files:**
- Create: `data/lib/strongs/usfm.ts`
- Test: `tests/data/strongsUsfm.test.ts`

**Interfaces:**
- Produces:
  - `interface Token { word: string; strongs: string | null }`
  - `WORD_RE: RegExp` (global) — a word: letters (ASCII + Latin-1/Extended `\u00c0-\u024f`), optionally with inner `'`, `\u2019`, `-`, starting and ending with a letter.
  - `wordsOf(text: string): string[]`
  - `normalizeStrongs(raw: string): string` — `"H0430"` → `"H430"`; throws `Error('Bad Strong\'s number: <raw>')` otherwise.
  - `usfmBookId(fileName: string): number | null` — prefix `02`–`40` → 1–39, `70`–`96` → 40–66, else `null`.
  - `parseUsfmBook(usfm: string): Map<string, Token[]>` — keys `"chapter:verse"`.

- [ ] **Step 1: Write the failing tests**

Create `tests/data/strongsUsfm.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { normalizeStrongs, parseUsfmBook, usfmBookId, wordsOf } from '../../data/lib/strongs/usfm'

const PILCROW = '\u00b6'
const RSQUO = '\u2019'
const BOOK = String.raw`\id GEN
\h Genesis
\c 1
\p
\v 1 In the \w beginning|strong="H7225"\w* \w God|strong="H0430"\w* created.
\v 2 And the \w earth|strong="H0776"\w* was \add without\add* form\f + \fr 1:2 \ft a note\f*.
\s1 A heading
\v 3 \w shall surely|strong="H4191"\w* \nd LORD\nd*${RSQUO}s ${PILCROW} end.
\c 2
\d A Psalm title that is not verse text.
\q1 \v 1 Thus \w the heavens|strong="H8064"\w*. \v 2 Two \+w on|strong="H5921"\+w* one line.`

const brief = (tokens: { word: string; strongs: string | null }[] | undefined) =>
  (tokens ?? []).map(t => (t.strongs ? `${t.word}=${t.strongs}` : t.word))

describe('normalizeStrongs', () => {
  it('drops leading zeros', () => {
    expect(normalizeStrongs('H0430')).toBe('H430')
    expect(normalizeStrongs('G0025')).toBe('G25')
    expect(normalizeStrongs('H7225')).toBe('H7225')
  })

  it('rejects anything else', () => {
    expect(() => normalizeStrongs('X12')).toThrow(/Bad Strong's number/)
  })
})

describe('usfmBookId', () => {
  it('maps eBible file numbers to our book ids', () => {
    expect(usfmBookId('02-GENeng-kjv2006.usfm')).toBe(1)
    expect(usfmBookId('40-MALeng-kjv2006.usfm')).toBe(39)
    expect(usfmBookId('70-MATeng-kjv2006.usfm')).toBe(40)
    expect(usfmBookId('96-REVeng-kjv2006.usfm')).toBe(66)
    expect(usfmBookId('00-FRTeng-kjv2006.usfm')).toBeNull()
    expect(usfmBookId('copr.htm')).toBeNull()
  })
})

describe('wordsOf', () => {
  it('keeps inner apostrophes and hyphens, drops punctuation', () => {
    expect(wordsOf(`Beth-el, the LORD${RSQUO}s house; fathers${RSQUO} sins.`)).toEqual([
      'Beth-el',
      'the',
      `LORD${RSQUO}s`,
      'house',
      'fathers',
      'sins',
    ])
  })
})

describe('parseUsfmBook', () => {
  const book = parseUsfmBook(BOOK)

  it('finds every verse', () => {
    expect([...book.keys()]).toEqual(['1:1', '1:2', '1:3', '2:1', '2:2'])
  })

  it('reads tagged and untagged words in order', () => {
    expect(brief(book.get('1:1'))).toEqual(['In', 'the', 'beginning=H7225', 'God=H430', 'created'])
  })

  it('drops footnotes and keeps the text of other markers', () => {
    expect(brief(book.get('1:2'))).toEqual(['And', 'the', 'earth=H776', 'was', 'without', 'form'])
  })

  it('gives every word of a multi-word tag the same number, skips headings, joins marker-split words', () => {
    expect(brief(book.get('1:3'))).toEqual(['shall=H4191', 'surely=H4191', `LORD${RSQUO}s`, 'end'])
  })

  it('skips Psalm titles and handles several verses on one line and nested word tags', () => {
    expect(brief(book.get('2:1'))).toEqual(['Thus', 'the=H8064', 'heavens=H8064'])
    expect(brief(book.get('2:2'))).toEqual(['Two', 'on=H5921', 'one', 'line'])
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npm test -- tests/data/strongsUsfm.test.ts`
Expected: FAIL — cannot resolve `../../data/lib/strongs/usfm`.

- [ ] **Step 3: Implement `data/lib/strongs/usfm.ts`**

```ts
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
```

- [ ] **Step 4: Run them to verify they pass**

Run: `npm test -- tests/data/strongsUsfm.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck and commit**

```bash
npm run typecheck
git add data/lib/strongs/usfm.ts tests/data/strongsUsfm.test.ts
git commit -m "feat: parse Strong's-tagged KJV USFM into word tokens"
```

---

### Task 2: Place tagged words on our text

**Files:**
- Create: `data/lib/strongs/align.ts`
- Test: `tests/data/strongsAlign.test.ts`

**Interfaces:**
- Consumes: `Token`, `WORD_RE` (Task 1).
- Produces:
  - `interface WordPos { word: string; start: number; end: number }`
  - `interface PlacedSpan { start: number; end: number; strongs: string }`
  - `ourWords(text: string): WordPos[]`
  - `normalizeWord(word: string): string`
  - `alignStrongs(text: string, tokens: Token[]): { spans: PlacedSpan[]; unplaced: string[] }` — `unplaced` lists the words of tagged tokens that could not be placed.

- [ ] **Step 1: Write the failing tests**

Create `tests/data/strongsAlign.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { alignStrongs, normalizeWord, ourWords } from '../../data/lib/strongs/align'
import type { Token } from '../../data/lib/strongs/usfm'

const AE = '\u00e6'
const RSQUO = '\u2019'
const t = (word: string, strongs: string | null = null): Token => ({ word, strongs })
const placed = (text: string, tokens: Token[]) =>
  alignStrongs(text, tokens).spans.map(s => `${text.slice(s.start, s.end)}=${s.strongs}`)

describe('normalizeWord', () => {
  it('ignores case, punctuation, hyphens and the ae ligature', () => {
    expect(normalizeWord('Beth-el')).toBe('bethel')
    expect(normalizeWord(`C${AE}sar`)).toBe('caesar')
    expect(normalizeWord(`LORD${RSQUO}S`)).toBe(normalizeWord("LORD's"))
  })
})

describe('ourWords', () => {
  it('gives each word with its offsets', () => {
    expect(ourWords('In the beginning, God.')).toEqual([
      { word: 'In', start: 0, end: 2 },
      { word: 'the', start: 3, end: 6 },
      { word: 'beginning', start: 7, end: 16 },
      { word: 'God', start: 18, end: 21 },
    ])
  })
})

describe('alignStrongs', () => {
  it('places tags on identical text', () => {
    const text = 'In the beginning God created the heaven.'
    const tokens = [t('In'), t('the'), t('beginning', 'H7225'), t('God', 'H430'), t('created', 'H1254'), t('the'), t('heaven', 'H8064')]
    expect(placed(text, tokens)).toEqual(['beginning=H7225', 'God=H430', 'created=H1254', 'heaven=H8064'])
  })

  it('places tags across edition spellings', () => {
    const text = `unto Bethel, and Caesar; the LORD${RSQUO}S house`
    const tokens = [t('unto'), t('Beth-el', 'H1008'), t('and'), t(`C${AE}sar`, 'G2541'), t('the'), t("LORD's", 'H3068'), t('house', 'H1004')]
    expect(placed(text, tokens)).toEqual(['Bethel=H1008', 'Caesar=G2541', `LORD${RSQUO}S=H3068`, 'house=H1004'])
  })

  it('pairs a one-for-one different word', () => {
    expect(placed('east of Eden Cherubim, and', [t('east'), t('of'), t('Eden', 'H5731'), t('Cherubims', 'H3742'), t('and')])).toEqual([
      'Eden=H5731',
      'Cherubim=H3742',
    ])
  })

  it('leaves split words unplaced', () => {
    const result = alignStrongs('I cannot go', [t('I'), t('can', 'H3201'), t('not', 'H3808'), t('go', 'H1980')])
    expect(result.spans.map(s => s.strongs)).toEqual(['H1980'])
    expect(result.unplaced).toEqual(['can', 'not'])
  })

  it('handles a verse with no tokens', () => {
    expect(alignStrongs('Selah.', [])).toEqual({ spans: [], unplaced: [] })
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npm test -- tests/data/strongsAlign.test.ts`
Expected: FAIL — cannot resolve `../../data/lib/strongs/align`.

- [ ] **Step 3: Implement `data/lib/strongs/align.ts`**

```ts
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
```

- [ ] **Step 4: Run them to verify they pass**

Run: `npm test -- tests/data/strongsAlign.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck and commit**

```bash
npm run typecheck
git add data/lib/strongs/align.ts tests/data/strongsAlign.test.ts
git commit -m "feat: place Strong's tags onto our verse text"
```

---

### Task 3: Dictionary parsers

**Files:**
- Create: `data/lib/strongs/dictionary.ts`
- Test: `tests/data/strongsDictionary.test.ts`

**Interfaces:**
- Consumes: `decodeEntities` from `data/lib/osis.ts` (existing export).
- Produces:
  - `interface DictEntry { id: string; lemma: string; xlit: string; pron: string; derivation: string; definition: string; kjvDef: string }`
  - `parseHebrewDictionary(xml: string): DictEntry[]`
  - `parseGreekDictionary(xml: string): DictEntry[]`

- [ ] **Step 1: Write the failing tests**

Create `tests/data/strongsDictionary.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { parseGreekDictionary, parseHebrewDictionary } from '../../data/lib/strongs/dictionary'

const ELOHIM = '\u05d0\u05b1\u05dc\u05b9\u05d4\u05b4\u05d9\u05dd'
const ELOAH = '\u05d0\u05b1\u05dc\u05d5\u05b9\u05d4\u05b7\u05bc'
const AGAPE = '\u1f00\u03b3\u03ac\u03c0\u03b7'

const HEBREW = `<osis><osisText>
      <div type="entry" n="430">
        <w gloss="93c" lemma="${ELOHIM}" morph="n-m" POS="el-o-heem'" xlit="elohiym" ID="H430" xml:lang="heb">x</w>
        <foreign xml:lang="grc"><w gloss="G:2316" /></foreign>
        <list><item>1) (plural)</item><item>1a) rulers</item></list>
        <note type="exegesis">plural of <w lemma="${ELOAH}" POS="el-o'-ah" src="433" xlit="eloahh"/>;</note>
        <note type="explanation"><hi>gods</hi> in the ordinary sense; &amp; more</note>
        <note type="translation">angels, God (gods).</note>
        <note type="x-typo">ignore me</note>
      </div>
      <div type="entry" n="1">
        <w lemma="a" POS="awb" xlit="ab" ID="H1" xml:lang="heb">a</w>
        <note type="explanation">father</note>
      </div>
</osisText></osis>`

const GREEK = `<strongsdictionary><entries>
<entry strongs="00026">
 <strongs>26</strongs>   <greek BETA="A)GA/PH" unicode="${AGAPE}" translit="agape"/>   <pronunciation strongs="ag-ah'-pay"/>
 <strongs_derivation>from <strongsref language="GREEK" strongs="25"/>;</strongs_derivation><strongs_def> love, i.e. affection or
 benevolence</strongs_def><kjv_def>:--(feast of) charity(-ably), dear, love.</kjv_def>
<see language="GREEK" strongs="25"/>
</entry>
<entry strongs="04533">
 <strongs>4533</strongs> <greek BETA="SALMW/N" unicode="x" translit="Salmon"/>
 <strongs_derivation>of Hebrew origin (<strongsref language="HEBREW" strongs="08012"/>);</strongs_derivation><strongs_def> Salmon</strongs_def>
</entry>
</entries></strongsdictionary>`

describe('parseHebrewDictionary', () => {
  const entries = parseHebrewDictionary(HEBREW)

  it('reads each entry', () => {
    expect(entries.map(e => e.id)).toEqual(['H430', 'H1'])
    expect(entries[0]).toEqual({
      id: 'H430',
      lemma: ELOHIM,
      xlit: 'elohiym',
      pron: "el-o-heem'",
      derivation: `plural of H433 (${ELOAH});`,
      definition: 'gods in the ordinary sense; & more',
      kjvDef: 'angels, God (gods).',
    })
  })

  it('leaves missing parts empty', () => {
    expect(entries[1]).toMatchObject({ id: 'H1', derivation: '', definition: 'father', kjvDef: '' })
  })
})

describe('parseGreekDictionary', () => {
  const entries = parseGreekDictionary(GREEK)

  it('reads each entry and its cross-references', () => {
    expect(entries[0]).toEqual({
      id: 'G26',
      lemma: AGAPE,
      xlit: 'agape',
      pron: "ag-ah'-pay",
      derivation: 'from G25;',
      definition: 'love, i.e. affection or benevolence',
      kjvDef: '(feast of) charity(-ably), dear, love.',
    })
  })

  it('writes Hebrew references without leading zeros and tolerates missing parts', () => {
    expect(entries[1]).toMatchObject({ id: 'G4533', pron: '', derivation: 'of Hebrew origin (H8012);', kjvDef: '' })
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npm test -- tests/data/strongsDictionary.test.ts`
Expected: FAIL — cannot resolve `../../data/lib/strongs/dictionary`.

- [ ] **Step 3: Implement `data/lib/strongs/dictionary.ts`**

```ts
import { decodeEntities } from '../osis'

export interface DictEntry {
  id: string
  lemma: string
  xlit: string
  pron: string
  derivation: string
  definition: string
  kjvDef: string
}

const ATTR_RE = /([\w:]+)="([^"]*)"/g

function attrs(tag: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const m of tag.matchAll(ATTR_RE)) out[m[1]] = decodeEntities(m[2])
  return out
}

const clean = (s: string) =>
  decodeEntities(s.replace(/<[^>]+>/g, ''))
    .replace(/\s+/g, ' ')
    .trim()

// ---- Hebrew (OSIS: StrongHebrewG.xml) ----

const HEB_NOTE_RE = /<note type="(exegesis|explanation|translation)">([\s\S]*?)<\/note>/g

const hebText = (s: string) =>
  clean(
    s.replace(/<w\b([^>]*)\/>/g, (_m, a: string) => {
      const at = attrs(a)
      if (!at.src) return at.lemma ?? ''
      return at.lemma ? `H${Number(at.src)} (${at.lemma})` : `H${Number(at.src)}`
    }),
  )

export function parseHebrewDictionary(xml: string): DictEntry[] {
  const out: DictEntry[] = []
  for (const m of xml.matchAll(/<div type="entry"[^>]*>([\s\S]*?)<\/div>/g)) {
    const body = m[1]
    const w = /<w\b([^>]*\bID="H(\d+)"[^>]*)>/.exec(body)
    if (!w) continue
    const at = attrs(w[1])
    const notes: Record<string, string> = {}
    for (const n of body.matchAll(HEB_NOTE_RE)) notes[n[1]] = hebText(n[2])
    out.push({
      id: `H${Number(w[2])}`,
      lemma: at.lemma ?? '',
      xlit: at.xlit ?? '',
      pron: at.POS ?? '',
      derivation: notes.exegesis ?? '',
      definition: notes.explanation ?? '',
      kjvDef: notes.translation ?? '',
    })
  }
  return out
}

// ---- Greek (strongsgreek.xml) ----

const grkText = (s: string) =>
  clean(
    s
      .replace(/<strongsref\b([^>]*)\/>/g, (_m, a: string) => {
        const at = attrs(a)
        return `${at.language === 'HEBREW' ? 'H' : 'G'}${Number(at.strongs)}`
      })
      .replace(/<greek\b([^>]*)\/>/g, (_m, a: string) => attrs(a).unicode ?? '')
      .replace(/<pronunciation\b[^>]*\/>/g, ''),
  )

const part = (body: string, tag: string) => {
  const m = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`).exec(body)
  return m ? grkText(m[1]) : ''
}

export function parseGreekDictionary(xml: string): DictEntry[] {
  const out: DictEntry[] = []
  for (const m of xml.matchAll(/<entry strongs="(\d+)">([\s\S]*?)<\/entry>/g)) {
    const body = m[2]
    const g = /<greek\b([^>]*)\/>/.exec(body)
    const greek = g ? attrs(g[1]) : {}
    const p = /<pronunciation\b([^>]*)\/>/.exec(body)
    out.push({
      id: `G${Number(m[1])}`,
      lemma: greek.unicode ?? '',
      xlit: greek.translit ?? '',
      pron: p ? (attrs(p[1]).strongs ?? '') : '',
      derivation: part(body, 'strongs_derivation'),
      definition: part(body, 'strongs_def'),
      kjvDef: part(body, 'kjv_def').replace(/^:--\s*/, ''),
    })
  }
  return out
}
```

(In `part`, the `RegExp` source string must contain `\\s\\S` — two backslashes each in the `.ts` file — so the regex sees `\s\S`. Verify the bytes on disk.)

- [ ] **Step 4: Run them to verify they pass**

Run: `npm test -- tests/data/strongsDictionary.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck and commit**

```bash
npm run typecheck
git add data/lib/strongs/dictionary.ts tests/data/strongsDictionary.test.ts
git commit -m "feat: parse the public-domain Strong's Hebrew and Greek dictionaries"
```

---

### Task 4: Build the tables, the import command, and import the real data

**Files:**
- Create: `data/lib/strongs/buildStrongs.ts`, `data/import-strongs.ts`
- Modify: `package.json` (script), `README.md` (rebuilding section)
- Modify: `resources/bible.db` (regenerated by the import)
- Test: `tests/data/buildStrongs.test.ts`, `tests/data/realBible.test.ts`

**Interfaces:**
- Consumes: `Token`, `parseUsfmBook`, `usfmBookId` (Task 1); `alignStrongs` (Task 2); `DictEntry`, `parseHebrewDictionary`, `parseGreekDictionary` (Task 3); `makeFixtureBible`, `JOHN_3_16` from `tests/helpers/fixtureBible.ts`.
- Produces:
  - `interface StrongsBook { book: number; verses: Map<string, Token[]> }`
  - `interface StrongsReport { tagged: number; placed: number; topUnplaced: [string, number][]; hebrew: number; greek: number; missingEntries: string[] }`
  - `class StrongsBuildError extends Error`
  - `verseChecksum(db: Database.Database): { count: number; sha256: string }`
  - `buildStrongs(dbPath: string, books: StrongsBook[], entries: DictEntry[]): StrongsReport`
  - Tables in `resources/bible.db` (Global Constraints).

- [ ] **Step 1: Write the failing tests**

Create `tests/data/buildStrongs.test.ts`:

```ts
import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { buildStrongs, StrongsBuildError, verseChecksum, type StrongsBook } from '../../data/lib/strongs/buildStrongs'
import type { DictEntry } from '../../data/lib/strongs/dictionary'
import type { Token } from '../../data/lib/strongs/usfm'
import { JOHN_3_16, makeFixtureBible } from '../helpers/fixtureBible'

// JOHN_3_16 = 'For God so loved the world, that he gave his only begotten Son.'
const t = (word: string, strongs: string | null = null): Token => ({ word, strongs })
const JOHN: StrongsBook = {
  book: 43,
  verses: new Map([
    ['3:16', [t('For'), t('God', 'G2316'), t('so'), t('loved', 'G25'), t('the'), t('world', 'G2889')]],
    ['3:17', [t('For'), t('God', 'G2316')]],
  ]),
}
const entry = (id: string): DictEntry => ({ id, lemma: 'x', xlit: 'x', pron: '', derivation: '', definition: `def ${id}`, kjvDef: '' })
const ENTRIES = [entry('G2316'), entry('G25'), entry('H430')]

const rows = (path: string) => {
  const db = new Database(path, { readonly: true })
  try {
    return db
      .prepare('SELECT chapter, verse, start_pos AS s, end_pos AS e, strongs FROM word_strongs ORDER BY chapter, verse, start_pos')
      .all() as { chapter: number; verse: number; s: number; e: number; strongs: string }[]
  } finally {
    db.close()
  }
}

describe('buildStrongs', () => {
  it('writes placed words and dictionary entries without changing verse text', () => {
    const path = makeFixtureBible()
    const db = new Database(path)
    const before = verseChecksum(db)
    db.close()

    const report = buildStrongs(path, [JOHN], ENTRIES)

    const words = rows(path)
    expect(words.filter(w => w.verse === 16).map(w => [JOHN_3_16.slice(w.s, w.e), w.strongs])).toEqual([
      ['God', 'G2316'],
      ['loved', 'G25'],
      ['world', 'G2889'],
    ])
    expect(report).toMatchObject({ tagged: 4, placed: 4, hebrew: 1, greek: 2, missingEntries: ['G2889'] })

    const after = new Database(path, { readonly: true })
    expect(verseChecksum(after)).toEqual(before)
    expect((after.prepare('SELECT definition FROM strongs_entries WHERE id = ?').get('G25') as { definition: string }).definition).toBe('def G25')
    after.close()
  })

  it('replaces earlier rows when run again', () => {
    const path = makeFixtureBible()
    buildStrongs(path, [JOHN], ENTRIES)
    buildStrongs(path, [JOHN], ENTRIES)
    expect(rows(path)).toHaveLength(4)
  })

  it('refuses to write if verse text would change', () => {
    const path = makeFixtureBible()
    buildStrongs(path, [JOHN], ENTRIES)
    const db = new Database(path)
    db.exec("CREATE TRIGGER sabotage AFTER INSERT ON word_strongs BEGIN UPDATE verses SET text = 'changed' WHERE verse = 16; END")
    const before = verseChecksum(db)
    db.close()

    expect(() => buildStrongs(path, [JOHN], [entry('G2316')])).toThrow(StrongsBuildError)

    const after = new Database(path, { readonly: true })
    expect(verseChecksum(after)).toEqual(before)
    expect((after.prepare('SELECT count(*) AS n FROM strongs_entries').get() as { n: number }).n).toBe(3)
    after.close()
  })

  it('computes the checksum over verse text in Bible order', () => {
    const db = new Database(makeFixtureBible(), { readonly: true })
    const sum = verseChecksum(db)
    db.close()
    expect(sum.count).toBe(5)
    expect(sum.sha256).toMatch(/^[0-9a-f]{64}$/)
  })
})
```

Append to `tests/data/realBible.test.ts` (add `import { verseChecksum } from '../../data/lib/strongs/buildStrongs'` to its imports; `Database`, `existsSync`, `PATH`, `beforeAll`, `afterAll` are already in that file):

```ts
const hasStrongsTables = (() => {
  if (!existsSync(PATH)) return false
  const db = new Database(PATH, { readonly: true })
  try {
    return (db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type = 'table' AND name = 'word_strongs'").get() as { n: number }).n === 1
  } finally {
    db.close()
  }
})()

describe.skipIf(!hasStrongsTables)("resources/bible.db Strong's data", () => {
  let db: Database.Database
  beforeAll(() => {
    db = new Database(PATH, { readonly: true })
  })
  afterAll(() => db.close())

  const tagOf = (b: number, c: number, v: number, word: string) => {
    const text = (db.prepare('SELECT text FROM verses WHERE book_id = ? AND chapter = ? AND verse = ?').get(b, c, v) as { text: string }).text
    const spans = db
      .prepare('SELECT start_pos AS s, end_pos AS e, strongs FROM word_strongs WHERE book_id = ? AND chapter = ? AND verse = ?')
      .all(b, c, v) as { s: number; e: number; strongs: string }[]
    return spans.find(x => text.slice(x.s, x.e) === word)?.strongs
  }

  it('tags known words', () => {
    expect(tagOf(1, 1, 1, 'God')).toBe('H430')
    expect(tagOf(43, 3, 16, 'loved')).toBe('G25')
  })

  it('places at least 99.9% of the 361,172 tagged words', () => {
    expect((db.prepare('SELECT count(*) AS n FROM word_strongs').get() as { n: number }).n).toBeGreaterThan(360_800)
  })

  it('has a dictionary entry for every tag', () => {
    const missing = db
      .prepare('SELECT count(*) AS n FROM word_strongs w LEFT JOIN strongs_entries e ON e.id = w.strongs WHERE e.id IS NULL')
      .get() as { n: number }
    expect(missing.n).toBe(0)
    expect((db.prepare("SELECT count(*) AS n FROM strongs_entries WHERE id LIKE 'H%'").get() as { n: number }).n).toBe(8674)
    expect((db.prepare("SELECT count(*) AS n FROM strongs_entries WHERE id LIKE 'G%'").get() as { n: number }).n).toBe(5624)
  })

  it('left the verse text exactly as it was', () => {
    expect(verseChecksum(db)).toEqual({ count: 31102, sha256: 'b089fd537dd81d5ec186689dec27aa0b083e07421e3a5160f0975dc8e903970d' })
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npm test -- tests/data/buildStrongs.test.ts tests/data/realBible.test.ts`
Expected: FAIL — cannot resolve `buildStrongs`. (The real-data block is skipped until Step 6.)

- [ ] **Step 3: Implement `data/lib/strongs/buildStrongs.ts`**

```ts
import Database from 'better-sqlite3'
import { createHash } from 'node:crypto'
import { alignStrongs } from './align'
import type { DictEntry } from './dictionary'
import type { Token } from './usfm'

export interface StrongsBook {
  /** Our book id, 1-66. */
  book: number
  /** Tokens keyed "chapter:verse". */
  verses: Map<string, Token[]>
}

export interface StrongsReport {
  tagged: number
  placed: number
  topUnplaced: [string, number][]
  hebrew: number
  greek: number
  /** Strong's ids used by placed words that have no dictionary entry. */
  missingEntries: string[]
}

export class StrongsBuildError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'StrongsBuildError'
  }
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS word_strongs (
  book_id INTEGER NOT NULL,
  chapter INTEGER NOT NULL,
  verse INTEGER NOT NULL,
  start_pos INTEGER NOT NULL,
  end_pos INTEGER NOT NULL,
  strongs TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS word_strongs_verse ON word_strongs (book_id, chapter, verse);
CREATE TABLE IF NOT EXISTS strongs_entries (
  id TEXT PRIMARY KEY,
  lemma TEXT NOT NULL,
  xlit TEXT NOT NULL,
  pron TEXT NOT NULL,
  derivation TEXT NOT NULL,
  definition TEXT NOT NULL,
  kjv_def TEXT NOT NULL
);
DELETE FROM word_strongs;
DELETE FROM strongs_entries;
`

/** Verse count and SHA-256 of every verse text in Bible order, to prove the import leaves the text alone. */
export function verseChecksum(db: Database.Database): { count: number; sha256: string } {
  const hash = createHash('sha256')
  let count = 0
  const rows = db.prepare('SELECT book_id, chapter, verse, text FROM verses ORDER BY book_id, chapter, verse').raw().iterate() as Iterable<
    [number, number, number, string]
  >
  for (const [b, c, v, text] of rows) {
    hash.update(`${b}.${c}.${v}\t${text}\n`, 'utf8')
    count++
  }
  return { count, sha256: hash.digest('hex') }
}

export function buildStrongs(dbPath: string, books: StrongsBook[], entries: DictEntry[]): StrongsReport {
  const db = new Database(dbPath)
  try {
    const before = verseChecksum(db)
    const tokensByVerse = new Map<string, Token[]>()
    for (const b of books) for (const [cv, tokens] of b.verses) tokensByVerse.set(`${b.book}:${cv}`, tokens)

    const verses = db.prepare('SELECT book_id AS b, chapter AS c, verse AS v, text FROM verses').all() as {
      b: number
      c: number
      v: number
      text: string
    }[]
    const rows: [number, number, number, number, number, string][] = []
    const unplaced = new Map<string, number>()
    const used = new Set<string>()
    let tagged = 0
    for (const v of verses) {
      const tokens = tokensByVerse.get(`${v.b}:${v.c}:${v.v}`) ?? []
      tagged += tokens.filter(tk => tk.strongs).length
      const result = alignStrongs(v.text, tokens)
      for (const w of result.unplaced) unplaced.set(w, (unplaced.get(w) ?? 0) + 1)
      for (const s of result.spans) {
        rows.push([v.b, v.c, v.v, s.start, s.end, s.strongs])
        used.add(s.strongs)
      }
    }

    db.transaction(() => {
      db.exec(SCHEMA)
      const insertWord = db.prepare(
        'INSERT INTO word_strongs (book_id, chapter, verse, start_pos, end_pos, strongs) VALUES (?, ?, ?, ?, ?, ?)',
      )
      for (const r of rows) insertWord.run(...r)
      const insertEntry = db.prepare(
        'INSERT INTO strongs_entries (id, lemma, xlit, pron, derivation, definition, kjv_def) VALUES (?, ?, ?, ?, ?, ?, ?)',
      )
      for (const e of entries) insertEntry.run(e.id, e.lemma, e.xlit, e.pron, e.derivation, e.definition, e.kjvDef)
      const after = verseChecksum(db)
      if (after.count !== before.count || after.sha256 !== before.sha256) {
        throw new StrongsBuildError("Verse text changed during the Strong's import; nothing was written")
      }
    })()

    const ids = new Set(entries.map(e => e.id))
    return {
      tagged,
      placed: rows.length,
      topUnplaced: [...unplaced.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10),
      hebrew: entries.filter(e => e.id.startsWith('H')).length,
      greek: entries.filter(e => e.id.startsWith('G')).length,
      missingEntries: [...used].filter(id => !ids.has(id)).sort(),
    }
  } finally {
    db.close()
  }
}
```

- [ ] **Step 4: Run the unit tests to verify they pass**

Run: `npm test -- tests/data/buildStrongs.test.ts`
Expected: PASS.

- [ ] **Step 5: Add the import command and docs**

Create `data/import-strongs.ts`:

```ts
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildStrongs, type StrongsBook } from './lib/strongs/buildStrongs'
import { parseGreekDictionary, parseHebrewDictionary } from './lib/strongs/dictionary'
import { parseUsfmBook, usfmBookId } from './lib/strongs/usfm'

const SOURCE = join(process.cwd(), 'data', 'source')
const USFM_DIR = join(SOURCE, 'eng-kjv2006_usfm')
const HEBREW = join(SOURCE, 'StrongHebrewG.xml')
const GREEK = join(SOURCE, 'strongsgreek.xml')
const DB = join(process.cwd(), 'resources', 'bible.db')

for (const path of [USFM_DIR, HEBREW, GREEK, DB]) {
  if (!existsSync(path)) {
    console.error(`Not found: ${path}`)
    process.exit(1)
  }
}

const books: StrongsBook[] = []
for (const file of readdirSync(USFM_DIR).filter(f => f.endsWith('.usfm'))) {
  const book = usfmBookId(file)
  if (book !== null) books.push({ book, verses: parseUsfmBook(readFileSync(join(USFM_DIR, file), 'utf8')) })
}
if (books.length !== 66) {
  console.error(`Expected 66 books in ${USFM_DIR}, found ${books.length}`)
  process.exit(1)
}

const entries = [...parseHebrewDictionary(readFileSync(HEBREW, 'utf8')), ...parseGreekDictionary(readFileSync(GREEK, 'utf8'))]

try {
  const r = buildStrongs(DB, books, entries)
  console.log(`Tagged words: ${r.tagged}; placed on our text: ${r.placed} (${((100 * r.placed) / r.tagged).toFixed(2)}%)`)
  console.log(`Most common unplaced: ${r.topUnplaced.map(([w, n]) => `${w} (${n})`).join(', ') || 'none'}`)
  console.log(`Dictionary entries: ${r.hebrew} Hebrew, ${r.greek} Greek`)
  if (r.missingEntries.length > 0) console.warn(`Used but missing from the dictionaries: ${r.missingEntries.join(', ')}`)
  console.log(`Wrote Strong's data to ${DB}`)
} catch (e) {
  console.error((e as Error).message)
  process.exit(1)
}
```

`package.json` — add after the `import-kjv` script:

```json
    "import-strongs": "esbuild data/import-strongs.ts --bundle --platform=node --format=cjs --external:better-sqlite3 --outfile=out/import-strongs.cjs && cross-env ELECTRON_RUN_AS_NODE=1 electron out/import-strongs.cjs",
```

`README.md` — after the "Rebuilding the Bible database" section, add:

```markdown
### Adding Strong's numbers and dictionaries

`resources/bible.db` also holds Strong's numbers for each KJV word and the Strong's Hebrew and Greek dictionaries (all public domain). To rebuild them, put these in `data/source/` and run `npm run import-strongs` (it never changes the verse text):

- `eng-kjv2006_usfm/` — unzip https://ebible.org/Scriptures/eng-kjv2006_usfm.zip
- `StrongHebrewG.xml` — https://raw.githubusercontent.com/openscriptures/strongs/master/hebrew/StrongHebrewG.xml
- `strongsgreek.xml` — from https://raw.githubusercontent.com/openscriptures/strongs/master/greek/StrongsGreekDictionaryXML_1.4.zip

Use these XML files, not Open Scriptures' JSON versions (those carry a CC-BY-SA license).
```

- [ ] **Step 6: Download the sources and run the real import**

```bash
mkdir -p data/source && cd data/source
curl -sSL -o kjv2006.zip https://ebible.org/Scriptures/eng-kjv2006_usfm.zip && unzip -o -q kjv2006.zip -d eng-kjv2006_usfm && rm kjv2006.zip
curl -sSL -o StrongHebrewG.xml https://raw.githubusercontent.com/openscriptures/strongs/master/hebrew/StrongHebrewG.xml
curl -sSL -o greek.zip https://raw.githubusercontent.com/openscriptures/strongs/master/greek/StrongsGreekDictionaryXML_1.4.zip && unzip -o -q -j greek.zip '*strongsgreek.xml' -d . && rm greek.zip
cd ../..
npm run import-strongs
```

Expected output (approximately): `Tagged words: 361172; placed on our text: 361034 (99.96%)`, `Dictionary entries: 8674 Hebrew, 5624 Greek`, no "missing" warning.

- [ ] **Step 7: Run all tests (the real-data block now runs), typecheck**

Run: `npm test` — Expected: all pass, including `resources/bible.db Strong's data` (not skipped).
Run: `npm run typecheck` — Expected: no errors.

- [ ] **Step 8: Commit (including the regenerated database)**

```bash
git add data/lib/strongs/buildStrongs.ts data/import-strongs.ts package.json README.md resources/bible.db tests/data/buildStrongs.test.ts tests/data/realBible.test.ts
git commit -m "feat: import Strong's numbers and dictionaries into bible.db"
```

---

### Task 5: Main process — spans, entries, IPC, panel setting

**Files:**
- Modify: `src/shared/types.ts`, `src/main/bibleDb.ts`, `src/shared/ipc.ts`, `src/main/ipc.ts`, `src/preload/index.ts`, `src/shared/api.ts`, `src/shared/panels.ts`, `src/main/userDb.ts`
- Modify: `docs/superpowers/specs/2026-10-05-strongs-concordance-design.md` (§5.1: `strongs` is optional — see Step 3)
- Test: `tests/main/bibleDb.test.ts`, `tests/main/userDb.test.ts`

**Interfaces:**
- Consumes: `buildStrongs`, `StrongsBook` (Task 4) — in tests only; `makeFixtureBible` helper.
- Produces:
  - `interface StrongsSpan { start: number; end: number; id: string }`
  - `interface StrongsEntry { id: string; lemma: string; xlit: string; pron: string; derivation: string; definition: string; kjvDef: string }`
  - `BibleVerse.strongs?: StrongsSpan[]` (always set by `getVerses`: `[]` when unavailable)
  - `BibleDb.hasStrongs: boolean`, `BibleDb.strongsEntry(id: string): StrongsEntry | null`
  - `ControlApi.hasStrongs(): Promise<boolean>`, `ControlApi.getStrongsEntry(id: string): Promise<StrongsEntry | null>`; IPC channels `strongs:available`, `strongs:entry`
  - `PanelName` includes `'strongs'` (settings key `strongsPanelCollapsed`)

- [ ] **Step 1: Write the failing tests**

Append to `tests/main/bibleDb.test.ts` (add imports `import { buildStrongs } from '../../data/lib/strongs/buildStrongs'` and `import type { Token } from '../../data/lib/strongs/usfm'`):

```ts
describe("BibleDb Strong's data", () => {
  const t = (word: string, strongs: string | null = null): Token => ({ word, strongs })
  const withStrongs = () => {
    const path = makeFixtureBible()
    buildStrongs(
      path,
      [{ book: 43, verses: new Map([['3:16', [t('For'), t('God', 'G2316'), t('so'), t('loved', 'G25')]]]) }],
      [{ id: 'G25', lemma: 'x', xlit: 'agapao', pron: 'ag-ap-ah-o', derivation: '', definition: 'to love', kjvDef: 'love' }],
    )
    return path
  }

  it('is unavailable without the tables, and verses carry no spans', () => {
    db = BibleDb.open(makeFixtureBible())
    expect(db.hasStrongs).toBe(false)
    expect(db.strongsEntry('G25')).toBeNull()
    expect(db.getVerses({ bookId: 43, startChapter: 3, startVerse: 16, endChapter: 3, endVerse: 16 })[0].strongs).toEqual([])
  })

  it('returns each verse with its Strong\u2019s spans in order', () => {
    db = BibleDb.open(withStrongs())
    expect(db.hasStrongs).toBe(true)
    const [v16, v17] = db.getVerses({ bookId: 43, startChapter: 3, startVerse: 16, endChapter: 3, endVerse: 17 })
    expect(v16.strongs?.map(s => [JOHN_3_16.slice(s.start, s.end), s.id])).toEqual([
      ['God', 'G2316'],
      ['loved', 'G25'],
    ])
    expect(v17.strongs).toEqual([])
  })

  it('looks up an entry', () => {
    db = BibleDb.open(withStrongs())
    expect(db.strongsEntry('G25')).toEqual({
      id: 'G25',
      lemma: 'x',
      xlit: 'agapao',
      pron: 'ag-ap-ah-o',
      derivation: '',
      definition: 'to love',
      kjvDef: 'love',
    })
    expect(db.strongsEntry('G9999')).toBeNull()
  })
})
```

Append inside `describe('UserDb panel collapse', …)` in `tests/main/userDb.test.ts`:

```ts
  it("remembers the Strong's panel separately", () => {
    const path = newPath()
    const db = open(path)
    expect(db.getPanelCollapsed('strongs')).toBe(false)
    db.setPanelCollapsed('strongs', true)
    db.close()
    opened.pop()
    const again = open(path)
    expect(again.getPanelCollapsed('strongs')).toBe(true)
    expect(again.getPanelCollapsed('settings')).toBe(false)
  })
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npm test -- tests/main/bibleDb.test.ts tests/main/userDb.test.ts`
Expected: FAIL — `hasStrongs` undefined / `'strongs'` not a panel name (typecheck errors surface at Step 4).

- [ ] **Step 3: Types and spec note**

`src/shared/types.ts` — add after `interface Span`:

```ts
/** A word in a verse's text that has a Strong's number, e.g. { start: 4, end: 7, id: 'G2316' }. */
export interface StrongsSpan {
  start: number
  end: number
  id: string
}

export interface StrongsEntry {
  id: string
  lemma: string
  xlit: string
  pron: string
  derivation: string
  definition: string
  kjvDef: string
}
```

and in `interface BibleVerse`, after `redLetter: Span[]`:

```ts
  /** Strong's-tagged words; [] when the data isn't installed. Optional so verse literals elsewhere stay valid. */
  strongs?: StrongsSpan[]
```

In the spec, §5.1, change "`BibleVerse` gains `strongs: StrongsSpan[]` (empty when unavailable)" to "`BibleVerse` gains `strongs?: StrongsSpan[]` (always set by `getVerses`, `[]` when unavailable; optional so other verse literals stay valid)".

- [ ] **Step 4: Implement `BibleDb`, IPC, and the panel name**

`src/main/bibleDb.ts`:
- Import `StrongsEntry`, `StrongsSpan` types.
- Change the constructor to `private constructor(private readonly db: Database.Database, readonly hasStrongs: boolean) {}`.
- In `open`, replace `return new BibleDb(db)` with:

```ts
      const tables = db
        .prepare("SELECT count(*) AS n FROM sqlite_master WHERE type = 'table' AND name IN ('word_strongs', 'strongs_entries')")
        .get() as { n: number }
      return new BibleDb(db, tables.n === 2)
```

- In `getVerses`, before the final `return rows.map(...)`, add:

```ts
    const strongsByVerse = new Map<number, StrongsSpan[]>()
    if (this.hasStrongs) {
      const tags = this.db
        .prepare(
          'SELECT chapter, verse, start_pos AS start, end_pos AS end, strongs AS id FROM word_strongs WHERE book_id = ? AND chapter * 1000 + verse BETWEEN ? AND ? ORDER BY chapter, verse, start_pos',
        )
        .all(span.bookId, lo, hi) as { chapter: number; verse: number; start: number; end: number; id: string }[]
      for (const t of tags) {
        const list = strongsByVerse.get(key(t.chapter, t.verse)) ?? []
        list.push({ start: t.start, end: t.end, id: t.id })
        strongsByVerse.set(key(t.chapter, t.verse), list)
      }
    }
```

and add `strongs: strongsByVerse.get(key(r.chapter, r.verse)) ?? [],` to the returned object after `redLetter: …`.

- Add the method after `getVerses`:

```ts
  strongsEntry(id: string): StrongsEntry | null {
    if (!this.hasStrongs) return null
    const row = this.db
      .prepare('SELECT id, lemma, xlit, pron, derivation, definition, kjv_def AS kjvDef FROM strongs_entries WHERE id = ?')
      .get(id) as StrongsEntry | undefined
    return row ?? null
  }
```

`src/shared/ipc.ts` — add: `hasStrongs: 'strongs:available',` and `getStrongsEntry: 'strongs:entry',`.

`src/shared/api.ts` — import `StrongsEntry` from `./types` and add to `ControlApi`:

```ts
  hasStrongs(): Promise<boolean>
  getStrongsEntry(id: string): Promise<StrongsEntry | null>
```

`src/preload/index.ts` — in `control`:

```ts
    hasStrongs: () => ipcRenderer.invoke(IPC.hasStrongs),
    getStrongsEntry: id => ipcRenderer.invoke(IPC.getStrongsEntry, id),
```

`src/main/ipc.ts` — after the `IPC.allVerses` handler:

```ts
  ipcMain.handle(IPC.hasStrongs, () => ctx.bible.hasStrongs)
  ipcMain.handle(IPC.getStrongsEntry, (_e, id: unknown) =>
    typeof id === 'string' && /^[HG]\d+$/.test(id) ? ctx.bible.strongsEntry(id) : null,
  )
```

`src/shared/panels.ts` — `PANEL_NAMES = ['settings', 'browse', 'strongs'] as const`.

`src/main/userDb.ts` — `PANEL_KEYS` gains `strongs: 'strongsPanelCollapsed'`.

- [ ] **Step 5: Run tests and typecheck**

Run: `npm test -- tests/main/bibleDb.test.ts tests/main/userDb.test.ts tests/main/loadGroups.test.ts`
Expected: PASS (`loadGroups` spreads verse fields, so `strongs` passes through unchanged).
Run: `npm run typecheck` — no errors.

- [ ] **Step 6: Commit**

```bash
git add src/shared/types.ts src/main/bibleDb.ts src/shared/ipc.ts src/main/ipc.ts src/preload/index.ts src/shared/api.ts src/shared/panels.ts src/main/userDb.ts tests/main/bibleDb.test.ts tests/main/userDb.test.ts docs/superpowers/specs/2026-10-05-strongs-concordance-design.md
git commit -m "feat: serve Strong's spans and entries from the Bible database"
```

---

### Task 6: Lookup helpers and the entry view

**Files:**
- Create: `src/shared/strongs.ts`, `src/renderer/src/control/StrongsEntryView.tsx`
- Modify: `src/renderer/src/control/selection.ts`
- Test: `tests/shared/strongs.test.ts`, `tests/renderer/strongsClick.test.tsx`, `tests/renderer/StrongsEntryView.test.tsx`

**Interfaces:**
- Consumes: `StrongsSpan`, `StrongsEntry`, `BibleVerse` (Task 5); `VerseView` (existing).
- Produces:
  - `src/shared/strongs.ts`:
    - `interface VersePoint { bookId: number; chapter: number; verse: number; offset: number }`
    - `strongsAt(spans: StrongsSpan[], offset: number): StrongsSpan | null` — `start <= offset <= end`
    - `wordAt(text: string, offset: number): { start: number; end: number; word: string } | null`
    - `type LookupTarget = { kind: 'tagged'; span: StrongsSpan; word: string } | { kind: 'untagged'; word: string } | null`
    - `lookupTarget(verses: Pick<BibleVerse, 'bookId' | 'chapter' | 'verse' | 'text' | 'strongs'>[], p: VersePoint): LookupTarget`
    - `splitStrongsRefs(text: string): ({ text: string } | { id: string })[]`
  - `selection.ts`: `pointToVerseOffset(root: HTMLElement, node: Node, offset: number): VersePoint | null`; `verseTextRange(root: HTMLElement, verseKey: string, start: number, end: number): Range | null` (`verseKey` = `"book.chapter.verse"`).
  - `StrongsEntryView({ entry, onLink }: { entry: StrongsEntry; onLink(id: string): void })`

- [ ] **Step 1: Write the failing tests**

Create `tests/shared/strongs.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { lookupTarget, splitStrongsRefs, strongsAt, wordAt } from '../../src/shared/strongs'

const TEXT = 'For God so loved the world.'
const SPANS = [
  { start: 4, end: 7, id: 'G2316' },
  { start: 11, end: 16, id: 'G25' },
]
const VERSE = { bookId: 43, chapter: 3, verse: 16, text: TEXT, strongs: SPANS }

describe('strongsAt', () => {
  it('finds the span covering an offset, including its end', () => {
    expect(strongsAt(SPANS, 4)?.id).toBe('G2316')
    expect(strongsAt(SPANS, 7)?.id).toBe('G2316')
    expect(strongsAt(SPANS, 13)?.id).toBe('G25')
    expect(strongsAt(SPANS, 9)).toBeNull()
    expect(strongsAt([], 0)).toBeNull()
  })
})

describe('wordAt', () => {
  it('finds the word around an offset', () => {
    expect(wordAt(TEXT, 18)).toEqual({ start: 17, end: 20, word: 'the' })
    expect(wordAt("the LORD's house", 6)).toEqual({ start: 4, end: 10, word: "LORD's" })
    expect(wordAt(TEXT, 26)).toEqual({ start: 21, end: 26, word: 'world' })
    expect(wordAt('a  b', 2)).toBeNull()
  })
})

describe('lookupTarget', () => {
  const at = (offset: number) => lookupTarget([VERSE], { bookId: 43, chapter: 3, verse: 16, offset })

  it('finds a tagged word', () => {
    expect(at(5)).toEqual({ kind: 'tagged', span: SPANS[0], word: 'God' })
  })

  it('reports an untagged word', () => {
    expect(at(18)).toEqual({ kind: 'untagged', word: 'the' })
  })

  it('ignores clicks off any word or in another verse', () => {
    expect(lookupTarget([VERSE], { bookId: 43, chapter: 3, verse: 17, offset: 5 })).toBeNull()
    expect(lookupTarget([{ ...VERSE, text: 'a  b', strongs: [] }], { bookId: 43, chapter: 3, verse: 16, offset: 2 })).toBeNull()
  })

  it('treats a verse without Strong\u2019s data as untagged', () => {
    expect(lookupTarget([{ ...VERSE, strongs: undefined }], { bookId: 43, chapter: 3, verse: 16, offset: 5 })).toEqual({
      kind: 'untagged',
      word: 'God',
    })
  })
})

describe('splitStrongsRefs', () => {
  it('splits out H and G numbers', () => {
    expect(splitStrongsRefs('from G1537 and H8012; see G25.')).toEqual([
      { text: 'from ' },
      { id: 'G1537' },
      { text: ' and ' },
      { id: 'H8012' },
      { text: '; see ' },
      { id: 'G25' },
      { text: '.' },
    ])
    expect(splitStrongsRefs('no refs')).toEqual([{ text: 'no refs' }])
  })
})
```

Create `tests/renderer/strongsClick.test.tsx`:

```tsx
// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { pointToVerseOffset, verseTextRange } from '../../src/renderer/src/control/selection'
import { VerseView } from '../../src/renderer/src/verse/VerseView'
import { DEFAULT_STYLES } from '../../src/shared/styles'
import type { DisplayGroup } from '../../src/shared/types'

// Red letters split the verse into two text nodes: "For God" and " so loved the world".
const groups: DisplayGroup[] = [
  {
    label: 'John 3:16',
    verses: [{ bookId: 43, chapter: 3, verse: 16, text: 'For God so loved the world', redLetter: [{ start: 0, end: 7 }], highlights: [] }],
  },
]

function setup(): HTMLElement {
  const root = document.createElement('div')
  root.innerHTML = renderToStaticMarkup(<VerseView groups={groups} styles={DEFAULT_STYLES} blank={false} />)
  document.body.replaceChildren(root)
  return root
}

const textNodes = (root: HTMLElement) => {
  const verse = root.querySelector('[data-verse-key="43.3.16"]')!
  const walker = document.createTreeWalker(verse, NodeFilter.SHOW_TEXT)
  const out: Text[] = []
  for (let n = walker.nextNode(); n; n = walker.nextNode()) out.push(n as Text)
  return out
}

describe('pointToVerseOffset', () => {
  it('maps a point in the first text node', () => {
    const root = setup()
    expect(pointToVerseOffset(root, textNodes(root)[0], 5)).toEqual({ bookId: 43, chapter: 3, verse: 16, offset: 5 })
  })

  it('counts earlier text nodes', () => {
    const root = setup()
    expect(pointToVerseOffset(root, textNodes(root)[1], 4)).toEqual({ bookId: 43, chapter: 3, verse: 16, offset: 11 })
  })

  it('ignores points outside verse text, such as the verse number', () => {
    const root = setup()
    const num = root.querySelector('.verse-num')!.firstChild!
    expect(pointToVerseOffset(root, num, 0)).toBeNull()
  })
})

describe('verseTextRange', () => {
  it('covers the given offsets across text nodes', () => {
    const root = setup()
    expect(verseTextRange(root, '43.3.16', 4, 7)?.toString()).toBe('God')
    expect(verseTextRange(root, '43.3.16', 4, 16)?.toString()).toBe('God so loved')
    expect(verseTextRange(root, '1.1.1', 0, 2)).toBeNull()
  })
})
```

Create `tests/renderer/StrongsEntryView.test.tsx`:

```tsx
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { StrongsEntryView } from '../../src/renderer/src/control/StrongsEntryView'
import type { StrongsEntry } from '../../src/shared/types'

const H430: StrongsEntry = {
  id: 'H430',
  lemma: '\u05d0\u05b1\u05dc\u05b9\u05d4\u05b4\u05d9\u05dd',
  xlit: 'elohiym',
  pron: "el-o-heem'",
  derivation: 'plural of H433;',
  definition: 'gods in the ordinary sense',
  kjvDef: 'angels, God (gods).',
}
const G26: StrongsEntry = { id: 'G26', lemma: '\u1f00\u03b3\u03ac\u03c0\u03b7', xlit: 'agape', pron: '', derivation: '', definition: 'love', kjvDef: '' }
const render = (entry: StrongsEntry) => renderToStaticMarkup(<StrongsEntryView entry={entry} onLink={() => {}} />)

describe('StrongsEntryView', () => {
  it('shows a Hebrew entry right to left with every part', () => {
    const out = render(H430)
    expect(out).toContain('lang="he"')
    expect(out).toContain('dir="rtl"')
    for (const s of ['elohiym', "el-o-heem'", 'Derivation', 'Definition', 'gods in the ordinary sense', 'KJV', 'angels, God (gods).']) {
      expect(out).toContain(s)
    }
  })

  it('turns Strong\u2019s numbers into links', () => {
    expect(render(H430)).toMatch(/<button[^>]*class="link-btn strongs-ref"[^>]*>H433<\/button>/)
  })

  it('shows a Greek entry and leaves out empty parts', () => {
    const out = render(G26)
    expect(out).toContain('lang="grc"')
    expect(out).not.toContain('dir="rtl"')
    expect(out).not.toContain('Derivation')
    expect(out).not.toContain('KJV')
    expect(out).not.toContain('()')
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npm test -- tests/shared/strongs.test.ts tests/renderer/strongsClick.test.tsx tests/renderer/StrongsEntryView.test.tsx`
Expected: FAIL — missing modules / exports.

- [ ] **Step 3: Implement `src/shared/strongs.ts`**

```ts
import type { BibleVerse, StrongsSpan } from './types'

export interface VersePoint {
  bookId: number
  chapter: number
  verse: number
  offset: number
}

/** The tagged word covering an offset; an offset right after a word's last letter still counts. */
export function strongsAt(spans: StrongsSpan[], offset: number): StrongsSpan | null {
  return spans.find(s => s.start <= offset && offset <= s.end) ?? null
}

const WORD_CHAR = /[A-Za-z\u00c0-\u024f'\u2019]/

/** The run of word characters around an offset (or ending at it), or null between words. */
export function wordAt(text: string, offset: number): { start: number; end: number; word: string } | null {
  let start = offset
  let end = offset
  while (start > 0 && WORD_CHAR.test(text[start - 1])) start--
  while (end < text.length && WORD_CHAR.test(text[end])) end++
  if (end === start) return null
  return { start, end, word: text.slice(start, end) }
}

export type LookupTarget = { kind: 'tagged'; span: StrongsSpan; word: string } | { kind: 'untagged'; word: string } | null

/** What a click at a verse offset refers to: a tagged word, an untagged word, or nothing. */
export function lookupTarget(
  verses: Pick<BibleVerse, 'bookId' | 'chapter' | 'verse' | 'text' | 'strongs'>[],
  p: VersePoint,
): LookupTarget {
  const v = verses.find(x => x.bookId === p.bookId && x.chapter === p.chapter && x.verse === p.verse)
  if (!v) return null
  const span = strongsAt(v.strongs ?? [], p.offset)
  if (span) return { kind: 'tagged', span, word: v.text.slice(span.start, span.end) }
  const w = wordAt(v.text, p.offset)
  return w ? { kind: 'untagged', word: w.word } : null
}

/** Splits text into plain parts and Strong's numbers (H123, G456) for linking. */
export function splitStrongsRefs(text: string): ({ text: string } | { id: string })[] {
  const out: ({ text: string } | { id: string })[] = []
  let pos = 0
  for (const m of text.matchAll(/\b[HG]\d+\b/g)) {
    if (m.index > pos) out.push({ text: text.slice(pos, m.index) })
    out.push({ id: m[0] })
    pos = m.index + m[0].length
  }
  if (pos < text.length || out.length === 0) out.push({ text: text.slice(pos) })
  return out
}
```

- [ ] **Step 4: Add the DOM helpers to `src/renderer/src/control/selection.ts`**

Change the type import to `import type { VerseRange } from '../../../shared/types'` plus `import type { VersePoint } from '../../../shared/strongs'`, and append:

```ts
/** The verse and character offset of a point in the verse text (e.g. a click's caret), or null outside verse text. */
export function pointToVerseOffset(root: HTMLElement, node: Node, offset: number): VersePoint | null {
  const start = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement
  const el = start?.closest<HTMLElement>('[data-verse-key]')
  if (!el || !root.contains(el)) return null
  const [bookId, chapter, verse] = (el.dataset.verseKey ?? '').split('.').map(Number)
  return { bookId, chapter, verse, offset: offsetWithin(el, node, offset) }
}

/** A DOM range over characters [start, end) of one verse's text, or null if that verse isn't shown. */
export function verseTextRange(root: HTMLElement, verseKey: string, start: number, end: number): Range | null {
  const el = root.querySelector<HTMLElement>(`[data-verse-key="${verseKey}"]`)
  if (!el) return null
  const doc = el.ownerDocument
  const walker = doc.createTreeWalker(el, NodeFilter.SHOW_TEXT)
  const range = doc.createRange()
  let pos = 0
  let started = false
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const len = n.textContent?.length ?? 0
    if (!started && start <= pos + len) {
      range.setStart(n, start - pos)
      started = true
    }
    if (started && end <= pos + len) {
      range.setEnd(n, end - pos)
      return range
    }
    pos += len
  }
  return null
}
```

- [ ] **Step 5: Implement `src/renderer/src/control/StrongsEntryView.tsx`**

```tsx
import { Fragment } from 'react'
import { splitStrongsRefs } from '../../../shared/strongs'
import type { StrongsEntry } from '../../../shared/types'

interface Props {
  entry: StrongsEntry
  onLink(id: string): void
}

function Linked({ text, onLink }: { text: string; onLink(id: string): void }) {
  return (
    <>
      {splitStrongsRefs(text).map((part, i) =>
        'id' in part ? (
          <button key={i} type="button" className="link-btn strongs-ref" onClick={() => onLink(part.id)}>
            {part.id}
          </button>
        ) : (
          <Fragment key={i}>{part.text}</Fragment>
        ),
      )}
    </>
  )
}

/** One Strong's entry. Pure (no state or IPC) so the display window can reuse it later. */
export function StrongsEntryView({ entry, onLink }: Props) {
  const hebrew = entry.id.startsWith('H')
  const field = (label: string, text: string) =>
    text && (
      <p className="strongs-entry__field">
        <span className="strongs-entry__label">{label}</span> <Linked text={text} onLink={onLink} />
      </p>
    )
  return (
    <div className="strongs-entry">
      <div className="strongs-entry__head">
        <span className="strongs-entry__lemma" lang={hebrew ? 'he' : 'grc'} dir={hebrew ? 'rtl' : undefined}>
          {entry.lemma}
        </span>{' '}
        <span className="strongs-entry__xlit">{entry.xlit}</span>
        {entry.pron && <span className="strongs-entry__pron"> ({entry.pron})</span>}
      </div>
      {field('Derivation', entry.derivation)}
      {field('Definition', entry.definition)}
      {field('KJV', entry.kjvDef)}
    </div>
  )
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm test -- tests/shared/strongs.test.ts tests/renderer/strongsClick.test.tsx tests/renderer/StrongsEntryView.test.tsx tests/renderer/selection.test.tsx`
Expected: PASS.

- [ ] **Step 7: Typecheck and commit**

```bash
npm run typecheck
git add src/shared/strongs.ts src/renderer/src/control/selection.ts src/renderer/src/control/StrongsEntryView.tsx tests/shared/strongs.test.ts tests/renderer/strongsClick.test.tsx tests/renderer/StrongsEntryView.test.tsx
git commit -m "feat: Strong's lookup helpers and entry view"
```

---

### Task 7: Strong's panel and its state

**Files:**
- Create: `src/renderer/src/control/strongsState.ts`, `src/renderer/src/control/StrongsPanel.tsx`
- Test: `tests/renderer/StrongsPanel.test.tsx`

**Interfaces:**
- Consumes: `StrongsEntry` (Task 5); `StrongsEntryView` (Task 6).
- Produces:
  - `strongsState.ts`:
    - `type StrongsView = { kind: 'empty' } | { kind: 'unavailable' } | { kind: 'untagged'; word: string } | { kind: 'missing'; id: string } | { kind: 'entry'; entry: StrongsEntry; context: string | null }`
    - `interface StrongsState { view: StrongsView; back: StrongsView[] }`
    - `INITIAL_STRONGS: StrongsState`
    - `showLookup(view: StrongsView): StrongsState` — from a preview click; clears Back.
    - `followLink(state: StrongsState, view: StrongsView): StrongsState` — pushes the current view; no change if the same entry id is already shown.
    - `goBack(state: StrongsState): StrongsState`
  - `StrongsPanel(props: { state: StrongsState; collapsed: boolean; onToggle(): void; onLink(id: string): void; onBack(): void })`

- [ ] **Step 1: Write the failing tests**

Create `tests/renderer/StrongsPanel.test.tsx`:

```tsx
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { StrongsPanel } from '../../src/renderer/src/control/StrongsPanel'
import {
  followLink,
  goBack,
  INITIAL_STRONGS,
  showLookup,
  type StrongsState,
  type StrongsView,
} from '../../src/renderer/src/control/strongsState'
import type { StrongsEntry } from '../../src/shared/types'

const entry = (id: string): StrongsEntry => ({ id, lemma: 'x', xlit: `x${id}`, pron: '', derivation: '', definition: `def ${id}`, kjvDef: '' })
const view = (id: string, context: string | null = null): StrongsView => ({ kind: 'entry', entry: entry(id), context })
const noop = () => {}
const render = (state: StrongsState, collapsed = false) =>
  renderToStaticMarkup(<StrongsPanel state={state} collapsed={collapsed} onToggle={noop} onLink={noop} onBack={noop} />)

describe('strongsState', () => {
  it('starts empty', () => {
    expect(INITIAL_STRONGS).toEqual({ view: { kind: 'empty' }, back: [] })
  })

  it('a lookup clears the history', () => {
    const s = followLink(showLookup(view('H430')), view('H433'))
    expect(showLookup(view('G25'))).toEqual({ view: view('G25'), back: [] })
    expect(s.back).toHaveLength(1)
  })

  it('following links builds history and Back walks it', () => {
    const a = showLookup(view('H430', '"God" in Genesis 1:1'))
    const b = followLink(a, view('H433'))
    const c = followLink(b, view('H410'))
    expect(c.back.map(v => (v.kind === 'entry' ? v.entry.id : v.kind))).toEqual(['H430', 'H433'])
    expect(goBack(c)).toEqual(b)
    expect(goBack(goBack(c))).toEqual(a)
    expect(goBack(a)).toEqual(a)
  })

  it('following a link to the entry already shown changes nothing', () => {
    const a = showLookup(view('H430'))
    expect(followLink(a, view('H430'))).toBe(a)
  })
})

describe('StrongsPanel', () => {
  it('invites a click before any lookup', () => {
    expect(render(INITIAL_STRONGS)).toContain("Click a word in the preview to see its Strong&#x27;s entry.")
  })

  it('shows the messages', () => {
    expect(render(showLookup({ kind: 'untagged', word: 'the' }))).toContain('No Strong&#x27;s number for &#x27;the&#x27;.')
    expect(render(showLookup({ kind: 'missing', id: 'H9999' }))).toContain('No entry for H9999.')
    expect(render(showLookup({ kind: 'unavailable' }))).toContain('Strong&#x27;s data not installed')
  })

  it('shows an entry with its header and context', () => {
    const out = render(showLookup(view('H430', '"God" in Genesis 1:1')))
    expect(out).toContain('H430')
    expect(out).toContain('Hebrew')
    expect(out).toContain('&quot;God&quot; in Genesis 1:1')
    expect(out).toContain('def H430')
    expect(out).not.toContain('>Back<')
  })

  it('offers Back after following a link', () => {
    const out = render(followLink(showLookup(view('H430')), view('G25')))
    expect(out).toContain('>Back<')
    expect(out).toContain('Greek')
  })

  it('collapses to its bar', () => {
    const out = render(showLookup(view('H430')), true)
    expect(out).toContain('strongs-panel--collapsed')
    expect(out).not.toContain('def H430')
    expect(out).toContain('aria-expanded="false"')
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npm test -- tests/renderer/StrongsPanel.test.tsx`
Expected: FAIL — missing modules.

- [ ] **Step 3: Implement `src/renderer/src/control/strongsState.ts`**

```ts
import type { StrongsEntry } from '../../../shared/types'

export type StrongsView =
  | { kind: 'empty' }
  | { kind: 'unavailable' }
  | { kind: 'untagged'; word: string }
  | { kind: 'missing'; id: string }
  | { kind: 'entry'; entry: StrongsEntry; context: string | null }

export interface StrongsState {
  view: StrongsView
  back: StrongsView[]
}

export const INITIAL_STRONGS: StrongsState = { view: { kind: 'empty' }, back: [] }

/** A lookup from the preview starts a fresh history. */
export const showLookup = (view: StrongsView): StrongsState => ({ view, back: [] })

/** Following a cross-reference keeps the current view for Back. */
export function followLink(state: StrongsState, view: StrongsView): StrongsState {
  const cur = state.view
  if (cur.kind === 'entry' && view.kind === 'entry' && cur.entry.id === view.entry.id) return state
  return { view, back: [...state.back, cur] }
}

export function goBack(state: StrongsState): StrongsState {
  if (state.back.length === 0) return state
  return { view: state.back[state.back.length - 1], back: state.back.slice(0, -1) }
}
```

- [ ] **Step 4: Implement `src/renderer/src/control/StrongsPanel.tsx`**

```tsx
import type { StrongsState } from './strongsState'
import { StrongsEntryView } from './StrongsEntryView'

interface Props {
  state: StrongsState
  collapsed: boolean
  onToggle(): void
  onLink(id: string): void
  onBack(): void
}

const DOT = '\u00b7'
const OPEN = '\u25be'
const CLOSED = '\u25b4'

function body(state: StrongsState, onLink: (id: string) => void) {
  const v = state.view
  switch (v.kind) {
    case 'empty':
      return <p className="muted">Click a word in the preview to see its Strong&apos;s entry.</p>
    case 'unavailable':
      return <p className="muted">Strong&apos;s data not installed {'\u2014'} run npm run import-strongs.</p>
    case 'untagged':
      return <p className="muted">{`No Strong's number for '${v.word}'.`}</p>
    case 'missing':
      return <p className="muted">{`No entry for ${v.id}.`}</p>
    case 'entry':
      return <StrongsEntryView entry={v.entry} onLink={onLink} />
  }
}

export function StrongsPanel({ state, collapsed, onToggle, onLink, onBack }: Props) {
  const v = state.view
  return (
    <section className={`strongs-panel${collapsed ? ' strongs-panel--collapsed' : ''}`}>
      <div className="strongs-panel__bar">
        <button
          type="button"
          className="link-btn strongs-panel__toggle"
          aria-expanded={!collapsed}
          title={collapsed ? "Show Strong's" : "Hide Strong's"}
          onClick={onToggle}
        >
          {collapsed ? CLOSED : OPEN} Strong&apos;s
        </button>
        {!collapsed && v.kind === 'entry' && (
          <span className="strongs-panel__title">
            {`${v.entry.id} ${DOT} ${v.entry.id.startsWith('H') ? 'Hebrew' : 'Greek'}`}
            {v.context && ` ${DOT} ${v.context}`}
          </span>
        )}
        {!collapsed && state.back.length > 0 && (
          <button type="button" className="btn strongs-panel__back" onClick={onBack}>
            Back
          </button>
        )}
      </div>
      {!collapsed && <div className="strongs-panel__body">{body(state, onLink)}</div>}
    </section>
  )
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test -- tests/renderer/StrongsPanel.test.tsx`
Expected: PASS.

- [ ] **Step 6: Typecheck and commit**

```bash
npm run typecheck
git add src/renderer/src/control/strongsState.ts src/renderer/src/control/StrongsPanel.tsx tests/renderer/StrongsPanel.test.tsx
git commit -m "feat: Strong's panel with history"
```

---

### Task 8: Wire lookups into the preview and control window

**Files:**
- Modify: `src/renderer/src/control/PreviewPanel.tsx`, `src/renderer/src/control/ControlScreen.tsx`, `src/renderer/src/control/control.css`, `src/renderer/src/control/HelpPanel.tsx`, `README.md`
- Test: `tests/renderer/HelpPanel.test.tsx`

**Interfaces:**
- Consumes: `pointToVerseOffset`, `verseTextRange` (Task 6); `lookupTarget`, `VersePoint` (Task 6); `StrongsPanel`, `INITIAL_STRONGS`, `showLookup`, `followLink`, `goBack`, `StrongsState`, `StrongsView` (Task 7); `api().hasStrongs()`, `api().getStrongsEntry(id)`, panel `'strongs'` (Task 5); `bookById` from `src/shared/books.ts`.
- Produces: `PreviewPanel` props `strongsEnabled: boolean`, `strongsMark: VerseRange | null`, `onLookup(p: VersePoint): void`.

- [ ] **Step 1: Write the failing test**

In `tests/renderer/HelpPanel.test.tsx`, add inside `describe('HelpPanel', …)`:

```tsx
  it("explains Strong's lookups", () => {
    const out = renderToStaticMarkup(<HelpPanel version="1.2.3" onClose={() => {}} />)
    expect(out).toContain('Strong&#x27;s')
    expect(out).toContain('Click a word in the live preview')
  })
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- tests/renderer/HelpPanel.test.tsx`
Expected: FAIL.

- [ ] **Step 3: PreviewPanel — click to look up, hover and current marks**

In `src/renderer/src/control/PreviewPanel.tsx`:

Imports — add `import type { VersePoint } from '../../../shared/strongs'`, change the selection import to `import { pointToVerseOffset, selectionToRanges, verseTextRange } from './selection'`, and add `lookupTarget` from `'../../../shared/strongs'`.

Props — add to `interface Props` and the destructuring:

```ts
  /** Strong's data is installed: words can be looked up and hovered. */
  strongsEnabled: boolean
  /** The looked-up word to tint, if any. */
  strongsMark: VerseRange | null
  onLookup(p: VersePoint): void
```

Module-level helpers (above `export function PreviewPanel`):

```ts
type HighlightRegistryLike = { set(name: string, h: unknown): void; delete(name: string): void }
const highlights = (): HighlightRegistryLike | null =>
  typeof CSS !== 'undefined' && 'highlights' in CSS ? (CSS as unknown as { highlights: HighlightRegistryLike }).highlights : null

function setHighlight(name: string, range: Range | null) {
  const reg = highlights()
  if (!reg || typeof Highlight === 'undefined') return
  if (range) reg.set(name, new Highlight(range))
  else reg.delete(name)
}

/** The text node and offset under a screen point. */
function caretAt(x: number, y: number): { node: Node; offset: number } | null {
  const doc = document as Document & {
    caretPositionFromPoint?(x: number, y: number): { offsetNode: Node; offset: number } | null
    caretRangeFromPoint?(x: number, y: number): Range | null
  }
  const p = doc.caretPositionFromPoint?.(x, y)
  if (p) return { node: p.offsetNode, offset: p.offset }
  const r = doc.caretRangeFromPoint?.(x, y)
  return r ? { node: r.startContainer, offset: r.startOffset } : null
}
```

Inside the component, after the existing effects:

```ts
  const verses = groups.flatMap(g => g.verses)

  // Tint the looked-up word in the preview (never on the display).
  useEffect(() => {
    if (!viewport.current || !strongsMark) {
      setHighlight('strongs-current', null)
      return
    }
    const m = strongsMark
    setHighlight('strongs-current', verseTextRange(viewport.current, `${m.bookId}.${m.chapter}.${m.verse}`, m.start, m.end))
  }, [strongsMark, groups])

  useEffect(() => () => {
    setHighlight('strongs-hover', null)
    setHighlight('strongs-current', null)
  }, [])

  const pointAt = (x: number, y: number): VersePoint | null => {
    const c = viewport.current ? caretAt(x, y) : null
    return c && viewport.current ? pointToVerseOffset(viewport.current, c.node, c.offset) : null
  }

  const handleMouseMove = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (!strongsEnabled || !viewport.current) return
    const p = pointAt(e.clientX, e.clientY)
    const target = p ? lookupTarget(verses, p) : null
    if (p && target?.kind === 'tagged') {
      setHighlight('strongs-hover', verseTextRange(viewport.current, `${p.bookId}.${p.chapter}.${p.verse}`, target.span.start, target.span.end))
      viewport.current.style.cursor = 'pointer'
    } else {
      setHighlight('strongs-hover', null)
      viewport.current.style.cursor = ''
    }
  }
```

Change `handleMouseUp` to take the event and look up on a plain click:

```ts
  const handleMouseUp = (e: ReactMouseEvent<HTMLDivElement>) => {
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed || !viewport.current) {
      onSelect([])
      setAnchor(null)
      // A click (no text dragged) looks up the word under the pointer.
      if (e.button === 0) {
        const p = pointAt(e.clientX, e.clientY)
        if (p) onLookup(p)
      }
      return
    }
```

(the rest of `handleMouseUp` is unchanged). On the viewport `<div>`, add `onMouseMove={handleMouseMove}` and `onMouseLeave={() => setHighlight('strongs-hover', null)}`.

- [ ] **Step 4: ControlScreen — state, lookup, panel**

In `src/renderer/src/control/ControlScreen.tsx`:

Imports — add:

```ts
import { bookById } from '../../../shared/books'
import { lookupTarget, type VersePoint } from '../../../shared/strongs'
import { StrongsPanel } from './StrongsPanel'
import { followLink, goBack, INITIAL_STRONGS, showLookup, type StrongsState, type StrongsView } from './strongsState'
```

State — add after `browseJump`:

```ts
  const [strongsAvailable, setStrongsAvailable] = useState(false)
  const [strongs, setStrongs] = useState<StrongsState>(INITIAL_STRONGS)
  const [strongsCollapsed, setStrongsCollapsed] = useState(false)
  const [strongsMark, setStrongsMark] = useState<VerseRange | null>(null)
```

Mount effect — add:

```ts
    void a.hasStrongs().then(setStrongsAvailable)
    void a.getPanelCollapsed('strongs').then(setStrongsCollapsed)
```

Add an effect after the mount effect:

```ts
  // New verses on screen: the looked-up word is no longer shown.
  useEffect(() => setStrongsMark(null), [groups])
```

Add functions after `toggleBrowse`:

```ts
  const setStrongsPanel = (collapsed: boolean) => {
    setStrongsCollapsed(collapsed)
    void api().setPanelCollapsed('strongs', collapsed)
  }

  const entryView = async (id: string, context: string | null): Promise<StrongsView> => {
    const entry = await api().getStrongsEntry(id)
    return entry ? { kind: 'entry', entry, context } : { kind: 'missing', id }
  }

  // A click on a word in the live preview.
  const lookupWord = async (p: VersePoint) => {
    const verses = groups.flatMap(g => g.verses)
    const target = lookupTarget(verses, p)
    if (!target) return
    if (strongsCollapsed) setStrongsPanel(false)
    if (!strongsAvailable) {
      setStrongs(showLookup({ kind: 'unavailable' }))
      return
    }
    if (target.kind === 'untagged') {
      setStrongsMark(null)
      setStrongs(showLookup({ kind: 'untagged', word: target.word }))
      return
    }
    const where = `${bookById(p.bookId).name} ${p.chapter}:${p.verse}`
    setStrongs(showLookup(await entryView(target.span.id, `"${target.word}" in ${where}`)))
    setStrongsMark({ bookId: p.bookId, chapter: p.chapter, verse: p.verse, start: target.span.start, end: target.span.end })
  }

  const followStrongsLink = async (id: string) => {
    const next = await entryView(id, null)
    setStrongs(s => followLink(s, next))
  }
```

`PreviewPanel` — add props:

```tsx
              strongsEnabled={strongsAvailable}
              strongsMark={strongsMark}
              onLookup={p => void lookupWord(p)}
```

Inside `<main className="panel panel--middle">`, after the `{styles && (<PreviewPanel … />)}` block, add:

```tsx
          <StrongsPanel
            state={strongs}
            collapsed={strongsCollapsed}
            onToggle={() => setStrongsPanel(!strongsCollapsed)}
            onLink={id => void followStrongsLink(id)}
            onBack={() => setStrongs(goBack)}
          />
```

- [ ] **Step 5: Styles — append to `control.css`**

```css
.strongs-panel {
  flex: none;
  height: 200px;
  display: flex;
  flex-direction: column;
  margin-top: 8px;
  border-top: 1px solid var(--border);
  min-height: 0;
}

.strongs-panel--collapsed {
  height: auto;
}

.strongs-panel__bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 0;
  font-size: 12px;
}

.strongs-panel__toggle {
  font-weight: 600;
  color: var(--muted);
}

.strongs-panel__title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.strongs-panel__back {
  padding: 1px 8px;
}

.strongs-panel__body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  font-size: 13px;
  line-height: 1.45;
}

.strongs-entry__lemma {
  font-size: 22px;
}

.strongs-entry__xlit {
  font-style: italic;
}

.strongs-entry__label {
  font-weight: 600;
  color: var(--muted);
}

.strongs-entry__field {
  margin: 4px 0;
}

.strongs-ref {
  padding: 0 2px;
}

::highlight(strongs-hover) {
  text-decoration: underline dotted;
}

::highlight(strongs-current) {
  background-color: rgba(255, 214, 0, 0.35);
}
```

- [ ] **Step 6: Document it**

`src/renderer/src/control/HelpPanel.tsx` — add a section after "Highlight words":

```tsx
        <h3>Strong&apos;s concordance</h3>
        <p>
          Click a word in the live preview to see its Strong&apos;s Hebrew or Greek entry in the panel under the preview
          (the original word, pronunciation, derivation, definition, and KJV renderings). Click a number such as H430 in an
          entry to open it; Back returns. Dragging across words still selects them for highlighting. The arrow on the
          panel&apos;s bar hides or shows it. Nothing appears on the display.
        </p>
```

`README.md` — after the Browse bullet:

```markdown
- Strong's: click a word in the live preview to see its Strong's Hebrew or Greek entry in the panel under the preview; click H/G numbers in an entry to follow them, and **Back** to return. Dragging still selects words for highlighting. Nothing is shown on the display.
```

- [ ] **Step 7: Run all tests, typecheck, build**

Run: `npm test` — all pass. Run: `npm run typecheck` — clean. Run: `npm run build` — succeeds.

- [ ] **Step 8: Manual check (`npm run dev`)**

1. Show `gen 1:1`. Hover "God": dotted underline and pointer cursor; hover "the": nothing.
2. Click "God": the panel shows `H430 · Hebrew · "God" in Genesis 1:1`, the Hebrew word right to left, and the definition; "God" is tinted in the preview only (check the projector).
3. Click a number in the derivation: that entry opens with **Back**; Back returns.
4. Click "the": "No Strong's number for 'the'."
5. Drag across words: the highlight toolbar appears; no lookup.
6. Collapse the panel with its arrow; click a word: it reopens. Restart the app: the collapsed state is remembered.
7. Show `jn 3:16`, click "loved": `G25 · Greek`.

- [ ] **Step 9: Commit**

```bash
git add src/renderer/src/control/PreviewPanel.tsx src/renderer/src/control/ControlScreen.tsx src/renderer/src/control/control.css src/renderer/src/control/HelpPanel.tsx README.md tests/renderer/HelpPanel.test.tsx
git commit -m "feat: click a word in the preview to see its Strong's entry"
```
