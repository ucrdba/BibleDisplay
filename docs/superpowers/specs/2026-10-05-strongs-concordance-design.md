# Strong's Concordance — Design Spec

**Date:** 2026-10-05
**Status:** Approved in brainstorming; awaiting written-spec review

## 1. Purpose

Let the operator click a word in the live preview and read its Strong's Hebrew/Greek dictionary
entry in a panel under the preview — a study aid in the control window. The projector is not
affected (a later "show on display" feature is anticipated, not built).

## 2. Scope

**In scope**
- A one-time import that adds Strong's numbers for each KJV word, and the Strong's Hebrew and
  Greek dictionaries, to `resources/bible.db` without changing any verse text.
- Click-to-look-up in the live preview; hover underline and a tint on the looked-up word (preview
  only).
- A collapsible Strong's panel under the live preview showing the entry, with clickable
  cross-references and Back.

**Out of scope**
- Showing entries on the projector (kept possible: §5.4).
- Occurrence lists ("where else is H430 used").
- Lookups from the display window, the Browse picker, or search results.
- Morphology, interlinear text, or any other lexicon.

## 3. Data sources and licensing

Established by a spike (2026-10-05):

| Data | Source | Rights |
|---|---|---|
| KJV with Strong's numbers per word | eBible.org `eng-kjv2006_usfm.zip` (from CrossWire) | Public Domain (eBible copyright page) |
| Hebrew dictionary (8,674 entries) | Open Scriptures `hebrew/StrongHebrewG.xml` | `<rights>Public Domain</rights>` |
| Greek dictionary (5,624 entries) | Open Scriptures `greek/StrongsGreekDictionaryXML_1.4.zip` → `strongsgreek.xml` (Ulrik Petersen) | "Public Domain -- Copy Freely" |

- Open Scriptures' **JSON** dictionaries are labeled CC-BY-SA and must **not** be used.
- Spike measurements: all 31,102 verses present; 30,486 verse texts identical to ours, the rest
  differing only by edition spelling (Beth-el/Bethel, Cæsar/Caesar, LORD's/LORD'S, can not/cannot);
  361,172 tagged words, 361,034 (99.96%) placeable on our text; 14,057 distinct Strong's numbers
  used, all present in the dictionaries; one number per tag; no letter suffixes.
- Source files are downloaded by hand into `data/source/` (git-ignored), like the existing KJV
  OSIS source. The README documents the URLs.

## 4. Import

### 4.1 Command

`npm run import-strongs` — bundled with esbuild and run under Electron's Node exactly like
`import-kjv`:

```
"import-strongs": "esbuild data/import-strongs.ts --bundle --platform=node --format=cjs --external:better-sqlite3 --outfile=out/import-strongs.cjs && cross-env ELECTRON_RUN_AS_NODE=1 electron out/import-strongs.cjs"
```

Inputs: `data/source/eng-kjv2006_usfm.zip` (or an unzipped `data/source/eng-kjv2006_usfm/`
folder), `data/source/StrongHebrewG.xml`, `data/source/strongsgreek.xml`. Output: modifies
`resources/bible.db` in place.

### 4.2 Steps

1. Open `resources/bible.db` read-write; read all `verses` rows (never written).
2. Parse each USFM book into verses of **tokens**: `{ word: string, strongs: string | null }`.
   - `\w text|strong="H0430"\w*` (and `\+w`): every word inside `text` gets that number.
   - Footnotes/cross-refs (`\f … \f*`, `\x … \x*`) are dropped; other character markers
     (`\add`, `\wj`, `\nd`, …) are removed keeping their text; paragraph/section markers and
     the pilcrow `¶` are ignored; headings (`\s`, `\d`, `\ms`, `\mt`, `\h`, `\toc*`, `\id`,
     `\ide`, `\rem`) are skipped.
   - Book order follows the file prefix numbers (02–40 OT, 70–96 NT) mapped to our book ids 1–66.
3. **Align** each verse's tokens onto our verse text:
   - Our words: maximal runs of letters, apostrophes (`'` `’`) and hyphens, with their
     `[start, end)` character offsets.
   - Normalize both sides for comparison: Unicode NFKD, `æ→ae`, lower-case, keep only `a–z`.
   - Pair words with a longest-common-subsequence diff; an `equal` run pairs one-to-one; a
     `replace` run with the same word count on both sides pairs one-to-one; other runs are left
     unplaced.
   - Each placed tagged token yields a span `{ start, end, strongs }` on **our** text.
4. Parse dictionaries into entries (§4.4).
5. In one transaction, drop and recreate the Strong's tables (§4.3) and insert all rows.
6. Safety: before and after, compute the verse count and a SHA-256 of all verse texts in
   canonical order; if they differ, roll back and exit non-zero.
7. Print a report: tagged tokens, placed, unplaced (with the 10 most common unplaced words),
   entries per language, and any used numbers missing from the dictionaries.

### 4.3 Tables

```sql
CREATE TABLE word_strongs (
  book_id INTEGER NOT NULL,
  chapter INTEGER NOT NULL,
  verse INTEGER NOT NULL,
  start_pos INTEGER NOT NULL,
  end_pos INTEGER NOT NULL,
  strongs TEXT NOT NULL            -- "H430", "G26": letter + number, no leading zeros
);
CREATE INDEX word_strongs_verse ON word_strongs (book_id, chapter, verse);

CREATE TABLE strongs_entries (
  id TEXT PRIMARY KEY,             -- "H430"
  lemma TEXT NOT NULL,             -- original-language word (Hebrew or Greek script)
  xlit TEXT NOT NULL,              -- transliteration
  pron TEXT NOT NULL,              -- pronunciation ('' if none)
  derivation TEXT NOT NULL,        -- '' if none
  definition TEXT NOT NULL,
  kjv_def TEXT NOT NULL            -- KJV renderings ('' if none)
);
```

### 4.4 Dictionary parsing

- **Hebrew** (`StrongHebrewG.xml`, OSIS): one `<div type="entry">` per entry. The `<w>` with
  `ID="H…"` gives `id`, `lemma` (attribute), `xlit`, and `POS` → `pron`.
  `<note type="exegesis">` → `derivation`; `<note type="explanation">` → `definition`;
  `<note type="translation">` → `kjv_def`. Inside notes, `<w src="433" lemma="…" …/>` becomes
  `H433 (lemma)` and `<hi>` keeps its text. Ignored: the `<foreign>` Greek glosses, the numbered
  `<list>` outline (a later lexicon's, not Strong's), and `<note type="x-typo">`.
- **Greek** (`strongsgreek.xml`): one `<entry strongs="00026">`; `<greek unicode translit>` →
  `lemma`, `xlit`; `<pronunciation strongs>` → `pron`; `<strongs_derivation>` → `derivation`;
  `<strongs_def>` → `definition`; `<kjv_def>` → `kjv_def` (leading `:--` removed).
  `<strongsref language="HEBREW|GREEK" strongs="…"/>` becomes `H…` / `G…` text (no leading
  zeros); `<greek …/>` inside text becomes its `unicode` value.
- Whitespace is collapsed; ids have no leading zeros.

### 4.5 Code layout

- `data/lib/strongs/usfm.ts` — `parseUsfmBook(text): Map<"chapter:verse", Token[]>`.
- `data/lib/strongs/align.ts` — `alignStrongs(ourText, tokens): StrongsSpan[]` and word helpers.
- `data/lib/strongs/dictionary.ts` — `parseHebrewDictionary(xml)`, `parseGreekDictionary(xml)`.
- `data/lib/strongs/buildStrongs.ts` — writes the tables with the safety check; returns the report.
- `data/import-strongs.ts` — reads the source files and calls the above.

## 5. Application

### 5.1 Types and main process

- `src/shared/types.ts`: `interface StrongsSpan { start: number; end: number; id: string }`;
  `BibleVerse` gains `strongs?: StrongsSpan[]` (always set by `getVerses`, `[]` when unavailable; optional so other verse literals stay valid);
  `interface StrongsEntry { id; lemma; xlit; pron; derivation; definition; kjvDef }`.
- `src/main/bibleDb.ts`: on open, detect whether both Strong's tables exist (`hasStrongs`);
  `getVerses` adds each verse's spans (ordered by `start_pos`) when available;
  `strongsEntry(id): StrongsEntry | null`.
- IPC (`shared/ipc.ts`, `main/ipc.ts`, `preload`, `shared/api.ts`): `hasStrongs(): Promise<boolean>`,
  `getStrongsEntry(id: string): Promise<StrongsEntry | null>` (ids validated as `/^[HG]\d+$/`).
- `loadGroups` passes `strongs` through to `VerseData` unchanged (display window ignores it).

### 5.2 Looking up a word (live preview only)

- `VerseView` markup is **not** changed (the display and highlighting depend on it).
- On mouse-up in the preview with a **collapsed** selection (a click, or a drag that ends where it
  started), the preview maps the click point to `(verse, offset)` using the existing selection
  mapping (`selection.ts`; the caret position from the collapsed selection or
  `document.caretPositionFromPoint`).
- Pure helper `strongsAt(spans, offset): StrongsSpan | null` (in `src/shared/strongs.ts`) finds the
  span with `start <= offset < end` (an offset equal to a span's end, i.e. a click on the
  boundary after the last letter, also matches that span).
- Result handling: a span → open the entry; a word without a span → "No Strong's number for
  '<word>'" (the word is the letter run around the offset); a click on a verse number, heading,
  or blank area → no change.
- Dragging (non-collapsed selection) keeps today's behavior: highlight toolbar, no lookup.
- **Preview-only marking** with the CSS Custom Highlight API (`CSS.highlights`, `::highlight()`):
  - `strongs-hover`: the tagged word under the mouse — faint underline; cursor `pointer` over
    tagged words.
  - `strongs-current`: the word whose entry is shown — soft tint; cleared when the shown verses
    change.
  - If the API is unavailable, marking is skipped silently; lookups still work.

### 5.3 Strong's panel

- New `src/renderer/src/control/StrongsPanel.tsx`, placed in the middle column under the live
  preview: about 200px tall; a header bar toggles it to a thin strip (▾ / ▴). Collapsed state is
  remembered: `'strongs'` is added to `PANEL_NAMES` (settings key `strongsPanelCollapsed`,
  default expanded). A lookup while collapsed expands it.
- Header: `H430 · Hebrew · "God" in Genesis 1:1` and a **Back** button when history is non-empty.
- Body (`StrongsEntryView`, §5.4): lemma (large; Hebrew with `dir="rtl" lang="he"`, Greek with
  `lang="grc"`), transliteration, pronunciation, Derivation, Definition, KJV renderings. Every
  `H\d+` / `G\d+` in the text is a link that opens that entry and pushes the current one on the
  Back stack; looking up a word from the preview clears the Back stack. Looking up the same
  entry again does not add history.
- Messages:
  - nothing looked up yet: "Click a word in the preview to see its Strong's entry."
  - untagged word: "No Strong's number for '<word>'."
  - link to an id with no entry: "No entry for <id>."
  - data not installed (`hasStrongs()` false): "Strong's data not installed — run npm run
    import-strongs." and words are not clickable.

### 5.4 Projector later

`StrongsEntryView` is a pure component (`entry → markup`, no state, no IPC) so a future "Show on
display" can render it in the display window. Verses already carry `strongs` spans to the display.

### 5.5 Files

**New:** `data/import-strongs.ts`, `data/lib/strongs/{usfm,align,dictionary,buildStrongs}.ts`,
`src/shared/strongs.ts`, `src/renderer/src/control/StrongsPanel.tsx`,
`src/renderer/src/control/StrongsEntryView.tsx`, tests for each.

**Changed:** `package.json` (script), `src/shared/types.ts`, `src/main/bibleDb.ts`,
`src/main/loadGroups.ts` (if needed to pass `strongs`), IPC files, `src/shared/panels.ts`,
`src/main/userDb.ts` (panel key), `src/renderer/src/control/PreviewPanel.tsx` (click → lookup,
highlights), `src/renderer/src/control/ControlScreen.tsx` (panel placement and state),
`control.css`, `HelpPanel.tsx`, `README.md`, and `resources/bible.db` (regenerated by the import,
then committed).

## 6. Edge cases

| Situation | Behavior |
|---|---|
| Untagged word or one of the unplaced words | "No Strong's number for '…'"; no tint |
| Click on verse number / heading / blank | Nothing changes |
| Zero-length drag | Treated as a click |
| Same word clicked again | Panel unchanged; no duplicate history |
| Link to a missing id | "No entry for H9999." |
| Verses change (new reference, Clear) | Tint cleared; panel keeps the last entry |
| Display blanked | Lookups still work in the preview; nothing on the projector |
| `bible.db` without Strong's tables | Words not clickable; "not installed" message |
| Import would change verse text | Import rolls back and exits non-zero |

## 7. Testing

- `tests/data/strongsUsfm.test.ts`: tags, multi-word tags, `\add`/`\wj`/`\nd` removal, footnote
  removal, headings skipped, pilcrow ignored, leading-zero ids normalized.
- `tests/data/strongsAlign.test.ts`: identical text; spelling variants (Beth-el/Bethel,
  Cæsar/Caesar, LORD's/LORD'S); "can not"/"cannot" left unplaced; offsets point at the right
  letters (`ourText.slice(start, end)` is the word).
- `tests/data/strongsDictionary.test.ts`: small Hebrew and Greek XML fixtures → entries;
  cross-references become `H…`/`G…` text; `:--` stripped; ids without leading zeros.
- `tests/data/buildStrongs.test.ts`: builds into the fixture Bible; tables populated; re-running
  replaces rows; a deliberate text mismatch is refused without writing.
- `tests/data/realBible.test.ts` (skipped if tables absent): Genesis 1:1 "God" → `H430`;
  John 3:16 "loved" → `G25`; ≥ 99.9% of words placed is reflected in row count; every
  `word_strongs.strongs` has an entry; verse checksum equals a value recorded in the test.
- `tests/main/bibleDb.test.ts`: spans returned with verses; `strongsEntry`; database without the
  tables → `hasStrongs` false, spans empty.
- `tests/shared/strongs.test.ts`: `strongsAt` inside, at boundaries, between words, empty list.
- `tests/renderer/StrongsEntryView.test.tsx`: fields rendered; Hebrew `dir="rtl"`; `H…`/`G…`
  turned into links.
- `tests/renderer/StrongsPanel.test.tsx` (jsdom): messages; following a link and Back; collapsed
  panel expands on lookup.
- `tests/renderer/strongsClick.test.tsx` (jsdom): clicking inside a rendered verse's word looks up
  its id; a drag does not.
- Manual: run the import; click "God" in Genesis 1:1; follow a link and Back; drag-to-highlight
  still works; the projector shows no change.
