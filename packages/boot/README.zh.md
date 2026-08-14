# boot/：共享的 app bin 启动粘合层

[English](README.md) | 中文

由 `apps/cli`、[`apps/desktop`](../../apps/desktop/README.md) 和 [`examples/`](../examples/README.md) demo bin 共享、与渠道无关的启动库。

| 包 | 职责 | ctx 键 |
|---|---|---|
| `app-boot/` | app bin 的共享启动粘合层：加载 `.env`、会明确报错的 Loader 保护机制、感知快照的配置解析，以及等待整棵树停稳的启动序列 | （供各 bin 使用的库） |
| `cmdline/` | 启动器到应用的命令行交接，以及由应用持有的启动解析 | `cmdlineArgs`、`appExit` |
| `host-lock/` | 独占的 `$DSH_HOME/host.lock`，保证一个 Harness home 上只有一个仍在运行的 Web Host | （库） |

启动序列与个人配置约定见 [`app-boot/README.md`](app-boot/README.md)；由应用持有的命令行见 [`cmdline/README.md`](cmdline/README.md)；Web Host 锁见 [`host-lock/README.md`](host-lock/README.md)。
