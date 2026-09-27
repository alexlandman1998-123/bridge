import { assertElectronicSigningApproved } from './signingClassificationPolicy.js'

// Separate from the retired listing-mandate signing route. Enabling this
// requires a reviewed per-document server flow, recorded legal approvals,
// and the release checks for token issuance, signing evidence, and storage.
export const SELLER_PORTAL_SIGNING_ENABLED = import.meta.env?.VITE_SELLER_PORTAL_SIGNING_ENABLED === 'true'
export const SELLER_PORTAL_SIGNING_UNAVAILABLE_CODE = 'seller_portal_signing_unavailable'

export function assertSellerPortalSigningAvailable(workflowKey = '') {
  assertElectronicSigningApproved(workflowKey)
  if (SELLER_PORTAL_SIGNING_ENABLED) return
  const error = new Error('Seller portal signing is not enabled. Prepare a physical signing copy instead.')
  error.code = SELLER_PORTAL_SIGNING_UNAVAILABLE_CODE
  throw error
}
