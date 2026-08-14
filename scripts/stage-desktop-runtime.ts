/**
 * Stage the self-contained Node + `dsh` closure that electron-builder copies
 * into extraResources/harness. The packaged Electron binary is not a Node ABI
 * host; the copied `node` runs `dsh web` with the same native addons as CLI.
 */

import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { chmodSync, copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const staging = join(root, '.artifacts/desktop-runtime')
/** Pinned Node that satisfies the repo `engines.node` floor (`^22.19.0`). */
const BUNDLED_NODE_VERSION = '22.19.0'

/**
 * Env that pins the bundled Node arch when electron-builder packs `--arm64`
 * or `--x64` on a host of the other arch.
 */
export const DSH_DESKTOP_NODE_ARCH_ENV = 'DSH_DESKTOP_NODE_ARCH'

/**
 * Run a command with inherited stdio and reject on a non-zero exit.
 * @param command - executable.
 * @param args - argv.
 * @param cwd - working directory.
 */
async function run(command: string, args: string[], cwd = root): Promise<void> {
  await new Promise<void>((resolveRun, reject) => {
    const child = spawn(command, args, { cwd, stdio: 'inherit' })
    child.on('error', reject)
    child.on('exit', (code) => {
      if (code === 0) resolveRun()
      else reject(new Error(`${command} ${args.join(' ')} exited ${String(code)}`))
    })
  })
}

/**
 * Deploy `@deepseek-ai/dsh` and copy this process's Node beside it.
 */
async function main(): Promise<void> {
  if (existsSync(staging)) rmSync(staging, { recursive: true, force: true })
  const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
  await run(pnpm, [
    '--filter',
    '@deepseek-ai/dsh',
    'deploy',
    '--legacy',
    '--prod',
    '--config.node-linker=hoisted',
    '--config.auto-install-peers=false',
    '--config.link-workspace-packages=true',
    staging,
  ])
  const nodeName = process.platform === 'win32' ? 'node.exe' : 'node'
  const nodeDest = join(staging, nodeName)
  await installBundledNode(nodeDest)
  if (process.platform !== 'win32') chmodSync(nodeDest, 0o755)
  const bin = join(staging, 'lib', 'bin.js')
  if (!existsSync(bin)) {
    throw new Error(`stage-desktop-runtime: missing ${bin}; pnpm deploy did not produce the dsh bin`)
  }
  const frontend = join(staging, 'node_modules', '@deepseek-ai', 'dsh-web-frontend', 'dist', 'index.html')
  if (!existsSync(frontend)) {
    throw new Error(`stage-desktop-runtime: missing ${frontend}; build the web frontend before packaging`)
  }
  completeWorkspaceClosure(staging, join(root, 'apps/cli/package.json'))
}

/**
 * Copy every workspace package reachable from the dsh app (dependencies and
 * required peers) into the staged `node_modules`. `pnpm deploy --prod` omits
 * peers that the repo only resolves through hoisting, such as
 * `@deepseek-ai/cordis-plugin-group`.
 * @param staging - the deploy root.
 * @param installAnchor - absolute path of `apps/cli/package.json`.
 */
export function completeWorkspaceClosure(staging: string, installAnchor: string): void {
  const modulesDir = join(staging, 'node_modules')
  const appManifest = JSON.parse(readFileSync(installAnchor, 'utf8')) as {
    name?: string
    dependencies?: Record<string, string>
    peerDependencies?: Record<string, string>
  }
  const seen = new Map<string, string>()
  if (appManifest.name !== undefined) seen.set(appManifest.name, dirname(installAnchor))
  const queue: string[] = [installAnchor]
  for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
    const manifest = JSON.parse(readFileSync(next, 'utf8')) as {
      dependencies?: Record<string, string>
      peerDependencies?: Record<string, string>
      peerDependenciesMeta?: Record<string, { optional?: boolean }>
    }
    const names = [
      ...Object.keys(manifest.dependencies ?? {}),
      ...Object.keys(manifest.peerDependencies ?? {}).filter(name => manifest.peerDependenciesMeta?.[name]?.optional !== true),
    ]
    for (const name of names) {
      if (seen.has(name)) continue
      const dir = resolvePackageDir(next, name)
      if (dir === undefined) continue
      seen.set(name, dir)
      queue.push(join(dir, 'package.json'))
    }
  }
  let copied = 0
  for (const [name, dir] of seen) {
    const dest = join(modulesDir, ...name.split('/'))
    if (existsSync(join(dest, 'package.json'))) continue
    mkdirSync(dirname(dest), { recursive: true })
    cpSync(dir, dest, {
      recursive: true,
      dereference: true,
      filter: (path) => {
        const base = path.slice(dir.length)
        return base !== `${sep}node_modules` && !base.startsWith(`${sep}node_modules${sep}`)
      },
    })
    copied += 1
  }
  console.log(`stage-desktop-runtime: completed workspace closure (+${String(copied)} packages)`)
}

/**
 * Install a Node binary that can run the packaged web host.
 * Copies this process when it already meets the engine floor; otherwise
 * downloads the official binary for the current platform.
 * @param dest - destination `node` / `node.exe` path.
 */
async function installBundledNode(dest: string): Promise<void> {
  if (resolveDesktopNodeArch() === process.arch && nodeMeetsEngineFloor(process.versions.node)) {
    copyFileSync(process.execPath, dest)
    return
  }
  const spec = bundledNodeArchive()
  const tmp = join(root, '.artifacts', `node-${BUNDLED_NODE_VERSION}-${spec.tag}`)
  mkdirSync(tmp, { recursive: true })
  const archive = join(tmp, spec.filename)
  if (!existsSync(archive)) {
    console.log(`stage-desktop-runtime: downloading ${spec.url}`)
    const response = await fetch(spec.url)
    if (!response.ok) {
      throw new Error(`stage-desktop-runtime: failed to download ${spec.url}: ${String(response.status)}`)
    }
    writeFileSync(archive, Buffer.from(await response.arrayBuffer()))
  }
  if (spec.filename.endsWith('.zip')) {
    await run('tar', ['-xf', archive, '-C', tmp])
  } else {
    await run('tar', ['-xzf', archive, '-C', tmp])
  }
  const extracted = join(tmp, spec.extractedBin)
  if (!existsSync(extracted)) {
    throw new Error(`stage-desktop-runtime: downloaded Node archive missing ${extracted}`)
  }
  copyFileSync(extracted, dest)
}

/**
 * Whether `version` satisfies the packaged-host floor (Node 22.19+ or 24+).
 * @param version - `process.versions.node`.
 * @returns true when this Node can load `node:zlib` `createZstdDecompress`.
 */
export function nodeMeetsEngineFloor(version: string): boolean {
  const [major = 0, minor = 0] = version.split('.').map(part => Number(part))
  return major > 22 || (major === 22 && minor >= 19) || major >= 24
}

/**
 * Arch of the Node binary that must sit next to `dsh` in the installer.
 * Defaults to this process; `DSH_DESKTOP_NODE_ARCH` overrides when a
 * same-OS electron-builder `--arm64` / `--x64` pack needs the other binary.
 * @param env - environment to read; defaults to `process.env`.
 * @param processArch - `process.arch` fallback.
 * @returns `arm64` or `x64`.
 */
export function resolveDesktopNodeArch(
  env: NodeJS.ProcessEnv = process.env,
  processArch: string = process.arch,
): 'arm64' | 'x64' {
  const override = env[DSH_DESKTOP_NODE_ARCH_ENV]
  if (override === 'arm64' || override === 'x64') return override
  if (override !== undefined && override !== '') {
    throw new Error(`stage-desktop-runtime: unsupported ${DSH_DESKTOP_NODE_ARCH_ENV} ${override}`)
  }
  if (processArch === 'arm64' || processArch === 'x64') return processArch
  throw new Error(`stage-desktop-runtime: unsupported arch ${processArch}`)
}

/** Official Node distribution archive for the current platform. */
function bundledNodeArchive(): { url: string; filename: string; tag: string; extractedBin: string } {
  const arch = resolveDesktopNodeArch()
  if (process.platform === 'darwin' || process.platform === 'linux') {
    const os = process.platform === 'darwin' ? 'darwin' : 'linux'
    const tag = `${os}-${arch}`
    const filename = `node-v${BUNDLED_NODE_VERSION}-${tag}.tar.gz`
    return {
      url: `https://nodejs.org/dist/v${BUNDLED_NODE_VERSION}/${filename}`,
      filename,
      tag,
      extractedBin: join(`node-v${BUNDLED_NODE_VERSION}-${tag}`, 'bin', 'node'),
    }
  }
  if (process.platform === 'win32') {
    const tag = `win-${arch}`
    const filename = `node-v${BUNDLED_NODE_VERSION}-${tag}.zip`
    return {
      url: `https://nodejs.org/dist/v${BUNDLED_NODE_VERSION}/${filename}`,
      filename,
      tag,
      extractedBin: join(`node-v${BUNDLED_NODE_VERSION}-${tag}`, 'node.exe'),
    }
  }
  throw new Error(`stage-desktop-runtime: unsupported platform ${process.platform}`)
}

/**
 * Resolve a package directory from an already-resolved manifest path.
 * @param anchor - absolute package.json path of the depender.
 * @param name - package name to resolve.
 * @returns the package directory, or `undefined` when it is not installed.
 */
function resolvePackageDir(anchor: string, name: string): string | undefined {
  try {
    return dirname(createRequire(anchor).resolve(`${name}/package.json`))
  } catch {
    return undefined
  }
}

const invokedDirectly = process.argv[1] !== undefined
  && fileURLToPath(import.meta.url) === resolve(process.argv[1])
if (invokedDirectly) await main()
