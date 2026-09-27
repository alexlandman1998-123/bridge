// Temporary compatibility boundary for the retired seller signing route.
// Per-document portal signing must be approved and implemented separately;
// this switch must not be lifted merely to expose a button.
import { assertElectronicSigningApproved } from './signingClassificationPolicy.js'

export const ONLINE_SIGNING_DISABLED = true
export const ONLINE_SIGNING_DISABLED_CODE = 'online_signing_disabled'
export const ONLINE_SIGNING_DISABLED_MESSAGE =
  'Online document signing is unavailable. Arrange wet-ink signatures and upload the signed originals for review.'

export function assertOnlineSigningAvailable() {
  if (ONLINE_SIGNING_DISABLED) {
    const error = new Error(ONLINE_SIGNING_DISABLED_MESSAGE)
    error.code = ONLINE_SIGNING_DISABLED_CODE
    throw error
  }
  assertElectronicSigningApproved('seller_mandate')
}
