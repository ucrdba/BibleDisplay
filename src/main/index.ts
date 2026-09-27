import { app, BrowserWindow } from 'electron'
import { join } from 'node:path'

app.whenReady().then(() => {
  const win = new BrowserWindow({ width: 900, height: 600, autoHideMenuBar: true })
  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) void win.loadURL(devUrl)
  else void win.loadFile(join(__dirname, '../renderer/index.html'))
})

app.on('window-all-closed', () => app.quit())
