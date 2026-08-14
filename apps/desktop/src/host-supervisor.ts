/**
 * Attach to a live Web host or spawn `dsh web` and wait for `$DSH_HOME/host.lock`.
 * @module @deepseek-ai/dsh-desktop/host-supervisor
 */

import type { ChildProcess } from 'node:child_process'
import {
  HOST_LOCK_WAIT_MS,
  inspectHostLock,
  waitForHostLockUrl,
} from '@deepseek-ai/dsh-host-lock'

/** A spawned host the supervisor owns and must stop on quit. */
interface OwnedHost {
  /** The lock's listen URL. */
  url: string
  /** This process spawned the child. */
  owned: true
  /** The `dsh web` child. */
  child: ChildProcess
}

/** A host some other process already owns. */
interface AttachedHost {
  /** The lock's listen URL. */
  url: string
  /** This process did not spawn the child. */
  owned: false
}

/** Result of {@link resolveHostSession}. */
export type HostSession = OwnedHost | AttachedHost

/** Options for {@link resolveHostSession}. */
export interface ResolveHostSessionOptions {
  /** Harness home whose lock is authoritative. */
  home: string
  /** Start `dsh web` when no live host owns the lock. */
  spawn: () => ChildProcess
  /** Deadline for the lock URL. Defaults to {@link HOST_LOCK_WAIT_MS}. */
  timeoutMs?: number
  /** Abort attach or spawn-wait. */
  signal?: AbortSignal
}

/**
 * Attach to a ready or starting host, or spawn one and wait for its URL.
 * @param options - home, spawn factory, and wait bounds.
 * @returns the listen URL and whether this process owns the child.
 */
export async function resolveHostSession(options: ResolveHostSessionOptions): Promise<HostSession> {
  const timeoutMs = options.timeoutMs ?? HOST_LOCK_WAIT_MS
  const wait = { home: options.home, timeoutMs, ...options.signal !== undefined && { signal: options.signal } }
  const inspection = inspectHostLock(options.home)
  if (inspection.status === 'ready' || inspection.status === 'starting') {
    const url = inspection.status === 'ready'
      ? inspection.record.url
      : await waitForHostLockUrl(wait)
    return { url, owned: false }
  }
  const child = options.spawn()
  const output = collectChildOutput(child)
  try {
    const url = await Promise.race([
      waitForHostLockUrl(wait),
      rejectOnChildExit(child, output),
    ])
    return { url, owned: true, child }
  } catch (error) {
    if (!child.killed) child.kill()
    throw error
  }
}

/** Bytes of child stdout+stderr kept for a failed-start diagnostic. */
const CHILD_OUTPUT_LIMIT = 8_000

/**
 * Buffer the child's stdio so a failed start can include the real diagnostic.
 * @param child - the spawned `dsh web`.
 * @returns a function that returns the trimmed buffer.
 */
function collectChildOutput(child: ChildProcess): () => string {
  let buf = ''
  const append = (chunk: Buffer | string): void => {
    buf += typeof chunk === 'string' ? chunk : chunk.toString('utf8')
    if (buf.length > CHILD_OUTPUT_LIMIT) buf = buf.slice(-CHILD_OUTPUT_LIMIT)
  }
  child.stdout?.on('data', append)
  child.stderr?.on('data', append)
  return () => buf.trim()
}

/**
 * Fail the wait when the child exits before publishing a URL.
 * @param child - the spawned `dsh web`.
 * @param output - buffered stdio from {@link collectChildOutput}.
 * @returns a promise that rejects on `exit` or `error`.
 */
function rejectOnChildExit(child: ChildProcess, output: () => string): Promise<never> {
  return new Promise((_, reject) => {
    const onExit = (code: number | null, signal: NodeJS.Signals | null): void => {
      child.removeListener('error', onError)
      const detail = output()
      reject(new Error(
        `dsh desktop: dsh web exited ${code === null ? `from ${signal ?? 'signal'}` : `with code ${String(code)}`} before publishing a host URL`
        + (detail === '' ? '' : `\n${detail}`),
      ))
    }
    const onError = (error: Error): void => {
      child.removeListener('exit', onExit)
      reject(error)
    }
    child.once('exit', onExit)
    child.once('error', onError)
  })
}
