const DONE = new Set(['complete', 'completed', 'completed_externally', 'skipped', 'not_applicable'])
const ROLE = { buyer: 'Buyer', seller: 'Seller', agent: 'Agent', bank: 'Bank', bond_originator: 'Bond originator', attorney: 'Attorney', transfer_attorney: 'Transfer attorney', bond_attorney: 'Bond attorney', cancellation_attorney: 'Cancellation attorney' }
const WAITING = {
  buyer_onboarding_complete: 'Waiting on buyer details', collect_buyer_details: 'Waiting on buyer details',
  seller_onboarding_complete: 'Waiting on seller details', collect_seller_details: 'Waiting on seller details',
  signed_otp_received: 'Waiting on signed OTP', sign_otp: 'Waiting on signed OTP',
  proof_of_funds_received: 'Waiting on proof of funds', proof_of_funds: 'Waiting on proof of funds',
  documents_received: 'Waiting on bond documents', bond_documents_received: 'Waiting on bond documents',
  applications_submitted: 'Waiting on bank submission', waiting_for_bank_quotes: 'Waiting on bond quotes',
  feedback_received: 'Waiting on bank feedback / quotes', quote_approved: 'Waiting on quote approval',
  instruction_sent: 'Waiting on bank instruction', cash_portion_confirmed: 'Waiting on cash contribution confirmation',
}

function summary(steps, fallbackStatus) {
  if (!steps.length) return { detail: 'Progress not available', status: 'unknown', owner: '' }
  const step = steps.find(item => !DONE.has(item.status))
  if (!step) return { detail: 'All applicable steps complete', status: 'complete', owner: '' }
  const label = step.label || step.stepLabel || 'Progress not available'
  return { detail: !['in_progress', 'blocked'].includes(step.status) ? WAITING[step.key] || label : label,
    status: step.status === 'blocked' ? 'blocked' : step.status === 'waiting' || (step.status !== 'in_progress' && (step.ownerRole === 'bank' || Object.hasOwn(WAITING, step.key))) ? 'waiting'
      : step.status === 'in_progress' || fallbackStatus === 'in_progress' ? 'in_progress' : 'pending',
    owner: ROLE[step.ownerRole] || '' }
}

export function buildOverviewWorkflowProgress({ transactionId, rollup } = {}) {
  const sameMatter = Boolean(transactionId && rollup?.transactionId === transactionId)
  const workflows = sameMatter && rollup.usedLegacyFallback === false ? rollup.workflows || {} : {}
  const financeCandidates = Object.entries(workflows).filter(([key, item]) => key.startsWith('finance_') && item?.required !== false)
  const finance = financeCandidates.length === 1 ? financeCandidates[0][1] : null
  const commercial = [
    { key: 'otp', label: 'Sales / OTP', target: 'deal_setup', workflow: workflows.sales_otp, workflowKey: 'sales_otp' },
    { key: 'finance', label: 'Finance', target: 'finance', workflow: finance, workflowKey: financeCandidates.length === 1 ? financeCandidates[0][0] : null },
  ].map(({ workflow, workflowKey, ...row }) => ({ ...row, isActive: sameMatter && Boolean(workflowKey) && rollup.activeWorkflowKey === workflowKey,
    ...summary((workflow?.requiredSteps || []).filter(step => step.required !== false), workflow?.status) }))
  const legal = sameMatter ? rollup.transactionJourneySnapshot?.legalJourney : null
  const source = legal?.status === 'ready' ? legal.snapshot : null
  const valid = source?.transactionId === transactionId && Number.isSafeInteger(source.revision) && source.revision >= 0 &&
    source.planRevision === source.revision && Array.isArray(source.lanes) && source.lanes.every(lane =>
      Array.isArray(lane.phases) && lane.phases.every(phase => Array.isArray(phase.tasks) && phase.tasks.every(task => task.revision === source.revision)))
  const labels = { transfer: 'Transfer', bond: 'Bond registration', cancellation: 'Bond cancellation' }
  const lanes = valid ? source.lanes.filter(lane => Object.hasOwn(labels, lane.key)) : []
  const legalRows = lanes.length ? lanes.map(lane => ({
    key: lane.key, label: labels[lane.key], target: 'transfer',
    isActive: rollup.activeWorkflowKey === { transfer: 'attorney_transfer', bond: 'attorney_bond', cancellation: 'seller_bond_cancellation' }[lane.key] || (lane.key === 'transfer' && rollup.activeWorkflowKey === 'registration'),
    ...summary(lane.phases.flatMap(phase => phase.tasks)),
    ...(legal.stale ? { note: 'Last saved progress' } : {}),
  })) : [{ key: 'transfer', label: 'Conveyancing', target: 'transfer',
    isActive: sameMatter && ['attorney_transfer', 'attorney_bond', 'seller_bond_cancellation', 'registration'].includes(rollup.activeWorkflowKey),
    detail: valid ? 'Workflow not set up yet' : 'Progress not available', status: 'unknown', owner: '' }]
  return [...commercial, ...legalRows]
}

export function selectImmediateWorkflow(workflows = []) {
  const outstanding = workflows.filter(row => row.status !== 'complete')
  return outstanding.find(row => row.isActive) || outstanding[0] || (workflows.length
    ? { key: 'complete', label: 'Workflows', detail: 'All applicable steps complete', status: 'complete' }
    : { key: 'unknown', label: 'Transaction', detail: 'Saved progress not available', status: 'unknown' })
}

export function getExistingBondLabel(transaction = {}) {
  const value = transaction.routing_profile_json?.mvpProfile?.sellerExistingBond ??
    transaction.routing_profile_json?.sellerHasExistingBond ?? transaction.seller_has_existing_bond ?? transaction.existing_bond
  if ([true, 'true', 'yes', 1, '1'].includes(typeof value === 'string' ? value.trim().toLowerCase() : value)) return 'Yes'
  if ([false, 'false', 'no', 0, '0'].includes(typeof value === 'string' ? value.trim().toLowerCase() : value)) return 'No'
  return 'Not confirmed'
}
