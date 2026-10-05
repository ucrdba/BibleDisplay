interface Props {
  version: string
  onClose(): void
}

export function HelpPanel({ version, onClose }: Props) {
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
        <p className="muted">
          Bible Display — version {version}
          <br />© 2026 Landmark Missionary Church of Banning CA. Free to install, use, and share; may not be sold.
          See LICENSE.txt. The King James Version text is in the public domain.
        </p>
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
            <code>luke 1:18..</code> (verse 18 to the end of the chapter)
          </li>
          <li>
            <code>ps 23.1.3.4</code> (verses 1, 3 and 4 of Psalm 23)
          </li>
          <li>
            <code>lk 1.1..5.7..</code> (verses 1 to 5, then 7 to the end of the chapter: <code>..</code> between two
            numbers is a range)
          </li>
          <li>
            Lists with commas or semicolons: <code>jn 1:3-5, mk 3:1-3; luke 1:2</code>
          </li>
        </ul>
        <p>
          A period works like a colon: <code>gen 1.1</code>.
        </p>
        <p>
          Rest of a chapter: add <code>..</code> after a verse to show it through the last verse of that chapter.{' '}
          <code>luke 1:18..</code> or <code>luke 1.18..</code> shows Luke 1:18-80; <code>jn 3:16, 30..</code> shows
          John 3:16 and John 3:30-36; <code>jude 20..</code> works for one-chapter books. The <code>..</code> needs a
          starting verse — <code>luke 1..</code> is incomplete (use <code>luke 1</code> for the whole chapter).
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
          <li>
            <kbd>Ctrl</kbd>+<kbd>F</kbd> = search
          </li>
        </ul>
        <p>Note: B, arrows, Home/End work when the cursor is not in the verse box.</p>

        <h3>Imported and Recent lists</h3>
        <p>
          Click a line to show it; <kbd>Ctrl+click</kbd> adds or removes lines; <kbd>Shift+click</kbd> selects a
          range; all selected lines show together. Right-click (or Delete) to delete selected lines.
        </p>
        <p>
          <strong>Clear list</strong> on the Recent tab empties the whole Recent list (it asks first, since it can't be
          undone).
        </p>

        <h3>Search</h3>
        <p>
          Press <kbd>Ctrl</kbd>+<kbd>F</kbd> or open the Search tab and type. Results appear as you type, with the
          matching words in bold. Click a result to show it; <kbd>Ctrl+click</kbd> and <kbd>Shift+click</kbd> show
          several; <kbd>Enter</kbd> shows the selected results (or the first). <kbd>Esc</kbd> clears the search.
        </p>
        <ul>
          <li>
            <b>All words</b>: every word, in any order. <code>&quot;still waters&quot;</code> in quotes is a phrase;{' '}
            <code>faith*</code> also finds faithful.
          </li>
          <li>
            <b>Exact phrase</b>: the words in order; the first and last can be partial (<code>still wat</code>).
          </li>
          <li>
            <b>Any word</b>: verses with at least one of the words.
          </li>
          <li>
            <b>Regex</b>: a regular expression, e.g. <code>\bgrace\b.*\bpeace\b</code>.
          </li>
        </ul>
        <p>
          The second list limits the search to the Old or New Testament, the Gospels, or one book. In the verse box,{' '}
          <code>?still waters</code> searches for words and <code>/still\s+wat/</code> searches with a regex.
        </p>

        <h3>Browse</h3>
        <p>
          The Browse column lists Books, Chapters, and Verses. Click a book, then a chapter, then a verse to show it.{' '}
          <kbd>Ctrl+click</kbd> adds or removes verses (even in other chapters or books); <kbd>Shift+click</kbd> selects
          the range from the last verse you clicked; <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+click adds that range. Double-click a
          chapter to show the whole chapter. Verses you show any other way are highlighted here too, and a dot marks the
          books and chapters that contain them. Click the arrow at the top to hide or show the column.
        </p>

        <h3>Import list</h3>
        <p>
          Click Import list… and pick a <code>.txt</code> file with one reference per line. The list is saved
          until you import another or click Clear list. Lines with problems show ⚠ (hover for the reason).
        </p>

        <h3>Highlight words</h3>
        <p>
          Highlight: drag across words in the live preview, then pick a color in the toolbar that pops up under
          them (white and black work on dark and light backgrounds). Remove highlight clears the selected part.
          Highlights are saved. The All verse text and All headings colors on the right change all text.
        </p>

        <h3>Saving and printing</h3>
        <p>
          Right-click the live preview to <strong>Save verse list…</strong> (a <code>.txt</code> you can bring
          back with Import list…) or <strong>Save verse text…</strong> (headings and full verse text to paste
          elsewhere).
        </p>
        <p>
          Right-click → <strong>Print…</strong> to print the passages (Jesus' words in red), or choose
          "Microsoft Print to PDF" for a PDF.
        </p>
        <p>
          Right-click → <strong>Add to Recent</strong> to save what is on screen to the Recent list.
          Right-click → <strong>Clear</strong> to remove everything from the preview and the display (the same as
          the Clear button or Esc).
        </p>

        <h3>Blank vs Clear</h3>
        <p>Blank hides the verses but keeps them (press B again to bring them back); Clear removes them.</p>

        <h3>Display on</h3>
        <p>Choose which monitor shows the verses (right panel).</p>
        <h3>Hide settings</h3>
        <p>
          Click » at the top of the right panel to hide it and give the preview more room; click « to bring it back. Keyboard
          shortcuts and the highlight toolbar still work while it is hidden.
        </p>
      </div>
    </div>
  )
}
