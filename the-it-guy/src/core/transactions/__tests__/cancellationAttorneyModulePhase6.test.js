import assert from 'node:assert/strict'
import {
  CANCELLATION_ATTORNEY_PHASE6_RELEASE_BLOCKER_ID,
  CANCELLATION_GUARANTEE_CONTROL_BOUNDARY,
  CANCELLATION_GUARANTEE_MATCH_STATES,
  CANCELLATION_GUARANTEE_STATUSES,
  CANCELLATION_GUARANTEE_WORKSPACE_STATUSES,
  buildCancellationAttorneyPhase6BaselineReport,
  buildCancellationGuaranteeNextActions,
  buildCancellationGuaranteeScheduleModel,
  buildCancellationGuaranteeWorkspace,
  validateCancellationGuaranteeWorkspace,
} from '../cancellationAttorneyModulePhase6.js'
import { buildCancellationPackWorkspace } from '../cancellationAttorneyModulePhase3.js'
import { buildCancellationFiguresRegister } from '../cancellationAttorneyModulePhase5.js'

const verified = (value, overrides = {}) => ({
  value,
  sourceId: overrides.sourceId || 'source-cancellation-pack-1',
  capturedAt: overrides.capturedAt || '2026-07-10T09:00:00.000Z',
  verifiedAt: overrides.verifiedAt || '2026-07-10T10:00:00.000Z',
  verifiedBy: overrides.verifiedBy || { role: 'cancellation_attorney', userId: 'cancellation-attorney-1' },
  expiresAt: overrides.expiresAt || null,
})

const beneficiaryAndWording = Object.freeze({
  beneficiary: 'FNB Home Loans',
  wording: 'payable to existing lender on registration',
})

const completeEvidence = ({
  expiryDate = '2026-08-15T00:00:00.000Z',
  penaltyRisk = 'none',
  guaranteeAmount = 1234567.89,
  guaranteeStatus = 'accepted',
} = {}) => ({
  seller_existing_bond_status: verified('existing_bond_confirmed'),
  cancellation_bank: verified('FNB'),
  cancellation_bond_account_number: verified('FNB-HL-2026-001'),
  lender_instruction_reference: verified('FNB-CAN-2026-77'),
  cancellation_instruction_received_at: verified('2026-07-10'),
  notice_period_status: verified('notice_served'),
  notice_date: verified('2026-05-01'),
  cancellation_figures_amount: verified(1234567.89, { sourceId: 'figures-fnb-1', expiresAt: expiryDate }),
  cancellation_figures_expiry_date: verified(expiryDate, { sourceId: 'figures-fnb-1' }),
  daily_interest_amount: verified(345.67, { sourceId: 'figures-fnb-1' }),
  penalty_notice_risk: verified(penaltyRisk),
  guarantee_required_amount: verified(guaranteeAmount),
  guarantee_beneficiary_and_wording: verified(beneficiaryAndWording),
  guarantee_reference: verified('GTY-CAN-2026-11'),
  guarantee_acceptance_status: verified(guaranteeStatus),
  seller_cancellation_signing_requirement: verified({ required: true, method: 'wet_ink' }),
  signed_cancellation_document_status: verified('signed_originals_received'),
  lodgement_reference: verified('LOD-CAN-2026-101'),
  lodgement_date: verified('2026-08-02'),
  cancellation_registration_reference: verified('REG-CAN-2026-44'),
  cancellation_registration_date: verified('2026-08-05'),
  settlement_amount: verified(1235000),
  settlement_payment_reference: verified('PAY-CAN-2026-55'),
  closeout_status: verified('complete'),
})

const guaranteeEvidence = [
  { requirementKey: 'guarantee_document', status: 'verified', referenceId: 'doc-guarantee-1', artifactHash: 'hash-guarantee-1', capturedAt: '2026-07-14T09:00:00.000Z', verifiedAt: '2026-07-14T10:00:00.000Z' },
  { requirementKey: 'wording_review', status: 'verified', referenceId: 'decision-wording-1', capturedAt: '2026-07-14T10:00:00.000Z', verifiedAt: '2026-07-14T11:00:00.000Z' },
  { requirementKey: 'cancellation_acceptance_decision', status: 'verified', referenceId: 'decision-acceptance-1', capturedAt: '2026-07-14T11:00:00.000Z', verifiedAt: '2026-07-14T12:00:00.000Z' },
]

function containsForbiddenAuditPayload(value) {
  if (!value || typeof value !== 'object') return false
  return Object.entries(value).some(([key, nested]) => {
    if (['guarantees', 'evidence', 'facts', 'value', 'renderModel', 'body', 'sections'].includes(String(key))) return true
    return containsForbiddenAuditPayload(nested)
  })
}

assert.equal(CANCELLATION_ATTORNEY_PHASE6_RELEASE_BLOCKER_ID, 'guarantee_coordination_workspace_missing')
assert.deepEqual(CANCELLATION_GUARANTEE_CONTROL_BOUNDARY.requiredFactKeys, [
  'guarantee_required_amount',
  'guarantee_beneficiary_and_wording',
  'guarantee_reference',
  'guarantee_acceptance_status',
])
assert.equal(CANCELLATION_GUARANTEE_CONTROL_BOUNDARY.issuesGuarantee, false)
assert.equal(CANCELLATION_GUARANTEE_CONTROL_BOUNDARY.acceptsGuaranteeAutomatically, false)
assert.equal(CANCELLATION_GUARANTEE_CONTROL_BOUNDARY.routesGuaranteeExternally, false)
assert.equal(CANCELLATION_GUARANTEE_CONTROL_BOUNDARY.submitsToBankPortal, false)
assert.equal(CANCELLATION_GUARANTEE_CONTROL_BOUNDARY.writesExternalSystem, false)

const packWorkspace = buildCancellationPackWorkspace({
  transaction: { id: 'tx-cancellation-phase6' },
  evidence: completeEvidence(),
  generatedAt: '2026-07-15T08:00:00.000Z',
})
const figuresRegister = buildCancellationFiguresRegister({
  workspace: packWorkspace,
  settlementDate: '2026-08-10',
  figures: [{
    figureId: 'figures-ready-1',
    status: 'verified',
    amount: 1234567.89,
    expiryDate: '2026-08-15',
    dailyInterestAmount: 345.67,
    penaltyNoticeRisk: 'none',
    penaltyReviewed: true,
    guaranteeRequiredAmount: 1234567.89,
    guaranteeBeneficiaryAndWording: beneficiaryAndWording,
    sourceReference: 'figures-fnb-1',
  }],
  generatedAt: '2026-07-15T09:00:00.000Z',
  asOf: '2026-07-15T09:00:00.000Z',
})
assert.equal(figuresRegister.readyForPhase6, true)

const blockedWorkspace = buildCancellationGuaranteeWorkspace({
  workspace: packWorkspace,
  figuresRegister,
  guarantees: [{
    guaranteeId: 'guarantee-blocked-1',
    reference: 'GTY-CAN-2026-11',
    status: 'received',
    amount: 1200000,
    requiredAmount: 1234567.89,
    beneficiaryAndWording: { beneficiary: 'Wrong Bank', wording: 'incorrect wording' },
    expectedBeneficiaryAndWording: beneficiaryAndWording,
    expiresAt: '2026-08-20',
    evidence: [{ requirementKey: 'guarantee_document', status: 'verified', referenceId: 'doc-guarantee-1' }],
  }],
  actor: { role: 'cancellation_attorney', userId: 'cancellation-attorney-1' },
  commandId: 'phase6-guarantee-1',
  generatedAt: '2026-07-15T10:00:00.000Z',
})
assert.equal(blockedWorkspace.validation.valid, true, JSON.stringify(blockedWorkspace.validation.errors, null, 2))
assert.equal(blockedWorkspace.status, CANCELLATION_GUARANTEE_WORKSPACE_STATUSES.blocked)
assert.equal(blockedWorkspace.readyForPhase7, false)
assert.equal(blockedWorkspace.metrics.guaranteeCount, 1)
assert.equal(blockedWorkspace.metrics.blockedGuaranteeCount, 1)
assert.equal(blockedWorkspace.metrics.underGuaranteedCount, 1)
assert.equal(blockedWorkspace.metrics.wordingMismatchCount, 1)
assert.equal(blockedWorkspace.metrics.evidenceGapCount, 2)
assert.equal(blockedWorkspace.metrics.acceptancePendingCount, 1)
assert.equal(blockedWorkspace.activeGuarantee.status, CANCELLATION_GUARANTEE_STATUSES.received)
assert.equal(blockedWorkspace.activeGuarantee.matchState, CANCELLATION_GUARANTEE_MATCH_STATES.blocked)
assert.ok(blockedWorkspace.activeGuarantee.blockers.some((blocker) => blocker.id === 'guarantee_amount_below_required'))
assert.ok(blockedWorkspace.activeGuarantee.blockers.some((blocker) => blocker.id === 'guarantee_beneficiary_or_wording_mismatch'))
assert.ok(blockedWorkspace.activeGuarantee.blockers.some((blocker) => blocker.id === 'cancellation_attorney_acceptance_required'))

const blockedActions = buildCancellationGuaranteeNextActions(blockedWorkspace)
assert.equal(blockedActions[0].actionLabel, 'Request corrected guarantee amount')
assert.equal(blockedActions[0].priority, 'critical')

const blockedSchedule = buildCancellationGuaranteeScheduleModel(blockedWorkspace)
assert.equal(blockedSchedule.rows.length, 1)
assert.equal(blockedSchedule.rows[0].nextAction, 'Request corrected guarantee amount')
assert.equal(blockedWorkspace.auditEvent.eventType, 'cancellation_guarantee_workspace_structured')
assert.equal(blockedWorkspace.auditEvent.releaseBlockerId, CANCELLATION_ATTORNEY_PHASE6_RELEASE_BLOCKER_ID)
assert.equal(blockedWorkspace.auditEvent.guaranteeMetrics.guaranteeCount, 1)
assert.equal(containsForbiddenAuditPayload(blockedWorkspace.auditEvent), false)

const readyWorkspace = buildCancellationGuaranteeWorkspace({
  workspace: packWorkspace,
  figuresRegister,
  guarantees: [{
    guaranteeId: 'guarantee-ready-1',
    reference: 'GTY-CAN-2026-11',
    status: 'accepted',
    amount: 1234567.89,
    requiredAmount: 1234567.89,
    beneficiaryAndWording,
    expectedBeneficiaryAndWording: beneficiaryAndWording,
    acceptanceReviewed: true,
    expiresAt: '2026-08-20',
    ownerRole: 'transfer_attorney',
    evidence: guaranteeEvidence,
  }],
  actor: { role: 'cancellation_attorney', userId: 'cancellation-attorney-1' },
  commandId: 'phase6-guarantee-2',
  generatedAt: '2026-07-15T10:30:00.000Z',
})
assert.equal(readyWorkspace.validation.valid, true, JSON.stringify(readyWorkspace.validation.errors, null, 2))
assert.equal(readyWorkspace.status, CANCELLATION_GUARANTEE_WORKSPACE_STATUSES.ready)
assert.equal(readyWorkspace.readyForPhase7, true)
assert.equal(readyWorkspace.metrics.matchedGuaranteeCount, 1)
assert.equal(readyWorkspace.metrics.blockedGuaranteeCount, 0)
assert.equal(readyWorkspace.metrics.attentionGuaranteeCount, 0)
assert.equal(readyWorkspace.metrics.evidenceGapCount, 0)
assert.equal(readyWorkspace.nextActions.length, 0)

const badFiguresWorkspace = buildCancellationGuaranteeWorkspace({
  workspace: packWorkspace,
  figuresRegister: buildCancellationFiguresRegister({
    workspace: packWorkspace,
    settlementDate: '2026-08-20',
    generatedAt: '2026-07-15T09:00:00.000Z',
    asOf: '2026-07-15T09:00:00.000Z',
  }),
  guarantees: [{
    guaranteeId: 'guarantee-with-bad-figures',
    reference: 'GTY-CAN-2026-11',
    status: 'accepted',
    amount: 1234567.89,
    requiredAmount: 1234567.89,
    beneficiaryAndWording,
    expectedBeneficiaryAndWording: beneficiaryAndWording,
    acceptanceReviewed: true,
    evidence: guaranteeEvidence,
  }],
  actor: { role: 'cancellation_attorney', userId: 'cancellation-attorney-1' },
  commandId: 'phase6-guarantee-3',
  generatedAt: '2026-07-15T10:45:00.000Z',
})
assert.equal(badFiguresWorkspace.validation.valid, false)
assert.ok(badFiguresWorkspace.validation.errors.includes('figures_gate_not_ready'))
assert.equal(badFiguresWorkspace.readyForPhase7, false)
assert.equal(badFiguresWorkspace.nextActions[0].actionLabel, 'Clear cancellation figures before guarantee acceptance')
assert.equal(validateCancellationGuaranteeWorkspace(badFiguresWorkspace).valid, false)

const missingFactsPack = buildCancellationPackWorkspace({
  transaction: { id: 'tx-cancellation-phase6-missing' },
  evidence: { cancellation_bank: verified('FNB') },
  generatedAt: '2026-07-15T08:00:00.000Z',
})
const missingFactWorkspace = buildCancellationGuaranteeWorkspace({
  workspace: missingFactsPack,
  guarantees: [],
  actor: { role: 'cancellation_attorney', userId: 'cancellation-attorney-1' },
  commandId: 'phase6-guarantee-4',
  generatedAt: '2026-07-15T10:50:00.000Z',
})
assert.equal(missingFactWorkspace.validation.valid, false)
assert.ok(missingFactWorkspace.validation.errors.includes('guarantee_required_amount_fact_not_verified'))
assert.ok(missingFactWorkspace.validation.errors.includes('guarantee_beneficiary_and_wording_fact_not_verified'))
assert.ok(missingFactWorkspace.validation.errors.includes('guarantee_reference_fact_not_verified'))
assert.ok(missingFactWorkspace.validation.errors.includes('guarantee_acceptance_status_fact_not_verified'))
assert.ok(missingFactWorkspace.validation.errors.includes('cancellation_guarantee_required'))

const report = buildCancellationAttorneyPhase6BaselineReport({
  transaction: { id: 'tx-cancellation-phase6-report' },
  evidence: completeEvidence(),
  figuresRegister,
  guarantees: [{
    guaranteeId: 'guarantee-ready-report',
    reference: 'GTY-CAN-2026-11',
    status: 'accepted',
    amount: 1234567.89,
    requiredAmount: 1234567.89,
    beneficiaryAndWording,
    expectedBeneficiaryAndWording: beneficiaryAndWording,
    acceptanceReviewed: true,
    expiresAt: '2026-08-20',
    evidence: guaranteeEvidence,
  }],
  actor: { role: 'cancellation_attorney', userId: 'cancellation-attorney-1' },
  commandId: 'phase6-report',
  generatedAt: '2026-07-15T11:00:00.000Z',
})
assert.equal(report.readyForPhase7, true, JSON.stringify(report, null, 2))
assert.equal(report.guaranteeCount, 1)
assert.equal(report.matchedGuaranteeCount, 1)
assert.equal(report.blockedGuaranteeCount, 0)
assert.equal(report.evidenceGapCount, 0)
assert.equal(report.acceptancePendingCount, 0)

console.log(`Cancellation attorney module Phase 6 guarantee workspace passed (${report.guaranteeCount} guarantee).`)
