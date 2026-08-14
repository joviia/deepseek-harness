import { describe, expect, it } from 'vitest'
import {
  DSH_DESKTOP_BIN_ENV,
  DSH_DESKTOP_CWD_ENV,
  DSH_DESKTOP_NODE_ENV,
  resolveDesktopLaunch,
} from '../src/paths.ts'

describe('resolveDesktopLaunch', () => {
  it('points a packaged launch at extraResources harness + bundled Node', () => {
    const launch = resolveDesktopLaunch({
      packaged: true,
      resourcesPath: '/App/Resources',
      env: { DSH_HOME: '/tmp/dsh-home' },
      homedir: '/Users/dev',
    })
    expect(launch.home).toBe('/tmp/dsh-home')
    expect(launch.cwd).toBe('/Users/dev')
    expect(launch.node).toMatch(/[/\\]harness[/\\]node(?:\.exe)?$/)
    expect(launch.argv[0]).toMatch(/[/\\]harness[/\\]lib[/\\]bin\.js$/)
    expect(launch.argv.slice(1)).toEqual(['web', '--host', '127.0.0.1', '--port', '0'])
  })

  it('uses the launcher-exported Node and source bin for a checkout launch', () => {
    const launch = resolveDesktopLaunch({
      packaged: false,
      resourcesPath: '/unused',
      env: {
        [DSH_DESKTOP_NODE_ENV]: '/usr/bin/node',
        [DSH_DESKTOP_BIN_ENV]: '/repo/apps/cli/src/bin.ts',
        [DSH_DESKTOP_CWD_ENV]: '/repo',
        DSH_HOME: '/tmp/dsh-home',
      },
    })
    expect(launch).toEqual({
      node: '/usr/bin/node',
      argv: ['--import', 'tsx/esm', '/repo/apps/cli/src/bin.ts', 'web', '--host', '127.0.0.1', '--port', '0'],
      cwd: '/repo',
      home: '/tmp/dsh-home',
    })
  })

  it('runs a built bin without the tsx loader', () => {
    const launch = resolveDesktopLaunch({
      packaged: false,
      resourcesPath: '/unused',
      env: {
        [DSH_DESKTOP_NODE_ENV]: '/usr/bin/node',
        [DSH_DESKTOP_BIN_ENV]: '/repo/apps/cli/lib/bin.js',
        [DSH_DESKTOP_CWD_ENV]: '/repo',
        DSH_HOME: '/tmp/dsh-home',
      },
    })
    expect(launch.argv).toEqual(['/repo/apps/cli/lib/bin.js', 'web', '--host', '127.0.0.1', '--port', '0'])
  })

  it('rejects a checkout launch that forgot the launcher env', () => {
    expect(() => resolveDesktopLaunch({
      packaged: false,
      resourcesPath: '/unused',
      env: {},
    })).toThrow('DSH_DESKTOP_NODE')
  })
})
