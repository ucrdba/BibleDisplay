# Browse Picker — Design Spec

**Date:** 2026-10-05
**Status:** Approved in brainstorming; awaiting written-spec review

## 1. Purpose

Let the operator pick verses by pointing instead of typing, e-Sword style: three lists —
**Books | Chapters | Verses** — where clicking verses shows them on the display, and Ctrl/Shift
select several exactly as Windows list selection does. Selections may span chapters and books.

## 2. Scope

**In scope**
- A new, collapsible "Browse" column in the control window with the three lists.
- Windows-style selection of verses (click, Ctrl+click, Shift+click, Ctrl+Shift+click), across
  chapters and books, shown on the display immediately, in the order picked.
- Double-click a chapter to show the whole chapter.
- The picker always mirrors what is on screen, however it got there.

**Out of scope**
- Showing verse text (or tooltips) in the picker — verse numbers only.
- Keyboard navigation inside the lists (arrow keys keep their current display-scrolling meaning).
- Multi-selecting chapters or books (double-click shows one whole chapter).
- Shift ranges that cross books.

## 3. User interface

### 3.1 Layout

- New column between the left panel and the live preview, **260px** wide, full height. Header
  "Browse". The panels grid becomes `300px 260px 1fr 300px`.
- Inside: three side-by-side scrolling lists, each with a small header — **Books** (wider),
  **Chapters**, **Verses**.
- The column collapses to a **28px** strip like the settings panel. The left-side column uses
  **«** to collapse and **»** to reopen (tooltips "Hide Browse" / "Show Browse"). The collapsed
  state is remembered (§5.4). Grid columns: Browse `28px` when collapsed; Settings `28px` when
  collapsed (existing behavior).

### 3.2 Navigating (never changes the display)

- **Books**: the 66 full book names in canonical order, with a thin divider between Malachi and
  Matthew. Clicking a book selects it as the current book and lists its chapters; for a
  one-chapter book (Obadiah, Philemon, 2 John, 3 John, Jude) chapter 1 is selected automatically.
- **Chapters**: `1 … n` for the current book. Clicking one makes it the current chapter and lists
  its verses.
- **Verses**: `1 … n` for the current chapter.
- The current book and chapter are visibly marked (as the active row).

### 3.3 Selecting verses (changes the display immediately)

Rules follow Windows list selection. The **anchor** is the last verse clicked (plain or Ctrl) in
the picker.

| Gesture | Result |
|---|---|
| Click | Show only that verse. Anchor = it. |
| Ctrl+click | Toggle that verse (add if not shown, remove if shown). Anchor = it. |
| Shift+click | Replace everything with the range anchor → clicked verse (either direction, may cross chapters). Anchor unchanged. |
| Ctrl+Shift+click | Add the range anchor → clicked verse to the current selection. Anchor unchanged. |
| Shift or Ctrl+Shift with no anchor, or anchor in a different book | Same as Ctrl+click for Ctrl+Shift; same as Click for Shift. |
| Double-click a chapter | Show that whole chapter only (as if typing `ps 23`). Anchor cleared. |

Order and joining:
- Selections keep the **order picked**. An added verse joins an existing passage it touches
  (directly before or after, including across a chapter boundary such as 3:36 → 4:1); otherwise it
  is appended at the end.
- After an add or range-add, passages of the same book that overlap or touch are merged; the
  merged passage takes the position of the earlier one.
- Removing a verse from inside a passage splits it in place (3:16-18 minus 17 → 3:16, 3:18).

### 3.4 Mirroring the screen

- Verses that are on screen are highlighted in the Verses list. Chapters and books that contain
  any on-screen verse show a small ● marker.
- When the display changes by any route other than the picker (verse box, Show, Recent,
  Imported, Search, Clear/Esc), the picker clears its anchor and **navigates** to the book and
  chapter of the first on-screen passage (if any). Picker clicks never move its navigation.
- A picker change writes the references into the verse box (e.g. `Joh 3:16-18, Joh 3:20`) and
  shows them; like the other lists, it does **not** add to Recent.

## 4. Selection model

New pure module `src/shared/pickerSelection.ts` (no React).

### 4.1 Types

```ts
interface Passage {          // same span fields as RefGroup, plus whole
  bookId: number
  startChapter: number
  startVerse: number
  endChapter: number
  endVerse: number
  whole: boolean             // a whole chapter (or chapters) as typed, e.g. "ps 23"
}
interface VerseRef { bookId: number; chapter: number; verse: number }
interface ClickMods { ctrl: boolean; shift: boolean }
```

`RefGroup` gains `whole: boolean`, set by the parser: true for chapter-only references
(`ps 23`, `ps 23-24`), false otherwise (including `1:18..`). Passages are built from the current
`refGroups`.

### 4.2 Functions

- `isSelected(passages, v): boolean`
- `selectedChapters(passages, bookId, index): Set<number>` and `selectedBooks(passages): Set<number>`
  — for the ● markers.
- `toggleVerse(passages, v, index): Passage[]` — §3.3 add/remove/join/split rules. Editing a
  `whole` passage makes it (and any split pieces) `whole: false`.
- `rangeOf(a, b, index): Passage` — same book; from the earlier verse to the later one.
- `addRange(passages, range, index): Passage[]` — append, then merge per §3.3.
- `wholeChapter(bookId, chapter, index): Passage`
- `pickerClick(passages, v, mods, anchor, index): { passages: Passage[]; anchor: VerseRef | null }`
  — the §3.3 table.
- `toReferenceText(passages): string` — every passage with its book's 3-letter code, joined by
  `, `: whole → `Psa 23` / `Psa 23-24`; same chapter → `Joh 3:16` / `Joh 3:16-18`; across
  chapters → `Joh 3:36-4:2`. Must round-trip through `parseReferences` to identical spans and
  `whole` flags.

"Touching" uses verse counts from the existing `BibleIndex`: v touches a passage if it is the
verse right after its end (end+1, or chapter+1 verse 1 when the end is the chapter's last verse)
or right before its start.

## 5. Architecture and data flow

### 5.1 Components

- `src/renderer/src/control/SidePanel.tsx` — generalized: props `side: 'left' | 'right'`,
  `collapsed`, `onToggle`, `label` (used in tooltips "Hide <label>" / "Show <label>"),
  `className`, `children`. Arrows: right side » hides / « shows (unchanged); left side « hides /
  » shows. The settings panel uses `side="right" label="settings"` so its tooltips stay
  "Hide settings" / "Show settings".
- `src/renderer/src/control/BrowsePanel.tsx` (new) — props: `index: BibleIndex | null`,
  `passages: Passage[]`, `jumpSignal: number`, `onChange(passages: Passage[]): void`. Local state:
  current book, current chapter, anchor. Renders the three lists; verse clicks call
  `pickerClick` and then `onChange`; chapter double-clicks call `onChange([wholeChapter(...)])`.
  When `jumpSignal` changes, it clears the anchor and navigates to `passages[0]` (if any).

### 5.2 ControlScreen

- Holds `browseCollapsed` (loaded/saved like the settings panel) and `browseJump` (a counter).
- `passages` are derived from `refGroups`.
- `onChange(next)`: `text = toReferenceText(next)`; set the verse box to `text`; clear errors and
  list selections; `show(text, false)`. If `next` is empty, it clears the display instead
  (`show('')` would be a no-op). Does not bump `browseJump`.
- Every other route that changes what is shown (`show` from the verse box/Show button, list
  clicks, search hits, Clear, removing a group from the Selected list) bumps `browseJump`.

### 5.3 Shared click handling

`pickerClick` lives in the shared module so the Windows rules are tested without React.
`BrowsePanel` maps DOM events to `ClickMods` (`ctrlKey || metaKey`, `shiftKey`).

### 5.4 Remembered collapse state

`getPanelCollapsed(panel)` / `setPanelCollapsed(panel, collapsed)` take
`panel: 'settings' | 'browse'` (IPC, preload, `ControlApi`, `UserDb`). Settings keys:
`'settings'` → existing key `rightPanelCollapsed` (unchanged, so saved choices survive);
`'browse'` → `browsePanelCollapsed`. Unknown panel names are rejected in the main process.
Default: expanded.

### 5.5 Files

**New:** `src/shared/pickerSelection.ts`, `src/renderer/src/control/BrowsePanel.tsx`,
`tests/shared/pickerSelection.test.ts`, `tests/renderer/BrowsePanel.test.tsx`.

**Changed:** `src/shared/types.ts` (`RefGroup.whole`), `src/shared/parser.ts` (set `whole`),
`src/renderer/src/control/SidePanel.tsx`, `src/renderer/src/control/ControlScreen.tsx`,
`src/renderer/src/control/control.css`, `src/main/userDb.ts`, `src/main/ipc.ts`,
`src/shared/ipc.ts`, `src/shared/api.ts`, `src/preload/index.ts`,
`src/renderer/src/control/HelpPanel.tsx`, `README.md`, and the existing tests that construct
`RefGroup` literals or call the panel-collapse API.

## 6. Edge cases

| Situation | Behavior |
|---|---|
| Verse counts not loaded yet | Books listed; Chapters and Verses show "Loading…". |
| Nothing on screen | Picker works normally; no highlights or markers. |
| Esc / Clear | Display empties → highlights clear, anchor cleared, navigation unchanged. |
| Shift across books | Treated as Click (Shift) / Ctrl+click (Ctrl+Shift). |
| Removing the only shown verse (Ctrl+click) | Selection becomes empty → display cleared, verse box emptied. |
| Very large selections | Allowed; the display already scrolls. |

## 7. Testing

- `tests/shared/pickerSelection.test.ts`: toggle add/remove; split in place; join before/after;
  join across a chapter boundary; merge on touch/overlap keeping the earlier position; whole
  chapter loses `whole` when edited; `rangeOf` both directions and across chapters; `addRange`
  order; every `pickerClick` row of §3.3 (including no anchor and different-book anchor);
  `selectedChapters`/`selectedBooks`; `toReferenceText` round-trip through `parseReferences`
  for whole chapters, chapter ranges, single verses, verse ranges, cross-chapter ranges, and
  numbered books (`1Jo`, `2Sa`).
- `tests/shared/parser.test.ts`: `whole` true for `ps 23`, `ps 23-24`; false for `jn 3:16`,
  `luke 1:18..`.
- `tests/renderer/BrowsePanel.test.tsx` (static render): 66 books with the OT/NT divider;
  chapters and verses for the current book/chapter; highlighted verses; ● markers; "Loading…".
- `tests/renderer/SidePanel.test.tsx`: both sides' arrows and tooltips.
- `tests/main/userDb.test.ts`: both panels round-trip; the existing `rightPanelCollapsed` value is
  read for `'settings'`.
- Manual: click / Ctrl / Shift across chapters / Ctrl+Shift; double-click Psalm 23; type
  `jn 3:16-18` → picker jumps there; Esc clears highlights; collapse Browse, restart, still
  collapsed; settings panel collapse still works.
