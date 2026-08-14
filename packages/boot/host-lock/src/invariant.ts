/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-host-lock`.
 * @module @deepseek-ai/dsh-host-lock/invariant
 */

import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-host-lock'

/** Cordis companion plugin name. */
export const name = 'host-lock-invariant'
/** Service required before the companion can register. */
export const inject = ['invariants']

/**
 * No runtime invariant: lock ownership is a pid plus exclusive-create file
 * protocol with no Cordis event stream or mutable service to audit.
 */
const install: InvariantInstaller = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
