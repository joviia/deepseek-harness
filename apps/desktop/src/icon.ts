/**
 * Resolve the branded desktop icon shipped under `apps/desktop/build/`.
 * @module @deepseek-ai/dsh-desktop/icon
 */

import { fileURLToPath } from 'node:url'

/**
 * Absolute path to the 1024px PNG. Checkout tests resolve it from `src/`;
 * the packaged asar and `electron .` resolve it from `lib/`.
 * @param fromUrl - module URL to resolve from; defaults to this module.
 * @returns filesystem path of `build/icon.png`.
 */
export function resolveDesktopIconPng(fromUrl = import.meta.url): string {
  return fileURLToPath(new URL('../build/icon.png', fromUrl))
}
