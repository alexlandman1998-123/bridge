export const MVP_TRANSACTION_CONTROL_BOARD_VERSION = 'arch9_mvp_transaction_control_board_v1'

const GATES = [
  ['onboarding', 'Onboarding', 'onboardingGateSatisfied'],
  ['otp', 'OTP execution', 'otpGateSatisfied'],
  ['finance', 'Finance readiness', 'financeGateSatisfied'],
  ['transfer', 'Transfer readiness', 'transferGateSatisfied'],
]

export function buildMvpTransactionControlBoard(truth = {}) {
  const blockers = Array.isArray(truth.blockers) ? truth.blockers : []
  return {
    version: MVP_TRANSACTION_CONTROL_BOARD_VERSION,
    transactionId: truth.transactionId || null,
    stage: truth.stage || { key: 'UNKNOWN', label: 'Stage not set', rank: 0 },
    status: truth.readiness?.status || 'incomplete',
    nextAction: truth.nextAction || null,
    gates: GATES.map(([key, label, readinessKey]) => ({
      key, label, satisfied: truth.readiness?.[readinessKey] === true,
      blockers: blockers.filter((blocker) => blocker.type === key || blocker.type === 'onboarding' && key === 'onboarding' || blocker.type === 'otp' && key === 'otp' || blocker.type === 'finance' && key === 'finance' || blocker.type === 'transfer' && key === 'transfer'),
    })),
    blockers,
    counts: {
      blockers: blockers.length,
      outstandingDocuments: Number(truth.readiness?.outstandingDocumentCount || 0),
      missingParticipants: Number(truth.readiness?.missingParticipantCount || 0),
    },
  }
}
