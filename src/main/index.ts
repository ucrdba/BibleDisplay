import { app, dialog, Menu, screen, type BrowserWindow } from 'electron'
import { join } from 'node:path'
import { IPC } from '../shared/ipc'
import type { DisplayInfo } from '../shared/types'
import { BibleDb } from './bibleDb'
import { registerIpc } from './ipc'
import { UserDb } from './userDb'
import { createControlWindow, createDisplayWindow, placeDisplayWindow } from './windows'

let control: BrowserWindow | null = null
let display: BrowserWindow | null = null
let secondMonitor = false

function bibleDbPath(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'bible.db')
    : join(app.getAppPath(), 'resources', 'bible.db')
}

function displayInfo(): DisplayInfo {
  const [width, height] = display?.getContentSize() ?? [1920, 1080]
  return { width, height, secondMonitor }
}

function sendDisplayInfo(): void {
  control?.webContents.send(IPC.evtDisplayInfo, displayInfo())
}

function reposition(): void {
  if (!display) return
  secondMonitor = placeDisplayWindow(display)
  sendDisplayInfo()
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (control) {
      if (control.isMinimized()) control.restore()
      control.focus()
    }
  })

  app.whenReady().then(() => {
    Menu.setApplicationMenu(null)

    let bible: BibleDb
    try {
      bible = BibleDb.open(bibleDbPath())
    } catch (e) {
      dialog.showErrorBox('Bible Display', (e as Error).message)
      app.quit()
      return
    }

    let user: UserDb
    try {
      user = UserDb.open(join(app.getPath('userData'), 'user.db'))
    } catch (e) {
      const message = (e as Error).message
      dialog.showErrorBox('Bible Display', `Could not open your settings database: ${message}`)
      bible.close()
      app.quit()
      return
    }

    registerIpc({ bible, user, getControl: () => control, getDisplay: () => display, displayInfo })

    control = createControlWindow()
    display = createDisplayWindow()
    display.once('ready-to-show', reposition)
    display.on('resize', sendDisplayInfo)
    display.on('closed', () => {
      display = null
    })
    control.on('closed', () => {
      control = null
      app.quit()
    })

    screen.on('display-added', reposition)
    screen.on('display-removed', reposition)
    screen.on('display-metrics-changed', reposition)

    app.on('will-quit', () => {
      bible.close()
      user.close()
    })
  })

  app.on('window-all-closed', () => app.quit())
}
