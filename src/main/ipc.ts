import { BrowserWindow as ElectronBrowserWindow, dialog, ipcMain, type BrowserWindow } from 'electron'
import { basename } from 'node:path'
import { readFile, writeFile } from 'node:fs/promises'
import { IPC } from '../shared/ipc'
import { isPanelName } from '../shared/panels'
import { decodeTextFile, IMPORT_MAX_BYTES, parseImportText } from '../shared/importList'
import type { SearchPrefs } from '../shared/search'
import type { Styles } from '../shared/styles'
import type {
  DisplayInfo,
  DisplayState,
  ImportResult,
  PrintResult,
  RefGroup,
  SaveResult,
  ScrollCommand,
  VerseRange,
} from '../shared/types'
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
  setMonitor(id: number | null): void
}

export function registerIpc(ctx: MainContext): void {
  let state: DisplayState = { groups: [], blank: false }
  const toDisplay = (channel: string, payload: unknown) => ctx.getDisplay()?.webContents.send(channel, payload)

  ipcMain.handle(IPC.verseCounts, () => ctx.bible.verseCounts())
  ipcMain.handle(IPC.allVerses, () => ctx.bible.allVerses())
  ipcMain.handle(IPC.getSearchPrefs, () => ctx.user.getSearchPrefs())
  ipcMain.handle(IPC.setSearchPrefs, (_e, prefs: SearchPrefs) => ctx.user.setSearchPrefs(prefs))
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
  ipcMain.handle(IPC.clearRecent, () => ctx.user.clearRecent())
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
  ipcMain.handle(IPC.saveTextFile, async (_e, suggestedName: string, content: string): Promise<SaveResult> => {
    const options: Electron.SaveDialogOptions = {
      title: 'Save',
      defaultPath: suggestedName,
      filters: [{ name: 'Text files', extensions: ['txt'] }],
    }
    const parent = ctx.getControl()
    const pick = parent ? await dialog.showSaveDialog(parent, options) : await dialog.showSaveDialog(options)
    if (pick.canceled || !pick.filePath) return { kind: 'canceled' }
    try {
      await writeFile(pick.filePath, content, 'utf8')
      return { kind: 'saved', fileName: basename(pick.filePath) }
    } catch (e) {
      return { kind: 'error', message: (e as Error).message }
    }
  })
  ipcMain.handle(IPC.printHtml, async (_e, html: string): Promise<PrintResult> => {
    const win = new ElectronBrowserWindow({ show: false, webPreferences: { sandbox: true, javascript: false } })
    try {
      await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
      return await new Promise<PrintResult>(resolve => {
        win.webContents.print({ silent: false, printBackground: false }, (success, failureReason) => {
          if (success) resolve({ kind: 'printed' })
          // Electron reports a dismissed dialog as "cancelled" or "Print job canceled" depending on version.
          else if (/cancel/i.test(failureReason)) resolve({ kind: 'canceled' })
          else resolve({ kind: 'error', message: failureReason })
        })
      })
    } catch (e) {
      return { kind: 'error', message: (e as Error).message }
    } finally {
      win.destroy()
    }
  })
  ipcMain.handle(IPC.listImported, () => ctx.user.listImported())
  ipcMain.handle(IPC.clearImported, () => ctx.user.clearImported())
  ipcMain.handle(IPC.removeImported, (_e, indices: number[]) => ctx.user.removeImported(indices))
  ipcMain.handle(IPC.listFonts, () => listFonts())
  ipcMain.handle(IPC.getDisplayInfo, () => ctx.displayInfo())
  ipcMain.handle(IPC.setDisplayMonitor, (_e, id: number | null) => ctx.setMonitor(id))
  ipcMain.handle(IPC.getPanelCollapsed, (_e, panel: unknown) => (isPanelName(panel) ? ctx.user.getPanelCollapsed(panel) : false))
  ipcMain.handle(IPC.setPanelCollapsed, (_e, panel: unknown, collapsed: unknown) => {
    if (isPanelName(panel)) ctx.user.setPanelCollapsed(panel, collapsed === true)
  })
  ipcMain.handle(IPC.displayReady, () => ({ state, styles: ctx.user.getStyles() }))

  ipcMain.on(IPC.present, (_e, next: DisplayState) => {
    state = next
    toDisplay(IPC.evtState, next)
  })
  ipcMain.on(IPC.scroll, (_e, cmd: ScrollCommand) => toDisplay(IPC.evtScroll, cmd))
  ipcMain.on(IPC.reportScroll, (_e, top: number) => ctx.getControl()?.webContents.send(IPC.evtScrollPos, top))
}
