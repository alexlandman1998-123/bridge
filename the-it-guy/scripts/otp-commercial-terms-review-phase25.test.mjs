import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import {
  buildOtpCommissionVariationRecord,
} from '../src/core/documents/otpCommercialTermsFoundation.js'
import {
  buildOtpCommercialTermsPersistencePhase24Audit,
} from '../src/core/documents/otpCommercialTermsPersistencePhase24.js'
import {
  OTP_COMMERCIAL_TERMS_REVIEW_CONTRACT,
  OTP_COMMERCIAL_TERMS_REVIEW_PHASE25_VERSION,
  OTP_COMMERCIAL_TERMS_REVIEW_READY_STATUS,
  OTP_COMMERCIAL_TERMS_REVIEW_ROUTES,
  buildOtpCommercialTermsReviewModel,
  buildOtpCommercialTermsReviewPhase25Audit,
  formatOtpCommercialTermsReviewPhase25Markdown,
} from '../src/core/documents/otpCommercialTermsReviewPhase25.js'

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const migrationSql = await readFile(new URL('../../supabase/migrations/202608050010_otp_commercial_terms_persistence.sql', import.meta.url), 'utf8')
const serviceSource = await readFile(new URL('../src/services/documents/otpCommercialTermsPersistenceService.js', import.meta.url), 'utf8')
const componentSource = await readFile(new URL('../src/components/documents/OtpCommercialTermsReviewPanel.jsx', import.meta.url), 'utf8')
const intakePanelSource = await readFile(new URL('../src/components/documents/OtpDraftIntakePanel.jsx', import.meta.url), 'utf8')

assert.equal(
  packageJson.scripts?.['test:otp-commercial-terms-review-phase25'],
  'node scripts/otp-commercial-terms-review-phase25.test.mjs',
  'package.json should expose the OTP commercial terms review Phase 25 test.',
)
assert.equal(
  packageJson.scripts?.['report:otp-commercial-terms-review-phase25'],
  'node scripts/report-otp-commercial-terms-review-phase25.mjs',
  'package.json should expose the OTP commercial terms review Phase 25 report.',
)
assert.ok(
  packageJson.scripts?.['verify:otp-template-vnext']?.includes('test:otp-commercial-terms-review-phase25'),
  'OTP vNext verification should include Phase 25 review UI.',
)

assert.equal(OTP_COMMERCIAL_TERMS_REVIEW_PHASE25_VERSION, 'otp_commercial_terms_review_phase25_v1')
assert.equal(OTP_COMMERCIAL_TERMS_REVIEW_READY_STATUS, 'OTP_COMMERCIAL_TERMS_REVIEW_READY_FOR_PHASE26_RUNTIME_WIRING')
assert.equal(OTP_COMMERCIAL_TERMS_REVIEW_CONTRACT, 'otp-vnext-commercial-terms-review-phase25-v1')
assert.deepEqual(
  OTP_COMMERCIAL_TERMS_REVIEW_ROUTES.map((route) => route.key),
  ['resale_existing_property', 'new_development'],
)
assert.notEqual(
  OTP_COMMERCIAL_TERMS_REVIEW_ROUTES[0].screenKey,
  OTP_COMMERCIAL_TERMS_REVIEW_ROUTES[1].screenKey,
)

const pendingCommission = buildOtpCommissionVariationRecord({
  transactionId: 'tx-phase25-resale',
  routeVariant: 'resale_existing_property',
  mandateCommission: { basis: 'percentage', percentage: 5 },
  proposedOtpCommission: { basis: 'percentage', percentage: 4.25 },
  reason: 'Offer negotiation',
})
const resaleBlocked = buildOtpCommercialTermsReviewModel({
  transactionId: 'tx-phase25-resale',
  routeVariant: 'resale_existing_property',
  commissionVariation: pendingCommission,
  sellerFacts: {
    property: {
      rates_taxes: 1950,
      levies: 2400,
      scheme: { body_corporate_name: 'Phase 25 Body Corporate', levies: 2400 },
    },
  },
  matterAttorneyQuoteState: {
    transactionId: 'tx-phase25-resale',
    transactionAttorneyAssignmentId: 'assignment-phase25-resale',
    routeVariant: 'resale_existing_property',
    quoteStatus: 'uploaded',
    amount: 42000,
  },
  reviewedAt: '2026-08-05T13:00:00.000Z',
})

assert.equal(resaleBlocked.status, 'OTP_REVIEW_BLOCKED_PENDING_COMMERCIAL_APPROVAL')
assert.equal(resaleBlocked.canGenerateOtp, false)
assert.equal(resaleBlocked.sections.commissionApproval.visibleBeforeGeneration, true)
assert.equal(resaleBlocked.sections.commissionApproval.status, 'pending_approval')
assert.equal(resaleBlocked.sections.commissionApproval.mandateCommission, '5% percentage')
assert.equal(resaleBlocked.sections.commissionApproval.proposedOtpCommission, '4.25% percentage')
assert.ok(resaleBlocked.generationBlockers.includes('otp_commission_variation_pending_approval'))
assert.equal(resaleBlocked.sections.matterAttorneyQuote.transactionScoped, true)
assert.equal(resaleBlocked.sections.matterAttorneyQuote.separatedFromAttorneyLeadQuote, true)

const approvedCommission = buildOtpCommissionVariationRecord({
  transactionId: 'tx-phase25-resale',
  routeVariant: 'resale_existing_property',
  mandateCommission: { basis: 'percentage', percentage: 5 },
  proposedOtpCommission: { basis: 'percentage', percentage: 4.25 },
  approval: {
    status: 'approved',
    approvalReference: 'OTP-P25-COMM-001',
    approverId: 'principal-user',
    approvedAt: '2026-08-05T13:05:00.000Z',
  },
})
const resaleReady = buildOtpCommercialTermsReviewModel({
  transactionId: 'tx-phase25-resale',
  routeVariant: 'resale_existing_property',
  commissionVariation: approvedCommission,
  costObligationItems: [
    { item_key: 'buyer_transfer_cost_quote', amount_status: 'pending', source_scope: 'transfer_attorney_assignment', route_variant: 'resale_existing_property' },
    { item_key: 'buyer_transfer_duty', amount_status: 'known', amount: 185000, source_scope: 'transaction_offer_terms', route_variant: 'resale_existing_property' },
    { item_key: 'municipal_rates_estimate', amount_status: 'estimated', amount: 1950, source_scope: 'rates_account', route_variant: 'resale_existing_property' },
    { item_key: 'scheme_levy_estimate', amount_status: 'estimated', amount: 2400, source_scope: 'levy_statement', route_variant: 'resale_existing_property' },
    { item_key: 'development_levy_estimate', amount_status: 'estimated', amount: 2100, source_scope: 'development_unit_setup', route_variant: 'new_development' },
  ],
  matterAttorneyQuoteState: {
    transaction_id: 'tx-phase25-resale',
    transaction_attorney_assignment_id: 'assignment-phase25-resale',
    route_variant: 'resale_existing_property',
    quote_status: 'uploaded',
    source_scope: 'transaction_matter',
  },
})

assert.equal(resaleReady.status, 'OTP_REVIEW_READY_FOR_GENERATION')
assert.equal(resaleReady.canGenerateOtp, true)
assert.equal(resaleReady.sections.commissionApproval.finalOtpCommission, '4.25% percentage')
assert.equal(resaleReady.sections.commissionApproval.approvalReference, 'OTP-P25-COMM-001')
assert.equal(resaleReady.sections.buyerCostObligations.statusCounts.known, 1)
assert.equal(resaleReady.sections.buyerCostObligations.statusCounts.estimated, 2)
assert.equal(resaleReady.sections.buyerCostObligations.statusCounts.pending, 1)
assert.equal(resaleReady.sections.buyerCostObligations.items.some((item) => item.key === 'development_levy_estimate'), false)
assert.equal(resaleReady.routeSeparation.prohibitedCostKeysAbsent, true)
assert.equal(resaleReady.routeVariant, 'resale_existing_property')
assert.equal(resaleReady.screenKey, 'otp_review_resale_existing_property')

const developmentReady = buildOtpCommercialTermsReviewModel({
  transactionId: 'tx-phase25-development',
  routeVariant: 'new_development',
  commissionVariation: {
    transaction_id: 'tx-phase25-development',
    route_variant: 'new_development',
    mandate_commission_snapshot: { basis: 'percentage', percentage: 5 },
    proposed_otp_commission: { basis: 'percentage', percentage: 5 },
    approval_status: 'not_required',
  },
  developmentUnit: {
    levyEstimate: 2200,
    utilityConnectionCharges: 14500,
  },
  matterAttorneyQuoteState: {
    transaction_id: 'tx-phase25-development',
    transaction_attorney_assignment_id: 'assignment-phase25-development',
    route_variant: 'new_development',
    quote_status: 'pending_upload',
    source_scope: 'transaction_matter',
  },
})

assert.equal(developmentReady.status, 'OTP_REVIEW_READY_FOR_GENERATION')
assert.equal(developmentReady.screenKey, 'otp_review_new_development')
assert.ok(developmentReady.sections.buyerCostObligations.items.some((item) => item.key === 'development_levy_estimate'))
assert.ok(developmentReady.sections.buyerCostObligations.items.some((item) => item.key === 'utility_connection_charges'))
assert.equal(developmentReady.sections.buyerCostObligations.items.some((item) => item.key === 'scheme_levy_estimate'), false)
assert.equal(developmentReady.routeSeparation.prohibitedCostKeysAbsent, true)

const leadQuoteLeak = buildOtpCommercialTermsReviewModel({
  transactionId: 'tx-phase25-lead-leak',
  routeVariant: 'resale_existing_property',
  commissionVariation: approvedCommission,
  sellerFacts: { property: { rates_taxes: 1950, levies: 2400 } },
  matterAttorneyQuoteState: {
    transaction_id: 'tx-phase25-lead-leak',
    transaction_attorney_assignment_id: 'assignment-phase25-lead-leak',
    route_variant: 'resale_existing_property',
    quote_status: 'uploaded',
    source_scope: 'attorney_lead_quote',
    attorney_lead_quote_id: 'lead-quote-should-not-flow',
  },
})

assert.equal(leadQuoteLeak.status, 'OTP_REVIEW_BLOCKED_MATTER_QUOTE_SCOPE')
assert.equal(leadQuoteLeak.canGenerateOtp, false)
assert.ok(leadQuoteLeak.generationBlockers.includes('matter_attorney_quote_scope_not_transaction_matter'))
assert.equal(leadQuoteLeak.sections.matterAttorneyQuote.separatedFromAttorneyLeadQuote, false)

for (const token of [
  'OtpCommercialTermsReviewPanel',
  'data-route-variant',
  'commissionApproval',
  'buyerCostObligations',
  'matterAttorneyQuote',
  'Known',
  'Estimated',
  'Pending',
  'aria-label',
]) {
  assert.ok(componentSource.includes(token), `review panel should include ${token}`)
}
for (const token of [
  'commercialTermsReviewModel',
  'commercialTermsReviewInput',
  'commercial_terms_review',
  'OtpCommercialTermsReviewPanel',
  'onCommercialTermsReviewAction',
]) {
  assert.ok(intakePanelSource.includes(token), `OTP intake panel should include ${token}`)
}

const phase24Audit = buildOtpCommercialTermsPersistencePhase24Audit({
  checkedAt: '2026-08-05T13:15:00.000Z',
  migrationSql,
  serviceSource,
})
const phase25Audit = buildOtpCommercialTermsReviewPhase25Audit({
  checkedAt: '2026-08-05T13:15:00.000Z',
  phase24Audit,
  reviewComponentSource: componentSource,
})

assert.equal(phase25Audit.version, OTP_COMMERCIAL_TERMS_REVIEW_PHASE25_VERSION)
assert.equal(phase25Audit.contract, OTP_COMMERCIAL_TERMS_REVIEW_CONTRACT)
assert.equal(phase25Audit.status, OTP_COMMERCIAL_TERMS_REVIEW_READY_STATUS)
assert.equal(phase25Audit.mutatedData, false)
assert.equal(phase25Audit.summary.blockerCount, 0)
assert.equal(phase25Audit.nextPhase.phase, 26)
assert.equal(phase25Audit.nextPhase.key, 'runtime_data_wiring')
assert.deepEqual(phase25Audit.blockers, [])

for (const check of [
  'PHASE25_PHASE24_PERSISTENCE_READY',
  'PHASE25_COMMISSION_APPROVAL_VISIBLE_AND_BLOCKING',
  'PHASE25_MANDATE_COMMISSION_REMAINS_SEPARATE',
  'PHASE25_COST_OBLIGATION_STATUSES_VISIBLE',
  'PHASE25_RESALE_AND_DEVELOPMENT_REVIEW_SCREENS_SEPARATE',
  'PHASE25_MATTER_ATTORNEY_QUOTE_TRANSACTION_SCOPED',
  'PHASE25_REVIEW_PANEL_COMPONENT_PRESENT',
]) {
  assert.equal(phase25Audit.checks.find((item) => item.code === check)?.pass, true, `${check} should pass.`)
}

const blockedAudit = buildOtpCommercialTermsReviewPhase25Audit({
  checkedAt: '2026-08-05T13:15:00.000Z',
  phase24Audit: { ...phase24Audit, status: 'OTP_COMMERCIAL_TERMS_PERSISTENCE_REMEDIATION_REQUIRED' },
  reviewComponentSource: componentSource,
})
assert.equal(blockedAudit.status, 'OTP_COMMERCIAL_TERMS_REVIEW_REMEDIATION_REQUIRED')
assert.equal(blockedAudit.nextPhase, null)

const markdown = formatOtpCommercialTermsReviewPhase25Markdown(phase25Audit)
for (const token of [
  'OTP Generator Phase 25 Review UI',
  'OTP_COMMERCIAL_TERMS_REVIEW_READY_FOR_PHASE26_RUNTIME_WIRING',
  'otp_review_resale_existing_property',
  'otp_review_new_development',
  'Phase 26: Runtime Data Wiring',
]) {
  assert.ok(markdown.includes(token), `markdown should include ${token}`)
}

console.log('OTP commercial terms review Phase 25 contract passed.')
