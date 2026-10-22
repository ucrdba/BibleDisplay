import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import type { Styles } from '../../../shared/styles'
import type { DisplayGroup, DisplayInfo, DisplayStrongs, ScrollCommand, VerseRange } from '../../../shared/types'
import { DisplayLayout } from '../verse/DisplayLayout'
import { setHighlight } from '../verse/highlights'
import { HighlightToolbar } from './HighlightToolbar'
import { PreviewMenu } from './PreviewMenu'
import { lookupTarget, pointInRects, type VersePoint } from '../../../shared/strongs'
import { pointToVerseOffset, selectionToRanges, verseTextRange } from './selection'

interface Size {
  width: number
  height: number
}

interface Anchor {
  x: number
  y: number
}

const TOOLBAR_WIDTH = 340
const TOOLBAR_HEIGHT = 40
const MENU_WIDTH = 190
const MENU_HEIGHT = 114
/** Room kept beside the preview for its scrollbar (bar width + gap). */
const BAR_SPACE = 20
/** How long after the user moves the scrollbar before display reports may move it again. */
const BAR_HOLD_MS = 300

interface Props {
  groups: DisplayGroup[]
  styles: Styles
  blank: boolean
  info: DisplayInfo
  scrollTop: number
  onScroll(cmd: ScrollCommand): void
  onSelect(ranges: VerseRange[]): void
  hasSelection: boolean
  onHighlight(color: string): void
  onRemoveHighlight(): void
  canSave: boolean
  onSaveList(): void
  onSaveText(): void
  onPrint(): void
  onAddRecent(): void
  onClear(): void
  /** Strong's data is installed: words can be looked up and hovered. */
  strongsEnabled: boolean
  /** The looked-up word to tint, if any. */
  strongsMark: VerseRange | null
  onLookup(p: VersePoint): void
  /** The Strong's entry the display shows in its band (mirrored here). */
  strongs?: DisplayStrongs | null
}

export function previewScale(panel: Size, display: Size): number {
  if (!panel.width || !panel.height || !display.width || !display.height) return 0
  return Math.min(panel.width / display.width, panel.height / display.height)
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

export function PreviewPanel({
  groups,
  styles,
  blank,
  info,
  scrollTop,
  onScroll,
  onSelect,
  hasSelection,
  onHighlight,
  onRemoveHighlight,
  canSave,
  onSaveList,
  onSaveText,
  onPrint,
  onAddRecent,
  onClear,
  strongsEnabled,
  strongsMark,
  onLookup,
  strongs = null,
}: Props) {
  const outer = useRef<HTMLDivElement>(null)
  const viewport = useRef<HTMLDivElement>(null)
  const versesEl = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [panel, setPanel] = useState<Size>({ width: 0, height: 0 })
  const [anchor, setAnchor] = useState<Anchor | null>(null)
  const [menu, setMenu] = useState<Anchor | null>(null)
  const bar = useRef<HTMLDivElement>(null)
  const [content, setContent] = useState({ scroll: 0, client: 0 })
  const barLastSet = useRef(0)
  const barUserAt = useRef(0)
  const barTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!menu) return
    const close = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenu(null)
    }
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [menu])

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
    if (versesEl.current) versesEl.current.scrollTop = scrollTop
  }, [scrollTop, groups, strongs])

  // Measure the verses area so the scrollbar beside the preview matches it.
  useLayoutEffect(() => {
    const el = versesEl.current
    if (!el) return
    const measure = () =>
      setContent(c =>
        c.scroll === el.scrollHeight && c.client === el.clientHeight ? c : { scroll: el.scrollHeight, client: el.clientHeight },
      )
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    if (el.firstElementChild) ro.observe(el.firstElementChild)
    return () => ro.disconnect()
  }, [groups, strongs, styles, blank, info])

  const k = previewScale({ width: Math.max(0, panel.width - BAR_SPACE), height: panel.height }, info)

  // Keep the scrollbar where the display is (unless the user is moving it right now).
  // Reads the latest values from a ref, since it also runs later from a timer.
  const barTarget = useRef(0)
  barTarget.current = scrollTop * k
  const syncBar = () => {
    const el = bar.current
    if (!el || Date.now() - barUserAt.current < BAR_HOLD_MS) return
    el.scrollTop = barTarget.current
    barLastSet.current = el.scrollTop
  }
  useEffect(syncBar)
  useEffect(() => () => {
    if (barTimer.current) clearTimeout(barTimer.current)
  }, [])

  const handleBarScroll = () => {
    const el = bar.current
    if (!el || k <= 0 || Math.abs(el.scrollTop - barLastSet.current) < 1) return
    barUserAt.current = Date.now()
    onScroll({ kind: 'to', px: el.scrollTop / k })
    if (barTimer.current) clearTimeout(barTimer.current)
    barTimer.current = setTimeout(syncBar, BAR_HOLD_MS)
  }
  const scrollable = content.scroll > content.client + 1

  const verses = groups.flatMap(g => g.verses)

  // Tint the looked-up word in the preview (never on the display).
  useEffect(() => {
    if (!viewport.current || !strongsMark) {
      setHighlight('strongs-current', null)
      return
    }
    const m = strongsMark
    setHighlight('strongs-current', verseTextRange(viewport.current, `${m.bookId}.${m.chapter}.${m.verse}`, m.start, m.end))
  }, [strongsMark, groups, blank])

  useEffect(() => () => {
    setHighlight('strongs-hover', null)
    setHighlight('strongs-current', null)
  }, [])

  const pointAt = (x: number, y: number): VersePoint | null => {
    const c = viewport.current ? caretAt(x, y) : null
    return c && viewport.current ? pointToVerseOffset(viewport.current, c.node, c.offset) : null
  }

  // The word under the pointer, only if the pointer is really over it (not nearby blank space).
  const wordUnder = (x: number, y: number) => {
    const root = viewport.current
    const p = pointAt(x, y)
    const target = p ? lookupTarget(verses, p) : null
    if (!root || !p || !target) return null
    const start = target.kind === 'tagged' ? target.span.start : target.start
    const end = target.kind === 'tagged' ? target.span.end : target.end
    const range = verseTextRange(root, `${p.bookId}.${p.chapter}.${p.verse}`, start, end)
    if (!range || !pointInRects(Array.from(range.getClientRects()), x, y)) return null
    return { p, target, range }
  }

  const handleMouseMove = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (!strongsEnabled || !viewport.current) return
    const hit = wordUnder(e.clientX, e.clientY)
    if (hit?.target.kind === 'tagged') {
      setHighlight('strongs-hover', hit.range)
      viewport.current.style.cursor = 'pointer'
    } else {
      setHighlight('strongs-hover', null)
      viewport.current.style.cursor = ''
    }
  }

  const handleMouseUp = (e: ReactMouseEvent<HTMLDivElement>) => {
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed || !viewport.current) {
      onSelect([])
      setAnchor(null)
      // A click (no text dragged) looks up the word under the pointer.
      if (e.button === 0) {
        const hit = wordUnder(e.clientX, e.clientY)
        if (hit) onLookup(hit.p)
      }
      return
    }
    const range = sel.getRangeAt(0)
    const ranges = selectionToRanges(viewport.current, range)
    onSelect(ranges)
    if (ranges.length === 0) {
      setAnchor(null)
      return
    }
    const rect = range.getBoundingClientRect()
    const left = Math.min(rect.left, Math.max(0, window.innerWidth - TOOLBAR_WIDTH))
    const top =
      rect.bottom + 6 + TOOLBAR_HEIGHT > window.innerHeight ? rect.top - 6 - TOOLBAR_HEIGHT : rect.bottom + 6
    setAnchor({ x: left, y: top })
  }

  const handleContextMenu = (e: ReactMouseEvent<HTMLDivElement>) => {
    e.preventDefault()
    const x = Math.min(e.clientX, Math.max(0, window.innerWidth - MENU_WIDTH))
    const y = Math.min(e.clientY, Math.max(0, window.innerHeight - MENU_HEIGHT))
    setMenu({ x, y })
  }

  return (
    <div
      className="preview"
      ref={outer}
      onWheel={e => onScroll({ kind: 'by', px: e.deltaY / Math.max(k, 0.1) })}
      onContextMenu={handleContextMenu}
    >
      <div className="preview__stage">
        <div className="preview__frame" style={{ width: info.width * k, height: info.height * k }}>
          <div
            className="preview__viewport"
            ref={viewport}
            onMouseUp={handleMouseUp}
            onMouseMove={handleMouseMove}
            onMouseLeave={() => setHighlight('strongs-hover', null)}
            style={{ width: info.width, height: info.height, transform: `scale(${k})` }}
          >
            <DisplayLayout groups={groups} styles={styles} blank={blank} strongs={strongs} versesRef={versesEl} />
          </div>
        </div>
        <div
          className="preview__scrollbar"
          ref={bar}
          title="Scroll the display"
          style={{ height: content.client * k, visibility: scrollable ? 'visible' : 'hidden' }}
          onScroll={handleBarScroll}
          onWheel={e => e.stopPropagation()}
        >
          <div className="preview__scrollbar-track" style={{ height: content.scroll * k }} />
        </div>
      </div>
      {hasSelection && anchor && (
        <HighlightToolbar
          x={anchor.x}
          y={anchor.y}
          onHighlight={onHighlight}
          onRemove={onRemoveHighlight}
          onClose={() => {
            setAnchor(null)
            onSelect([])
          }}
        />
      )}
      {menu && (
        <PreviewMenu
          x={menu.x}
          y={menu.y}
          menuRef={menuRef}
          canSave={canSave}
          onClose={() => setMenu(null)}
          onSaveList={onSaveList}
          onSaveText={onSaveText}
          onPrint={onPrint}
          onAddRecent={onAddRecent}
          onClear={onClear}
        />
      )}
    </div>
  )
}
