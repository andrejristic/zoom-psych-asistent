import { app, BrowserWindow, dialog, globalShortcut, ipcMain, Menu, nativeImage, screen, shell, Tray } from 'electron'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { AwsInput, MainEvent, Settings, StartOptions } from '../shared/ipc'
import type { ConversationContext } from '../core/types'
import { listDevices } from './audio'
import { connectAnthropic, connectAws, connections, disconnect } from './connections'
import { reportMarkdown } from './report'
import { listDemos, SessionManager } from './session'
import { listSessions, loadSession, loadSettings, saveSettings, sessionsDir } from './store'

const HIDE_SHORTCUT = 'CommandOrControl+Shift+H'
const LINKS = {
  'anthropic-console': 'https://console.anthropic.com/settings/keys',
  'aws-console': 'https://console.aws.amazon.com/iam/home#/security_credentials'
}

let win: BrowserWindow | undefined
let tray: Tray | undefined
let settings: Settings = loadSettings()

function send(ev: MainEvent): void {
  win?.webContents.send('event', ev)
}

const sessions = new SessionManager(send, () => settings)

function iconPath(): string {
  return app.isPackaged ? join(process.resourcesPath, 'icons', 'icon.png') : join(app.getAppPath(), 'build', 'icon.png')
}

// Development check: PSYCH_SHOT=<dir> renders off screen, plays a demo and saves screenshots.
const SHOT_DIR = process.env['PSYCH_SHOT']

function createWindow(): void {
  const area = screen.getPrimaryDisplay().workArea
  const width = 400
  win = new BrowserWindow({
    show: !SHOT_DIR,
    width,
    height: area.height,
    x: area.x + area.width - width,
    y: area.y,
    minWidth: 320,
    minHeight: 480,
    frame: false,
    backgroundColor: '#11151c',
    alwaysOnTop: settings.alwaysOnTop,
    icon: iconPath(),
    title: 'Psych Asistent',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      offscreen: !!SHOT_DIR
    }
  })
  if (SHOT_DIR) {
    win.setSize(width, 900)
    win.webContents.once('did-finish-load', () => void screenshotTour(SHOT_DIR))
  }
  // Invisible to screen sharing on Windows and macOS. Linux (X11) has no such
  // mechanism; there the user hides the window with the shortcut or the tray.
  win.setContentProtection(true)
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  win.on('closed', () => (win = undefined))
  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) void win.loadURL(devUrl)
  else void win.loadFile(join(__dirname, '../renderer/index.html'))
}

function toggleHidden(): void {
  if (!win) return
  if (win.isVisible()) win.hide()
  else win.showInactive()
  send({ kind: 'visibility', hidden: !win.isVisible() })
  updateTray()
}

function updateTray(): void {
  if (!tray) return
  const sr = settings.uiLang === 'sr'
  const visible = win?.isVisible() ?? false
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: visible ? (sr ? 'Sakrij (Ctrl+Shift+H)' : 'Hide (Ctrl+Shift+H)') : sr ? 'Prikaži (Ctrl+Shift+H)' : 'Show (Ctrl+Shift+H)', click: toggleHidden },
      { type: 'separator' },
      { label: sr ? 'Izađi' : 'Quit', click: () => app.quit() }
    ])
  )
}

function registerIpc(): void {
  ipcMain.handle('settings:get', () => settings)
  ipcMain.handle('settings:set', (_e, patch: Partial<Settings>) => {
    settings = { ...settings, ...patch }
    saveSettings(settings)
    if (patch.alwaysOnTop !== undefined) win?.setAlwaysOnTop(settings.alwaysOnTop)
    if (patch.uiLang) updateTray()
    return settings
  })
  ipcMain.handle('devices:list', () => listDevices())
  ipcMain.handle('demos:list', () => listDemos())
  ipcMain.handle('transcript:pick', async () => {
    const r = await dialog.showOpenDialog(win!, {
      properties: ['openFile'],
      filters: [{ name: 'Transcript', extensions: ['txt', 'json'] }]
    })
    return r.canceled ? undefined : r.filePaths[0]
  })
  ipcMain.handle('session:start', (_e, opts: StartOptions) => sessions.start(opts))
  ipcMain.handle('session:stop', () => sessions.stop())
  ipcMain.handle('audio:test', (_e, seconds: number) => sessions.testAudio(seconds))
  ipcMain.handle('advice:feedback', (_e, id: string, rating: 'up' | 'down' | undefined) => sessions.feedback(id, rating))
  ipcMain.handle('context:set', (_e, ctx: ConversationContext) => sessions.setContext(ctx))
  ipcMain.handle('sessions:list', () => listSessions())
  ipcMain.handle('connections:get', () => connections())
  ipcMain.handle('connections:anthropic', (_e, key: string) => connectAnthropic(key))
  ipcMain.handle('connections:aws', (_e, input: AwsInput) => connectAws(input))
  ipcMain.handle('connections:disconnect', (_e, kind: 'anthropic' | 'aws') => disconnect(kind))
  ipcMain.handle('report:export', async (_e, id: string) => {
    const s = loadSession(id) ?? (sessions.last?.id === id ? sessions.last : undefined)
    if (!s) return undefined
    const r = await dialog.showSaveDialog(win!, {
      defaultPath: `${s.report.title.replace(/[^\p{L}\p{N} _-]+/gu, '')}.md`,
      filters: [{ name: 'Markdown', extensions: ['md'] }]
    })
    if (r.canceled || !r.filePath) return undefined
    writeFileSync(r.filePath, reportMarkdown(s.report, s.transcript, settings.uiLang))
    return r.filePath
  })
  ipcMain.handle('external:open', (_e, target: keyof typeof LINKS | 'sessions-folder') => {
    if (target === 'sessions-folder') return shell.openPath(sessionsDir())
    if (target in LINKS) return shell.openExternal(LINKS[target])
  })
  ipcMain.handle('window', (_e, action: 'minimize' | 'close' | 'hide') => {
    if (action === 'minimize') win?.minimize()
    if (action === 'close') win?.close()
    if (action === 'hide') toggleHidden()
  })
}

async function screenshotTour(dir: string): Promise<void> {
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
  const shot = async (name: string) => writeFileSync(join(dir, `${name}.png`), (await win!.webContents.capturePage()).toPNG())
  const demo = process.env['PSYCH_SHOT_DEMO'] ?? 'en-sales-call.txt'
  settings = { ...settings, replaySpeed: 8, uiLang: (process.env['PSYCH_SHOT_LANG'] as Settings['uiLang']) ?? settings.uiLang }
  win!.webContents.reload()
  await wait(1500)
  await shot('1-start')
  await win!.webContents.executeJavaScript("document.querySelectorAll('.titlebar .icon')[1].click()")
  await wait(800)
  await shot('0-settings')
  await win!.webContents.executeJavaScript("document.querySelectorAll('.titlebar .icon')[1].click()")
  await sessions.start({ mode: 'replay', demoId: demo })
  await wait(17000)
  await shot('2-live')
  await wait(9000)
  await shot('3-later')
  await wait(20000)
  await shot('4-report')
  app.quit()
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    win?.show()
    win?.focus()
  })

  void app.whenReady().then(() => {
    registerIpc()
    createWindow()
    globalShortcut.register(HIDE_SHORTCUT, toggleHidden)
    try {
      tray = new Tray(nativeImage.createFromPath(iconPath()).resize({ width: 22, height: 22 }))
      tray.setToolTip('Psych Asistent')
      updateTray()
    } catch {
      // No tray on this desktop; the shortcut still works.
    }
  })

  app.on('will-quit', () => globalShortcut.unregisterAll())
  app.on('window-all-closed', () => {
    void sessions.stop().finally(() => app.quit())
  })
}
