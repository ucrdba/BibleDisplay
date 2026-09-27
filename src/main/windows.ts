import { BrowserWindow, screen } from 'electron'
import { join } from 'node:path'
import { pickDisplay } from './displayPick'

const PRELOAD = join(__dirname, '../preload/index.js')

function load(win: BrowserWindow, route: 'control' | 'display'): void {
  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) void win.loadURL(`${devUrl}#/${route}`)
  else void win.loadFile(join(__dirname, '../renderer/index.html'), { hash: `/${route}` })
}

/**
 * Prevents the window from ever navigating away from the app's own page (e.g. a file or
 * link dropped onto the window) and prevents window.open()/target=_blank from opening new
 * windows. `will-navigate` is not emitted for same-document reloads (including electron-vite's
 * dev-mode HMR, which reloads via location.reload()), only for navigation to a new document,
 * so this does not interfere with `npm run dev` hot reload.
 */
function lockNavigation(win: BrowserWindow): void {
  win.webContents.on('will-navigate', e => e.preventDefault())
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
}

export function createControlWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1400,
    height: 860,
    title: 'Bible Display — Control',
    autoHideMenuBar: true,
    webPreferences: { preload: PRELOAD },
  })
  lockNavigation(win)
  load(win, 'control')
  return win
}

export function createDisplayWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1024,
    height: 640,
    title: 'Bible Display',
    autoHideMenuBar: true,
    backgroundColor: '#111111',
    show: false,
    frame: false,
    webPreferences: { preload: PRELOAD },
  })
  lockNavigation(win)
  load(win, 'display')
  return win
}

/** Puts the display window fullscreen on the second monitor. Returns false if there is none. */
export function placeDisplayWindow(win: BrowserWindow): boolean {
  const primary = screen.getPrimaryDisplay()
  const target = pickDisplay(screen.getAllDisplays(), primary.id)
  if (win.isFullScreen()) win.setFullScreen(false)
  if (target) {
    win.setBounds(target.bounds)
    win.setFullScreen(true)
    win.showInactive()
    return true
  }
  const { x, y, width, height } = primary.workArea
  win.setBounds({
    x: x + Math.round(width * 0.2),
    y: y + Math.round(height * 0.15),
    width: Math.round(width * 0.6),
    height: Math.round(height * 0.6),
  })
  win.showInactive()
  return false
}
