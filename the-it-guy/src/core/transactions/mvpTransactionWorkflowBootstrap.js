export const MVP_TRANSACTION_WORKFLOW_BOOTSTRAP_VERSION = 'arch9_mvp_transaction_workflow_bootstrap_v1'

export function buildMvpTransactionWorkflowBootstrap(profile = {}) {
  const bond = ['bond', 'hybrid'].includes(profile.financeType)
  const lanes = [
    { laneType: 'main', currentStage: 'onboarding', status: 'active', ownerRole: 'agent', blocked: false },
    { laneType: 'finance', currentStage: bond ? 'finance_intake' : 'proof_of_funds', status: 'pending', ownerRole: bond ? 'bond_originator' : 'buyer', blocked: false },
    { laneType: 'transfer', currentStage: 'instruction_pending', status: 'pending', ownerRole: 'transfer_attorney', blocked: false },
  ]
  if (bond) lanes.push({ laneType: 'bond', currentStage: 'bond_instruction_pending', status: 'pending', ownerRole: 'bond_attorney', blocked: false })
  return Object.freeze({ version: MVP_TRANSACTION_WORKFLOW_BOOTSTRAP_VERSION, lanes })
}
