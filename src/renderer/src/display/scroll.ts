import type { Styles } from '../../../shared/styles'
import type { ScrollCommand } from '../../../shared/types'

export interface ScrollMetrics {
  top: number
  clientHeight: number
  scrollHeight: number
  lineHeight: number
}

export function lineHeightPx(styles: Styles): number {
  return styles.verse.size * styles.scale * 1.4
}

export function scrollTarget(cmd: ScrollCommand, m: ScrollMetrics): number {
  const max = Math.max(0, m.scrollHeight - m.clientHeight)
  const page = Math.max(m.lineHeight, m.clientHeight - m.lineHeight * 2)
  let target: number
  switch (cmd.kind) {
    case 'lineUp':
      target = m.top - m.lineHeight * 2
      break
    case 'lineDown':
      target = m.top + m.lineHeight * 2
      break
    case 'pageUp':
      target = m.top - page
      break
    case 'pageDown':
      target = m.top + page
      break
    case 'home':
      target = 0
      break
    case 'end':
      target = max
      break
    case 'by':
      target = m.top + cmd.px
      break
  }
  return Math.min(max, Math.max(0, target))
}
