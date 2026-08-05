import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import {
  buildOtpCommercialTermsPersistencePhase24Audit,
} from '../src/core/documents/otpCommercialTermsPersistencePhase24.js'
import {
  buildOtpCommercialTermsReviewPhase25Audit,
} from '../src/core/documents/otpCommercialTermsReviewPhase25.js'
import {
  buildOtpCommercialTermsRuntimePhase26Audit,
} from '../src/core/documents/otpCommercialTermsRuntimePhase26.js'
import {
  buildOtpGeneratedPdfProofPhase27Audit,
} from '../src/core/documents/otpGeneratedPdfProofPhase27.js'
import {
  OTP_MATTER_ATTORNEY_QUOTE_PORTAL_CONTRACT,
  OTP_MATTER_ATTORNEY_QUOTE_PORTAL_PHASE28_VERSION,
  OTP_MATTER_ATTORNEY_QUOTE_PORTAL_READY_STATUS,
  OTP_MATTER_ATTORNEY_QUOTE_PORTAL_SERVICE_OPERATIONS,
  buildMatterAttorneyQuotePortalAction,
  buildMatterAttorneyQuotePortalState,
  buildOtpMatterAttorneyQuotePortalPhase28Audit,
  formatOtpMatterAttorneyQuotePortalPhase28Markdown,
} from '../src/core/documents/otpMatterAttorneyQuotePortalPhase28.js'
import { renderOtpGeneratedPdfProofPhase27 } from './render-otp-generated-pdf-proof-phase27.mjs'

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const migrationSql = await readFile(new URL('../../supabase/migrations/202608050010_otp_commercial_terms_persistence.sql', import.meta.url), 'utf8')
const persistenceServiceSource = await readFile(new URL('../src/services/documents/otpCommercialTermsPersistenceService.js', import.meta.url), 'utf8')
const reviewComponentSource = await readFile(new URL('../src/components/documents/OtpCommercialTermsReviewPanel.jsx', import.meta.url), 'utf8')
const runtimeServiceSource = await readFile(new URL('../src/services/documents/otpCommercialTermsRuntimeService.js', import.meta.url), 'utf8')
const portalServiceSource = await readFile(new URL('../src/services/documents/otpMatterAttorneyQuotePortalService.js', import.meta.url), 'utf8')
const phase28Source = await readFile(new URL('../src/core/documents/otpMatterAttorneyQuotePortalPhase28.js', import.meta.url), 'utf8')

assert.equal(
  packageJson.scripts?.['test:otp-matter-attorney-quote-portal-phase28'],
  'node scripts/otp-matter-attorney-quote-portal-phase28.test.mjs',
  'package.json should expose the OTP matter attorney quote portal Phase 28 test.',
)
assert.equal(
  packageJson.scripts?.['report:otp-matter-attorney-quote-portal-phase28'],
  'node scripts/report-otp-matter-attorney-quote-portal-phase28.mjs',
  'package.json should expose the OTP matter attorney quote portal Phase 28 report.',
)
assert.ok(
  packageJson.scripts?.['verify:otp-template-vnext']?.includes('test:otp-matter-attorney-quote-portal-phase28'),
  'OTP vNext verification should include Phase 28 matter attorney quote portal flow.',
)

assert.equal(OTP_MATTER_ATTORNEY_QUOTE_PORTAL_PHASE28_VERSION, 'otp_matter_attorney_quote_portal_phase28_v1')
assert.equal(OTP_MATTER_ATTORNEY_QUOTE_PORTAL_READY_STATUS, 'OTP_MATTER_ATTORNEY_QUOTE_PORTAL_READY_FOR_PHASE29_FINAL_PRODUCTION_READINESS_GATE')
assert.equal(OTP_MATTER_ATTORNEY_QUOTE_PORTAL_CONTRACT, 'otp-vnext-matter-attorney-quote-portal-phase28-v1')
assert.deepEqual(OTP_MATTER_ATTORNEY_QUOTE_PORTAL_SERVICE_OPERATIONS, [
  'loadMatterAttorneyQuotePortalState',
  'uploadMatterAttorneyQuoteDocument',
  'reviseMatterAttorneyQuoteDocument',
  'markMatterAttorneyQuoteViewed',
  'submitMatterAttorneyQuoteQuery',
  'acknowledgeMatterAttorneyQuote',
])

for (const token of [
  'attorney_upload_quote',
  'attorney_revise_quote',
  'buyer_view_quote',
  'buyer_query_quote',
  'buyer_acknowledge_quote',
  'buyer_final_statement',
  'publicAttorneyLeadQuoteTouched: false',
]) {
  assert.ok(phase28Source.includes(token), `Phase 28 core should include ${token}`)
}

for (const operation of OTP_MATTER_ATTORNEY_QUOTE_PORTAL_SERVICE_OPERATIONS) {
  assert.ok(portalServiceSource.includes(`export async function ${operation}`), `portal service should export ${operation}`)
}
for (const token of [
  'assertMatterQuotePortalAccess',
  'allowedTransactionAttorneyAssignmentIds',
  'matter_attorney_cost_quote_states',
  'source_scope',
  'transaction_matter',
  'upsertMatterAttorneyCostQuoteState',
]) {
  assert.ok(portalServiceSource.includes(token), `portal service should include ${token}`)
}
assert.equal(portalServiceSource.includes('attorney_lead_quotes'), false)
assert.equal(portalServiceSource.includes('bridge_prepare_attorney_quote_email'), false)

const portalState = buildMatterAttorneyQuotePortalState({
  checkedAt: '2026-08-05T16:00:00.000Z',
  transactionId: 'tx-phase28-direct',
  routeVariant: 'resale_existing_property',
  transactionAttorneyAssignmentId: 'assignment-phase28-direct',
  attorneyFirmId: 'firm-phase28',
  buyerParticipantIds: ['buyer-phase28'],
  quoteState: {
    quote_status: 'uploaded',
    document_definition_key: 'buyer_transfer_cost_invoice',
    file_url: 'secure://matter/tx-phase28-direct/quote.pdf',
    amount: 43000,
    source_scope: 'transaction_matter',
  },
})
assert.equal(portalState.portalReady, true)
assert.equal(portalState.transactionScoped, true)
assert.equal(portalState.separatedFromAttorneyLeadQuote, true)
assert.ok(portalState.allowedActions.includes('buyer_query_quote'))
assert.ok(portalState.allowedActions.includes('buyer_acknowledge_quote'))

const queryAction = buildMatterAttorneyQuotePortalAction({
  portalState,
  actionKey: 'buyer_query_quote',
  actorRole: 'buyer',
  actorId: 'buyer-phase28',
  queryText: 'Please clarify conveyancer disbursements.',
})
assert.equal(queryAction.allowed, true)
assert.equal(queryAction.quoteStatus, 'buyer_queried')
assert.equal(queryAction.sourceScope, 'transaction_matter')
assert.equal(queryAction.publicAttorneyLeadQuoteTouched, false)

const blockedLeadQuoteState = buildMatterAttorneyQuotePortalState({
  transactionId: 'tx-phase28-direct',
  routeVariant: 'resale_existing_property',
  transactionAttorneyAssignmentId: 'assignment-phase28-direct',
  attorneyFirmId: 'firm-phase28',
  quoteState: {
    quote_status: 'uploaded',
    source_scope: 'attorney_lead_quote',
    attorney_lead_quote_id: 'lead-quote-unsafe',
    file_url: 'secure://lead/quote.pdf',
  },
})
assert.equal(blockedLeadQuoteState.portalReady, false)
assert.equal(blockedLeadQuoteState.separatedFromAttorneyLeadQuote, false)
assert.deepEqual(blockedLeadQuoteState.allowedActions, [])

const phase24Audit = buildOtpCommercialTermsPersistencePhase24Audit({
  checkedAt: '2026-08-05T16:00:00.000Z',
  migrationSql,
  serviceSource: persistenceServiceSource,
})
const phase25Audit = buildOtpCommercialTermsReviewPhase25Audit({
  checkedAt: '2026-08-05T16:00:00.000Z',
  phase24Audit,
  reviewComponentSource,
})
const phase26Audit = buildOtpCommercialTermsRuntimePhase26Audit({
  checkedAt: '2026-08-05T16:00:00.000Z',
  phase25Audit,
  serviceSource: runtimeServiceSource,
})
const renderEvidence = await renderOtpGeneratedPdfProofPhase27()
const phase27Audit = buildOtpGeneratedPdfProofPhase27Audit({
  checkedAt: '2026-08-05T16:00:00.000Z',
  phase26Audit,
  renderEvidence,
})
const audit = buildOtpMatterAttorneyQuotePortalPhase28Audit({
  checkedAt: '2026-08-05T16:00:00.000Z',
  phase27Audit,
  migrationSql,
  serviceSource: portalServiceSource,
})

assert.equal(audit.version, OTP_MATTER_ATTORNEY_QUOTE_PORTAL_PHASE28_VERSION)
assert.equal(audit.contract, OTP_MATTER_ATTORNEY_QUOTE_PORTAL_CONTRACT)
assert.equal(audit.status, OTP_MATTER_ATTORNEY_QUOTE_PORTAL_READY_STATUS)
assert.equal(audit.mutatedData, false)
assert.equal(audit.summary.routeCount, 2)
assert.equal(audit.summary.serviceOperationCount, 6)
assert.equal(audit.summary.actionProofCount, 4)
assert.equal(audit.summary.blockerCount, 0)
assert.equal(audit.nextPhase.phase, 29)
assert.equal(audit.nextPhase.key, 'final_production_readiness_gate')
assert.deepEqual(audit.blockers, [])

for (const check of [
  'PHASE28_PHASE27_GENERATED_PDF_PROOF_READY',
  'PHASE28_PERSISTENCE_SUPPORTS_PORTAL_STATE',
  'PHASE28_SERVICE_WRAPPER_PRESENT',
  'PHASE28_RESALE_AND_DEVELOPMENT_ROUTES_SEPARATED',
  'PHASE28_BUYER_QUERY_REVISION_ACK_FLOW_PROVED',
  'PHASE28_PUBLIC_ATTORNEY_LEAD_QUOTES_EXCLUDED',
]) {
  assert.equal(audit.checks.find((item) => item.code === check)?.pass, true, `${check} should pass.`)
}

assert.ok(audit.actionRows.some((row) => row.actionKey === 'buyer_query_quote' && row.quoteStatus === 'buyer_queried'))
assert.ok(audit.actionRows.some((row) => row.actionKey === 'attorney_revise_quote' && row.quoteStatus === 'revised'))
assert.ok(audit.actionRows.some((row) => row.actionKey === 'buyer_acknowledge_quote' && row.quoteStatus === 'acknowledged'))
assert.equal(audit.evidence.blockedLeadScope.portalReady, false)
assert.equal(audit.evidence.blockedLeadScope.sourceScope, 'attorney_lead_quote')

const blocked = buildOtpMatterAttorneyQuotePortalPhase28Audit({
  checkedAt: '2026-08-05T16:00:00.000Z',
  phase27Audit: { ...phase27Audit, status: 'OTP_GENERATED_PDF_PROOF_REMEDIATION_REQUIRED' },
  migrationSql,
  serviceSource: portalServiceSource,
})
assert.equal(blocked.status, 'OTP_MATTER_ATTORNEY_QUOTE_PORTAL_REMEDIATION_REQUIRED')
assert.equal(blocked.nextPhase, null)

const markdown = formatOtpMatterAttorneyQuotePortalPhase28Markdown(audit)
for (const token of [
  'OTP Generator Phase 28 Matter Attorney Quote Portal Flow',
  'OTP_MATTER_ATTORNEY_QUOTE_PORTAL_READY_FOR_PHASE29_FINAL_PRODUCTION_READINESS_GATE',
  'buyer_query_quote',
  'attorney_revise_quote',
  'Phase 29: Final Production Readiness Gate',
]) {
  assert.ok(markdown.includes(token), `markdown should include ${token}`)
}

console.log('OTP matter attorney quote portal Phase 28 contract passed.')
