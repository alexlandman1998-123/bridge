import { resolveAppointmentSchedule } from './appointmentTime.js'
import { appointmentReservationState, canonicalReservationStatus } from './appointmentReservation.js'

const key = (value) => String(value || '').trim().toLowerCase()

// Identity aliases only: display names are never evidence of attendance.
export function appointmentMatchesAgent(appointment = {}, agent = {}) {
  const identities = new Set([
    agent.id, agent.userId, agent.user_id, agent.organisationUserId, agent.organisation_user_id,
    agent.profile?.id, agent.profile?.user_id, agent.email, agent.userEmail,
    ...(agent.identityKeys || []),
  ].map(key).filter(Boolean))
  const participants = (Array.isArray(appointment.participants) ? appointment.participants : []).filter((participant) => !participant.rsvpRevokedAt && !participant.rsvp_revoked_at)
  const candidates = [
    appointment.assignedAgentId, appointment.assigned_agent_id, appointment.agentId, appointment.agent_id,
    appointment.assignedUserId, appointment.assigned_user_id, appointment.assignedAgentEmail, appointment.assigned_agent_email,
    appointment.agentEmail, appointment.agent_email, appointment.createdBy, appointment.created_by,
    appointment.schedulingOwnerUserId, appointment.scheduling_owner_user_id, appointment.schedulingOwnerId, appointment.scheduling_owner_id,
    ...participants.flatMap((participant) => [participant.userId, participant.user_id, participant.email]),
  ]
  return candidates.some((value) => identities.has(key(value)))
}

export function appointmentReadState(appointment = {}, now = Date.now()) {
  const status = canonicalReservationStatus(appointment.status)
  const schedule = resolveAppointmentSchedule(appointment, { strict: false })
  const start = Date.parse(schedule.dateTime)
  const end = Date.parse(schedule.endDateTime)
  const clock = Number(now)
  const reservation = appointmentReservationState(appointment, clock)
  let category
  if (appointment.archivedAt || appointment.archived_at) category = 'archived'
  else if (['cancelled', 'declined', 'completed', 'no_show'].includes(status)) category = 'history'
  else if (status === 'draft') category = 'draft'
  else if (schedule.schedulingTimeIssue || !Number.isFinite(start) || !Number.isFinite(end) || end <= start || reservation === 'needs_review') category = 'follow_up'
  else if (reservation === 'held' || reservation === 'confirmed') category = start > clock ? 'upcoming' : 'in_progress'
  else category = 'follow_up'
  return { status, category, reservation, start, end, scheduled: ['upcoming', 'in_progress'].includes(category) }
}
