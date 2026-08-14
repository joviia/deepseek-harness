import { describe, expect, it } from 'vitest'
import {
  DSH_DESKTOP_NODE_ARCH_ENV,
  nodeMeetsEngineFloor,
  resolveDesktopNodeArch,
} from './stage-desktop-runtime.ts'

describe('nodeMeetsEngineFloor', () => {
  it('accepts the repo engine floor and rejects older 22.x', () => {
    expect(nodeMeetsEngineFloor('22.14.0')).toBe(false)
    expect(nodeMeetsEngineFloor('22.19.0')).toBe(true)
    expect(nodeMeetsEngineFloor('24.0.0')).toBe(true)
    expect(nodeMeetsEngineFloor('20.19.0')).toBe(false)
  })
})

describe('resolveDesktopNodeArch', () => {
  it('uses the process arch when the env is unset', () => {
    expect(resolveDesktopNodeArch({}, 'arm64')).toBe('arm64')
    expect(resolveDesktopNodeArch({}, 'x64')).toBe('x64')
  })

  it('lets DSH_DESKTOP_NODE_ARCH override the process arch', () => {
    expect(resolveDesktopNodeArch({ [DSH_DESKTOP_NODE_ARCH_ENV]: 'x64' }, 'arm64')).toBe('x64')
    expect(resolveDesktopNodeArch({ [DSH_DESKTOP_NODE_ARCH_ENV]: 'arm64' }, 'x64')).toBe('arm64')
  })

  it('rejects an arch electron-builder cannot pack', () => {
    expect(() => resolveDesktopNodeArch({ [DSH_DESKTOP_NODE_ARCH_ENV]: 'ia32' }, 'arm64'))
      .toThrow(DSH_DESKTOP_NODE_ARCH_ENV)
    expect(() => resolveDesktopNodeArch({}, 'ia32')).toThrow('unsupported arch')
  })
})
