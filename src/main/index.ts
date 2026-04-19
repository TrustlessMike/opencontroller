import './store-instance'
import { app, BrowserWindow, globalShortcut, Tray, session, Menu, shell } from 'electron'
import { join } from 'path'
import { registerIPCHandlers } from './ipc/handlers'
import { bootstrapConfigFromDiskIfNeeded } from './bootstrap-config'
import { createTray } from './tray'

app.setName('opencontroller')

// Crash-resilience: any uncaught error or rejected promise in the main process
// used to SIGTERM the whole app. Log + keep running.
process.on('uncaughtException', (err) => {
  // eslint-disable-next-line no-console
  console.error('[opencontroller] uncaughtException:', err)
})
process.on('unhandledRejection', (reason) => {
  // eslint-disable-next-line no-console
  console.error('[opencontroller] unhandledRejection:', reason)
})

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let isQuitting = false

function showOrCreate(): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (!mainWindow.isVisible()) mainWindow.show()
    mainWindow.focus()
    return
  }
  createWindow()
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    title: 'opencontroller',
    width: 960,
    height: 720,
    minWidth: 720,
    minHeight: 520,
    show: false,
    frame: false,
    titleBarStyle: 'hiddenInset',
    vibrancy: 'under-window',
    visualEffectState: 'active',
    backgroundColor: '#00000000',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      // Keep devtools enabled in packaged builds so crash stacks are
      // recoverable: ⌥⌘I / F12 opens them.
      devTools: true
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  // target="_blank" / window.open(…) links in the renderer would otherwise
  // spawn an unmanaged BrowserWindow (frameless, insecure, often crashes the
  // GPU process on macOS). Intercept: open http(s) in the default browser,
  // deny everything else.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) {
      void shell.openExternal(url)
    }
    return { action: 'deny' }
  })

  // Same for in-page navigations — block renderer from navigating away
  // from our loaded file (no white-screen if something tries to push state).
  mainWindow.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('file://') && !url.startsWith(process.env['ELECTRON_RENDERER_URL'] ?? '')) {
      e.preventDefault()
      if (/^https?:\/\//.test(url)) void shell.openExternal(url)
    }
  })

  // macOS: user clicking the red close button should hide, not destroy —
  // otherwise Cmd+Shift+Space / tray-click can't bring it back and it
  // feels like the app "crashed".
  mainWindow.on('close', (e) => {
    if (!isQuitting && process.platform === 'darwin') {
      e.preventDefault()
      mainWindow?.hide()
    }
  })

  // If the renderer process dies (SIGKILL, OOM, native crash), rebuild it.
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    // eslint-disable-next-line no-console
    console.error('[opencontroller] renderer gone:', details.reason, details.exitCode)
    if (details.reason !== 'clean-exit' && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.reload()
    }
  })

  // Toggle DevTools with ⌥⌘I or F12 for debugging field crashes.
  mainWindow.webContents.on('before-input-event', (_e, input) => {
    const cmd = input.meta || input.control
    if ((input.key === 'i' || input.key === 'I') && cmd && input.alt) {
      mainWindow?.webContents.toggleDevTools()
    }
    if (input.key === 'F12') {
      mainWindow?.webContents.toggleDevTools()
    }
    // Cmd+R reloads
    if ((input.key === 'r' || input.key === 'R') && cmd) {
      mainWindow?.webContents.reload()
    }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(async () => {
  try {
    // Auto-grant media permissions (microphone for dictation) so the
    // renderer's Web Speech Recognition doesn't hang on a denied prompt.
    session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => {
      const allow = ['media', 'mediaKeySystem', 'audioCapture', 'notifications']
      cb(allow.includes(permission))
    })

    // macOS: give the app a minimal menu so Cmd+Q, Cmd+W, copy/paste, and
    // DevTools entries work correctly. Without this, keyboard shortcuts
    // silently no-op and the app feels broken.
    if (process.platform === 'darwin') {
      const template: Electron.MenuItemConstructorOptions[] = [
        {
          label: app.name,
          submenu: [
            { role: 'about' },
            { type: 'separator' },
            { role: 'hide' },
            { role: 'hideOthers' },
            { role: 'unhide' },
            { type: 'separator' },
            {
              label: 'Quit ' + app.name,
              accelerator: 'Cmd+Q',
              click: () => {
                isQuitting = true
                app.quit()
              }
            }
          ]
        },
        {
          label: 'Edit',
          submenu: [
            { role: 'undo' },
            { role: 'redo' },
            { type: 'separator' },
            { role: 'cut' },
            { role: 'copy' },
            { role: 'paste' },
            { role: 'selectAll' }
          ]
        },
        {
          label: 'View',
          submenu: [
            { role: 'reload' },
            { role: 'forceReload' },
            { role: 'toggleDevTools' },
            { type: 'separator' },
            { role: 'resetZoom' },
            { role: 'zoomIn' },
            { role: 'zoomOut' },
            { type: 'separator' },
            { role: 'togglefullscreen' }
          ]
        },
        {
          label: 'Window',
          submenu: [
            { role: 'minimize' },
            {
              label: 'Close Window',
              accelerator: 'Cmd+W',
              click: () => {
                BrowserWindow.getFocusedWindow()?.hide()
              }
            },
            { role: 'front' }
          ]
        }
      ]
      Menu.setApplicationMenu(Menu.buildFromTemplate(template))
    }

    registerIPCHandlers()
    await bootstrapConfigFromDiskIfNeeded()
    createWindow()
    try {
      tray = createTray(() => {
        if (!mainWindow || mainWindow.isDestroyed()) {
          showOrCreate()
          return
        }
        mainWindow.isVisible() ? mainWindow.hide() : showOrCreate()
      })
    } catch (e) {
      // Missing tray icon on some dev machines shouldn't kill the app.
      // eslint-disable-next-line no-console
      console.warn('[opencontroller] Tray unavailable:', e)
      tray = null
    }

    // Primary shortcut: Cmd+Ctrl+O (avoids Cmd+Shift+Space emoji-picker
    // collision on modern macOS). We also register the old one as a fallback.
    const primary = globalShortcut.register('CommandOrControl+Alt+O', showOrCreate)
    const fallback = globalShortcut.register('CommandOrControl+Shift+Space', showOrCreate)
    if (!primary && !fallback) {
      // eslint-disable-next-line no-console
      console.warn('[opencontroller] Could not register any global shortcut.')
    }

    // Push-to-talk: Cmd+Ctrl+Space toggles dictation. We route this through
    // a renderer event because the speech-recognition API only exists in the
    // renderer. The shortcut also surfaces the window so the user sees the
    // dictation indicator.
    globalShortcut.register('CommandOrControl+Control+Space', () => {
      showOrCreate()
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('ptt:toggle')
      }
    })

    app.on('activate', () => {
      showOrCreate()
    })

    app.on('before-quit', () => {
      isQuitting = true
    })
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[opencontroller] Startup error:', e)
  }
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})

// On macOS, don't quit when the window is closed — stay in the tray.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// Keep tray alive reference to satisfy linters.
void tray
