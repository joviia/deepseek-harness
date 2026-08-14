# Agent Note: Electron 桌面壳

Status: implemented

[English](2026-08-14-electron-desktop-shell.md) | 中文

## 问题

产品 GUI 是本地 Web Host 加浏览器。想要双击即用的桌面应用的用户仍然必须安装 Node、运行 `dsh web`，并一直开着浏览器标签。针对同一 `$DSH_HOME` 再开一个 `dsh web` 还会再起一个 Host，并争用会话文件。

## 决策

交付一个 Electron 窗口，作为现有 `web` profile 的交付壳，而不是第三个 profile，也不是进程内的 Cordis 树。

`@deepseek-ai/dsh-host-lock` 持有 `$DSH_HOME/host.lock`。`web-startup` 在成功解析 flag 后获取该锁，并在 dispose 时释放。Loader 结算后，`dsh-web-app` 把 loopback 监听 URL 写入该文件。针对同一 home 的第二个 Web Host 打印 `occupiedHostMessage` 并以非零状态退出。`--help` 和被拒绝的 flag 不会占用该锁。

`@deepseek-ai/dsh-desktop` 是 Electron 主进程：单实例锁、沙箱 `BrowserWindow`（`contextIsolation`，无 `nodeIntegration`），以及监督器——附着到已就绪或正在启动的锁，或拉起 `dsh web --host 127.0.0.1 --port 0`。检出启动（`dsh desktop` / `pnpm run dev:desktop`）导出 `DSH_DESKTOP_NODE` 和 `DSH_DESKTOP_BIN`，因此子进程是真正的 Node，而不是 Electron。打包启动用 `scripts/stage-desktop-runtime.ts` 暂存该 Node 加上 `dsh` deploy 闭包，再由 electron-builder 的 afterPack 钩子（解引用，含 `node_modules`）拷进 `Resources/harness`。extraResources 带不走这棵树：它遵守仓库 `.gitignore` 里的 `node_modules/` 规则，否则打出来的 bin 会解析不到 `@deepseek-ai/dsh-app-boot`。Dock、窗口、DMG 和 NSIS 图示是 [`apps/desktop/build/icon.svg`](../../../../apps/desktop/build/icon.svg) 里画在 `#4D6BFE` 上的 DeepSeek 鲸标。关闭窗口会退出应用，并停止由本进程拉起的子进程；附着到已经在跑的 `dsh web` 时不杀那个 Host。

原生模块继续使用 Node ABI。本地 `dist:desktop` 用钥匙串里的 Developer ID Application（或 `CSC_*`）签名，并在设置了 Apple 公证环境变量时做公证。除非存在这些 secret，CI 安装包保持未签名（[桌面安装包发布](../process/2026-08-14-desktop-installer-release.md)）。自动更新不在范围内。

## 备选方案

- **在 Electron 主进程或 utilityProcess 里启动 Cordis。** 这要求按 Electron ABI 重编 `node-pty`、`koffi` 和 Landlock，并把 Host 放进同时也拥有窗口的崩溃域。现有的 Node deploy 闭包已经解决了 CLI 和 Python 运行时的打包。
- **新建一个复制 `dsh-web-app` 的 `desktop` profile。** Host、UI 和测试就是 web profile。第二套模板只会给同一棵树换名。
- **始终启动 `dsh web`、忽略已有 Host 的薄 Electron 包装。** 这违反共用 `$DSH_HOME` 的产品决策，也会让两台服务器竞态。

## 后果

桌面应用和 `dsh web` 在同一个 home 下共享会话、设置和凭据。本地 `dist:desktop` 把当前平台的安装包写到 `apps/desktop/release/`，并在有签名身份时签名。`.github/workflows/release.yml` 在推送时构建五平台安装包。检出开发者在库构建之后运行 `pnpm dsh desktop`。锁协议是未来任何监督器的附着点。

## 测试

`packages/boot/host-lock/tests/host-lock.spec.ts` 覆盖获取、同 pid 重入、接管、发布、等待和占用文案。`packages/bundle/web-app/tests/startup.spec.ts` 与 `web-app.spec.ts` 覆盖拒锁和 URL 发布。`apps/desktop/tests` 覆盖启动 argv、附着/拉起，以及 `build/icon.png` / `.icns` / `.ico` 鲸标文件。`apps/cli/tests/args.spec.ts` 路由 `dsh desktop`。
