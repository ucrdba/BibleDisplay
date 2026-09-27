import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { BibleApi, Unsubscribe } from '../shared/api'
import { IPC } from '../shared/ipc'

function subscribe<T>(channel: string, cb: (value: T) => void): Unsubscribe {
  const handler = (_e: IpcRendererEvent, value: T) => cb(value)
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

const api: BibleApi = {
  control: {
    verseCounts: () => ipcRenderer.invoke(IPC.verseCounts),
    loadGroups: groups => ipcRenderer.invoke(IPC.loadGroups, groups),
    getStyles: () => ipcRenderer.invoke(IPC.getStyles),
    setStyles: styles => ipcRenderer.invoke(IPC.setStyles, styles),
    addHighlights: (ranges, color) => ipcRenderer.invoke(IPC.addHighlights, ranges, color),
    removeHighlights: ranges => ipcRenderer.invoke(IPC.removeHighlights, ranges),
    addRecent: input => ipcRenderer.invoke(IPC.addRecent, input),
    listRecent: () => ipcRenderer.invoke(IPC.listRecent),
    removeRecent: inputs => ipcRenderer.invoke(IPC.removeRecent, inputs),
    importList: () => ipcRenderer.invoke(IPC.importList),
    saveTextFile: (suggestedName, content) => ipcRenderer.invoke(IPC.saveTextFile, suggestedName, content),
    listImported: () => ipcRenderer.invoke(IPC.listImported),
    clearImported: () => ipcRenderer.invoke(IPC.clearImported),
    removeImported: indices => ipcRenderer.invoke(IPC.removeImported, indices),
    listFonts: () => ipcRenderer.invoke(IPC.listFonts),
    getDisplayInfo: () => ipcRenderer.invoke(IPC.getDisplayInfo),
    setDisplayMonitor: id => ipcRenderer.invoke(IPC.setDisplayMonitor, id),
    present: state => ipcRenderer.send(IPC.present, state),
    scroll: cmd => ipcRenderer.send(IPC.scroll, cmd),
    onDisplayInfo: cb => subscribe(IPC.evtDisplayInfo, cb),
    onScrollPos: cb => subscribe(IPC.evtScrollPos, cb),
  },
  display: {
    ready: () => ipcRenderer.invoke(IPC.displayReady),
    onState: cb => subscribe(IPC.evtState, cb),
    onStyles: cb => subscribe(IPC.evtStyles, cb),
    onScroll: cb => subscribe(IPC.evtScroll, cb),
    reportScroll: top => ipcRenderer.send(IPC.reportScroll, top),
  },
}

contextBridge.exposeInMainWorld('bible', api)
