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
