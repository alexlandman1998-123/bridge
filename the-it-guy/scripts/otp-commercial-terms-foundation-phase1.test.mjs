import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import {
  MATTER_ATTORNEY_COST_QUOTE_STATUSES,
  OTP_COMMERCIAL_TERMS_FOUNDATION_VERSION,
  OTP_COMMERCIAL_TERMS_RECORD_CONTRACT,
  buildMatterAttorneyCostQuoteState,
  buildOtpBuyerCostObligationSchedule,
  buildOtpCommercialTermsFoundationAudit,
  buildOtpCommissionVariationRecord,
  buildTransactionCommissionLockDecision,
  canTransitionMatterAttorneyCostQuote,
  formatOtpCommercialTermsFoundationMarkdown,
} from '../src/core/documents/otpCommercialTermsFoundation.js'
import {
  buildOtpStructuredTermsAudit,
  buildOtpStructuredTermsManifest,
} from '../src/core/documents/otpStructuredTerms.js'
import {
  getOtpFieldDefinition,
} from '../src/core/documents/otpFieldRegistry.js'
import {
  listOtpLegalContentTemplateSections,
} from '../src/core/documents/otpLegalContentTemplates.js'

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))

assert.equal(
  packageJson.scripts?.['test:otp-commercial-terms-foundation-phase1'],
  'node scripts/otp-commercial-terms-foundation-phase1.test.mjs',
  'package.json should expose the OTP commercial terms Phase 1 test.',
)
assert.equal(
  packageJson.scripts?.['report:otp-commercial-terms-foundation'],
  'node scripts/report-otp-commercial-terms-foundation.mjs',
  'package.json should expose the OTP commercial terms report.',
)
assert.ok(
  packageJson.scripts?.['verify:otp-commercial-terms']?.includes('test:otp-commercial-terms-foundation-phase1'),
  'OTP commercial terms verification should include Phase 1.',
)

assert.equal(OTP_COMMERCIAL_TERMS_FOUNDATION_VERSION, 'otp_commercial_terms_phase1_v1')
assert.equal(OTP_COMMERCIAL_TERMS_RECORD_CONTRACT, 'otp_commercial_terms_record_phase1_v1')

const pendingVariation = buildOtpCommissionVariationRecord({
  transactionId: 'tx-1',
  mandateCommission: { basis: 'percentage', percentage: 5, source: 'mandate' },
  proposedOtpCommission: { basis: 'percentage', percentage: 4.5 },
  requestedBy: 'agent-1',
  reason: 'Buyer and seller negotiated lower commission at OTP stage.',
})

assert.equal(pendingVariation.variationRequired, true)
assert.equal(pendingVariation.approval.status, 'pending_approval')
assert.equal(pendingVariation.lockState, 'blocked_pending_approval')
assert.equal(pendingVariation.blocksTransactionCommissionLock, true)
assert.equal(pendingVariation.preservesMandateCommission, true)
assert.equal(pendingVariation.mandateCommissionSnapshot.percentage, 5)
assert.equal(pendingVariation.proposedOtpCommission.percentage, 4.5)
assert.equal(pendingVariation.finalOtpCommission, null)

const pendingDecision = buildTransactionCommissionLockDecision(pendingVariation)
assert.equal(pendingDecision.canLock, false)
assert.deepEqual(pendingDecision.blockerCodes, ['otp_commission_variation_pending_approval'])

const approvedVariation = buildOtpCommissionVariationRecord({
  transactionId: 'tx-1',
  mandateCommission: { basis: 'percentage', percentage: 5 },
  proposedOtpCommission: { basis: 'percentage', percentage: 4.5 },
  approval: {
    status: 'approved',
    approverId: 'principal-1',
    approvalReference: 'APPROVED-COMM-001',
    approvedAt: '2026-08-05T08:00:00.000Z',
  },
})

const approvedDecision = buildTransactionCommissionLockDecision(approvedVariation)
assert.equal(approvedVariation.approval.status, 'approved')
assert.equal(approvedDecision.canLock, true)
assert.equal(approvedDecision.finalOtpCommission.percentage, 4.5)
assert.equal(approvedDecision.mandateCommissionSnapshot.percentage, 5)

const unchangedVariation = buildOtpCommissionVariationRecord({
  mandateCommission: { basis: 'percentage', percentage: 5 },
  proposedOtpCommission: { basis: 'percentage', percentage: 5 },
})
assert.equal(unchangedVariation.approval.status, 'not_required')
assert.equal(unchangedVariation.lockState, 'ready_to_lock')
assert.equal(unchangedVariation.finalOtpCommission.percentage, 5)

const resaleCosts = buildOtpBuyerCostObligationSchedule({
  transactionId: 'tx-resale',
  routeVariant: 'resale_existing_property',
  sellerFacts: {
    property: {
      rates_taxes: 'R 1 650',
      levies: 'R 2 150',
      scheme: { body_corporate_name: 'Pine Avenue Body Corporate', levies: 'R 2 150' },
    },
  },
})

assert.equal(resaleCosts.contract, OTP_COMMERCIAL_TERMS_RECORD_CONTRACT)
assert.equal(resaleCosts.routeVariant, 'resale_existing_property')
assert.equal(resaleCosts.mutatedSourceFacts, false)
assert.ok(resaleCosts.buyerVisibleItems.some((item) => item.key === 'municipal_rates_estimate'))
assert.ok(resaleCosts.buyerVisibleItems.some((item) => item.key === 'scheme_levy_estimate'))
assert.ok(resaleCosts.buyerVisibleItems.some((item) => item.documentKeys.includes('buyer_transfer_cost_invoice')))
assert.ok(resaleCosts.pendingItems.some((item) => item.key === 'buyer_transfer_cost_quote'))

const developmentCosts = buildOtpBuyerCostObligationSchedule({
  transactionId: 'tx-development',
  routeVariant: 'new_development',
  developmentUnit: {
    levyEstimate: 'R 2 100',
    utilityConnectionCharges: 'R 15 000',
  },
})

assert.equal(developmentCosts.routeVariant, 'new_development')
assert.ok(developmentCosts.buyerVisibleItems.some((item) => item.key === 'development_levy_estimate'))
assert.ok(developmentCosts.buyerVisibleItems.some((item) => item.key === 'utility_connection_charges'))
assert.equal(developmentCosts.buyerVisibleItems.some((item) => item.key === 'scheme_levy_estimate'), false)

const matterQuote = buildMatterAttorneyCostQuoteState({
  transactionId: 'tx-1',
  transactionAttorneyAssignmentId: 'taa-1',
  routeVariant: 'resale_existing_property',
  status: 'uploaded',
  document: {
    documentDefinitionKey: 'buyer_transfer_cost_invoice',
    fileUrl: '/documents/tx-1/transfer-costs.pdf',
    amount: 'R 83 500',
  },
  leadQuoteId: 'lead-quote-not-the-source-of-truth',
})

assert.equal(matterQuote.transactionScoped, true)
assert.equal(matterQuote.separatedFromAttorneyLeadQuote, true)
assert.equal(matterQuote.clientPortalVisible, true)
assert.equal(matterQuote.buyerCanQuery, true)
assert.deepEqual(matterQuote.blockers, [])
assert.ok(MATTER_ATTORNEY_COST_QUOTE_STATUSES.includes('buyer_queried'))
assert.equal(canTransitionMatterAttorneyCostQuote('buyer_queried', 'revised'), true)
assert.equal(canTransitionMatterAttorneyCostQuote('acknowledged', 'buyer_queried'), false)

const unscopedQuote = buildMatterAttorneyCostQuoteState({ status: 'uploaded' })
assert.equal(unscopedQuote.transactionScoped, false)
assert.deepEqual(unscopedQuote.blockers, ['matter_attorney_cost_quote_requires_transaction_and_assignment'])

for (const fieldKey of [
  'mandate_commission_snapshot',
  'otp_commission_proposal',
  'otp_commission_variation_status',
  'otp_commission_approval_reference',
  'otp_buyer_cost_obligations',
  'otp_pending_cost_obligations',
  'matter_attorney_cost_quote_status',
]) {
  const definition = getOtpFieldDefinition(fieldKey)
  assert.ok(definition, `${fieldKey} should be registered.`)
  assert.ok(definition.sourcePaths.length > 0, `${fieldKey} should have source paths.`)
}

const resaleManifest = buildOtpStructuredTermsManifest({ variant: 'resale_existing_property' })
const developmentManifest = buildOtpStructuredTermsManifest({ variant: 'new_development' })

assert.ok(resaleManifest.groups.some((group) => group.key === 'otp_commission_variation'))
assert.ok(resaleManifest.groups.some((group) => group.key === 'buyer_cost_obligations'))
assert.ok(developmentManifest.groups.some((group) => group.key === 'otp_commission_variation'))
assert.ok(developmentManifest.groups.some((group) => group.key === 'buyer_cost_obligations'))

const sectionKeys = new Set(listOtpLegalContentTemplateSections({ variant: 'resale_existing_property' }).map((section) => section.section_key))
assert.ok(sectionKeys.has('otp_commission_variation'))
assert.ok(sectionKeys.has('buyer_cost_obligations'))

const structuredAudit = buildOtpStructuredTermsAudit({ checkedAt: '2026-08-05T00:00:00.000Z' })
assert.equal(structuredAudit.status, 'OTP_STRUCTURED_TERMS_READY_FOR_RENDERER_WIRING')
assert.deepEqual(structuredAudit.blockers, [])

const audit = buildOtpCommercialTermsFoundationAudit({ checkedAt: '2026-08-05T00:00:00.000Z' })
assert.equal(audit.status, 'OTP_COMMERCIAL_TERMS_FOUNDATION_READY')
assert.equal(audit.mutatedData, false)
assert.equal(audit.summary.blockerCount, 0)
assert.deepEqual(audit.blockers, [])

const markdown = formatOtpCommercialTermsFoundationMarkdown(audit)
assert.match(markdown, /OTP Commercial Terms Phase 1 Foundation/)
assert.match(markdown, /PHASE1_COMMISSION_VARIATION_DOES_NOT_OVERWRITE_MANDATE/)
assert.match(markdown, /PHASE1_MATTER_ATTORNEY_QUOTE_IS_TRANSACTION_SCOPED/)

console.log('OTP commercial terms foundation Phase 1 contract passed.')
