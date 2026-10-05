# Strong's on the Display — Design Spec

**Date:** 2026-10-05
**Status:** Approved in brainstorming; awaiting written-spec review
**Builds on:** `2026-10-05-strongs-concordance-design.md` (§5.4 anticipated this)

## 1. Purpose

Let the operator show the current Strong's entry on the projector, in a band under the verses,
with the looked-up word tinted — for teaching moments ("the word here is *ʼĕlôhîym*"). The live
preview mirrors it exactly.

## 2. Scope

**In scope**
- A remembered **Show on display** toggle on the Strong's panel bar.
- A Strong's band at the bottom of the display (and preview), styled from existing display styles.
- The looked-up word tinted on the display while its entry is shown.
- Verse scrolling confined to the verses area above the band.

**Out of scope**
- A one-off "send this entry" button; separate band style settings; clickable links on the
  projector; showing entries without verses on screen.

## 3. Behavior

### 3.1 Toggle

- A checkbox labeled **Show on display** on the Strong's panel's bar, visible whether the panel is
  expanded or collapsed. Default off. Remembered in the user database (settings key
  `strongsOnDisplay`).

### 3.2 When the band shows

The band is shown on the display (and the preview) only when **all** hold:
1. the toggle is on;
2. the Strong's panel's current view is an **entry** (not empty / unavailable / untagged / missing);
3. at least one verse group is shown;
4. the display is not blanked.

### 3.3 Tint on the display

- The looked-up word is tinted (soft yellow, same as the preview's `strongs-current`) **only when**
  the shown entry is the one looked up from the preview — i.e. the panel's Back history is empty
  and a mark exists. After following a link the band shows that entry with no tint; Back to the
  original restores the tint.
- New verses clear the mark (existing behavior), so the tint disappears; the band keeps the entry.

### 3.4 Interactions

| Situation | Result |
|---|---|
| Panel collapsed, toggle on | Band follows the toggle |
| Follow link / Back | Band follows the panel; tint per §3.3 |
| Verses change | Band stays, tint cleared, verses scroll to top (existing) |
| Clear / Esc | No verses → no band, no tint; band returns when verses are shown again |
| Blank / unblank | Everything hidden; restored on unblank |
| Very long entry | Clipped with a fade at the bottom of the band |
| Display window opened late / monitor changed | Receives the full state, band included (`ready()` returns the latest state) |

## 4. Data

- `src/shared/types.ts`:

```ts
export interface DisplayStrongs {
  entry: StrongsEntry
  /** The looked-up word to tint, or null. */
  mark: VerseRange | null
}

export interface DisplayState {
  groups: DisplayGroup[]
  blank: boolean
  /** The Strong's entry to show in a band under the verses, or null. */
  strongs: DisplayStrongs | null
}
```

  (Existing `DisplayState` literals gain `strongs: null`.)

- Pure helper (in `src/renderer/src/control/strongsState.ts`):
  `displayStrongs(state: StrongsState, onDisplay: boolean, mark: VerseRange | null): DisplayStrongs | null`
  — `null` unless `onDisplay` and `state.view.kind === 'entry'`; `mark` is passed through only when
  `state.back.length === 0`, else `null`.
- `ControlScreen` computes `displayStrongs(...)` each render (memoized) and sends
  `present({ groups, blank, strongs })` from **one effect** keyed on `[groups, blank, strongs]`,
  replacing the direct `api().present(...)` calls in `present()` and `toggleBlank`.
- The band-visibility conditions 3 and 4 (§3.2) are enforced by the layout (§5), not by the state,
  so the projector still holds the entry while blanked or cleared.
- User DB / IPC: `getStrongsOnDisplay(): boolean` / `setStrongsOnDisplay(on: boolean)` (settings key
  `strongsOnDisplay`, stored as `'true'`/`'false'`); IPC channels `strongs:get-on-display` /
  `strongs:set-on-display`; `ControlApi` and preload updated.

## 5. Layout and styling

### 5.1 `DisplayLayout`

New `src/renderer/src/verse/DisplayLayout.tsx`:

```ts
interface Props {
  groups: DisplayGroup[]
  styles: Styles
  blank: boolean
  strongs: DisplayStrongs | null
  /** The scrolling verses element (for scroll commands, scroll reporting, and the tint). */
  versesRef?: Ref<HTMLDivElement>
}
```

- Renders a full-height flex column: `div.display-layout__verses` (flex 1, `min-height: 0`,
  `overflow-y: auto`, hidden scrollbar) containing `VerseView`; then, when
  `strongs && !blank && groups.length > 0`, `div.strongs-band` (flex none, `max-height: 36%`,
  `overflow: hidden`) containing `StrongsEntryView` with `linkable={false}`.
- Used by **both** `DisplayScreen` and `PreviewPanel` in place of the bare `VerseView`.

### 5.2 Band styling (from display styles; no new settings)

- Band background: the display background lightened slightly
  (`color-mix(in srgb, <background> 90%, white)`), with a 2px top border in the heading color;
  padding about 0.6em 1em.
- Labels (`.strongs-entry__label`, the id/language line): heading color and heading font.
- Text: verse font and color; font size = `round(styles.verse.size * styles.scale * 0.6)` px.
- Lemma: 1.6em; Hebrew right-to-left (existing `StrongsEntryView` markup).
- Overflow: a bottom fade (`mask-image: linear-gradient(to bottom, black 80%, transparent)`) when
  content overflows; otherwise no fade is visible since the gradient covers empty space.
- The band's first line is `<id> · Hebrew|Greek` (via `showId`, §5.3). The panel's word context
  (`"God" in Genesis 1:1`) is **not** shown on the display — the tint shows the word.

### 5.3 `StrongsEntryView`

- New optional prop `linkable?: boolean` (default `true`). When `false`, `H…`/`G…` references
  render as plain text (`<span class="strongs-ref">`), not buttons. Still pure.
- New optional prop `showId?: boolean` (default `false`): when `true`, renders a first line
  `<id> · Hebrew|Greek` with the label class. The display band uses `showId` (the panel already
  shows the id in its bar).

### 5.4 Scrolling

- `DisplayScreen`: scroll commands, scroll-position reports, and scroll-to-top on new content target
  the verses element (`versesRef`), not the window. The outer `.display` no longer scrolls.
- `PreviewPanel`: its `scrollTop` mirroring targets the verses element inside the scaled viewport.
  Existing preview behavior (selection, highlight toolbar, Strong's click/hover) is unchanged; those
  operate on the viewport root, which still contains the verses.

### 5.5 Tint on the display

- `DisplayScreen` applies the `strongs-current` highlight (CSS Custom Highlight API) to
  `verseTextRange(versesEl, key, start, end)` for `state.strongs?.mark`, re-applied when the
  state, styles, or blank change, and cleared when the mark is null. `display.css` gains
  `::highlight(strongs-current) { background-color: rgba(255, 214, 0, 0.35); }`.
- `verseTextRange` is imported from `src/renderer/src/control/selection.ts` (renderer-only, no
  control-window dependencies).
- If `CSS.highlights` is unavailable, the tint is skipped silently.

## 6. Files

**New:** `src/renderer/src/verse/DisplayLayout.tsx`, `tests/renderer/DisplayLayout.test.tsx`.

**Changed:** `src/shared/types.ts`; `src/renderer/src/control/strongsState.ts` (`displayStrongs`);
`src/renderer/src/control/StrongsEntryView.tsx` (`linkable`, `showId`);
`src/renderer/src/control/StrongsPanel.tsx` (toggle); `src/renderer/src/control/ControlScreen.tsx`
(toggle state, single present effect); `src/renderer/src/control/PreviewPanel.tsx` (uses
`DisplayLayout`, scroll mirroring target); `src/renderer/src/display/DisplayScreen.tsx` (uses
`DisplayLayout`, scroll target, tint); `src/renderer/src/display/display.css`;
`src/renderer/src/verse/verse.css` (layout + band styles); `src/main/userDb.ts`, `src/main/ipc.ts`,
`src/shared/ipc.ts`, `src/shared/api.ts`, `src/preload/index.ts`; tests that build `DisplayState`
literals; `HelpPanel.tsx`, `README.md`.

## 7. Testing

- `tests/renderer/DisplayLayout.test.tsx` (static render): verses only when `strongs` is null; band
  with the entry when set; no band when blank or when there are no groups; band uses the heading
  color for labels and the verse font at 60% of `verse.size × scale`; ids render as plain text.
- `tests/renderer/StrongsEntryView.test.tsx`: `linkable={false}` renders `H433` as a span, not a
  button; `showId` renders `H430 · Hebrew`.
- `tests/renderer/StrongsPanel.test.tsx` (or a new state test): `displayStrongs` returns null when
  the toggle is off or the view is not an entry; returns `{ entry, mark }` with an empty Back
  stack; returns `mark: null` after following a link. The panel renders the **Show on display**
  checkbox checked/unchecked, including when collapsed.
- `tests/main/userDb.test.ts`: `strongsOnDisplay` round-trips; defaults to false.
- Manual: toggle on; click "God" in Genesis 1:1 → projector band + tint match the preview; follow a
  link (no tint), Back (tint); PgDn scrolls only the verses; Blank/unblank; Clear; A−/A+ resizes the
  band; toggle off → band gone; restart → toggle remembered.
