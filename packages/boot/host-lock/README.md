# `@deepseek-ai/dsh-host-lock`

English | [中文](README.zh.md)

Exclusive lock so one live Web host owns a Harness home. The file is `$DSH_HOME/host.lock` (`HOST_LOCK_FILENAME`). `dsh web`, the desktop shell, and any other composition that mounts `web-startup` share this protocol.

## Protocol

`acquireHostLock(home?)` creates the file with `wx` and this process's pid. A second call from the same pid is a no-op success. A live foreign pid is `occupied`. A dead pid or an unreadable body is stolen: the file is unlinked and the exclusive create is retried.

`publishHostLockUrl(url, home?)` writes the loopback listen URL after bind. It no-ops when this process does not own the lock.

`releaseHostLock(home?)` unlinks the file when this process owns it.

`inspectHostLock(home?)` classifies the file as `absent`, `invalid`, `stale`, `starting` (live pid, no URL), or `ready` (live pid and URL).

`waitForHostLockUrl(options)` polls until `ready` or until the deadline, abort, or a stale/invalid file.

`occupiedHostMessage(inspection)` is the stderr line a second host prints.

`isProcessLive(pid)` uses `process.kill(pid, 0)`; `EPERM` counts as live.

## Model Experience

None, as this package only serializes host-process ownership before any session exists.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- **A recycled pid can look live** — after the owner exits, the OS may reuse that pid before the next inspect; a colliding process then appears to hold the lock until it exits or the file is removed by hand.
