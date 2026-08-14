/**
 * Create the single BrowserWindow that loads the Web host URL.
 * @module @deepseek-ai/dsh-desktop/window
 */

import { BrowserWindow } from 'electron'
import { resolveDesktopIconPng } from './icon.ts'

/** Default window size for a first launch. */
const DEFAULT_WINDOW_WIDTH = 1280
/** Default window height for a first launch. */
const DEFAULT_WINDOW_HEIGHT = 800

/**
 * Open a sandboxed window on `url` and show it once the first paint is ready.
 * @param url - the loopback Web host URL from the lock file.
 * @returns the created window.
 */
export function createAppWindow(url: string): BrowserWindow {
  const window = new BrowserWindow({
    width: DEFAULT_WINDOW_WIDTH,
    height: DEFAULT_WINDOW_HEIGHT,
    show: false,
    title: 'DeepSeek Harness',
    icon: resolveDesktopIconPng(),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  window.once('ready-to-show', () => {
    window.show()
  })
  void window.loadURL(url)
  return window
}
