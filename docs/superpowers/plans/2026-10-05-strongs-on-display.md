# Strong's on the Display Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A remembered "Show on display" toggle on the Strong's panel puts the current entry in a band at the bottom of the projector (and the mirrored preview), with the looked-up word tinted.

**Architecture:** `DisplayState` gains `strongs: DisplayStrongs | null`, computed in the control window by a pure `displayStrongs()` helper and sent from one `present` effect. A shared `DisplayLayout` (scrolling verses area + optional band rendering the pure `StrongsEntryView`) replaces the bare `VerseView` in both `DisplayScreen` and `PreviewPanel`, so the preview mirrors the projector. Scrolling and the tint target the verses area.

**Tech Stack:** Electron + React 19 + TypeScript (electron-vite), better-sqlite3, Vitest (inside Electron's Node via `npm test`), CSS Custom Highlight API.

**Spec:** `docs/superpowers/specs/2026-10-05-strongs-on-display-design.md`

## Global Constraints

- The band shows only when: toggle on **and** panel view is an entry **and** at least one verse group **and** not blanked.
- Tint on the display only when the entry is the one looked up from the preview (Back history empty) and a mark exists.
- Toggle label `Show on display`; default off; remembered under settings key `strongsOnDisplay` (`'true'`/`'false'`); IPC `strongs:get-on-display` / `strongs:set-on-display`.
- Band: `max-height: 36%`; background `color-mix(in srgb, <background> 90%, white)`; 2px top border in heading color; labels in heading color and heading font; text in verse font and color at `Math.round(verse.size × scale × 0.6)` px; lemma 1.6em; bottom fade only when the content overflows.
- On the display, `H…`/`G…` references are plain text (`linkable={false}`); the band's first line is `<id> · Hebrew|Greek` (`showId`).
- Scrolling (commands, reports, scroll-to-top) targets the verses area, not the window; the preview's scroll mirroring targets the same area.
- Non-ASCII in `.ts/.tsx` as `\u` escapes inside JS strings (tooling here corrupts escapes — verify bytes). JSX text/attributes don't process escapes; use `{'·'}`. No BOM; keep each file's line endings.
- Tests: `npm test -- <path>`; `npm run typecheck` before each commit. Commit trailer `Co-Authored-By:` naming the committing model. Do **not** stage `package.json` / `package-lock.json` (the user's unrelated version bump is uncommitted in the working tree).
- **Branch:** `feat/strongs-display` from `main`.

## File Structure

| File | Responsibility |
|---|---|
| `src/shared/types.ts` | `DisplayStrongs`; `DisplayState.strongs`. |
| `src/renderer/src/control/strongsState.ts` | `displayStrongs()` (pure). |
| `src/main/userDb.ts`, IPC files | `strongsOnDisplay` setting. |
| `src/renderer/src/control/StrongsEntryView.tsx` | `linkable`, `showId` options. |
| `src/renderer/src/verse/highlights.ts` (new) | `setHighlight(name, range)` shared by preview and display. |
| `src/renderer/src/verse/DisplayLayout.tsx` (new) | Verses area + optional Strong's band; `bandStyle()`. |
| `src/renderer/src/verse/verse.css` | Layout and band styles. |
| `src/renderer/src/display/DisplayScreen.tsx`, `display.css` | Use `DisplayLayout`; scroll target; tint. |
| `src/renderer/src/control/PreviewPanel.tsx` | Use `DisplayLayout`; scroll mirroring target; shared `setHighlight`. |
| `src/renderer/src/control/StrongsPanel.tsx`, `ControlScreen.tsx` | Toggle; single `present` effect. |
| `HelpPanel.tsx`, `README.md` | Docs. |

---

### Task 1: Display state, `displayStrongs`, and the remembered toggle

**Files:**
- Modify: `src/shared/types.ts`, `src/main/ipc.ts`, `src/renderer/src/display/DisplayScreen.tsx` (initial state literal only), `src/renderer/src/control/strongsState.ts`, `src/main/userDb.ts`, `src/shared/ipc.ts`, `src/shared/api.ts`, `src/preload/index.ts`
- Test: `tests/renderer/StrongsPanel.test.tsx`, `tests/main/userDb.test.ts`

**Interfaces:**
- Produces:
  - `interface DisplayStrongs { entry: StrongsEntry; mark: VerseRange | null }`
  - `DisplayState.strongs: DisplayStrongs | null`
  - `displayStrongs(state: StrongsState, onDisplay: boolean, mark: VerseRange | null): DisplayStrongs | null`
  - `UserDb.getStrongsOnDisplay(): boolean`, `UserDb.setStrongsOnDisplay(on: boolean): void`
  - `ControlApi.getStrongsOnDisplay(): Promise<boolean>`, `ControlApi.setStrongsOnDisplay(on: boolean): Promise<void>`

- [ ] **Step 1: Write the failing tests**

In `tests/renderer/StrongsPanel.test.tsx`, add `displayStrongs` to the import from `strongsState`, and append:

```tsx
describe('displayStrongs', () => {
  const MARK = { bookId: 1, chapter: 1, verse: 1, start: 17, end: 20 }

  it('is null when the toggle is off or nothing is looked up', () => {
    expect(displayStrongs(showLookup(view('H430')), false, MARK)).toBeNull()
    expect(displayStrongs(INITIAL_STRONGS, true, MARK)).toBeNull()
    expect(displayStrongs(showLookup({ kind: 'untagged', word: 'the' }), true, null)).toBeNull()
    expect(displayStrongs(showLookup({ kind: 'missing', id: 'H9999' }), true, null)).toBeNull()
  })

  it('shows the looked-up entry with its tint', () => {
    expect(displayStrongs(showLookup(view('H430')), true, MARK)).toEqual({ entry: entry('H430'), mark: MARK })
  })

  it('drops the tint after following a link, and restores it on Back', () => {
    const followed = followLink(showLookup(view('H430')), view('H433'))
    expect(displayStrongs(followed, true, MARK)).toEqual({ entry: entry('H433'), mark: null })
    expect(displayStrongs(goBack(followed), true, MARK)).toEqual({ entry: entry('H430'), mark: MARK })
  })
})
```

In `tests/main/userDb.test.ts`, append:

```ts
describe("UserDb Strong's on display", () => {
  it('starts off and remembers the choice across reopening', () => {
    const path = newPath()
    const db = open(path)
    expect(db.getStrongsOnDisplay()).toBe(false)
    db.setStrongsOnDisplay(true)
    db.close()
    opened.pop()
    const again = open(path)
    expect(again.getStrongsOnDisplay()).toBe(true)
    again.setStrongsOnDisplay(false)
    expect(again.getStrongsOnDisplay()).toBe(false)
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npm test -- tests/renderer/StrongsPanel.test.tsx tests/main/userDb.test.ts`
Expected: FAIL — `displayStrongs` / `getStrongsOnDisplay` don't exist.

- [ ] **Step 3: Types**

`src/shared/types.ts` — add after `interface DisplayGroup` (it needs `StrongsEntry` and `VerseRange`, both already in this file):

```ts
/** A Strong's entry shown in a band under the verses on the display. */
export interface DisplayStrongs {
  entry: StrongsEntry
  /** The looked-up word to tint, or null. */
  mark: VerseRange | null
}
```

and in `interface DisplayState` add after `blank: boolean`:

```ts
  /** The Strong's entry to show in a band under the verses, or null. */
  strongs: DisplayStrongs | null
```

Update the two existing literals:
- `src/main/ipc.ts`: `let state: DisplayState = { groups: [], blank: false, strongs: null }`
- `src/renderer/src/display/DisplayScreen.tsx`: `useState<DisplayState>({ groups: [], blank: false, strongs: null })`

(`ControlScreen.tsx` also builds `DisplayState` objects in its `api().present(...)` calls; add `strongs: null` to each there for now so it typechecks — Task 4 replaces those calls.)

- [ ] **Step 4: `displayStrongs`**

`src/renderer/src/control/strongsState.ts` — change the type import to `import type { DisplayStrongs, StrongsEntry, VerseRange } from '../../../shared/types'` and append:

```ts
/**
 * What the display's Strong's band shows: the current entry when the toggle is on, tinting the
 * looked-up word only while that original entry is shown (no Back history).
 */
export function displayStrongs(state: StrongsState, onDisplay: boolean, mark: VerseRange | null): DisplayStrongs | null {
  if (!onDisplay || state.view.kind !== 'entry') return null
  return { entry: state.view.entry, mark: state.back.length === 0 ? mark : null }
}
```

- [ ] **Step 5: The remembered setting and its IPC**

`src/main/userDb.ts` — add after `setPanelCollapsed`:

```ts
  getStrongsOnDisplay(): boolean {
    const row = this.db.prepare('SELECT value FROM settings WHERE key = ?').get('strongsOnDisplay') as { value: string } | undefined
    return row?.value === 'true'
  }

  setStrongsOnDisplay(on: boolean): void {
    this.db
      .prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
      .run('strongsOnDisplay', JSON.stringify(on))
  }
```

`src/shared/ipc.ts` — add `getStrongsOnDisplay: 'strongs:get-on-display',` and `setStrongsOnDisplay: 'strongs:set-on-display',`.

`src/shared/api.ts` — in `ControlApi`, after `getStrongsEntry`:

```ts
  getStrongsOnDisplay(): Promise<boolean>
  setStrongsOnDisplay(on: boolean): Promise<void>
```

`src/preload/index.ts` — in `control`:

```ts
    getStrongsOnDisplay: () => ipcRenderer.invoke(IPC.getStrongsOnDisplay),
    setStrongsOnDisplay: on => ipcRenderer.invoke(IPC.setStrongsOnDisplay, on),
```

`src/main/ipc.ts` — after the `IPC.getStrongsEntry` handler:

```ts
  ipcMain.handle(IPC.getStrongsOnDisplay, () => ctx.user.getStrongsOnDisplay())
  ipcMain.handle(IPC.setStrongsOnDisplay, (_e, on: unknown) => ctx.user.setStrongsOnDisplay(on === true))
```

- [ ] **Step 6: Run tests and typecheck**

Run: `npm test -- tests/renderer/StrongsPanel.test.tsx tests/main/userDb.test.ts` — PASS.
Run: `npm run typecheck` — clean. Run full `npm test` — all pass.

- [ ] **Step 7: Commit**

```bash
git add src/shared/types.ts src/main/ipc.ts src/renderer/src/display/DisplayScreen.tsx src/renderer/src/control/ControlScreen.tsx src/renderer/src/control/strongsState.ts src/main/userDb.ts src/shared/ipc.ts src/shared/api.ts src/preload/index.ts tests/renderer/StrongsPanel.test.tsx tests/main/userDb.test.ts
git commit -m "feat: display state carries a Strong's entry; remembered Show on display setting"
```

---

### Task 2: `DisplayLayout` with the Strong's band

**Files:**
- Create: `src/renderer/src/verse/DisplayLayout.tsx`, `src/renderer/src/verse/highlights.ts`
- Modify: `src/renderer/src/control/StrongsEntryView.tsx`, `src/renderer/src/verse/verse.css`
- Test: `tests/renderer/DisplayLayout.test.tsx`, `tests/renderer/StrongsEntryView.test.tsx`

**Interfaces:**
- Consumes: `DisplayStrongs`, `DisplayGroup` (Task 1); `VerseView`; `fontStack`, `Styles`, `DEFAULT_STYLES` from `src/shared/styles.ts`.
- Produces:
  - `StrongsEntryView({ entry, onLink?, linkable = true, showId = false })`
  - `bandStyle(styles: Styles): CSSProperties`
  - `DisplayLayout({ groups, styles, blank, strongs, versesRef? }: { groups: DisplayGroup[]; styles: Styles; blank: boolean; strongs: DisplayStrongs | null; versesRef?: Ref<HTMLDivElement> })`
  - `setHighlight(name: string, range: Range | null): void` in `src/renderer/src/verse/highlights.ts`

- [ ] **Step 1: Write the failing tests**

In `tests/renderer/StrongsEntryView.test.tsx`, append inside `describe('StrongsEntryView', …)`:

```tsx
  it('renders references as plain text when not linkable', () => {
    const out = renderToStaticMarkup(<StrongsEntryView entry={H430} linkable={false} />)
    expect(out).toContain('<span class="strongs-ref">H433</span>')
    expect(out).not.toContain('<button')
  })

  it('can show the id and language as a first line', () => {
    expect(renderToStaticMarkup(<StrongsEntryView entry={H430} showId />)).toContain('H430 \u00b7 Hebrew')
    expect(renderToStaticMarkup(<StrongsEntryView entry={G26} showId />)).toContain('G26 \u00b7 Greek')
    expect(render(H430)).not.toContain('H430 \u00b7 Hebrew')
  })
```

Create `tests/renderer/DisplayLayout.test.tsx`:

```tsx
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { bandStyle, DisplayLayout } from '../../src/renderer/src/verse/DisplayLayout'
import { DEFAULT_STYLES } from '../../src/shared/styles'
import type { DisplayGroup, DisplayStrongs } from '../../src/shared/types'

const GROUPS: DisplayGroup[] = [
  {
    label: 'Genesis 1:1',
    verses: [{ bookId: 1, chapter: 1, verse: 1, text: 'In the beginning God created the heaven and the earth.', redLetter: [], highlights: [] }],
  },
]
const STRONGS: DisplayStrongs = {
  entry: { id: 'H430', lemma: 'x', xlit: 'elohiym', pron: "el-o-heem'", derivation: 'plural of H433;', definition: 'gods', kjvDef: 'God' },
  mark: { bookId: 1, chapter: 1, verse: 1, start: 17, end: 20 },
}
const render = (opts: { groups?: DisplayGroup[]; blank?: boolean; strongs?: DisplayStrongs | null } = {}) =>
  renderToStaticMarkup(
    <DisplayLayout groups={opts.groups ?? GROUPS} styles={DEFAULT_STYLES} blank={opts.blank ?? false} strongs={opts.strongs ?? null} />,
  )

describe('DisplayLayout', () => {
  it('shows only the verses when there is no Strong\u2019s entry', () => {
    const out = render()
    expect(out).toContain('class="display-layout__verses"')
    expect(out).toContain('Genesis 1:1')
    expect(out).not.toContain('strongs-band')
  })

  it('shows the band with the entry under the verses', () => {
    const out = render({ strongs: STRONGS })
    expect(out.indexOf('display-layout__verses')).toBeLessThan(out.indexOf('strongs-band'))
    expect(out).toContain('H430 \u00b7 Hebrew')
    expect(out).toContain('elohiym')
    expect(out).toContain('<span class="strongs-ref">H433</span>')
    expect(out).not.toContain('<button')
  })

  it('hides the band when blank or when no verses are shown', () => {
    expect(render({ strongs: STRONGS, blank: true })).not.toContain('strongs-band')
    expect(render({ strongs: STRONGS, groups: [] })).not.toContain('strongs-band')
  })
})

describe('bandStyle', () => {
  it('builds the band from the display styles', () => {
    const s = bandStyle({ ...DEFAULT_STYLES, scale: 1.5 })
    expect(s.fontSize).toBe(Math.round(DEFAULT_STYLES.verse.size * 1.5 * 0.6))
    expect(s.color).toBe(DEFAULT_STYLES.verse.color)
    expect(s.fontFamily).toContain(DEFAULT_STYLES.verse.font)
    expect(s.background).toBe(`color-mix(in srgb, ${DEFAULT_STYLES.background} 90%, white)`)
    expect(s.borderTop).toBe(`2px solid ${DEFAULT_STYLES.heading.color}`)
    expect((s as Record<string, unknown>)['--strongs-label-color']).toBe(DEFAULT_STYLES.heading.color)
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npm test -- tests/renderer/DisplayLayout.test.tsx tests/renderer/StrongsEntryView.test.tsx`
Expected: FAIL — `DisplayLayout` missing; `linkable`/`showId` unsupported.

- [ ] **Step 3: `StrongsEntryView` options**

Replace `src/renderer/src/control/StrongsEntryView.tsx` with:

```tsx
import { Fragment } from 'react'
import { splitStrongsRefs } from '../../../shared/strongs'
import type { StrongsEntry } from '../../../shared/types'

interface Props {
  entry: StrongsEntry
  onLink?(id: string): void
  /** false on the display: references render as plain text. */
  linkable?: boolean
  /** Show "<id> · Hebrew|Greek" as a first line (the display band). */
  showId?: boolean
}

const DOT = '\u00b7'

function Linked({ text, onLink, linkable }: { text: string; onLink?(id: string): void; linkable: boolean }) {
  return (
    <>
      {splitStrongsRefs(text).map((part, i) =>
        'id' in part ? (
          linkable ? (
            <button key={i} type="button" className="link-btn strongs-ref" onClick={() => onLink?.(part.id)}>
              {part.id}
            </button>
          ) : (
            <span key={i} className="strongs-ref">
              {part.id}
            </span>
          )
        ) : (
          <Fragment key={i}>{part.text}</Fragment>
        ),
      )}
    </>
  )
}

/** One Strong's entry. Pure (no state or IPC) so the display window can reuse it. */
export function StrongsEntryView({ entry, onLink, linkable = true, showId = false }: Props) {
  const hebrew = entry.id.startsWith('H')
  const field = (label: string, text: string) =>
    text && (
      <p className="strongs-entry__field">
        <span className="strongs-entry__label">{label}</span> <Linked text={text} onLink={onLink} linkable={linkable} />
      </p>
    )
  return (
    <div className="strongs-entry">
      {showId && <p className="strongs-entry__label strongs-entry__id">{`${entry.id} ${DOT} ${hebrew ? 'Hebrew' : 'Greek'}`}</p>}
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

- [ ] **Step 4: Shared highlight helper**

Create `src/renderer/src/verse/highlights.ts`:

```ts
type HighlightRegistryLike = { set(name: string, h: unknown): void; delete(name: string): void }

const registry = (): HighlightRegistryLike | null =>
  typeof CSS !== 'undefined' && 'highlights' in CSS ? (CSS as unknown as { highlights: HighlightRegistryLike }).highlights : null

/** Paints (or clears) a named CSS Custom Highlight; silently does nothing where the API is missing. */
export function setHighlight(name: string, range: Range | null): void {
  const reg = registry()
  if (!reg || typeof Highlight === 'undefined') return
  if (range) reg.set(name, new Highlight(range))
  else reg.delete(name)
}
```

- [ ] **Step 5: `DisplayLayout`**

Create `src/renderer/src/verse/DisplayLayout.tsx`:

```tsx
import { useLayoutEffect, useRef, useState, type CSSProperties, type Ref } from 'react'
import { fontStack, type Styles } from '../../../shared/styles'
import type { DisplayGroup, DisplayStrongs } from '../../../shared/types'
import { StrongsEntryView } from '../control/StrongsEntryView'
import { VerseView } from './VerseView'

interface Props {
  groups: DisplayGroup[]
  styles: Styles
  blank: boolean
  strongs: DisplayStrongs | null
  /** The scrolling verses element (scroll commands, scroll reports, the tint). */
  versesRef?: Ref<HTMLDivElement>
}

/** The Strong's band's look, taken from the display styles (no settings of its own). */
export function bandStyle(styles: Styles): CSSProperties {
  return {
    fontFamily: fontStack(styles.verse.font),
    fontSize: Math.round(styles.verse.size * styles.scale * 0.6),
    color: styles.verse.color,
    background: `color-mix(in srgb, ${styles.background} 90%, white)`,
    borderTop: `2px solid ${styles.heading.color}`,
    ['--strongs-label-color' as string]: styles.heading.color,
    ['--strongs-label-font' as string]: fontStack(styles.heading.font),
  }
}

function Band({ strongs, styles }: { strongs: DisplayStrongs; styles: Styles }) {
  const ref = useRef<HTMLDivElement>(null)
  const [overflow, setOverflow] = useState(false)
  useLayoutEffect(() => {
    const el = ref.current
    if (el) setOverflow(el.scrollHeight > el.clientHeight + 1)
  }, [strongs, styles])
  return (
    <div ref={ref} className={`strongs-band${overflow ? ' strongs-band--overflow' : ''}`} style={bandStyle(styles)}>
      <StrongsEntryView entry={strongs.entry} linkable={false} showId />
    </div>
  )
}

/** What the projector shows (and the preview mirrors): the verses, and optionally a Strong's band under them. */
export function DisplayLayout({ groups, styles, blank, strongs, versesRef }: Props) {
  const showBand = strongs !== null && !blank && groups.length > 0
  return (
    <div className="display-layout">
      <div className="display-layout__verses" ref={versesRef}>
        <VerseView groups={groups} styles={styles} blank={blank} />
      </div>
      {showBand && strongs && <Band strongs={strongs} styles={styles} />}
    </div>
  )
}
```

- [ ] **Step 6: Styles — append to `src/renderer/src/verse/verse.css`**

```css
.display-layout {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.display-layout__verses {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  scrollbar-width: none;
}

.display-layout__verses::-webkit-scrollbar {
  display: none;
}

.strongs-band {
  flex: none;
  max-height: 36%;
  overflow: hidden;
  box-sizing: border-box;
  padding: 0.6em 1em;
  line-height: 1.35;
}

.strongs-band--overflow {
  -webkit-mask-image: linear-gradient(to bottom, black 80%, transparent);
  mask-image: linear-gradient(to bottom, black 80%, transparent);
}

.strongs-band .strongs-entry__label {
  color: var(--strongs-label-color);
  font-family: var(--strongs-label-font);
  font-weight: 600;
}

.strongs-band .strongs-entry__id {
  margin: 0 0 0.2em;
}

.strongs-band .strongs-entry__lemma {
  font-size: 1.6em;
}

.strongs-band .strongs-entry__xlit {
  font-style: italic;
}

.strongs-band .strongs-entry__field {
  margin: 0.15em 0;
}
```

- [ ] **Step 7: Run tests and typecheck**

Run: `npm test -- tests/renderer/DisplayLayout.test.tsx tests/renderer/StrongsEntryView.test.tsx tests/renderer/StrongsPanel.test.tsx` — PASS.
Run: `npm run typecheck` — clean.

- [ ] **Step 8: Commit**

```bash
git add src/renderer/src/verse/DisplayLayout.tsx src/renderer/src/verse/highlights.ts src/renderer/src/verse/verse.css src/renderer/src/control/StrongsEntryView.tsx tests/renderer/DisplayLayout.test.tsx tests/renderer/StrongsEntryView.test.tsx
git commit -m "feat: display layout with a Strong's band under the verses"
```

---

### Task 3: Projector and preview use the layout

**Files:**
- Modify: `src/renderer/src/display/DisplayScreen.tsx`, `src/renderer/src/display/display.css`, `src/renderer/src/control/PreviewPanel.tsx`

**Interfaces:**
- Consumes: `DisplayLayout`, `setHighlight` (Task 2); `verseTextRange` from `src/renderer/src/control/selection.ts`; `DisplayStrongs`, `DisplayState.strongs` (Task 1).
- Produces: `PreviewPanel` prop `strongs?: DisplayStrongs | null` (defaults to `null`).

- [ ] **Step 1: DisplayScreen — verses area scrolls; tint**

In `src/renderer/src/display/DisplayScreen.tsx`:
- Replace `import { VerseView } from '../verse/VerseView'` with:

```ts
import { verseTextRange } from '../control/selection'
import { DisplayLayout } from '../verse/DisplayLayout'
import { setHighlight } from '../verse/highlights'
```

- Keep the existing `scroller` ref and all its scroll logic unchanged — it now points at the verses area instead of the window.
- Add after the scroll-to-top effect:

```ts
  // Tint the looked-up word while its Strong's entry is shown.
  useEffect(() => {
    const el = scroller.current
    const m = state.strongs?.mark
    setHighlight(
      'strongs-current',
      el && m && !state.blank ? verseTextRange(el, `${m.bookId}.${m.chapter}.${m.verse}`, m.start, m.end) : null,
    )
  }, [state, styles])
```

- Replace the returned JSX with:

```tsx
  return (
    <div className="display" style={{ background: styles.background }}>
      <DisplayLayout groups={state.groups} styles={styles} blank={state.blank} strongs={state.strongs} versesRef={scroller} />
    </div>
  )
```

`src/renderer/src/display/display.css` — replace its contents with:

```css
.display {
  height: 100vh;
  overflow: hidden;
  cursor: none;
}

::highlight(strongs-current) {
  background-color: rgba(255, 214, 0, 0.35);
}
```

- [ ] **Step 2: PreviewPanel — mirror the layout**

In `src/renderer/src/control/PreviewPanel.tsx`:
- Imports: replace `import { VerseView } from '../verse/VerseView'` with `import { DisplayLayout } from '../verse/DisplayLayout'` and `import { setHighlight } from '../verse/highlights'`; add `DisplayStrongs` to the `types` import.
- Delete the local `HighlightRegistryLike` type, `highlights()` function and `setHighlight()` function (now shared).
- Props: add to `interface Props` and the destructuring (with default):

```ts
  /** The Strong's entry the display shows in its band (mirrored here). */
  strongs?: DisplayStrongs | null
```

  destructure as `strongs = null,`.
- Add a ref after `viewport`: `const verses = useRef<HTMLDivElement>(null)`.
- Change the scroll-mirroring effect to target the verses area:

```ts
  useEffect(() => {
    if (verses.current) verses.current.scrollTop = scrollTop
  }, [scrollTop, groups, strongs])
```

- In the viewport `<div>`, replace `<VerseView groups={groups} styles={styles} blank={blank} />` with:

```tsx
          <DisplayLayout groups={groups} styles={styles} blank={blank} strongs={strongs} versesRef={verses} />
```

  (Hit-testing, selection, hover and the tint keep using `viewport.current` as their root — it still contains the verses.)

- [ ] **Step 3: Run tests, typecheck, build**

Run: `npm test` — all pass (no behavior change while `strongs` is null).
Run: `npm run typecheck` — clean. Run: `npm run build` — succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/display/DisplayScreen.tsx src/renderer/src/display/display.css src/renderer/src/control/PreviewPanel.tsx
git commit -m "feat: projector and preview share the display layout; verses area scrolls"
```

---

### Task 4: Toggle on the panel and one present effect

**Files:**
- Modify: `src/renderer/src/control/StrongsPanel.tsx`, `src/renderer/src/control/ControlScreen.tsx`, `src/renderer/src/control/control.css`, `src/renderer/src/control/HelpPanel.tsx`, `README.md`
- Test: `tests/renderer/StrongsPanel.test.tsx`, `tests/renderer/HelpPanel.test.tsx`

**Interfaces:**
- Consumes: `displayStrongs` (Task 1); `api().getStrongsOnDisplay()` / `setStrongsOnDisplay(on)` (Task 1); `PreviewPanel` prop `strongs` (Task 3).
- Produces: `StrongsPanel` props gain `onDisplay: boolean` and `onToggleDisplay(on: boolean): void`.

- [ ] **Step 1: Write the failing tests**

In `tests/renderer/StrongsPanel.test.tsx`, change the `render` helper to pass the new props:

```tsx
const render = (state: StrongsState, collapsed = false, onDisplay = false) =>
  renderToStaticMarkup(
    <StrongsPanel state={state} collapsed={collapsed} onToggle={noop} onLink={noop} onBack={noop} onDisplay={onDisplay} onToggleDisplay={noop} />,
  )
```

and append inside `describe('StrongsPanel', …)`:

```tsx
  it('offers Show on display, checked or not, even when collapsed', () => {
    expect(render(INITIAL_STRONGS)).toMatch(/<input type="checkbox"[^>]*\/?>\s*Show on display/)
    expect(render(INITIAL_STRONGS, false, true)).toMatch(/<input type="checkbox" checked=""[^>]*\/?>\s*Show on display/)
    expect(render(INITIAL_STRONGS, true, true)).toContain('Show on display')
  })
```

In `tests/renderer/HelpPanel.test.tsx`, add inside `describe('HelpPanel', …)`:

```tsx
  it("explains showing Strong's on the display", () => {
    expect(renderToStaticMarkup(<HelpPanel version="1.2.3" onClose={() => {}} />)).toContain('Show on display')
  })
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npm test -- tests/renderer/StrongsPanel.test.tsx tests/renderer/HelpPanel.test.tsx`
Expected: FAIL.

- [ ] **Step 3: The toggle on `StrongsPanel`**

In `src/renderer/src/control/StrongsPanel.tsx`, add to `Props` and the destructuring:

```ts
  onDisplay: boolean
  onToggleDisplay(on: boolean): void
```

and inside `.strongs-panel__bar`, after the `{!collapsed && v.kind === 'entry' && (…)}` title block and before the Back button, add:

```tsx
        <label className="strongs-panel__display" title="Also show the entry on the display, under the verses">
          <input type="checkbox" checked={onDisplay} onChange={e => onToggleDisplay(e.target.checked)} /> Show on display
        </label>
```

`src/renderer/src/control/control.css` — append:

```css
.strongs-panel__display {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 4px;
  white-space: nowrap;
}
```

- [ ] **Step 4: ControlScreen — state, toggle, one present effect**

In `src/renderer/src/control/ControlScreen.tsx`:
- Add `displayStrongs` to the import from `./strongsState`.
- State, after `strongsMark`: `const [strongsOnDisplay, setStrongsOnDisplay] = useState(false)`.
- Mount effect: add `void a.getStrongsOnDisplay().then(setStrongsOnDisplay)`.
- After the state declarations that `displayStrongs` needs (after `strongsMark`), add:

```ts
  const shownStrongs = useMemo(() => displayStrongs(strongs, strongsOnDisplay, strongsMark), [strongs, strongsOnDisplay, strongsMark])

  // The one place the display is told what to show: verses, blank, and the Strong's band.
  useEffect(() => {
    api().present({ groups, blank, strongs: shownStrongs })
  }, [groups, blank, shownStrongs])
```

- In `present` (the `useCallback`), delete the line `api().present({ groups: loaded, blank: nextBlank, strongs: null })` (the effect sends it once `groups` updates). Its `nextBlank` parameter is then unused — remove the parameter and update every call from `present(x, blank)` to `present(x)`.
- In `toggleBlank`, delete the `api().present(...)` line (the effect sends it once `blank` updates).
- Add after `setStrongsPanel`:

```ts
  const toggleStrongsOnDisplay = (on: boolean) => {
    setStrongsOnDisplay(on)
    void api().setStrongsOnDisplay(on)
  }
```

- `PreviewPanel`: add `strongs={shownStrongs}`.
- `StrongsPanel`: add `onDisplay={strongsOnDisplay}` and `onToggleDisplay={toggleStrongsOnDisplay}`.

- [ ] **Step 5: Docs**

`src/renderer/src/control/HelpPanel.tsx` — in the "Strong's concordance" section, change the last sentence "Nothing appears on the display." to:

```tsx
          To show the entry on the display too, tick <strong>Show on display</strong> on the panel&apos;s bar: it appears
          in a band under the verses, with the word tinted. Untick it to remove the band.
```

`README.md` — in the Strong's bullet, replace "Nothing is shown on the display." with "Tick **Show on display** on the panel to also show the entry in a band under the verses on the display, with the word tinted."

- [ ] **Step 6: Run all tests, typecheck, build**

Run: `npm test` — all pass. Run: `npm run typecheck` — clean. Run: `npm run build` — succeeds.

- [ ] **Step 7: Manual check (`npm run dev`)**

1. Show `gen 1:1`; click "God". Tick **Show on display**: the projector shows a band with `H430 · Hebrew`, the Hebrew word, and the entry; "God" is tinted on the projector; the preview matches.
2. Follow a link in the panel: the band shows that entry, no tint. Back: H430 and the tint return.
3. Show `ps 119`; PgDn: only the verses scroll; the band stays.
4. Blank: everything hidden; unblank: band and tint return.
5. Clear (Esc): band gone; show verses again: band returns (tint gone).
6. A−/A+: the band text resizes with the verses.
7. Untick: band gone. Restart: the toggle is remembered.

- [ ] **Step 8: Commit**

```bash
git add src/renderer/src/control/StrongsPanel.tsx src/renderer/src/control/ControlScreen.tsx src/renderer/src/control/control.css src/renderer/src/control/HelpPanel.tsx README.md tests/renderer/StrongsPanel.test.tsx tests/renderer/HelpPanel.test.tsx
git commit -m "feat: Show on display puts the Strong's entry under the verses on the projector"
```
