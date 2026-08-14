# `@deepseek-ai/dsh-host-lock`

[English](README.md) | 中文

独占锁，保证一个 Harness home 上只有一个仍在运行的 Web Host。锁文件是 `$DSH_HOME/host.lock`（`HOST_LOCK_FILENAME`）。`dsh web`、桌面壳，以及任何挂载 `web-startup` 的组合都遵守这套协议。

## 协议

`acquireHostLock(home?)` 用 `wx` 创建该文件，并写入本进程 pid。同一 pid 的第二次调用视为成功且不改文件。另一个仍存活的 pid 得到 `occupied`。已死 pid 或无法读取的文件体会被接管：先 unlink，再重试互斥创建。

`publishHostLockUrl(url, home?)` 在 bind 之后写入 loopback 监听 URL。本进程不是持有者时为空操作。

`releaseHostLock(home?)` 在本进程持有时删除该文件。

`inspectHostLock(home?)` 将文件分类为 `absent`、`invalid`、`stale`、`starting`（pid 仍存活但无 URL）或 `ready`（pid 仍存活且已有 URL）。

`waitForHostLockUrl(options)` 轮询直到 `ready`，或直到截止、中止、或文件变为 stale/invalid。

`occupiedHostMessage(inspection)` 是第二个 Host 打印的 stderr 行。

`isProcessLive(pid)` 使用 `process.kill(pid, 0)`；`EPERM` 视为仍存活。

## Model Experience

无。本包只在任何会话出现之前序列化 Host 进程所有权。

#### KV Cache effect

无；本包既不组装也不发送 provider 请求。

## Known Limitations and Deferred Work

- **被回收的 pid 可能看起来仍存活** — 持有者退出后，操作系统可能在下一次 inspect 之前复用该 pid；撞号的进程会显得仍持有锁，直到它退出或有人手工删除该文件。
