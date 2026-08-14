# Agent Note: Desktop installer release

Status: implemented

English | [中文](2026-08-14-desktop-installer-release.zh.md)

## Problem

The product entry users want is a double-click installer. The dsh `release.yml` workflow packed npm tarballs and optionally published them. Those artifacts cannot be opened as an app, and a single Ubuntu pack job cannot produce a macOS DMG or a Windows NSIS installer that carries the matching Node ABI.

## Decision

`.github/workflows/release.yml` builds click-to-install packages only: macOS DMG (arm64 and x64), Windows NSIS x64, and Linux AppImage (x64 and arm64). It runs on pull request, master push, `dsh-v*` tag, and workflow_dispatch. Each matrix row uses a native runner, sets `DSH_DESKTOP_NODE_ARCH` so `scripts/stage-desktop-runtime.ts` downloads that arch's Node when it is not this process, and uploads only `*.dmg` / `*.exe` / `*.AppImage`. A `dsh-v*` tag push, or a dispatch with `publish=true` from such a tag, attaches those files to a GitHub Release. The workflow does not run `release:pack` or `release:publish` and does not upload npm tarballs.

Vendor, native, and Python publication stay on their own workflows ([npm sequences](2026-08-10-npm-release-sequences.md)).

`pnpm run dist:desktop` is the current-platform local pack. electron-builder signs the macOS app when a Developer ID Application identity is in the keychain (or `CSC_LINK` / `CSC_NAME` is set) and signs Windows when `CSC_LINK` is set. Notarization runs when `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, and `APPLE_TEAM_ID` are set. CI sets `CSC_IDENTITY_AUTO_DISCOVERY=false` so hosted runners stay unsigned unless those secrets exist. The macOS entitlements in `apps/desktop/build/entitlements.mac.plist` allow the sandboxed window to spawn the bundled Node host.

## Alternatives considered

**Keep npm tarballs in `release.yml` and add desktop jobs beside them.** The requested product artifact is the installer. Shipping both would keep a publish path users cannot double-click.

**Cross-compile every target from one macOS runner.** The staged Node and native addons must match the packaged OS and arch. A same-OS `--x64` pack on arm64 is the only cross-compile the stager supports, via `DSH_DESKTOP_NODE_ARCH`.

**Require signing in CI.** Hosted runners have no Developer ID. Forcing a signature would fail every pack until org secrets exist. Local keychain signing covers a machine that already has the identity.

## Consequences

A master push produces five installer artifacts. A `dsh-v*` tag publishes them on the GitHub Release for that tag. CI installers are unsigned unless `CSC_LINK` is configured. Local macOS packs use the Developer ID in the keychain. The dsh family can still be packed locally with `release:pack`; CI no longer does that.

## Testing

`scripts/ci-workflow.spec.ts` pins the matrix targets, the installer-only upload globs, the absent npm pack/publish steps, and the GitHub Release job. `scripts/stage-desktop-runtime.spec.ts` covers `DSH_DESKTOP_NODE_ARCH`.
