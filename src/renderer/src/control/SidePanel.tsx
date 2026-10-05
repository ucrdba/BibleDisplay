import type { ReactNode } from 'react'

interface Props {
  collapsed: boolean
  onToggle(): void
  children: ReactNode
}

export function SidePanel({ collapsed, onToggle, children }: Props) {
  return (
    <aside className={`panel panel--right${collapsed ? ' panel--collapsed' : ''}`}>
      <button
        type="button"
        className="btn panel__toggle"
        title={collapsed ? 'Show settings' : 'Hide settings'}
        aria-expanded={!collapsed}
        onClick={onToggle}
      >
        {collapsed ? '«' : '»'}
      </button>
      {!collapsed && children}
    </aside>
  )
}
