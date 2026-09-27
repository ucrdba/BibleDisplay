import { app, BrowserWindow, screen } from 'electron'
import { join } from 'node:path'
import { pickDisplay } from './displayPick'

const PRELOAD = join(__dirname, '../preload/index.js')

/**
 * Path to the app icon, used for the BrowserWindow icon on Linux/Windows. Packaged builds
 * ship it as an extraResource alongside bible.db; in dev it is read straight from the
 * repo's resources folder.
 */
function iconPath(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'icon.png')
    : join(app.getAppPath(), 'resources', 'icon.png')
}

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
    icon: iconPath(),
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
    icon: iconPath(),
    webPreferences: { preload: PRELOAD },
  })
  lockNavigation(win)
  load(win, 'display')
  return win
}

/**
 * Puts the display window fullscreen on the target monitor (the preferred one if connected and
 * not the primary, otherwise the first non-primary monitor). Falls back to a windowed placement
 * on the primary's work area if there is no non-primary target, or if the target is the primary
 * (chosen explicitly as "this screen").
 */
export function placeDisplayWindow(
  win: BrowserWindow,
  preferredId: number | null,
): { secondMonitor: boolean; monitorId: number | null } {
  const primary = screen.getPrimaryDisplay()
  const target = pickDisplay(screen.getAllDisplays(), primary.id, preferredId)
  if (win.isFullScreen()) win.setFullScreen(false)
  if (target && target.id !== primary.id) {
    win.setBounds(target.bounds)
    win.setFullScreen(true)
    win.showInactive()
    return { secondMonitor: true, monitorId: target.id }
  }
  const { x, y, width, height } = primary.workArea
  win.setBounds({
    x: x + Math.round(width * 0.2),
    y: y + Math.round(height * 0.15),
    width: Math.round(width * 0.6),
    height: Math.round(height * 0.6),
  })
  win.showInactive()
  return { secondMonitor: false, monitorId: primary.id }
}
