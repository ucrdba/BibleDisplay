# Bible Display

Show KJV Bible verses on a second monitor. Type references on the control window; every verse appears on the second screen with Jesus' words in red, your fonts and colors, and your saved highlights.

## Using it

- Type references and press **Enter**: `jn 1:3-5, mk 3:1-3, luke 1:2`, `ps 23`, `jn 1:50-2:3`, `jn 3:16, 18`, `jude 5`.
- Add `..` after a verse to show the rest of the chapter: `luke 1.18.., john 3.16` shows Luke 1:18-80 and John 3:16.
- List verses with periods: `ps 23.1.3.4` shows Psalm 23 verses 1, 3 and 4. Between two numbers `..` is a range, and at the end it runs to the end of the chapter: `lk 1.1..5.7..` shows Luke 1:1-5 and 1:7-80.
- A period works like a colon, so you don't need Shift: `gen 1.1`, `jn 1.3-5`, `jn 1.50-2.3`.
- Books: full names, 3-letter codes (`gen`, `mar`, `joh`), common short forms (`jn`, `mk`, `ps`), or any unique start of a name. Numbered books: `1 john`, `1jn`, `1 joh`.
- Type-ahead: start typing a book; ↑/↓ to choose, Tab or Enter to accept, Esc to close.
- **A− / A+** or **Ctrl − / Ctrl +**: text size. **PgUp/PgDn**, **↑/↓**, **Home/End**, or the mouse wheel over the preview: scroll the display. **B**: blank the display (press again to bring the verses back). **Esc**: Clear — empty the input and remove everything from the display (when the book suggestions are open, Esc just closes them).
- Highlight: select words in the preview, then pick a color in the toolbar that pops up under them. **Remove highlight** clears the selected part.
- Import a list: click **Import list…** and choose a `.txt` file with one reference per line (e.g. your sermon's verses). Click a line to show it; the list stays until you import another file or click **Clear list**. Lines with problems are marked ⚠.
- Imported and Recent lists: click a line to show it; **Ctrl+click** adds or removes lines, **Shift+click** selects a range — all selected lines show together. Right-click (or press **Delete**) to delete the selected lines from the list. **Clear list** on the Recent tab empties all of Recent (it asks first).
- Search: press **Ctrl+F** (or open the **Search** tab) and type. Modes: **All words** (any order; `"quoted phrase"`; `faith*` for word starts), **Exact phrase** (`still wat`), **Any word**, and **Regex**. Limit it to the Old or New Testament, the Gospels, or one book. Click results to show them (Ctrl/Shift+click for several). In the verse box, `?still waters` or `/still\s+wat/` opens a search.
- Browse: the **Books | Chapters | Verses** column lets you point and click. Click a verse to show it; **Ctrl+click** adds or removes verses (across chapters and books); **Shift+click** selects a range from the last verse clicked; **Ctrl+Shift+click** adds a range. Double-click a chapter to show all of it. Whatever is on screen is highlighted in the picker. The arrow at the top hides or shows the column.
- Right-click the live preview to **Save verse list…** (re-importable), **Save verse text…** (full text), **Print…**, **Add to Recent** (saves what's on screen to the Recent list), or **Clear** everything from the preview and the display (same as Esc).
- **Display on** (right panel): pick which monitor shows the verses; your choice is remembered.
- **»** at the top of the right panel hides it to give the preview more room; **«** brings it back. Shortcuts and the highlight toolbar still work while it is hidden.
- **F1** or **? Help**: shows how to use everything.

## License

Copyright © 2026 Landmark Missionary Church of Banning CA. Free to install, use, copy, and share; may not be sold or modified. See [LICENSE.txt](LICENSE.txt). The King James Version text is in the public domain.

## Development

```bash
npm install          # also rebuilds better-sqlite3 for Electron
npm run dev          # run the app
npm test             # run tests (inside Electron's Node)
npm run typecheck
npm run dist         # bump the patch version, then build the Windows installer into release/
```

### Rebuilding the Bible database

`resources/bible.db` is generated from the public-domain KJV OSIS file at
https://github.com/seven1m/open-bibles (`eng-kjv.osis.xml`). To regenerate it, save that file as
`data/source/eng-kjv.osis.xml` and run `npm run import-kjv`.
