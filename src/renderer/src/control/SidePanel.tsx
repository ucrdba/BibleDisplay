import type { ReactNode } from 'react'

interface Props {
  /** Which edge of the window the panel sits against; its arrows point outward to hide. */
  side: 'left' | 'right'
  /** Used in the tooltips: "Hide <label>" / "Show <label>". */
  label: string
  className: string
  collapsed: boolean
  onToggle(): void
  children: ReactNode
}

const LEFT = '\u00ab'
const RIGHT = '\u00bb'

export function SidePanel({ side, label, className, collapsed, onToggle, children }: Props) {
  const hideArrow = side === 'right' ? RIGHT : LEFT
  const showArrow = side === 'right' ? LEFT : RIGHT
  return (
    <aside className={`panel ${className}${collapsed ? ' panel--collapsed' : ''}`}>
      <button
        type="button"
        className="btn panel__toggle"
        title={`${collapsed ? 'Show' : 'Hide'} ${label}`}
        aria-expanded={!collapsed}
        onClick={onToggle}
      >
        {collapsed ? showArrow : hideArrow}
      </button>
      {!collapsed && children}
    </aside>
  )
}
