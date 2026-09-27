interface Props {
  onClose(): void
}

export function HelpPanel({ onClose }: Props) {
  return (
    <div
      className="help-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Help"
      onClick={e => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="help-panel">
        <h2>Help</h2>
        <button type="button" className="icon-btn help-close" aria-label="Close help" autoFocus onClick={onClose}>
          ✕
        </button>

        <h3>Typing verses</h3>
        <p>Type a reference and press Enter or Show. Examples:</p>
        <ul>
          <li>
            <code>jn 3:16</code>
          </li>
          <li>
            <code>jn 1:3-5</code>
          </li>
          <li>
            <code>ps 23</code> (whole chapter)
          </li>
          <li>
            <code>jn 1:50-2:3</code>
          </li>
          <li>
            <code>jn 3:16, 18</code> (same chapter)
          </li>
          <li>
            <code>jude 5</code>
          </li>
          <li>
            Lists with commas or semicolons: <code>jn 1:3-5, mk 3:1-3; luke 1:2</code>
          </li>
        </ul>
        <p>
          A period works like a colon: <code>gen 1.1</code>.
        </p>
        <p>
          Books: full names, 3-letter codes (<code>gen</code>, <code>mar</code>, <code>joh</code>), short forms
          (<code>jn</code>, <code>mk</code>, <code>ps</code>), numbered books (<code>1 john</code>, <code>1jn</code>
          ), or any unique start of a name.
        </p>
        <p>
          Type-ahead: start a book name, ↑/↓ to choose, Tab or Enter to accept, Esc to close. Bad parts are
          underlined with the reason; good parts still show.
        </p>

        <h3>Keyboard shortcuts</h3>
        <ul>
          <li>
            <kbd>Enter</kbd> = Show
          </li>
          <li>
            <kbd>Esc</kbd> = Clear (empty the box and the display)
          </li>
          <li>
            <kbd>B</kbd> = Blank / unblank
          </li>
          <li>
            <kbd>PgUp</kbd>/<kbd>PgDn</kbd> = scroll a page
          </li>
          <li>
            <kbd>↑</kbd>/<kbd>↓</kbd> = scroll a little
          </li>
          <li>
            <kbd>Home</kbd>/<kbd>End</kbd> = top/bottom
          </li>
          <li>
            <kbd>Ctrl</kbd> + / <kbd>Ctrl</kbd> − = bigger/smaller text
          </li>
          <li>
            <kbd>F1</kbd> = this help
          </li>
        </ul>
        <p>Note: B, arrows, Home/End work when the cursor is not in the verse box.</p>

        <h3>Imported and Recent lists</h3>
        <p>
          Click a line to show it; <kbd>Ctrl+click</kbd> adds or removes lines; <kbd>Shift+click</kbd> selects a
          range; all selected lines show together. Right-click (or Delete) to delete selected lines.
        </p>

        <h3>Import list</h3>
        <p>
          Click Import list… and pick a <code>.txt</code> file with one reference per line. The list is saved
          until you import another or click Clear list. Lines with problems show ⚠ (hover for the reason).
        </p>

        <h3>Highlight words</h3>
        <p>
          Highlight: drag across words in the live preview, then pick a color on the right. Remove highlight
          clears the selected part. Highlights are saved.
        </p>

        <h3>Blank vs Clear</h3>
        <p>Blank hides the verses but keeps them (press B again to bring them back); Clear removes them.</p>

        <h3>Display on</h3>
        <p>Choose which monitor shows the verses (right panel).</p>
      </div>
    </div>
  )
}
