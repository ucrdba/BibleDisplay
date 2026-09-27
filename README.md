# Bible Display

Show KJV Bible verses on a second monitor. Type references on the control window; every verse appears on the second screen with Jesus' words in red, your fonts and colors, and your saved highlights.

## Using it

- Type references and press **Enter**: `jn 1:3-5, mk 3:1-3, luke 1:2`, `ps 23`, `jn 1:50-2:3`, `jn 3:16, 18`, `jude 5`.
- Books: full names, 3-letter codes (`gen`, `mar`, `joh`), common short forms (`jn`, `mk`, `ps`), or any unique start of a name. Numbered books: `1 john`, `1jn`, `1 joh`.
- Type-ahead: start typing a book; ↑/↓ to choose, Tab or Enter to accept, Esc to close.
- **A− / A+** or **Ctrl − / Ctrl +**: text size. **PgUp/PgDn**, **↑/↓**, **Home/End**, or the mouse wheel over the preview: scroll the display. **B**: blank the display.
- Highlight: select words in the preview, then pick a color. **Remove highlight** clears the selected part.

## Development

```bash
npm install          # also rebuilds better-sqlite3 for Electron
npm run dev          # run the app
npm test             # run tests (inside Electron's Node)
npm run typecheck
npm run dist         # build the Windows installer into release/
```

### Rebuilding the Bible database

`resources/bible.db` is generated from the public-domain KJV OSIS file at
https://github.com/seven1m/open-bibles (`eng-kjv.osis.xml`). To regenerate it, save that file as
`data/source/eng-kjv.osis.xml` and run `npm run import-kjv`.
