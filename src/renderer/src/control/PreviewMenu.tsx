import type { RefObject } from 'react'

interface Props {
  x: number
  y: number
  menuRef: RefObject<HTMLDivElement | null>
  /** False when nothing is on screen; every item is then disabled. */
  canSave: boolean
  onClose(): void
  onSaveList(): void
  onSaveText(): void
  onPrint(): void
  onClear(): void
}

/** The live preview's right-click menu. */
export function PreviewMenu({ x, y, menuRef, canSave, onClose, onSaveList, onSaveText, onPrint, onClear }: Props) {
  const item = (label: string, action: () => void, autoFocus = false) => (
    <button
      type="button"
      role="menuitem"
      autoFocus={autoFocus}
      disabled={!canSave}
      onClick={() => {
        onClose()
        action()
      }}
    >
      {label}
    </button>
  )

  return (
    <div
      className="context-menu"
      ref={menuRef}
      style={{ left: x, top: y }}
      role="menu"
      onKeyDown={e => {
        if (e.key === 'Escape') {
          e.preventDefault()
          onClose()
        }
      }}
    >
      {item('Save verse list…', onSaveList, true)}
      {item('Save verse text…', onSaveText)}
      {item('Print…', onPrint)}
      <div className="context-menu__sep" role="separator" />
      {item('Clear', onClear)}
    </div>
  )
}
