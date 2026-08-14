/**
 * Electron main: single instance, attach-or-spawn the Web host, one window.
 * @module @deepseek-ai/dsh-desktop/main
 */

import { spawn, type ChildProcess } from 'node:child_process'
import { app, BrowserWindow, dialog, nativeImage } from 'electron'
import { DSH_HOME_ENV } from '@deepseek-ai/dsh-home-paths'
import { resolveHostSession } from './host-supervisor.ts'
import { resolveDesktopIconPng } from './icon.ts'
import { resolveDesktopLaunch } from './paths.ts'
import { createAppWindow } from './window.ts'

let ownedChild: ChildProcess | undefined

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const [window] = BrowserWindow.getAllWindows()
    if (window === undefined) return
    if (window.isMinimized()) window.restore()
    window.focus()
  })
  void app.whenReady().then(() => {
    void start()
  })
}

/**
 * Resolve the host URL, open the window, and own the child when we spawned it.
 */
async function start(): Promise<void> {
  const launch = resolveDesktopLaunch({
    packaged: app.isPackaged,
    resourcesPath: process.resourcesPath,
    env: process.env,
    homedir: app.getPath('home'),
  })
  try {
    const session = await resolveHostSession({
      home: launch.home,
      spawn: () => spawn(launch.node, launch.argv, {
        cwd: launch.cwd,
        env: { ...process.env, [DSH_HOME_ENV]: launch.home },
        stdio: ['ignore', 'pipe', 'pipe'],
      }),
    })
    if (session.owned) ownedChild = session.child
    // Packaged macOS already has icon.icns; setIcon(PNG) draws a raw square
    // and skips the Dock's squircle mask.
    if (process.platform === 'darwin' && !app.isPackaged) {
      app.dock?.setIcon(nativeImage.createFromPath(resolveDesktopIconPng()))
    }
    createAppWindow(session.url)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    dialog.showErrorBox('DeepSeek Harness', message)
    app.quit()
  }
}

app.on('window-all-closed', () => {
  app.quit()
})

app.on('before-quit', () => {
  if (ownedChild !== undefined && !ownedChild.killed) ownedChild.kill()
})
