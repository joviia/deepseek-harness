/**
 * Copy the staged Node + dsh closure into Resources/harness after electron-builder
 * packs the app. extraResources honors the repo `.gitignore` `node_modules/`
 * rule, so the deploy closure's packages never reach the app unless this hook
 * copies them (dereferenced, so pnpm store links do not escape the bundle).
 */
const { cpSync, existsSync, mkdirSync } = require('node:fs')
const { join } = require('node:path')

/** Repo-relative staging directory produced by scripts/stage-desktop-runtime.ts. */
const STAGING_REL = join('..', '..', '.artifacts', 'desktop-runtime')

/**
 * Copy `src` onto `dest`, following symlinks so the bundle is self-contained.
 * @param {string} src - staged runtime root.
 * @param {string} dest - `Contents/Resources/harness` (macOS) or `resources/harness`.
 */
function copyHarnessRuntime(src, dest) {
  if (!existsSync(src)) {
    throw new Error(
      `dsh desktop afterPack: staged runtime missing at ${src}; run scripts/stage-desktop-runtime.ts first`,
    )
  }
  mkdirSync(dest, { recursive: true })
  cpSync(src, dest, { recursive: true, dereference: true, force: true })
}

/**
 * electron-builder afterPack hook.
 * @param {{ packager: { projectDir: string, getResourcesDir: (out: string) => string }, appOutDir: string }} context
 */
module.exports = async function afterPack(context) {
  const src = join(context.packager.projectDir, STAGING_REL)
  const dest = join(context.packager.getResourcesDir(context.appOutDir), 'harness')
  copyHarnessRuntime(src, dest)
}

module.exports.copyHarnessRuntime = copyHarnessRuntime
