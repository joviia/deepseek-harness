import { EventEmitter } from 'node:events'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { ChildProcess } from 'node:child_process'
import { acquireHostLock, publishHostLockUrl } from '@deepseek-ai/dsh-host-lock'
import { resolveHostSession } from '../src/host-supervisor.ts'

/** Isolated home for one test. */
function tempHome(): string {
  return mkdtempSync(join(tmpdir(), 'dsh-desktop-host-'))
}

/** A spawn handle the tests can settle. */
function fakeChild(): ChildProcess & EventEmitter {
  return new EventEmitter() as ChildProcess & EventEmitter
}

describe('resolveHostSession', () => {
  it('attaches to a ready lock without spawning', async () => {
    const home = tempHome()
    writeFileSync(join(home, 'host.lock'), `${JSON.stringify({
      pid: process.ppid,
      url: 'http://127.0.0.1:43123',
      createdAt: '2026-08-14T00:00:00.000Z',
    })}\n`)
    let spawned = 0
    const session = await resolveHostSession({
      home,
      spawn: () => {
        spawned += 1
        return fakeChild()
      },
    })
    expect(spawned).toBe(0)
    expect(session).toEqual({ url: 'http://127.0.0.1:43123', owned: false })
  })

  it('spawns and waits for this process to publish the URL', async () => {
    const home = tempHome()
    const child = fakeChild()
    const pending = resolveHostSession({
      home,
      spawn: () => child,
      timeoutMs: 1_000,
    })
    expect(acquireHostLock(home).status).toBe('acquired')
    expect(publishHostLockUrl('http://127.0.0.1:9', home)).toBe(true)
    await expect(pending).resolves.toEqual({ url: 'http://127.0.0.1:9', owned: true, child })
  })

  it('kills the child when it exits before a URL appears and includes stderr', async () => {
    const home = tempHome()
    const child = fakeChild()
    const stderr = new EventEmitter()
    ;(child as ChildProcess).stderr = stderr as ChildProcess['stderr']
    let killed = false
    ;(child as ChildProcess).kill = () => {
      killed = true
      return true
    }
    const pending = resolveHostSession({
      home,
      spawn: () => child,
      timeoutMs: 1_000,
    })
    stderr.emit('data', "Error [ERR_MODULE_NOT_FOUND]: Cannot find package '@deepseek-ai/dsh-app-boot'\n")
    child.emit('exit', 1, null)
    await expect(pending).rejects.toThrow(/exited with code 1[\s\S]*ERR_MODULE_NOT_FOUND/)
    expect(killed).toBe(true)
  })
})
