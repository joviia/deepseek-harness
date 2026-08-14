# Agent Note: Electron desktop shell

Status: implemented

English | [中文](2026-08-14-electron-desktop-shell.zh.md)

## Problem

The product GUI is a local Web host plus a browser. Users who want a double-click desktop app still have to install Node, run `dsh web`, and keep a browser tab open. A second `dsh web` against the same `$DSH_HOME` can also start another Host and contend for session files.

## Decision

Ship an Electron window that is a delivery shell over the existing `web` profile, not a third profile and not an in-process Cordis tree.

`@deepseek-ai/dsh-host-lock` owns `$DSH_HOME/host.lock`. `web-startup` acquires the lock after a successful flag parse and releases it on dispose. After Loader settlement, `dsh-web-app` publishes the loopback listen URL into that file. A second Web host against the same home prints `occupiedHostMessage` and exits nonzero. `--help` and rejected flags never take the lock.

`@deepseek-ai/dsh-desktop` is the Electron main process: single-instance lock, sandboxed `BrowserWindow` (`contextIsolation`, no `nodeIntegration`), and a supervisor that attaches to a ready or starting lock or spawns `dsh web --host 127.0.0.1 --port 0`. Checkout launches (`dsh desktop` / `pnpm run dev:desktop`) export `DSH_DESKTOP_NODE` and `DSH_DESKTOP_BIN` so the child is real Node, not Electron. Packaged launches stage that Node plus the `dsh` deploy closure with `scripts/stage-desktop-runtime.ts`, then the electron-builder afterPack hook copies it (dereferenced, including `node_modules`) into `Resources/harness`. extraResources cannot carry that tree: it honors the repo `.gitignore` `node_modules/` rule and would ship a bin that cannot resolve `@deepseek-ai/dsh-app-boot`. Dock, window, DMG, and NSIS artwork is the DeepSeek whale on `#4D6BFE` from [`apps/desktop/build/icon.svg`](../../../../apps/desktop/build/icon.svg). Closing the window quits the app and stops a child this process started; attaching to an already running `dsh web` leaves that host running.

Native addons stay on the Node ABI. Local `dist:desktop` signs with a Developer ID Application in the keychain (or `CSC_*`) and notarizes when the Apple notary env is set. CI installers stay unsigned unless those secrets exist ([desktop installer release](../process/2026-08-14-desktop-installer-release.md)). Auto-update is out of scope.

## Alternatives considered

- **Boot Cordis inside Electron main or a utilityProcess.** That requires rebuilding `node-pty`, `koffi`, and Landlock for Electron's ABI and puts the Host in a crash domain that also owns the window. The existing Node deploy closure already solves packaging for CLI and the Python runtime.
- **A new `desktop` profile that duplicates `dsh-web-app`.** The Host, UI, and tests are the web profile. A second template would only rename the same tree.
- **A thin Electron wrapper that always starts `dsh web` and ignores an existing host.** That breaks the shared-`$DSH_HOME` product decision and races two servers.

## Consequences

The desktop app and `dsh web` share sessions, settings, and credentials under one home. Local `dist:desktop` writes a current-platform installer to `apps/desktop/release/` and signs it when an identity is available. `.github/workflows/release.yml` builds the five-platform installer set on push. Checkout developers run `pnpm dsh desktop` after a library build. The lock protocol is the attach point for any future supervisor.

## Testing

`packages/boot/host-lock/tests/host-lock.spec.ts` covers acquire, same-pid reentry, steal, publish, wait, and occupied copy. `packages/bundle/web-app/tests/startup.spec.ts` and `web-app.spec.ts` cover lock refuse and URL publish. `apps/desktop/tests` cover launch argv, attach-or-spawn, and the branded `build/icon.png` / `.icns` / `.ico`. `apps/cli/tests/args.spec.ts` routes `dsh desktop`.
