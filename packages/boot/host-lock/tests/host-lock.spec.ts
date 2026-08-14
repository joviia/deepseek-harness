import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  acquireHostLock,
  hostLockPath,
  inspectHostLock,
  isProcessLive,
  occupiedHostMessage,
  publishHostLockUrl,
  releaseHostLock,
  waitForHostLockUrl,
} from '../src/index.ts'
import { apply, inject, name } from '../src/invariant.ts'

/** Isolated home for one test. */
function tempHome(): string {
  return mkdtempSync(join(tmpdir(), 'dsh-host-lock-'))
}

describe('host lock', () => {
  it('acquires exclusively, publishes a URL, and releases', () => {
    const home = tempHome()
    const first = acquireHostLock(home)
    expect(first.status).toBe('acquired')
    expect(inspectHostLock(home)).toMatchObject({ status: 'starting', record: { pid: process.pid } })
    expect(publishHostLockUrl('http://127.0.0.1:3080', home)).toBe(true)
    expect(inspectHostLock(home)).toEqual({
      status: 'ready',
      record: expect.objectContaining({
        pid: process.pid,
        url: 'http://127.0.0.1:3080',
      }),
    })
    expect(releaseHostLock(home)).toBe(true)
    expect(inspectHostLock(home)).toEqual({ status: 'absent' })
    expect(releaseHostLock(home)).toBe(false)
  })

  it('treats a second acquire from this pid as a no-op success', () => {
    const home = tempHome()
    expect(acquireHostLock(home).status).toBe('acquired')
    expect(acquireHostLock(home).status).toBe('acquired')
    expect(publishHostLockUrl('http://127.0.0.1:9', home)).toBe(true)
    const again = acquireHostLock(home)
    expect(again).toEqual({
      status: 'acquired',
      record: expect.objectContaining({ pid: process.pid, url: 'http://127.0.0.1:9' }),
    })
  })

  it('reports a live foreign owner as occupied', () => {
    const home = tempHome()
    writeFileSync(hostLockPath(home), `${JSON.stringify({
      pid: process.ppid,
      url: 'http://127.0.0.1:43123',
      createdAt: '2026-08-14T00:00:00.000Z',
    })}\n`)
    const result = acquireHostLock(home)
    expect(result.status).toBe('occupied')
    if (result.status !== 'occupied') throw new Error('expected occupied')
    expect(result.inspection).toEqual({
      status: 'ready',
      record: {
        pid: process.ppid,
        url: 'http://127.0.0.1:43123',
        createdAt: '2026-08-14T00:00:00.000Z',
      },
    })
    expect(occupiedHostMessage(result.inspection))
      .toBe('error: a DeepSeek Harness Web host is already running at http://127.0.0.1:43123')
    expect(publishHostLockUrl('http://127.0.0.1:1', home)).toBe(false)
    expect(releaseHostLock(home)).toBe(false)
  })

  it('steals a stale lock whose pid is dead', () => {
    const home = tempHome()
    writeFileSync(hostLockPath(home), `${JSON.stringify({
      pid: 2_147_483_647,
      createdAt: '2026-08-14T00:00:00.000Z',
    })}\n`)
    expect(inspectHostLock(home).status).toBe('stale')
    const result = acquireHostLock(home)
    expect(result.status).toBe('acquired')
    if (result.status !== 'acquired') throw new Error('expected acquired')
    expect(result.record.pid).toBe(process.pid)
  })

  it('steals an invalid lock file', () => {
    const home = tempHome()
    writeFileSync(hostLockPath(home), 'not-json\n')
    expect(inspectHostLock(home)).toEqual({
      status: 'invalid',
      reason: 'host.lock is not a HostLockRecord',
    })
    expect(acquireHostLock(home).status).toBe('acquired')
  })

  it('names a starting occupant in the occupied message', () => {
    expect(occupiedHostMessage({
      status: 'starting',
      record: { pid: 1, createdAt: '2026-08-14T00:00:00.000Z' },
    })).toBe('error: a DeepSeek Harness Web host is already starting for this $DSH_HOME')
  })

  it('waits until a URL is published', async () => {
    const home = tempHome()
    expect(acquireHostLock(home).status).toBe('acquired')
    const pending = waitForHostLockUrl({ home, timeoutMs: 1_000, intervalMs: 10 })
    publishHostLockUrl('http://127.0.0.1:9', home)
    await expect(pending).resolves.toBe('http://127.0.0.1:9')
  })

  it('rejects a wait when the lock goes stale', async () => {
    const home = tempHome()
    writeFileSync(hostLockPath(home), `${JSON.stringify({
      pid: 2_147_483_647,
      createdAt: '2026-08-14T00:00:00.000Z',
    })}\n`)
    await expect(waitForHostLockUrl({ home, timeoutMs: 200, intervalMs: 10 }))
      .rejects.toThrow('lock became stale')
  })

  it('aborts a wait when the signal fires', async () => {
    const home = tempHome()
    expect(acquireHostLock(home).status).toBe('acquired')
    const signal = AbortSignal.timeout(20)
    await expect(waitForHostLockUrl({ home, timeoutMs: 1_000, intervalMs: 5, signal }))
      .rejects.toThrow('aborted')
  })

  it('rejects an already-aborted wait and a timed-out wait', async () => {
    const home = tempHome()
    expect(acquireHostLock(home).status).toBe('acquired')
    await expect(waitForHostLockUrl({
      home,
      timeoutMs: 1_000,
      intervalMs: 5,
      signal: AbortSignal.abort(),
    })).rejects.toThrow('aborted')
    await expect(waitForHostLockUrl({ home, timeoutMs: 30, intervalMs: 10 }))
      .rejects.toThrow('timed out')
  })

  it('classifies malformed records and refuses to publish without ownership', () => {
    const home = tempHome()
    expect(isProcessLive(0)).toBe(false)
    expect(isProcessLive(-1)).toBe(false)
    expect(isProcessLive(process.pid)).toBe(true)
    writeFileSync(hostLockPath(home), '[]\n')
    expect(inspectHostLock(home).status).toBe('invalid')
    writeFileSync(hostLockPath(home), `${JSON.stringify({ pid: 0, createdAt: 'x' })}\n`)
    expect(inspectHostLock(home).status).toBe('invalid')
    writeFileSync(hostLockPath(home), `${JSON.stringify({ pid: 1, createdAt: '' })}\n`)
    expect(inspectHostLock(home).status).toBe('invalid')
    writeFileSync(hostLockPath(home), `${JSON.stringify({ pid: 1, createdAt: 'x', url: '' })}\n`)
    expect(inspectHostLock(home).status).toBe('invalid')
    expect(publishHostLockUrl('http://127.0.0.1:1', home)).toBe(false)
    expect(releaseHostLock(home)).toBe(false)
  })

  it('registers the empty invariant companion', async () => {
    expect(name).toBe('host-lock-invariant')
    expect(inject).toEqual(['invariants'])
    const registered: string[] = []
    const ctx = {
      invariants: {
        register: (packageName: string, installer: () => void) => {
          registered.push(packageName)
          installer()
          return () => {}
        },
      },
    }
    await apply(ctx as never)
    expect(registered).toEqual(['@deepseek-ai/dsh-host-lock'])
  })
})
