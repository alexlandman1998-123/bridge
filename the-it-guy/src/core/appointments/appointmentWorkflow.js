import { appointmentReadState } from './appointmentReadModel.js'

const key = value => String(value || '').trim().toLowerCase()
export function resolveAppointmentCreationContext(form = {}, { leads = [], selectedLead = null, currentAgent = {}, calendarAgent = {} } = {}) {
  const leadId = form.relatedEntityType === 'lead' ? key(form.relatedEntityId) : ''
  const linkedLead = leadId ? leads.find(lead => key(lead.leadId) === leadId) || (key(selectedLead?.leadId) === leadId ? selectedLead : null) : null
  return { linkedLead, agentKey: form.assignedAgentId || calendarAgent.id || currentAgent.id }
}

// This controls presentation only; each command still verifies access in SQL.
export function appointmentWorkflowActions(appointment = {}, actor = {}, now = Date.now()) {
  const state = appointmentReadState(appointment, now)
  const id = key(actor.id || actor.userId)
  const canManage = Boolean(id) && ([appointment.assignedAgentId, appointment.schedulingOwnerUserId, appointment.createdBy].some(value => key(value) === id)
    || actor.canManageCalendar === true)
  const archived = Boolean(appointment.archivedAt || appointment.archived_at)
  const closed = ['cancelled','declined','completed','no_show'].includes(state.status)
  const self = (appointment.participants || []).find(person => !person.rsvpRevokedAt && !person.rsvp_revoked_at
    && ((id && key(person.userId || person.user_id) === id) || (!person.userId && !person.user_id && key(actor.email) && key(person.email) === key(actor.email))))
  const issued = !archived && !closed && state.status !== 'draft'
  return { state, canManage, archived, closed,
    canEdit: canManage && !closed && !archived,
    canArchive: canManage && !archived && (closed || state.status === 'draft'),
    canRestore: canManage && archived,
    canCancel: canManage && !closed && !archived,
    canComplete: canManage && issued && Number.isFinite(state.start) && state.start <= Number(now),
    canReissue: canManage && issued && state.reservation === 'needs_follow_up' && state.start > Number(now),
    canConfirm: canManage && ['requested','accepted'].includes(state.status) && issued && state.reservation === 'held' && (appointment.participants || []).filter(p => !p.rsvpRevokedAt && p.isRequired !== false).every(p => key(p.rsvpStatus) === 'accepted'),
    selfParticipant: self,
    canRespond: Boolean(id && self) && issued && ['held','confirmed'].includes(state.reservation),
  }
}
