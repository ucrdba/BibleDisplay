import { dialog, ipcMain, type BrowserWindow } from 'electron'
import { readFile } from 'node:fs/promises'
import { IPC } from '../shared/ipc'
import { decodeTextFile, IMPORT_MAX_BYTES, parseImportText } from '../shared/importList'
import type { Styles } from '../shared/styles'
import type { DisplayInfo, DisplayState, ImportResult, RefGroup, ScrollCommand, VerseRange } from '../shared/types'
import type { BibleDb } from './bibleDb'
import { listFonts } from './fonts'
import { loadGroups } from './loadGroups'
import type { UserDb } from './userDb'

export interface MainContext {
  bible: BibleDb
  user: UserDb
  getControl(): BrowserWindow | null
  getDisplay(): BrowserWindow | null
  displayInfo(): DisplayInfo
}

export function registerIpc(ctx: MainContext): void {
  let state: DisplayState = { groups: [], blank: false }
  const toDisplay = (channel: string, payload: unknown) => ctx.getDisplay()?.webContents.send(channel, payload)

  ipcMain.handle(IPC.verseCounts, () => ctx.bible.verseCounts())
  ipcMain.handle(IPC.loadGroups, (_e, groups: RefGroup[]) => loadGroups(ctx.bible, ctx.user, groups))
  ipcMain.handle(IPC.getStyles, () => ctx.user.getStyles())
  ipcMain.handle(IPC.setStyles, (_e, styles: Styles) => {
    ctx.user.setStyles(styles)
    toDisplay(IPC.evtStyles, ctx.user.getStyles())
  })
  ipcMain.handle(IPC.addHighlights, (_e, ranges: VerseRange[], color: string) => ctx.user.addHighlights(ranges, color))
  ipcMain.handle(IPC.removeHighlights, (_e, ranges: VerseRange[]) => ctx.user.removeHighlights(ranges))
  ipcMain.handle(IPC.addRecent, (_e, input: string) => ctx.user.addRecent(input))
  ipcMain.handle(IPC.listRecent, () => ctx.user.listRecent())
  ipcMain.handle(IPC.removeRecent, (_e, inputs: string[]) => ctx.user.removeRecent(inputs))
  ipcMain.handle(IPC.importList, async (): Promise<ImportResult> => {
    const options: Electron.OpenDialogOptions = {
      title: 'Import verse list',
      filters: [{ name: 'Text files', extensions: ['txt'] }],
      properties: ['openFile'],
    }
    const parent = ctx.getControl()
    const pick = parent ? await dialog.showOpenDialog(parent, options) : await dialog.showOpenDialog(options)
    if (pick.canceled || pick.filePaths.length === 0) return { kind: 'canceled' }
    try {
      const buf = await readFile(pick.filePaths[0])
      if (buf.byteLength > IMPORT_MAX_BYTES) {
        return {
          kind: 'error',
          message: 'That file is too large (over 1 MB). A verse list should be a small text file.',
        }
      }
      const lines = parseImportText(decodeTextFile(buf))
      ctx.user.setImported(lines)
      return { kind: 'ok', lines }
    } catch (e) {
      return { kind: 'error', message: `Could not read the file: ${(e as Error).message}` }
    }
  })
  ipcMain.handle(IPC.listImported, () => ctx.user.listImported())
  ipcMain.handle(IPC.clearImported, () => ctx.user.clearImported())
  ipcMain.handle(IPC.removeImported, (_e, indices: number[]) => ctx.user.removeImported(indices))
  ipcMain.handle(IPC.listFonts, () => listFonts())
  ipcMain.handle(IPC.getDisplayInfo, () => ctx.displayInfo())
  ipcMain.handle(IPC.displayReady, () => ({ state, styles: ctx.user.getStyles() }))

  ipcMain.on(IPC.present, (_e, next: DisplayState) => {
    state = next
    toDisplay(IPC.evtState, next)
  })
  ipcMain.on(IPC.scroll, (_e, cmd: ScrollCommand) => toDisplay(IPC.evtScroll, cmd))
  ipcMain.on(IPC.reportScroll, (_e, top: number) => ctx.getControl()?.webContents.send(IPC.evtScrollPos, top))
}
