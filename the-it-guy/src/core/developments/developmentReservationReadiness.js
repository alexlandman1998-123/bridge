import { DEVELOPMENT_LEAD_BOARD_STAGES, getDevelopmentLeadBoardStage, resolveDevelopmentLeadBoardMove } from './developmentLeadBoard.js'

// Match the shared reservation command; a unit preference alone is not a hold.
export function getDevelopmentReservationReadiness({ lead, unit, leads = [], developmentId = '' }) {
  const blockers = []
  const heldByBuyer = Boolean(lead && unit && lead.preferredUnitId === unit.id && lead.reservationState === 'reserved')
  if (!unit) blockers.push('Choose a unit to reserve.')
  else if (unit.currentTransactionId) blockers.push('This unit is managed through an existing transaction.')
  else if (String(unit.status || '').toLowerCase() !== 'available' && !(heldByBuyer && String(unit.status || '').toLowerCase() === 'reserved')) blockers.push('This unit is no longer available for reservation.')
  if (!lead) blockers.push('Link a buyer lead before confirming the reservation.')
  else {
    if (lead.convertedTransactionId || lead.leadStatus === 'converted') blockers.push('This buyer already has a transaction. Continue in their lead workspace.')
    if (lead.leadStatus === 'lost') blockers.push('This lead is marked lost. Reopen it through the lead workflow before reserving.')
    if (developmentId && lead.primaryDevelopmentId && lead.primaryDevelopmentId !== developmentId) blockers.push('The buyer’s primary development must match this unit. Update their development selection first.')
    if (['reserved', 'provisional'].includes(lead.reservationState) && lead.preferredUnitId && lead.preferredUnitId !== unit?.id) blockers.push('Release the buyer’s existing reservation before choosing another unit.')
    if (['onboarding_sent', 'onboarding_submitted', 'otp'].includes(lead.leadStatus) && !heldByBuyer) blockers.push('This buyer has progressed to onboarding or their offer. Review their existing reservation in the lead workflow.')
  }
  if (unit && leads.some(other => other.developerLeadId !== lead?.developerLeadId && other.preferredUnitId === unit.id && other.reservationState === 'reserved' && !other.convertedTransactionId)) blockers.push('Another buyer holds this unit. Release that reservation before reserving it again.')
  return { blockers, heldByBuyer, canReserve: blockers.length === 0 && !heldByBuyer }
}

export function getReservationStageChoices(lead) {
  const current = getDevelopmentLeadBoardStage(lead)
  const protectedProgress = ['reserved', 'onboarding_sent', 'onboarding_submitted', 'otp', 'converted'].includes(lead?.leadStatus)
  return DEVELOPMENT_LEAD_BOARD_STAGES.map(stage => {
    const move = resolveDevelopmentLeadBoardMove(lead || {}, stage.key)
    const closing = stage.key === 'lost' || lead?.leadStatus === 'lost'
    const blocked = closing || protectedProgress && ['captured', 'contacted', 'qualified', 'viewing', 'lost'].includes(stage.key)
    const reason = closing ? 'Close or reopen this buyer through their lead workflow.' : blocked ? 'Continue this buyer’s saved reservation, onboarding or transaction in their lead workspace.'
      : move.kind === 'workflow' ? stage.key === 'development_selection' ? 'Confirm the unit reservation below.' : 'Complete this stage in the buyer workflow using its saved evidence.' : ''
    return { ...stage, current: current.key === stage.key, editable: move.kind === 'status' && !blocked, reason }
  })
}
