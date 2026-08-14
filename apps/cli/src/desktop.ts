/**
 * `dsh desktop` — open the Electron shell over the web profile.
 * @module @deepseek-ai/dsh/desktop
 */

import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Must match `@deepseek-ai/dsh-desktop` `DSH_DESKTOP_NODE_ENV`. */
const DSH_DESKTOP_NODE_ENV = 'DSH_DESKTOP_NODE'
/** Must match `@deepseek-ai/dsh-desktop` `DSH_DESKTOP_CWD_ENV`. */
const DSH_DESKTOP_CWD_ENV = 'DSH_DESKTOP_CWD'
/** Must match `@deepseek-ai/dsh-desktop` `DSH_DESKTOP_BIN_ENV`. */
const DSH_DESKTOP_BIN_ENV = 'DSH_DESKTOP_BIN'

/** Checkout desktop package (src/ and lib/ both sit one level under apps/cli). */
const DESKTOP_ROOT = fileURLToPath(new URL('../../desktop/', import.meta.url))

/**
 * Spawn Electron with the desktop main script and wait for it to exit.
 * @param args - extra arguments forwarded after the main script.
 * @returns the Electron process exit code.
 */
export async function runDesktop(args: readonly string[]): Promise<number> {
  const main = join(DESKTOP_ROOT, 'lib', 'main.js')
  if (!existsSync(main)) {
    process.stderr.write(
      'dsh desktop: apps/desktop/lib/main.js is not built; run pnpm run build from the repository root\n',
    )
    return 1
  }
  let electron: string
  try {
    const require = createRequire(join(DESKTOP_ROOT, 'package.json'))
    electron = require('electron') as string
  } catch {
    process.stderr.write(
      'dsh desktop: electron is not installed; from a checkout run pnpm install, or use the packaged desktop app\n',
    )
    return 1
  }
  const child = spawn(electron, [main, ...args], {
    stdio: 'inherit',
    env: {
      ...process.env,
      [DSH_DESKTOP_NODE_ENV]: process.execPath,
      [DSH_DESKTOP_BIN_ENV]: process.argv[1] ?? '',
      [DSH_DESKTOP_CWD_ENV]: process.cwd(),
    },
  })
  return await new Promise((resolve) => {
    child.on('exit', (code) => {
      resolve(code ?? 1)
    })
    child.on('error', (error) => {
      process.stderr.write(`dsh desktop: failed to spawn Electron: ${error.message}\n`)
      resolve(1)
    })
  })
}
