import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react'

export interface ClickMods {
  ctrl: boolean
  shift: boolean
}

interface Props {
  items: string[]
  selected: number[]
  problems?: (string | null)[]
  onClick(index: number, mods: ClickMods): void
  onContext(index: number): void
  onDelete(): void
}

export function SelectableList({ items, selected, problems, onClick, onContext, onDelete }: Props) {
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menu) return
    const close = (e: globalThis.MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenu(null)
    }
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [menu])

  const openMenu = (e: MouseEvent, i: number) => {
    e.preventDefault()
    onContext(i)
    setMenu({ x: e.clientX, y: e.clientY })
  }

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Delete' && selected.length > 0) {
      e.preventDefault()
      onDelete()
    }
  }

  const count = Math.max(1, selected.length)

  return (
    <>
      <ul className="selectable" tabIndex={0} role="listbox" aria-multiselectable="true" onKeyDown={onKeyDown}>
        {items.map((item, i) => {
          const isSel = selected.includes(i)
          return (
            <li key={i} role="option" aria-selected={isSel}>
              <button
                type="button"
                className={isSel ? 'link-btn is-active' : 'link-btn'}
                title={`Show ${item}`}
                onClick={e => onClick(i, { ctrl: e.ctrlKey || e.metaKey, shift: e.shiftKey })}
                onContextMenu={e => openMenu(e, i)}
              >
                {item}
              </button>
              {problems?.[i] && (
                <span className="warn" title={problems[i] ?? undefined}>
                  ⚠
                </span>
              )}
            </li>
          )
        })}
      </ul>
      {menu && (
        <div className="context-menu" ref={menuRef} style={{ left: menu.x, top: menu.y }} role="menu">
          <button
            type="button"
            role="menuitem"
            autoFocus
            onClick={() => {
              setMenu(null)
              onDelete()
            }}
            onKeyDown={e => {
              if (e.key === 'Escape') {
                e.preventDefault()
                setMenu(null)
              }
            }}
          >
            {count > 1 ? `Delete ${count} items` : 'Delete'}
          </button>
        </div>
      )}
    </>
  )
}
