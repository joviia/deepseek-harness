/**
 * Resolve the Node binary, `dsh web` argv, workspace cwd, and Harness home
 * for the desktop supervisor. Packaged launches use the extraResources
 * closure; checkout launches use the env the `dsh desktop` launcher exports.
 * @module @deepseek-ai/dsh-desktop/paths
 */

import { homedir } from 'node:os'
import { join } from 'node:path'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'

/** Loopback bind the packaged and checkout desktop hosts always use. */
const DESKTOP_WEB_HOST = '127.0.0.1'

/** OS-assigned port so a leftover browser `dsh web` on 3080 can still be attached. */
const DESKTOP_WEB_PORT = '0'

/** Env the `dsh desktop` launcher sets to the Node that should spawn `dsh`. */
export const DSH_DESKTOP_NODE_ENV = 'DSH_DESKTOP_NODE'

/** Env the `dsh desktop` launcher sets to the invoking workspace directory. */
export const DSH_DESKTOP_CWD_ENV = 'DSH_DESKTOP_CWD'

/** Env the `dsh desktop` launcher sets to the checkout `dsh` entry. */
export const DSH_DESKTOP_BIN_ENV = 'DSH_DESKTOP_BIN'

/** Facts the supervisor needs to spawn or attach a Web host. */
export interface DesktopLaunchPaths {
  /** Node executable that runs `dsh` (never Electron's own binary). */
  node: string
  /** Argv after `node`, including the `dsh` entry and `web` flags. */
  argv: string[]
  /** Working directory for the child (the default workspace). */
  cwd: string
  /** Harness home the child and the lock share. */
  home: string
}

/** Inputs {@link resolveDesktopLaunch} reads from the Electron process. */
export interface DesktopLaunchRequest {
  /** `app.isPackaged`. */
  packaged: boolean
  /** `process.resourcesPath` when packaged. */
  resourcesPath: string
  /** Process environment. */
  env: NodeJS.ProcessEnv
  /** Fallback cwd when packaged and no launcher cwd is set. */
  homedir?: string
}

/**
 * Resolve spawn facts for this desktop process.
 * @param request - packaged flag, resources path, and environment.
 * @returns node, argv, cwd, and home.
 * @throws when a checkout launch is missing `DSH_DESKTOP_NODE` or `DSH_DESKTOP_BIN`.
 */
export function resolveDesktopLaunch(request: DesktopLaunchRequest): DesktopLaunchPaths {
  const userHome = request.homedir ?? homedir()
  const home = resolveDshHome(undefined, request.env)
  const cwd = request.env[DSH_DESKTOP_CWD_ENV] !== undefined && request.env[DSH_DESKTOP_CWD_ENV] !== ''
    ? request.env[DSH_DESKTOP_CWD_ENV]
    : request.packaged
      ? userHome
      : process.cwd()
  const webArgs = ['web', '--host', DESKTOP_WEB_HOST, '--port', DESKTOP_WEB_PORT]
  if (request.packaged) {
    const root = join(request.resourcesPath, 'harness')
    const node = join(root, process.platform === 'win32' ? 'node.exe' : 'node')
    return {
      node,
      argv: [join(root, 'lib', 'bin.js'), ...webArgs],
      cwd,
      home,
    }
  }
  const node = request.env[DSH_DESKTOP_NODE_ENV]
  const bin = request.env[DSH_DESKTOP_BIN_ENV]
  if (node === undefined || node === '' || bin === undefined || bin === '') {
    throw new Error(
      'dsh desktop: checkout launch requires DSH_DESKTOP_NODE and DSH_DESKTOP_BIN (use `dsh desktop` or `pnpm run dev:desktop`)',
    )
  }
  return {
    node,
    argv: bin.endsWith('.ts') ? ['--import', 'tsx/esm', bin, ...webArgs] : [bin, ...webArgs],
    cwd,
    home,
  }
}
