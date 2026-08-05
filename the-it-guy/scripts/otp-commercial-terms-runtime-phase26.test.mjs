import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import {
  buildOtpCommercialTermsPersistencePhase24Audit,
} from '../src/core/documents/otpCommercialTermsPersistencePhase24.js'
import {
  buildOtpCommercialTermsReviewPhase25Audit,
} from '../src/core/documents/otpCommercialTermsReviewPhase25.js'
import {
  OTP_COMMERCIAL_TERMS_RUNTIME_CONTRACT,
  OTP_COMMERCIAL_TERMS_RUNTIME_PHASE26_VERSION,
  OTP_COMMERCIAL_TERMS_RUNTIME_READY_STATUS,
  OTP_COMMERCIAL_TERMS_RUNTIME_SERVICE_OPERATIONS,
  buildOtpCommercialTermsRuntimeInput,
  buildOtpCommercialTermsRuntimePhase26Audit,
  deriveOtpRuntimeDevelopmentUnit,
  deriveOtpRuntimeSellerFacts,
  formatOtpCommercialTermsRuntimePhase26Markdown,
} from '../src/core/documents/otpCommercialTermsRuntimePhase26.js'

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const migrationSql = await readFile(new URL('../../supabase/migrations/202608050010_otp_commercial_terms_persistence.sql', import.meta.url), 'utf8')
const persistenceServiceSource = await readFile(new URL('../src/services/documents/otpCommercialTermsPersistenceService.js', import.meta.url), 'utf8')
const runtimeServiceSource = await readFile(new URL('../src/services/documents/otpCommercialTermsRuntimeService.js', import.meta.url), 'utf8')
const componentSource = await readFile(new URL('../src/components/documents/OtpCommercialTermsReviewPanel.jsx', import.meta.url), 'utf8')

assert.equal(
  packageJson.scripts?.['test:otp-commercial-terms-runtime-phase26'],
  'node scripts/otp-commercial-terms-runtime-phase26.test.mjs',
  'package.json should expose the OTP commercial terms runtime Phase 26 test.',
)
assert.equal(
  packageJson.scripts?.['report:otp-commercial-terms-runtime-phase26'],
  'node scripts/report-otp-commercial-terms-runtime-phase26.mjs',
  'package.json should expose the OTP commercial terms runtime Phase 26 report.',
)
assert.ok(
  packageJson.scripts?.['verify:otp-template-vnext']?.includes('test:otp-commercial-terms-runtime-phase26'),
  'OTP vNext verification should include Phase 26 runtime wiring.',
)

assert.equal(OTP_COMMERCIAL_TERMS_RUNTIME_PHASE26_VERSION, 'otp_commercial_terms_runtime_phase26_v1')
assert.equal(OTP_COMMERCIAL_TERMS_RUNTIME_READY_STATUS, 'OTP_COMMERCIAL_TERMS_RUNTIME_READY_FOR_PHASE27_GENERATED_PDF_PROOF')
assert.equal(OTP_COMMERCIAL_TERMS_RUNTIME_CONTRACT, 'otp-vnext-commercial-terms-runtime-phase26-v1')
assert.deepEqual(
  OTP_COMMERCIAL_TERMS_RUNTIME_SERVICE_OPERATIONS,
  [
    'loadOtpCommercialTermsRuntimeRecords',
    'buildOtpCommercialTermsRuntimeInputForTransaction',
  ],
)

const sellerFacts = deriveOtpRuntimeSellerFacts({
  sellerOnboarding: {
    form_data: {
      property: {
        ratesTaxes: '1950',
        levies: '2400',
        scheme: { bodyCorporateName: 'Bridge Body Corporate' },
      },
    },
  },
})
assert.equal(sellerFacts.property.rates_taxes, 1950)
assert.equal(sellerFacts.property.levies, 2400)
assert.ok(sellerFacts.sourceKeys.includes('seller_onboarding'))

const developmentUnit = deriveOtpRuntimeDevelopmentUnit({
  developmentUnit: {
    levy_estimate: '2200',
    utility_connection_charges: '14500',
  },
})
assert.equal(developmentUnit.levyEstimate, 2200)
assert.equal(developmentUnit.utilityConnectionCharges, 14500)
assert.ok(developmentUnit.sourceKeys.includes('development_unit_setup'))

const resaleRuntime = buildOtpCommercialTermsRuntimeInput({
  wiredAt: '2026-08-05T14:00:00.000Z',
  transaction: {
    id: 'tx-phase26-resale',
    purchase_price: 2850000,
    gross_commission_percentage: 4.5,
  },
  listing: {
    commission: { commission_percentage: 5 },
  },
  sellerOnboarding: {
    form_data: {
      property: {
        ratesTaxes: 1950,
        levies: 2400,
        scheme: { bodyCorporateName: 'Phase 26 Body Corporate' },
      },
    },
  },
  commissionVariationRows: [{
    transaction_id: 'tx-phase26-resale',
    route_variant: 'resale_existing_property',
    mandate_commission_snapshot: { basis: 'percentage', percentage: 5 },
    proposed_otp_commission: { basis: 'percentage', percentage: 4.5, amount: 128250 },
    approval_status: 'approved',
    approval_reference: 'OTP-P26-APPROVED',
    updated_at: '2026-08-05T13:58:00.000Z',
  }],
  costObligationRows: [
    { item_key: 'buyer_transfer_cost_quote', label: 'Attorney transfer-cost quote', route_variant: 'resale_existing_property', amount_status: 'pending', source: 'transfer_attorney_assignment', status: 'active' },
    { item_key: 'development_levy_estimate', label: 'Development levy estimate', route_variant: 'new_development', amount_status: 'estimated', amount: 2200, source: 'development_unit_setup', status: 'active' },
  ],
  attorneyAssignments: [{
    id: 'assignment-phase26-resale',
    attorneyRole: 'transfer_attorney',
    assignmentStatus: 'active',
    attorneyFirmId: 'firm-phase26',
    firmName: 'Phase 26 Attorneys',
    primaryAttorneyName: 'A Transfer Attorney',
  }],
  matterAttorneyQuoteRows: [{
    transaction_id: 'tx-phase26-resale',
    transaction_attorney_assignment_id: 'assignment-phase26-resale',
    route_variant: 'resale_existing_property',
    quote_status: 'uploaded',
    source_scope: 'transaction_matter',
    amount: 42000,
    updated_at: '2026-08-05T13:59:00.000Z',
  }],
})

assert.equal(resaleRuntime.routeVariant, 'resale_existing_property')
assert.equal(resaleRuntime.reviewModel.status, 'OTP_REVIEW_READY_FOR_GENERATION')
assert.equal(resaleRuntime.gates.canGenerateOtp, true)
assert.equal(resaleRuntime.gates.canFinalizeTransactionCommission, true)
assert.equal(resaleRuntime.commercialTerms.commission.lockDecision.approvalStatus, 'approved')
assert.equal(resaleRuntime.commercialTerms.matterAttorneyCostQuote.transactionAttorneyAssignmentId, 'assignment-phase26-resale')
assert.equal(resaleRuntime.generatorInput.mergeFields.otp_commission_approval_reference, 'OTP-P26-APPROVED')
assert.ok(resaleRuntime.generatorInput.mergeFields.otp_buyer_cost_obligations.includes('Municipal rates and taxes'))
assert.ok(resaleRuntime.generatorInput.mergeFields.otp_buyer_cost_obligations.includes('Body corporate levy estimate'))
assert.equal(
  resaleRuntime.reviewModel.sections.buyerCostObligations.items.some((item) => item.key === 'development_levy_estimate'),
  false,
)
assert.equal(resaleRuntime.routeSeparation.prohibitedCostKeysAbsent, true)
assert.equal(resaleRuntime.routeSeparation.attorneyLeadQuotesExcluded, true)
assert.equal(resaleRuntime.mutatedData, false)

const developmentRuntime = buildOtpCommercialTermsRuntimeInput({
  wiredAt: '2026-08-05T14:05:00.000Z',
  transaction: {
    id: 'tx-phase26-development',
    otp_document_variant: 'new_development',
    purchase_price: 3150000,
    gross_commission_percentage: 5,
  },
  listing: {
    commission: { commission_percentage: 5 },
  },
  developmentUnit: {
    levyEstimate: 2200,
    utilityConnectionCharges: 14500,
  },
  attorneyAssignments: [{
    id: 'assignment-phase26-development',
    attorneyRole: 'transfer_attorney',
    assignmentStatus: 'active',
  }],
})

assert.equal(developmentRuntime.routeVariant, 'new_development')
assert.equal(developmentRuntime.reviewModel.status, 'OTP_REVIEW_READY_FOR_GENERATION')
assert.equal(developmentRuntime.gates.canFinalizeTransactionCommission, true)
assert.ok(developmentRuntime.generatorInput.mergeFields.otp_buyer_cost_obligations.includes('Development levy estimate'))
assert.ok(developmentRuntime.generatorInput.mergeFields.otp_buyer_cost_obligations.includes('Utility connection charges'))
assert.equal(
  developmentRuntime.reviewModel.sections.buyerCostObligations.items.some((item) => item.key === 'scheme_levy_estimate'),
  false,
)
assert.equal(developmentRuntime.routeSeparation.prohibitedCostKeysAbsent, true)

const blockedCommissionRuntime = buildOtpCommercialTermsRuntimeInput({
  wiredAt: '2026-08-05T14:10:00.000Z',
  transaction: {
    id: 'tx-phase26-blocked',
    purchase_price: 2850000,
    gross_commission_percentage: 4.25,
  },
  listing: {
    commission: { commission_percentage: 5 },
  },
  sellerOnboarding: {
    form_data: { property: { ratesTaxes: 1800, levies: 2100 } },
  },
})

assert.equal(blockedCommissionRuntime.reviewModel.status, 'OTP_REVIEW_BLOCKED_PENDING_COMMERCIAL_APPROVAL')
assert.equal(blockedCommissionRuntime.gates.canGenerateOtp, false)
assert.equal(blockedCommissionRuntime.gates.canFinalizeTransactionCommission, false)
assert.ok(blockedCommissionRuntime.gates.generationBlockers.includes('otp_commission_variation_pending_approval'))

for (const token of [
  'loadOtpCommercialTermsRuntimeRecords',
  'buildOtpCommercialTermsRuntimeInputForTransaction',
  'transactions',
  'private_listings',
  'private_listing_seller_onboarding',
  'otp_commission_variations',
  'otp_cost_obligation_items',
  'matter_attorney_cost_quote_states',
  'transaction_attorney_assignments',
  'otp_commercial_terms_persistence_readiness_v1',
  'buildOtpCommercialTermsRuntimeInput',
]) {
  assert.ok(runtimeServiceSource.includes(token), `runtime service should include ${token}`)
}

const phase24Audit = buildOtpCommercialTermsPersistencePhase24Audit({
  checkedAt: '2026-08-05T14:15:00.000Z',
  migrationSql,
  serviceSource: persistenceServiceSource,
})
const phase25Audit = buildOtpCommercialTermsReviewPhase25Audit({
  checkedAt: '2026-08-05T14:15:00.000Z',
  phase24Audit,
  reviewComponentSource: componentSource,
})
const phase26Audit = buildOtpCommercialTermsRuntimePhase26Audit({
  checkedAt: '2026-08-05T14:15:00.000Z',
  phase25Audit,
  serviceSource: runtimeServiceSource,
})

assert.equal(phase26Audit.version, OTP_COMMERCIAL_TERMS_RUNTIME_PHASE26_VERSION)
assert.equal(phase26Audit.contract, OTP_COMMERCIAL_TERMS_RUNTIME_CONTRACT)
assert.equal(phase26Audit.status, OTP_COMMERCIAL_TERMS_RUNTIME_READY_STATUS)
assert.equal(phase26Audit.mutatedData, false)
assert.equal(phase26Audit.summary.blockerCount, 0)
assert.equal(phase26Audit.nextPhase.phase, 27)
assert.equal(phase26Audit.nextPhase.key, 'generated_pdf_proof')
assert.deepEqual(phase26Audit.blockers, [])

for (const check of [
  'PHASE26_PHASE25_REVIEW_READY',
  'PHASE26_RESALE_SELLER_FACTS_FLOW_TO_GENERATOR_INPUT',
  'PHASE26_DEVELOPMENT_COSTS_FLOW_TO_GENERATOR_INPUT',
  'PHASE26_COMMISSION_LOCK_DECISION_GATES_FINALISATION',
  'PHASE26_MATTER_ATTORNEY_ASSIGNMENT_QUOTE_WIRED',
  'PHASE26_RUNTIME_SERVICE_PRESENT',
]) {
  assert.equal(phase26Audit.checks.find((item) => item.code === check)?.pass, true, `${check} should pass.`)
}

const blockedAudit = buildOtpCommercialTermsRuntimePhase26Audit({
  checkedAt: '2026-08-05T14:15:00.000Z',
  phase25Audit: { ...phase25Audit, status: 'OTP_COMMERCIAL_TERMS_REVIEW_REMEDIATION_REQUIRED' },
  serviceSource: runtimeServiceSource,
})
assert.equal(blockedAudit.status, 'OTP_COMMERCIAL_TERMS_RUNTIME_REMEDIATION_REQUIRED')
assert.equal(blockedAudit.nextPhase, null)

const markdown = formatOtpCommercialTermsRuntimePhase26Markdown(phase26Audit)
for (const token of [
  'OTP Generator Phase 26 Runtime Data Wiring',
  'OTP_COMMERCIAL_TERMS_RUNTIME_READY_FOR_PHASE27_GENERATED_PDF_PROOF',
  'Phase 27: Generated PDF Proof',
  'PHASE26_RESALE_SELLER_FACTS_FLOW_TO_GENERATOR_INPUT',
]) {
  assert.ok(markdown.includes(token), `markdown should include ${token}`)
}

console.log('OTP commercial terms runtime Phase 26 contract passed.')
