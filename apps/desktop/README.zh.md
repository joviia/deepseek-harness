# `@deepseek-ai/dsh-desktop`

[English](README.md) | 中文

DeepSeek Harness Web UI 的 Electron 壳。主进程只负责窗口、单实例锁，以及监督器：附着到仍有效的 `$DSH_HOME/host.lock`，或拉起捆绑的 `dsh web --host 127.0.0.1 --port 0`。渲染进程是打开该 loopback URL 的沙箱窗口：不开 Node，不做产品 IPC。

## 启动

在仓库检出中，先运行 `pnpm run build`，然后：

```sh
pnpm dsh desktop
pnpm run dev:desktop
```

两者都会导出 `DSH_DESKTOP_NODE` 和 `DSH_DESKTOP_BIN`，以便 Electron 用检出里的 Node 拉起 Host，而不是用它自己的二进制。调用时的工作目录就是默认工作区。

打包后的应用（`pnpm run dist:desktop`）把 Node + `dsh` 的 deploy 闭包放到 `extraResources/harness`（`harness/lib/bin.js` 就是产品 CLI）；从 Dock 或开始菜单启动时，默认工作区是 `~`。它与 `dsh web` 共用 `$DSH_HOME`（默认 `~/.dsh`）。关闭窗口会退出应用，并停止由本进程拉起的 Host；若只是附着到已经在跑的 `dsh web`，则不杀那个 Host。

## 打包

`pnpm run dist:desktop` 先构建库和前端，再暂存 harness 闭包（`scripts/stage-desktop-runtime.ts` → `.artifacts/desktop-runtime`），最后跑 electron-builder。afterPack 钩子把这份闭包（含 `node_modules`）拷进 `Resources/harness`，因为 extraResources 会遵守仓库 `.gitignore` 并丢掉 `node_modules`。Dock、窗口、DMG 和 NSIS 图示是 `build/` 里画在 `#4D6BFE` 上的 DeepSeek 鲸标（源文件是 `icon.svg`）。产物在 `apps/desktop/release/`。本地钥匙串里的 Developer ID Application（或 `CSC_LINK` / `CSC_NAME`）给 macOS 应用签名；`CSC_LINK` 给 Windows 签名；`APPLE_ID`、`APPLE_APP_SPECIFIC_PASSWORD` 和 `APPLE_TEAM_ID` 做公证。`.github/workflows/release.yml` 在推送时为每个受支持 arch 构建 DMG、NSIS 和 AppImage，并挂到 `dsh-v*` GitHub Release。

## Model Experience

无。本包只是现有 Web Host 外面的桌面窗口；模型可见的 surface 上下文仍由 `dsh-web-app` 持有。

#### KV Cache effect

无；本包既不组装也不发送 provider 请求。

## Known Limitations and Deferred Work

- **除非存在签名 secret，CI 安装包未签名** — 托管 runner 设置 `CSC_IDENTITY_AUTO_DISCOVERY=false`；那些产物会触发 Gatekeeper 和 SmartScreen 警告。本地打包在有签名身份时会签名。公证仍需要 Apple 公证环境变量。
- **没有自动更新** — 新版本就是新的安装包。
- **本地打包只覆盖当前平台** — 除非 `DSH_DESKTOP_NODE_ARCH` 要求同一 OS 的另一个 arch，`dist:desktop` 暂存本机 Node。CI 构建五平台集合。
