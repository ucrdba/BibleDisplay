import { useEffect, useRef, useState } from 'react'
import { DEFAULT_STYLES, type Styles } from '../../../shared/styles'
import type { DisplayState } from '../../../shared/types'
import { verseTextRange } from '../control/selection'
import { DisplayLayout } from '../verse/DisplayLayout'
import { setHighlight } from '../verse/highlights'
import './display.css'
import { lineHeightPx, scrollTarget } from './scroll'

export function DisplayScreen() {
  const [state, setState] = useState<DisplayState>({ groups: [], blank: false, strongs: null })
  const [styles, setStyles] = useState<Styles>(DEFAULT_STYLES)
  const scroller = useRef<HTMLDivElement>(null)
  const stylesRef = useRef(styles)
  stylesRef.current = styles

  useEffect(() => {
    const api = window.bible.display
    let gotState = false
    let gotStyles = false
    const offs = [
      api.onState(s => {
        gotState = true
        setState(s)
      }),
      api.onStyles(st => {
        gotStyles = true
        setStyles(st)
      }),
      api.onScroll(cmd => {
        const el = scroller.current
        if (!el) return
        const top = scrollTarget(cmd, {
          top: el.scrollTop,
          clientHeight: el.clientHeight,
          scrollHeight: el.scrollHeight,
          lineHeight: lineHeightPx(stylesRef.current),
        })
        el.scrollTo({ top, behavior: cmd.kind === 'by' || cmd.kind === 'to' ? 'auto' : 'smooth' })
      }),
    ]
    void api.ready().then(r => {
      if (!gotState) setState(r.state)
      if (!gotStyles) setStyles(r.styles)
    })
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

  // Tint the looked-up word while its Strong's entry is shown.
  useEffect(() => {
    const el = scroller.current
    const m = state.strongs?.mark
    setHighlight(
      'strongs-current',
      el && m && !state.blank ? verseTextRange(el, `${m.bookId}.${m.chapter}.${m.verse}`, m.start, m.end) : null,
    )
  }, [state, styles])

  return (
    <div className="display" style={{ background: styles.background }}>
      <DisplayLayout groups={state.groups} styles={styles} blank={state.blank} strongs={state.strongs} versesRef={scroller} />
    </div>
  )
}
