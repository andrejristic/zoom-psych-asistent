import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { Api, MainEvent } from '../shared/ipc'

const api: Api = {
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (patch) => ipcRenderer.invoke('settings:set', patch),
  listDevices: () => ipcRenderer.invoke('devices:list'),
  listDemos: () => ipcRenderer.invoke('demos:list'),
  pickTranscript: () => ipcRenderer.invoke('transcript:pick'),
  start: (opts) => ipcRenderer.invoke('session:start', opts),
  stop: () => ipcRenderer.invoke('session:stop'),
  testAudio: (seconds) => ipcRenderer.invoke('audio:test', seconds),
  feedback: (id, rating) => ipcRenderer.invoke('advice:feedback', id, rating),
  setContext: (ctx) => ipcRenderer.invoke('context:set', ctx),
  exportReport: (id) => ipcRenderer.invoke('report:export', id),
  listSessions: () => ipcRenderer.invoke('sessions:list'),
  openExternal: (target) => ipcRenderer.invoke('external:open', target),
  window: (action) => ipcRenderer.invoke('window', action),
  onEvent: (cb) => {
    const listener = (_e: IpcRendererEvent, ev: MainEvent) => cb(ev)
    ipcRenderer.on('event', listener)
    return () => ipcRenderer.removeListener('event', listener)
  }
}

contextBridge.exposeInMainWorld('api', api)
