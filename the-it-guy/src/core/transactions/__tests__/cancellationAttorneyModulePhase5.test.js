import assert from 'node:assert/strict'
import {
  CANCELLATION_ATTORNEY_PHASE5_RELEASE_BLOCKER_ID,
  CANCELLATION_FIGURES_CONTROL_BOUNDARY,
  CANCELLATION_FIGURES_EXPIRY_STATES,
  CANCELLATION_FIGURES_RISK_STATES,
  CANCELLATION_FIGURES_VALIDITY_STATES,
  buildCancellationAttorneyPhase5BaselineReport,
  buildCancellationFiguresNextActions,
  buildCancellationFiguresRegister,
  buildCancellationFiguresScheduleModel,
  validateCancellationFiguresRegister,
} from '../cancellationAttorneyModulePhase5.js'
import { buildCancellationPackWorkspace } from '../cancellationAttorneyModulePhase3.js'

const verified = (value, overrides = {}) => ({
  value,
  sourceId: overrides.sourceId || 'source-cancellation-pack-1',
  capturedAt: overrides.capturedAt || '2026-07-10T09:00:00.000Z',
  verifiedAt: overrides.verifiedAt || '2026-07-10T10:00:00.000Z',
  verifiedBy: overrides.verifiedBy || { role: 'cancellation_attorney', userId: 'cancellation-attorney-1' },
  expiresAt: overrides.expiresAt || null,
})

const completeEvidence = ({
  expiryDate = '2026-07-18T00:00:00.000Z',
  penaltyRisk = { status: 'at_risk', reason: 'notice period shorter than settlement assumption' },
  guaranteeAmount = 1200000,
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
  guarantee_beneficiary_and_wording: verified({ beneficiary: 'FNB Home Loans', wording: 'payable to existing lender on registration' }),
  guarantee_reference: verified('GTY-CAN-2026-11'),
  guarantee_acceptance_status: verified('accepted'),
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

function containsForbiddenAuditPayload(value) {
  if (!value || typeof value !== 'object') return false
  return Object.entries(value).some(([key, nested]) => {
    if (['figures', 'facts', 'value', 'renderModel', 'body', 'sections'].includes(String(key))) return true
    return containsForbiddenAuditPayload(nested)
  })
}

assert.equal(CANCELLATION_ATTORNEY_PHASE5_RELEASE_BLOCKER_ID, 'cancellation_figures_register_missing')
assert.deepEqual(CANCELLATION_FIGURES_CONTROL_BOUNDARY.requiredFactKeys, [
  'cancellation_figures_amount',
  'cancellation_figures_expiry_date',
  'daily_interest_amount',
  'penalty_notice_risk',
])
assert.equal(CANCELLATION_FIGURES_CONTROL_BOUNDARY.requestsExternalFiguresAutomatically, false)
assert.equal(CANCELLATION_FIGURES_CONTROL_BOUNDARY.issuesCancellationFigures, false)
assert.equal(CANCELLATION_FIGURES_CONTROL_BOUNDARY.acceptsGuaranteeAutomatically, false)
assert.equal(CANCELLATION_FIGURES_CONTROL_BOUNDARY.reconcilesSettlement, false)
assert.equal(CANCELLATION_FIGURES_CONTROL_BOUNDARY.executesSettlementPayment, false)
assert.equal(CANCELLATION_FIGURES_CONTROL_BOUNDARY.writesExternalSystem, false)

const workspace = buildCancellationPackWorkspace({
  transaction: { id: 'tx-cancellation-phase5' },
  evidence: completeEvidence(),
  generatedAt: '2026-07-15T08:00:00.000Z',
})
assert.equal(workspace.canonicalData.factsByKey.cancellation_figures_amount.status, 'verified')
assert.equal(workspace.canonicalData.factsByKey.cancellation_figures_expiry_date.status, 'verified')

const register = buildCancellationFiguresRegister({
  workspace,
  settlementDate: '2026-07-20',
  actor: { role: 'cancellation_attorney', userId: 'cancellation-attorney-1' },
  commandId: 'phase5-figures-register-1',
  generatedAt: '2026-07-15T09:00:00.000Z',
  asOf: '2026-07-15T09:00:00.000Z',
})
assert.equal(register.validation.valid, true, JSON.stringify(register.validation.errors, null, 2))
assert.equal(register.metrics.figureCount, 1)
assert.equal(register.metrics.readyFigureCount, 0)
assert.equal(register.metrics.attentionFigureCount, 0)
assert.equal(register.metrics.blockedFigureCount, 1)
assert.equal(register.metrics.settlementAfterExpiryCount, 1)
assert.equal(register.metrics.highPenaltyRiskCount, 1)
assert.equal(register.metrics.guaranteeVarianceCount, 1)
assert.equal(register.readyForPhase6, false)

const active = register.activeFigure
assert.equal(active.amount, 1234567.89)
assert.equal(active.dailyInterestAmount, 345.67)
assert.equal(active.expiryState, CANCELLATION_FIGURES_EXPIRY_STATES.expiringSoon)
assert.equal(active.penaltyRiskState, CANCELLATION_FIGURES_RISK_STATES.high)
assert.equal(active.validForSettlement, false)
assert.equal(active.validityState, CANCELLATION_FIGURES_VALIDITY_STATES.blocked)
assert.equal(active.guaranteeVarianceState, 'under_guaranteed')
assert.ok(active.blockers.some((blocker) => blocker.id === 'settlement_after_figures_expiry'))
assert.ok(active.blockers.some((blocker) => blocker.id === 'penalty_notice_risk_requires_review'))
assert.ok(active.blockers.some((blocker) => blocker.id === 'guarantee_amount_below_figures'))

const nextActions = buildCancellationFiguresNextActions(register)
assert.equal(nextActions.length, 1)
assert.equal(nextActions[0].actionLabel, 'Request updated cancellation figures')
assert.equal(nextActions[0].priority, 'critical')

const scheduleModel = buildCancellationFiguresScheduleModel(register)
assert.equal(scheduleModel.rows.length, 1)
assert.equal(scheduleModel.rows[0].nextAction, 'Request updated cancellation figures')
assert.equal(scheduleModel.rows[0].projectedSettlementAmount, 1236296.24)
assert.equal(register.auditEvent.eventType, 'cancellation_figures_register_structured')
assert.equal(register.auditEvent.releaseBlockerId, CANCELLATION_ATTORNEY_PHASE5_RELEASE_BLOCKER_ID)
assert.equal(register.auditEvent.figureMetrics.figureCount, 1)
assert.equal(containsForbiddenAuditPayload(register.auditEvent), false)

const readyWorkspace = buildCancellationPackWorkspace({
  transaction: { id: 'tx-cancellation-phase5-ready' },
  evidence: completeEvidence({
    expiryDate: '2026-08-15T00:00:00.000Z',
    penaltyRisk: 'none',
    guaranteeAmount: 1234567.89,
  }),
  generatedAt: '2026-07-15T08:00:00.000Z',
})
const readyRegister = buildCancellationFiguresRegister({
  workspace: readyWorkspace,
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
    sourceReference: 'figures-fnb-1',
  }],
  actor: { role: 'cancellation_attorney', userId: 'cancellation-attorney-1' },
  commandId: 'phase5-figures-register-2',
  generatedAt: '2026-07-15T09:00:00.000Z',
  asOf: '2026-07-15T09:00:00.000Z',
})
assert.equal(readyRegister.validation.valid, true, JSON.stringify(readyRegister.validation.errors, null, 2))
assert.equal(readyRegister.metrics.readyFigureCount, 1)
assert.equal(readyRegister.metrics.blockedFigureCount, 0)
assert.equal(readyRegister.metrics.attentionFigureCount, 0)
assert.equal(readyRegister.metrics.highPenaltyRiskCount, 0)
assert.equal(readyRegister.metrics.guaranteeVarianceCount, 0)
assert.equal(readyRegister.nextActions.length, 0)
assert.equal(readyRegister.readyForPhase6, true)

const malformedWorkspace = buildCancellationPackWorkspace({
  transaction: { id: 'tx-cancellation-phase5-bad' },
  evidence: completeEvidence({
    expiryDate: '2026-08-15T00:00:00.000Z',
    penaltyRisk: 'none',
    guaranteeAmount: 1234567.89,
  }),
  generatedAt: '2026-07-15T08:00:00.000Z',
})
const malformed = buildCancellationFiguresRegister({
  workspace: malformedWorkspace,
  figures: [{ figureId: 'bad-figures-1', status: 'verified', amount: 1234567.89 }],
  actor: { role: 'cancellation_attorney', userId: 'cancellation-attorney-1' },
  commandId: 'phase5-figures-register-3',
  generatedAt: '2026-07-15T09:00:00.000Z',
})
assert.equal(malformed.validation.valid, false)
assert.ok(malformed.validation.errors.includes('cancellation_figures_expiry_date_required:bad-figures-1'))
assert.ok(malformed.validation.errors.includes('daily_interest_required:bad-figures-1'))
assert.equal(validateCancellationFiguresRegister(malformed).valid, false)

const missingFactWorkspace = buildCancellationPackWorkspace({
  transaction: { id: 'tx-cancellation-phase5-missing' },
  evidence: { cancellation_bank: verified('FNB') },
  generatedAt: '2026-07-15T08:00:00.000Z',
})
const missingFactRegister = buildCancellationFiguresRegister({
  workspace: missingFactWorkspace,
  actor: { role: 'cancellation_attorney', userId: 'cancellation-attorney-1' },
  commandId: 'phase5-figures-register-4',
  generatedAt: '2026-07-15T09:00:00.000Z',
})
assert.equal(missingFactRegister.validation.valid, false)
assert.ok(missingFactRegister.validation.errors.includes('cancellation_figures_amount_fact_not_verified'))
assert.ok(missingFactRegister.validation.errors.includes('cancellation_figures_expiry_date_fact_not_verified'))
assert.ok(missingFactRegister.validation.errors.includes('daily_interest_amount_fact_not_verified'))
assert.ok(missingFactRegister.validation.errors.includes('penalty_notice_risk_fact_not_verified'))
assert.equal(missingFactRegister.readyForPhase6, false)

const report = buildCancellationAttorneyPhase5BaselineReport({
  transaction: { id: 'tx-cancellation-phase5-report' },
  evidence: completeEvidence({
    expiryDate: '2026-08-15T00:00:00.000Z',
    penaltyRisk: 'none',
    guaranteeAmount: 1234567.89,
  }),
  settlementDate: '2026-08-10',
  actor: { role: 'cancellation_attorney', userId: 'cancellation-attorney-1' },
  commandId: 'phase5-report',
  generatedAt: '2026-07-15T09:00:00.000Z',
  asOf: '2026-07-15T09:00:00.000Z',
})
assert.equal(report.readyForPhase6, true, JSON.stringify(report, null, 2))
assert.equal(report.figureCount, 1)
assert.equal(report.readyFigureCount, 1)
assert.equal(report.blockedFigureCount, 0)
assert.equal(report.expiryRiskCount, 0)
assert.equal(report.highPenaltyRiskCount, 0)
assert.equal(report.guaranteeVarianceCount, 0)

console.log(`Cancellation attorney module Phase 5 figures register passed (${report.figureCount} structured figure set).`)
