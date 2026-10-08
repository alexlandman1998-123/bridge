export const DOCUMENT_UPLOAD_TELEMETRY_EVENT = 'arch9:document-upload-telemetry'

// A telemetry label must never come from scope[1..]: those values can be portal
// tokens, participant names, notes or filenames. Only these fixed labels leave
// the browser. Browser reports are untrusted operational signals, not save proof.
const aliases = {
  client_portal: 'buyer', buyer_bond_runtime: 'bondApplication', buyer_portal: 'buyer', buyer_onboarding: 'buyerOnboarding', seller_portal: 'seller',
  agent_listing: 'listing', internal_transaction: 'transaction', transaction_invoice: 'transaction',
  matter_financial_document: 'transaction', uploadClientPortalMatterFinancialProof: 'buyer',
  uploadClientPortalMatterFinancialRequestDocument: 'buyer', attorney_closeout: 'attorney',
  bond_closeout: 'bond', external_workspace: 'external', developer_portal: 'developer',
  development_asset: 'developmentAssets', commercial_workspace: 'commercialWorkspace',
  commercial_portal: 'commercial', commercial_onboarding: 'commercialTenant',
  commercial_landlord: 'commercialLandlord', recruitment_review: 'recruitment',
  recruitment_contract: 'recruitment', recruitment_signed_contract: 'recruitment',
  recruitment_onboarding: 'recruitment', fic_policy: 'fic', rental_document: 'rental', rental_application: 'rental',
  rental_landlord: 'rentalLandlord', bond_signed_application: 'bondWetInk',
  legal_template: 'legalTemplates', signed_packet: 'signedPackets',
}
export const DOCUMENT_MONITOR_SURFACES = Object.freeze([
  'buyer', 'buyerOnboarding', 'seller', 'listing', 'transaction', 'lead', 'developerLead',
  'attorneyVersions', 'attorney', 'bond', 'bondApplication', 'bondWetInk', 'external',
  'developer', 'developmentAssets', 'rental', 'rentalAgent', 'rentalLandlord',
  'commercialWorkspace', 'commercial', 'commercialTenant', 'commercialLandlord',
  'legalTemplates', 'signedPackets', 'recruitment', 'fic', 'partner', 'unknown',
])
export const DOCUMENT_MONITOR_STAGES = Object.freeze(['validation', 'preparing', 'uploading', 'saving', 'persistence', 'followUp', 'access'])
export const DOCUMENT_MONITOR_OUTCOMES = Object.freeze(['started', 'succeeded', 'recovered', 'failed', 'unconfirmed', 'attention'])
export const DOCUMENT_MONITOR_ERROR_CATEGORIES = Object.freeze(['none', 'validation', 'permission', 'network', 'missing_object', 'schema', 'unknown'])
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export function documentUploadErrorCategory(error) {
  if (!error) return 'none'
  const code = String(error.code || '')
  const status = Number(error.status || error.statusCode || error.cause?.status)
  if (code === 'document_save_unconfirmed') return documentUploadErrorCategory(error.cause) === 'none' ? 'network' : documentUploadErrorCategory(error.cause)
  if (code.startsWith('document_file_') || [400, 413, 415].includes(status)) return 'validation'
  if (['42501', 'PGRST301', 'PGRST302'].includes(code) || [401, 403].includes(status)) return 'permission'
  if (status === 404) return 'missing_object'
  if (/^(42|PGRST20)/.test(code)) return 'schema'
  if (error instanceof TypeError || /^(08|57)/.test(code)) return 'network'
  return 'unknown'
}
export function normalizeDocumentUploadTelemetry(input = {}) {
  const surface = aliases[input.surface] || input.surface
  const outcome = input.outcome === 'durable_saved' ? 'succeeded' : input.outcome === 'deduplicated' ? 'recovered' : input.outcome
  const stage = input.stage === 'storage' ? 'uploading' : input.stage
  return {
    eventId: uuid.test(input.eventId || '') ? input.eventId : globalThis.crypto?.randomUUID?.() || null,
    attemptId: uuid.test(input.attemptId || '') ? input.attemptId : globalThis.crypto?.randomUUID?.() || null,
    surface: DOCUMENT_MONITOR_SURFACES.includes(surface) ? surface : 'unknown',
    stage: DOCUMENT_MONITOR_STAGES.includes(stage) ? stage : 'persistence',
    outcome: DOCUMENT_MONITOR_OUTCOMES.includes(outcome) ? outcome : 'attention',
    errorCategory: DOCUMENT_MONITOR_ERROR_CATEGORIES.includes(input.errorCategory) ? input.errorCategory : documentUploadErrorCategory(input.error),
  }
}
export async function sendDocumentUploadTelemetry(payload, { fetcher = globalThis.fetch, location = globalThis.location } = {}) {
  // Local development must not write hosted telemetry. Failed monitoring must
  // never fail a save or trigger automatic re-upload of the customer's file.
  if (!location || location.protocol !== 'https:' || ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname) || typeof fetcher !== 'function') return false
  try {
    const response = await fetcher('/api/documents/telemetry', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload), keepalive: true, credentials: 'omit',
      signal: typeof globalThis.AbortSignal?.timeout === 'function' ? AbortSignal.timeout(3000) : undefined,
    })
    return response.ok === true
  } catch { return false }
}
export function reportDocumentUploadTelemetry(input = {}) {
  let payload
  try { payload = normalizeDocumentUploadTelemetry(input) } catch { return null }
  const logger = ['failed', 'unconfirmed'].includes(payload.outcome) ? console.warn : console.info
  try { logger('[document-upload]', payload) } catch { /* Diagnostics cannot affect the upload. */ }
  try {
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new CustomEvent(DOCUMENT_UPLOAD_TELEMETRY_EVENT, { detail: payload }))
      // Legacy step events have no attempt identity and can describe a failed
      // request followed by a recovered save. Keep those local to avoid
      // counting them as independent failed uploads.
      if (uuid.test(input.attemptId || '') || payload.stage === 'validation') void sendDocumentUploadTelemetry(payload)
    }
  } catch { /* Browser event listeners cannot affect the upload either. */ }
  return payload
}
