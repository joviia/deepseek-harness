/**
 * Exclusive Web-host lock under the Harness home.
 *
 * One live Web host may own `$DSH_HOME/host.lock`. The file is created
 * exclusively with this process's pid, the listen URL is written after bind,
 * and the owner unlinks the file on dispose. A second host treats a live
 * pid as occupied; a dead pid is stale and may be stolen.
 * @module @deepseek-ai/dsh-host-lock
 */

import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'

/** Basename of the lock file under the Harness home. */
export const HOST_LOCK_FILENAME = 'host.lock'

/** Default poll interval while waiting for a listen URL. */
export const HOST_LOCK_POLL_MS = 50

/** Default deadline while waiting for a listen URL. */
export const HOST_LOCK_WAIT_MS = 60_000

/** Durable contents of {@link HOST_LOCK_FILENAME}. */
export interface HostLockRecord {
  /** Process that created or last stole the lock. */
  pid: number
  /** Canonical loopback URL, absent until the owner binds. */
  url?: string
  /** ISO-8601 timestamp of lock creation or steal. */
  createdAt: string
}

/** What {@link inspectHostLock} observed on disk. */
export type HostLockInspection =
  | { status: 'absent' }
  | { status: 'invalid'; reason: string }
  | { status: 'stale'; record: HostLockRecord }
  | { status: 'starting'; record: HostLockRecord }
  | { status: 'ready'; record: HostLockRecord & { url: string } }

/** Outcome of {@link acquireHostLock}. */
export type HostLockAcquireResult =
  | { status: 'acquired'; record: HostLockRecord }
  | { status: 'occupied'; inspection: HostLockInspection }

/**
 * Resolve the lock path under `home`, or under {@link resolveDshHome}.
 * @param home - explicit Harness home; omitted to use the process default.
 * @returns the absolute lock-file path.
 */
export function hostLockPath(home?: string): string {
  return join(home ?? resolveDshHome(), HOST_LOCK_FILENAME)
}

/**
 * Whether `pid` still names a running process.
 * @param pid - the recorded owner.
 * @returns true when the process exists; `EPERM` counts as live.
 */
export function isProcessLive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'ESRCH') return false
    if (code === 'EPERM') return true
    /* v8 ignore next -- unexpected kill failures are not part of the lock protocol */
    throw error
  }
}

/**
 * Read and classify the lock file without mutating it.
 * @param home - explicit Harness home; omitted to use the process default.
 * @returns the inspection; missing files are `absent`.
 */
export function inspectHostLock(home?: string): HostLockInspection {
  const path = hostLockPath(home)
  let raw: string
  try {
    raw = readFileSync(path, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { status: 'absent' }
    /* v8 ignore next -- unexpected read failures are not classified */
    throw error
  }
  const record = parseRecord(raw)
  if (record === undefined) return { status: 'invalid', reason: 'host.lock is not a HostLockRecord' }
  if (!isProcessLive(record.pid)) return { status: 'stale', record }
  if (record.url !== undefined) return { status: 'ready', record: { ...record, url: record.url } }
  return { status: 'starting', record }
}

/**
 * Take exclusive ownership of the lock, or report a live occupant.
 *
 * A second call from the same pid is a no-op success so a launcher and the
 * web-startup plugin may both acquire. A stale or invalid file is unlinked
 * once and the exclusive create is retried.
 * @param home - explicit Harness home; omitted to use the process default.
 * @returns `acquired` for this pid, or `occupied` for another live pid.
 */
export function acquireHostLock(home?: string): HostLockAcquireResult {
  const existing = inspectHostLock(home)
  if ((existing.status === 'starting' || existing.status === 'ready') && existing.record.pid === process.pid) {
    return { status: 'acquired', record: existing.record }
  }
  if (existing.status === 'starting' || existing.status === 'ready') {
    return { status: 'occupied', inspection: existing }
  }
  const path = hostLockPath(home)
  mkdirSync(dirname(path), { recursive: true })
  if (existing.status === 'stale' || existing.status === 'invalid') {
    try {
      unlinkSync(path)
    } catch (error) {
      /* v8 ignore next -- a vanished stale file is the steal we wanted */
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
  }
  const record: HostLockRecord = { pid: process.pid, createdAt: new Date().toISOString() }
  try {
    writeFileSync(path, serialize(record), { flag: 'wx', encoding: 'utf8' })
    return { status: 'acquired', record }
  } catch (error) {
    /* v8 ignore next -- unexpected exclusive-create failures are not occupied */
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
    const inspection = inspectHostLock(home)
    /* v8 ignore next 3 -- same-pid exclusive-create race; single-threaded tests take the early return */
    if ((inspection.status === 'starting' || inspection.status === 'ready') && inspection.record.pid === process.pid) {
      return { status: 'acquired', record: inspection.record }
    }
    return { status: 'occupied', inspection }
  }
}

/**
 * Write the listen URL into a lock this process owns.
 * @param url - the canonical loopback URL after bind.
 * @param home - explicit Harness home; omitted to use the process default.
 * @returns true when this process published; false when it does not own the lock.
 */
export function publishHostLockUrl(url: string, home?: string): boolean {
  const inspection = inspectHostLock(home)
  if (inspection.status !== 'starting' && inspection.status !== 'ready') return false
  if (inspection.record.pid !== process.pid) return false
  const record: HostLockRecord = { ...inspection.record, url }
  writeFileSync(hostLockPath(home), serialize(record), { encoding: 'utf8' })
  return true
}

/**
 * Unlink the lock when this process owns it.
 * @param home - explicit Harness home; omitted to use the process default.
 * @returns true when the file was removed.
 */
export function releaseHostLock(home?: string): boolean {
  const inspection = inspectHostLock(home)
  if (inspection.status === 'absent' || inspection.status === 'invalid') return false
  if (inspection.record.pid !== process.pid) return false
  try {
    unlinkSync(hostLockPath(home))
    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
    /* v8 ignore next -- unexpected unlink failures are not a successful release */
    throw error
  }
}

/**
 * Usage text for a second Web host that lost the lock.
 * @param inspection - the occupied inspection from {@link acquireHostLock}.
 * @returns one stderr line without a trailing newline.
 */
export function occupiedHostMessage(inspection: HostLockInspection): string {
  if (inspection.status === 'ready') {
    return `error: a DeepSeek Harness Web host is already running at ${inspection.record.url}`
  }
  return 'error: a DeepSeek Harness Web host is already starting for this $DSH_HOME'
}

/** Options for {@link waitForHostLockUrl}. */
export interface WaitForHostLockUrlOptions {
  /** Explicit Harness home; omitted to use the process default. */
  home?: string
  /** Deadline in milliseconds. Defaults to {@link HOST_LOCK_WAIT_MS}. */
  timeoutMs?: number
  /** Poll interval in milliseconds. Defaults to {@link HOST_LOCK_POLL_MS}. */
  intervalMs?: number
  /** Abort the wait. */
  signal?: AbortSignal
}

/**
 * Poll until a live owner publishes a listen URL.
 * @param options - home, deadline, and optional abort.
 * @returns the published URL.
 * @throws when the deadline elapses, the lock disappears after we started waiting, or `signal` aborts.
 */
export async function waitForHostLockUrl(options: WaitForHostLockUrlOptions = {}): Promise<string> {
  const timeoutMs = options.timeoutMs ?? HOST_LOCK_WAIT_MS
  const intervalMs = options.intervalMs ?? HOST_LOCK_POLL_MS
  const deadline = Date.now() + timeoutMs
  while (Date.now() <= deadline) {
    if (options.signal?.aborted) {
      throw new Error('host-lock: wait for URL aborted')
    }
    const inspection = inspectHostLock(options.home)
    if (inspection.status === 'ready') return inspection.record.url
    if (inspection.status === 'stale' || inspection.status === 'invalid') {
      throw new Error('host-lock: lock became stale before a URL was published')
    }
    await sleep(intervalMs, options.signal)
  }
  throw new Error(`host-lock: timed out after ${String(timeoutMs)}ms waiting for a host URL`)
}

/**
 * Parse a lock-file body into a {@link HostLockRecord}.
 * @param raw - file contents.
 * @returns the record, or `undefined` when the body is not a valid record.
 */
function parseRecord(raw: string): HostLockRecord | undefined {
  let value: unknown
  try {
    value = JSON.parse(raw) as unknown
  } catch {
    return undefined
  }
  if (typeof value !== 'object' || value === null) return undefined
  const candidate = value as { pid?: unknown; url?: unknown; createdAt?: unknown }
  if (typeof candidate.pid !== 'number' || !Number.isInteger(candidate.pid) || candidate.pid <= 0) return undefined
  if (typeof candidate.createdAt !== 'string' || candidate.createdAt === '') return undefined
  if (candidate.url !== undefined && (typeof candidate.url !== 'string' || candidate.url === '')) return undefined
  return {
    pid: candidate.pid,
    createdAt: candidate.createdAt,
    ...candidate.url !== undefined && { url: candidate.url },
  }
}

/**
 * Serialize a record as one JSON line plus a trailing newline.
 * @param record - the lock contents.
 * @returns the file body.
 */
function serialize(record: HostLockRecord): string {
  return `${JSON.stringify(record)}\n`
}

/**
 * Wait `ms` milliseconds, or reject when `signal` aborts.
 * @param ms - delay.
 * @param signal - optional abort.
 */
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error('host-lock: wait for URL aborted'))
      return
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = (): void => {
      clearTimeout(timer)
      reject(new Error('host-lock: wait for URL aborted'))
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}
