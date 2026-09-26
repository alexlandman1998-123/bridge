const COMPLETE = 'completed'
const text = (value) => String(value || '').trim()

function task(tasks, key) {
  return (tasks || []).find((item) => item.key === key || item.stepKey === key) || null
}

function answer(taskRow, key) {
  const response = taskRow?.taskConfirmations?.[key]
  return { value: text(response?.answer), note: text(response?.note) }
}

function registrationCommunication(updates, registeredAt) {
  return (updates || []).find((update) => {
    const recipients = update.clientRecipients || update.client_recipients || []
    const publishedAt = update.createdAt || update.created_at
    return (update.updateType || update.update_type) === 'transfer_journey_progress' &&
      update.visibility === 'client_visible' && update.metadata?.journeyBrief?.stageKey === 'registration' &&
      Array.isArray(recipients) && recipients.some((recipient) => ['buyer', 'seller'].includes(recipient)) &&
      (!registeredAt || (publishedAt && new Date(publishedAt) >= new Date(registeredAt)))
  }) || null
}

/** The saved task and update rows explain Stage 6; the database remains the final gate. */
export function buildStageSixClosureReview({ taskKey = '', tasks = [], updates = [], plannedLanes = [], lanes = [] } = {}) {
  if (!['post_registration_closeout_review', 'matter_closed'].includes(taskKey)) return null
  const registeredTask = task(tasks, 'registered')
  const registered = registeredTask?.status === COMPLETE
  const financialTask = task(tasks, 'post_registration_closeout_review')
  const closureTask = task(tasks, 'matter_closed')
  const financialDecision = answer(financialTask, 'final_account_position_reviewed')
  const closureDecision = answer(closureTask, 'matter_closure_confirmed')
  const communication = registrationCommunication(updates, registeredTask?.completedAt || registeredTask?.completed_at)
  const financialDecisionValid = financialDecision.value === 'yes' ||
    (financialDecision.value === 'not_applicable' && Boolean(financialDecision.note))
  const financialComplete = financialTask?.status === COMPLETE && financialDecisionValid
  const communicationRecipients = communication?.clientRecipients || communication?.client_recipients || []
  const crossLaneIssues = (plannedLanes || []).filter((lane) => ['bond', 'cancellation'].includes(lane.laneKey)).flatMap((plannedLane) => {
    const key = plannedLane.laneKey === 'bond' ? 'bond_close_out_complete' : 'cancellation_close_out_complete'
    const lane = (lanes || []).find((item) => (item.laneKey || item.process_type) === plannedLane.laneKey)
    const step = (lane?.steps || []).find((item) => (item.stepKey || item.step_key) === key)
    return step?.status === COMPLETE ? [] : [`${plannedLane.laneKey === 'bond' ? 'Bond' : 'Cancellation'} close-out is not complete.`]
  })
  const issues = []
  if (!registered) issues.push('Transfer registration has not been confirmed.')
  if (taskKey === 'post_registration_closeout_review') {
    if (!financialDecisionValid) {
      issues.push('Review the final account, or record why it does not apply.')
    }
  } else {
    if (!financialComplete) issues.push('Financial close-out has not been completed.')
    if (!communication) issues.push('Publish a registration-stage update to the applicable buyer or seller portal.')
    if (closureDecision.value !== 'yes') issues.push('Confirm the administrative closure checklist.')
    issues.push(...crossLaneIssues)
  }
  return {
    ready: issues.length === 0,
    issues,
    financial: { complete: financialComplete, decision: financialDecision.value },
    communication: { published: Boolean(communication), recipients: communicationRecipients,
      publishedAt: communication?.createdAt || communication?.created_at || null },
    administrative: { complete: closureTask?.status === COMPLETE, decision: closureDecision.value },
  }
}
