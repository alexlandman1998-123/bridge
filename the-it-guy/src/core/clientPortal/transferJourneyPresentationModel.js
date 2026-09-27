export const CLIENT_TRANSFER_STAGE_DEFINITIONS = Object.freeze([
  { key: 'instruction', title: 'Transfer attorneys instructed', description: 'The signed agreement has been received and the transfer file is being opened.', duration: '1 – 3 business days', education: 'The transferring attorney checks the sale agreement, parties and property before opening the legal file.' },
  { key: 'fica', title: 'Documents & FICA collected', description: 'The attorneys review the buyer and seller information, identity documents and signing authority.', duration: '2 – 5 business days', education: 'Each party and signatory must be checked so the right people can sign the transfer documents.' },
  { key: 'rates', title: 'Rates & clearance figures requested', description: 'The transfer team is working through the municipal rates and clearance process.', duration: '5 – 10 business days', education: 'The municipality confirms the amounts to settle before issuing the clearance needed for transfer.' },
  { key: 'funding', title: 'Guarantees & finance', description: 'The attorneys confirm how the purchase price will be secured.', duration: '3 – 10 business days', education: 'The purchase price must be secured under the agreed cash, bond or combined funding arrangement.' },
  { key: 'signing', title: 'Transfer documents signed', description: 'The buyer and seller sign the documents required for transfer.', duration: '2 – 5 business days', education: 'The attorneys prepare the transfer documents and arrange the signatures needed for lodgement.' },
  { key: 'clearances', title: 'Compliance & clearances', description: 'The applicable tax, rates, levy and property requirements are checked.', duration: '5 – 15 business days', education: 'The attorneys review the clearances and supporting evidence that apply to this particular property and sale.' },
  { key: 'lodgement', title: 'Lodged at the Deeds Office', description: 'The applicable transfer, bond and cancellation documents are coordinated for lodgement.', duration: '7 – 10 business days', education: 'The Deeds Office examines the lodged documents before registration can take place.' },
  { key: 'registration', title: 'Registration', description: 'The property transfer is registered and the attorneys confirm the outcome.', duration: '1 – 2 business days', education: 'Registration is the recorded legal milestone; the attorneys then complete the final account and close-out work.' },
])

const VALID_STATUSES = new Set(['not_started', 'in_progress', 'waiting', 'blocked', 'completed', 'not_applicable'])
const text = value => typeof value === 'string' ? value.trim() : ''
export function selectCurrentTransferStage(stages = []) {
  const applicable = stages.filter(stage => stage.status !== 'not_applicable')
  return applicable.find(stage => ['blocked', 'waiting', 'in_progress'].includes(stage.status)) ||
    applicable.find(stage => stage.status !== 'completed') || null
}
// The final attorney-to-client registration message may be published after
// registration is complete, when there is no longer an active journey stage.
export function selectJourneyPublisherStage(stages = []) {
  const registration = stages.find(stage => stage.key === 'registration')
  return registration?.status === 'completed' ? registration : selectCurrentTransferStage(stages)
}
const STAGE_TASKS = Object.freeze({
  instruction: ['transfer:instruction_received', 'transfer:matter_opened', 'transfer:otp_source_docs_checked'],
  rates: ['transfer:municipal_rates_clearance_review'],
  funding: [
    'transfer:cash_funding_source_review', 'transfer:payment_security_review',
    'bond:bond_instruction_received', 'bond:bank_reference_captured',
    'bond:bond_approval_letter_received', 'bond:bank_requirements_confirmed',
    'bond:bank_conditions_outstanding', 'bond:bank_conditions_resolved',
    'bond:guarantees_issued', 'bond:guarantee_wording_accepted',
    'cancellation:cancellation_existing_bond_confirmed', 'cancellation:cancellation_bank_captured',
    'cancellation:cancellation_bond_account_captured', 'cancellation:cancellation_instruction_received',
    'cancellation:notice_period_captured', 'cancellation:cancellation_figures_requested',
    'cancellation:cancellation_figures_received', 'cancellation:figures_expiry_captured',
    'cancellation:notice_penalty_risk_captured', 'cancellation:cancellation_guarantees_requested',
    'cancellation:cancellation_guarantees_received', 'cancellation:cancellation_guarantees_accepted',
    'cancellation:cancellation_guarantee_allocation_review',
  ],
  signing: [
    'transfer:buyer_signing_review', 'transfer:seller_signing_review',
    'bond:bond_documents_prepared', 'bond:buyer_bond_signing_scheduled',
    'bond:buyer_signed_bond_documents', 'bond:bond_documents_sent_to_bank',
    'cancellation:cancellation_documents_prepared', 'cancellation:seller_cancellation_documents_signed',
  ],
  clearances: [
    'bond:bank_approval_to_lodge_received', 'bond:bond_lodgement_instructions_confirmed',
    'cancellation:cancellation_consent_confirmed', 'cancellation:cancellation_simultaneous_lodgement_confirmed',
  ],
  lodgement: ['transfer:lodged_at_deeds_office', 'bond:bond_lodged', 'cancellation:cancellation_lodged'],
  registration: ['transfer:registered', 'bond:bond_registered', 'cancellation:cancellation_registered'],
})

export function deriveProfessionalTransferMilestones(legalJourney) {
  const snapshot = legalJourney?.status === 'ready' ? legalJourney.snapshot : null
  if (!snapshot?.lanes?.length) return []
  const tasks = snapshot.lanes.flatMap(lane => lane.phases.flatMap(phase =>
    phase.tasks.map(task => ({ id: `${lane.key}:${task.key}`, lane: lane.key, phase: phase.key, status: task.status }))))
  return CLIENT_TRANSFER_STAGE_DEFINITIONS.map(stage => {
    const relevant = tasks.filter(task => STAGE_TASKS[stage.key]?.includes(task.id) ||
      (task.lane === 'transfer' && stage.key === 'fica' && task.phase === 'fica_authority') ||
      (task.lane === 'transfer' && stage.key === 'clearances' && task.phase === 'financial_preparation' &&
        task.id !== 'transfer:municipal_rates_clearance_review'))
    const status = !relevant.length || relevant.every(task => task.status === 'not_applicable') ? 'not_applicable'
      : relevant.some(task => task.status === 'blocked') ? 'blocked'
        : relevant.some(task => task.status === 'waiting') ? 'waiting'
          : relevant.every(task => ['completed', 'completed_externally', 'not_applicable'].includes(task.status)) ? 'completed'
            : relevant.some(task => ['in_progress', 'completed', 'completed_externally'].includes(task.status)) ? 'in_progress' : 'not_started'
    return { key: stage.key, status }
  })
}

export function buildClientTransferJourneyPresentation({ legalJourney, attorneyUpdates = [], audience = 'buyer', financeType = '', now = new Date() } = {}) {
  const snapshot = legalJourney?.status === 'ready' ? legalJourney.snapshot : null
  const milestoneRows = snapshot?.clientTransferMilestones
  if (!Array.isArray(milestoneRows) || !milestoneRows.length) return { status: 'unavailable', stages: [], currentStage: null }
  const byKey = new Map(milestoneRows.filter(row => VALID_STATUSES.has(row?.status)).map(row => [row.key, row.status]))
  const updates = (Array.isArray(attorneyUpdates) ? attorneyUpdates : [])
    .filter(update => update?.laneKey === 'transfer' && update?.visibility === 'client_visible' &&
      update?.clientRecipients?.includes(audience) && update?.metadata?.journeyBrief?.version === 1)
    .sort((a, b) => Date.parse(b.createdAt || 0) - Date.parse(a.createdAt || 0))
  const stages = CLIENT_TRANSFER_STAGE_DEFINITIONS.flatMap((definition) => {
    const status = byKey.get(definition.key)
    if (!status || status === 'not_applicable') return []
    const latestUpdate = updates.find(update => update.metadata.journeyBrief.stageKey === definition.key) || null
    const brief = latestUpdate?.metadata?.journeyBrief || {}
    return [{ ...definition, status, latestUpdate,
      currentStatus: text(brief.currentStatus) || (status === 'blocked' ? 'Needs attention' : status === 'waiting' ? 'Waiting on another party' : status === 'completed' ? 'Completed' : status === 'not_started' ? 'Preparing this stage' : 'In progress'),
      waitingOn: text(brief.waitingOn),
      delayStatus: text(brief.delayStatus),
      delayReason: text(brief.delayReason),
      clientAction: text(brief.clientAction),
      duration: text(brief.durationEstimate) || definition.duration,
    }]
  })
  if (!stages.length) return { status: 'unavailable', stages: [], currentStage: null }
  const currentStage = selectCurrentTransferStage(stages)
  const currentIndex = stages.findIndex(stage => stage.key === currentStage?.key)
  const completedCount = stages.filter(stage => stage.status === 'completed').length
  const isComplete = stages.length > 0 && completedCount === stages.length
  const currentUpdate = currentStage?.latestUpdate || null
  const brief = currentUpdate?.metadata?.journeyBrief || {}
  const activeUpdateAt = Date.parse(currentUpdate?.createdAt || '')
  const ageDays = Number.isFinite(activeUpdateAt) ? Math.floor((new Date(now).getTime() - activeUpdateAt) / 86400000) : null
  return {
    status: 'ready', stages, currentStage, currentIndex, completedCount, isComplete,
    progressPercent: stages.length ? Math.round((completedCount / stages.length) * 100) : 0,
    nextStage: stages.slice(currentIndex + 1).find(stage => stage.status !== 'completed') || null,
    waitingOn: isComplete ? 'No one — transfer complete' : currentStage?.waitingOn || 'Your transfer team',
    estimatedRegistration: isComplete ? 'Registered' : text(brief.registrationEstimate) || 'Timing to be confirmed',
    clientAction: isComplete ? 'No action required' : currentStage?.clientAction || 'We will confirm any action needed',
    clientActionDetail: currentStage?.clientAction ? 'Follow the instruction in the latest attorney update.' : 'Check your document requests and messages for assigned actions.',
    currentUpdate,
    updateIsOld: ageDays !== null && ageDays > 14,
    financeType,
  }
}
