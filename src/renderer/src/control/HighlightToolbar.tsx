import { HIGHLIGHT_COLORS } from './ColorField'

interface Props {
  x: number
  y: number
  onHighlight(color: string): void
  onRemove(): void
  onClose(): void
}

export function HighlightToolbar({ x, y, onHighlight, onRemove, onClose }: Props) {
  return (
    <div
      className="hl-toolbar"
      role="toolbar"
      aria-label="Highlight selected words"
      style={{ left: x, top: y }}
      onKeyDown={e => {
        if (e.key === 'Escape') {
          e.preventDefault()
          onClose()
        }
      }}
    >
      {HIGHLIGHT_COLORS.map(color => (
        <button
          key={color}
          type="button"
          className="swatch"
          style={{ background: color }}
          title={color}
          aria-label={`Highlight ${color}`}
          onMouseDown={e => e.preventDefault()}
          onClick={() => onHighlight(color)}
        />
      ))}
      <button type="button" className="btn" onMouseDown={e => e.preventDefault()} onClick={onRemove}>
        Remove highlight
      </button>
      <button
        type="button"
        className="icon-btn"
        aria-label="Close"
        onMouseDown={e => e.preventDefault()}
        onClick={onClose}
      >
        ✕
      </button>
    </div>
  )
}
