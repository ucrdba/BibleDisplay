import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import type { Styles } from '../../../shared/styles'
import type { DisplayGroup, DisplayInfo, ScrollCommand, VerseRange } from '../../../shared/types'
import { VerseView } from '../verse/VerseView'
import { HighlightToolbar } from './HighlightToolbar'
import { selectionToRanges } from './selection'

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
}

export function previewScale(panel: Size, display: Size): number {
  if (!panel.width || !panel.height || !display.width || !display.height) return 0
  return Math.min(panel.width / display.width, panel.height / display.height)
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
}: Props) {
  const outer = useRef<HTMLDivElement>(null)
  const viewport = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [panel, setPanel] = useState<Size>({ width: 0, height: 0 })
  const [anchor, setAnchor] = useState<Anchor | null>(null)
  const [menu, setMenu] = useState<Anchor | null>(null)

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
    if (viewport.current) viewport.current.scrollTop = scrollTop
  }, [scrollTop, groups])

  const k = previewScale(panel, info)

  const handleMouseUp = () => {
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed || !viewport.current) {
      onSelect([])
      setAnchor(null)
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
        <div
          className="context-menu"
          ref={menuRef}
          style={{ left: menu.x, top: menu.y }}
          role="menu"
          onKeyDown={e => {
            if (e.key === 'Escape') {
              e.preventDefault()
              setMenu(null)
            }
          }}
        >
          <button
            type="button"
            role="menuitem"
            autoFocus
            disabled={!canSave}
            onClick={() => {
              setMenu(null)
              onSaveList()
            }}
          >
            Save verse list…
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={!canSave}
            onClick={() => {
              setMenu(null)
              onSaveText()
            }}
          >
            Save verse text…
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={!canSave}
            onClick={() => {
              setMenu(null)
              onPrint()
            }}
          >
            Print…
          </button>
        </div>
      )}
    </div>
  )
}
