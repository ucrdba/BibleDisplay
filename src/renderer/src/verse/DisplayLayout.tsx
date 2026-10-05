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
    if (!el) return
    const measure = () => setOverflow(el.scrollHeight > el.clientHeight + 1)
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
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
