import { assertElectronicSigningApproved } from './signingClassificationPolicy.js'

// The reviewed per-document route is independent of retired listing signing.
// An explicit false remains a release/operator kill switch; document-level
// approval, actor access and evidence checks still apply on the server.
export const SELLER_PORTAL_SIGNING_ENABLED = import.meta.env?.VITE_SELLER_PORTAL_SIGNING_ENABLED !== 'false'
export const SELLER_PORTAL_SIGNING_UNAVAILABLE_CODE = 'seller_portal_signing_unavailable'

export function assertSellerPortalSigningAvailable(workflowKey = '') {
  assertElectronicSigningApproved(workflowKey)
  if (SELLER_PORTAL_SIGNING_ENABLED) return
  const error = new Error('Seller portal signing is not enabled. Prepare a physical signing copy instead.')
  error.code = SELLER_PORTAL_SIGNING_UNAVAILABLE_CODE
  throw error
}
