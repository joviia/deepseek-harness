# `@deepseek-ai/dsh-desktop`

English | [中文](README.zh.md)

Electron shell for the DeepSeek Harness Web UI. The main process is a window, a single-instance lock, and a supervisor that either attaches to a live `$DSH_HOME/host.lock` or spawns bundled `dsh web --host 127.0.0.1 --port 0`. The renderer is a sandboxed window on that loopback URL: no Node integration, no product IPC.

## Launch

From a repository checkout, after `pnpm run build`:

```sh
pnpm dsh desktop
pnpm run dev:desktop
```

Both export `DSH_DESKTOP_NODE` and `DSH_DESKTOP_BIN` so Electron spawns the checkout's Node rather than its own binary. The invoking directory is the default workspace.

A packaged app (`pnpm run dist:desktop`) copies a Node + `dsh` deploy closure into `extraResources/harness` (`harness/lib/bin.js` is the product CLI) and uses `~` as the default workspace when launched from the Dock or Start menu. It shares `$DSH_HOME` (default `~/.dsh`) with `dsh web`. Closing the window quits the app and stops a host this process started; attaching to an already running `dsh web` leaves that host running.

## Packaging

`pnpm run dist:desktop` builds libraries and the frontend, stages the harness closure (`scripts/stage-desktop-runtime.ts` → `.artifacts/desktop-runtime`), then runs electron-builder. The afterPack hook copies that closure — including `node_modules` — into `Resources/harness`, because extraResources follows the repo `.gitignore` and would drop `node_modules`. Dock, window, DMG, and NSIS artwork is the DeepSeek whale on `#4D6BFE` from `build/` (`icon.svg` is the source). Artifacts land in `apps/desktop/release/`. A Developer ID Application in the local keychain (or `CSC_LINK` / `CSC_NAME`) signs the macOS app; `CSC_LINK` signs Windows; `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, and `APPLE_TEAM_ID` notarize. `.github/workflows/release.yml` builds DMG, NSIS, and AppImage for each supported arch on push and attaches them to a `dsh-v*` GitHub Release.

## Model Experience

None, as this package is a desktop window around the existing Web host; `dsh-web-app` still owns the model-visible surface context.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- **CI installers are unsigned unless signing secrets exist** — hosted runners set `CSC_IDENTITY_AUTO_DISCOVERY=false`; Gatekeeper and SmartScreen warn on those bits. A local pack signs when the identity is present. Notarization still needs the Apple notary env.
- **No auto-update** — a new build is a new installer.
- **Local packaging is current-platform only** — `dist:desktop` stages this machine's Node unless `DSH_DESKTOP_NODE_ARCH` requests the other same-OS arch. CI builds the five-platform set.
