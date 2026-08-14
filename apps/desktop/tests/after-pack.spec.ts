import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs'
import { readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { copyHarnessRuntime } = require('../after-pack.cjs') as {
  copyHarnessRuntime: (src: string, dest: string) => void
}

describe('copyHarnessRuntime', () => {
  it('copies node_modules through a symlink so the bundle can resolve packages', () => {
    const root = mkdtempSync(join(tmpdir(), 'dsh-desktop-after-pack-'))
    const src = join(root, 'src')
    const store = join(src, '.pnpm', 'dsh-app-boot', 'lib')
    mkdirSync(store, { recursive: true })
    writeFileSync(join(store, 'index.js'), 'export const ok = true\n')
    mkdirSync(join(src, 'node_modules', '@deepseek-ai'), { recursive: true })
    symlinkSync(store, join(src, 'node_modules', '@deepseek-ai', 'dsh-app-boot'))
    writeFileSync(join(src, 'lib-bin-marker'), 'bin\n')
    const dest = join(root, 'dest', 'harness')
    copyHarnessRuntime(src, dest)
    expect(readFileSync(join(dest, 'node_modules', '@deepseek-ai', 'dsh-app-boot', 'index.js'), 'utf8'))
      .toBe('export const ok = true\n')
    expect(readFileSync(join(dest, 'lib-bin-marker'), 'utf8')).toBe('bin\n')
  })

  it('fails loud when the staged runtime is missing', () => {
    expect(() => copyHarnessRuntime(join(tmpdir(), 'missing-desktop-runtime'), join(tmpdir(), 'dest')))
      .toThrow('staged runtime missing')
  })
})
