# Agent Note: 桌面安装包发布

Status: implemented

[English](2026-08-14-desktop-installer-release.md) | 中文

## 问题

用户要的产品入口是双击即装的安装包。dsh 的 `release.yml` 工作流打包的是 npm tarball，并可选择发布它们。那些产物不能当应用打开；单台 Ubuntu pack 作业也无法打出携带匹配 Node ABI 的 macOS DMG 或 Windows NSIS 安装包。

## 决策

`.github/workflows/release.yml` 只构建可点击安装的包：macOS DMG（arm64 与 x64）、Windows NSIS x64，以及 Linux AppImage（x64 与 arm64）。它在 pull request、master 推送、`dsh-v*` tag 和 workflow_dispatch 上运行。矩阵每一行用原生 runner，设置 `DSH_DESKTOP_NODE_ARCH`，以便 `scripts/stage-desktop-runtime.ts` 在该 arch 不是当前进程时下载对应的 Node，并且只上传 `*.dmg` / `*.exe` / `*.AppImage`。推送 `dsh-v*` tag，或从该 tag 上 `publish=true` 地手动触发，会把这些文件挂到 GitHub Release。该工作流不跑 `release:pack` 或 `release:publish`，也不上传 npm tarball。

vendor、native 和 Python 发布仍走各自的工作流（[npm 序列](2026-08-10-npm-release-sequences.md)）。

`pnpm run dist:desktop` 是当前平台的本地打包。当钥匙串里有 Developer ID Application 身份（或设置了 `CSC_LINK` / `CSC_NAME`）时，electron-builder 会给 macOS 应用签名；设置了 `CSC_LINK` 时给 Windows 签名。设置了 `APPLE_ID`、`APPLE_APP_SPECIFIC_PASSWORD` 和 `APPLE_TEAM_ID` 时会做公证。CI 设置 `CSC_IDENTITY_AUTO_DISCOVERY=false`，因此托管 runner 在没有这些 secret 时保持未签名。`apps/desktop/build/entitlements.mac.plist` 里的 macOS entitlements 允许沙箱窗口拉起捆绑的 Node Host。

## 备选方案

**在 `release.yml` 里保留 npm tarball，再并排加桌面作业。** 要的产品产物是安装包。两条都发会留下一条用户无法双击的发布路径。

**在一台 macOS runner 上交叉编译所有目标。** 暂存的 Node 和原生模块必须匹配打包的 OS 与 arch。stager 唯一支持的交叉编译是同一 OS 上的 `--x64` 在 arm64 上打包，通过 `DSH_DESKTOP_NODE_ARCH`。

**要求 CI 必须签名。** 托管 runner 没有 Developer ID。强制签名会在组织 secret 配好之前让每次 pack 失败。本机钥匙串签名覆盖已经持有该身份的机器。

## 后果

一次 master 推送产出五份安装包产物。`dsh-v*` tag 把它们发到该 tag 的 GitHub Release。除非配置了 `CSC_LINK`，CI 安装包未签名。本地 macOS 打包使用钥匙串里的 Developer ID。dsh 族仍可用 `release:pack` 在本地打包；CI 不再做这件事。

## 测试

`scripts/ci-workflow.spec.ts` 钉死矩阵目标、仅安装包的上传 glob、不存在的 npm pack/publish 步骤，以及 GitHub Release 作业。`scripts/stage-desktop-runtime.spec.ts` 覆盖 `DSH_DESKTOP_NODE_ARCH`。
