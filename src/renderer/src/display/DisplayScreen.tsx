import { useEffect, useRef, useState } from 'react'
import { DEFAULT_STYLES, type Styles } from '../../../shared/styles'
import type { DisplayState } from '../../../shared/types'
import { VerseView } from '../verse/VerseView'
import './display.css'
import { lineHeightPx, scrollTarget } from './scroll'

export function DisplayScreen() {
  const [state, setState] = useState<DisplayState>({ groups: [], blank: false })
  const [styles, setStyles] = useState<Styles>(DEFAULT_STYLES)
  const scroller = useRef<HTMLDivElement>(null)
  const stylesRef = useRef(styles)
  stylesRef.current = styles

  useEffect(() => {
    const api = window.bible.display
    void api.ready().then(r => {
      setState(r.state)
      setStyles(r.styles)
    })
    const offs = [
      api.onState(setState),
      api.onStyles(setStyles),
      api.onScroll(cmd => {
        const el = scroller.current
        if (!el) return
        const top = scrollTarget(cmd, {
          top: el.scrollTop,
          clientHeight: el.clientHeight,
          scrollHeight: el.scrollHeight,
          lineHeight: lineHeightPx(stylesRef.current),
        })
        el.scrollTo({ top, behavior: cmd.kind === 'by' ? 'auto' : 'smooth' })
      }),
    ]
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

  return (
    <div className="display" ref={scroller} style={{ background: styles.background }}>
      <VerseView groups={state.groups} styles={styles} blank={state.blank} />
    </div>
  )
}
