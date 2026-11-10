// Keep the public API stable while loading network workflows on demand.
export {
  LEAD_DIRECTIONS,
  LEAD_CATEGORIES,
  LEAD_STAGES,
  LEAD_PRIORITIES,
  ACTIVITY_TYPES,
  TASK_STATUSES,
  TASK_PRIORITIES,
  APPOINTMENT_TYPES,
  APPOINTMENT_STATUSES,
  APPOINTMENT_STATUS_LABELS,
  APPOINTMENT_PARTICIPANT_ROLES,
  APPOINTMENT_RSVP_STATUSES,
  getLeadSourceOptions,
  filterDeletedAgencyLeadRows,
  recoverAgencyPipelineStoreForOrganisation,
  resolveAgencyPipelineStorageScope,
  getAgencyPipelineSnapshot,
  reconcileAgencyPipelineSnapshot,
  listAgencyLeads,
  createAgencyLead,
  updateAgencyLead,
  updateAgencyContact,
  deleteAgencyLead,
  addLeadActivity,
  updateLeadActivity,
  deleteLeadActivity,
  listLeadActivities,
  createLeadTask,
  updateLeadTask,
  deleteLeadTask,
  listLeadTasks,
  createLeadAppointment,
  createAppointment,
  updateAppointment,
  updateAppointmentParticipantRsvp,
  addAppointmentOutcome,
  listAppointments,
  listLeadAppointments,
  buildAppointmentsDashboardSummary,
  getAppointmentsDashboardSummary,
  listDealRecords,
  buildPipelineMetrics,
  buildPrincipalReporting,
  getAgencyCrmUpdatedEventName,
} from './agencyPipelineModel.js'

export async function listAppointmentResourcesAsync(organisationId, { includeInactive = false, signal } = {}) {
  const workflow = await import('./agencyPipelineWorkflow.js')
  return workflow.listAppointmentResourcesAsync(organisationId, { includeInactive: includeInactive, signal: signal })
}

export async function checkAppointmentSchedulingIntegrityAsync(organisationId, appointmentPayload = {}, options = {}) {
  const workflow = await import('./agencyPipelineWorkflow.js')
  return workflow.checkAppointmentSchedulingIntegrityAsync(organisationId, appointmentPayload, options)
}

export async function getAppointmentAsync(organisationId, appointmentId) {
  const workflow = await import('./agencyPipelineWorkflow.js')
  return workflow.getAppointmentAsync(organisationId, appointmentId)
}

export async function createAppointmentAsync(organisationId, payload = {}, { actor = null } = {}) {
  const workflow = await import('./agencyPipelineWorkflow.js')
  return workflow.createAppointmentAsync(organisationId, payload, { actor: actor })
}

export async function updateAppointmentAsync(organisationId, appointmentId, updater = {}, { actor = null } = {}) {
  const workflow = await import('./agencyPipelineWorkflow.js')
  return workflow.updateAppointmentAsync(organisationId, appointmentId, updater, { actor: actor })
}

export async function updateAppointmentParticipantRsvpAsync(organisationId, appointmentId, participantId, payload = {}, { actor = null } = {}) {
  const workflow = await import('./agencyPipelineWorkflow.js')
  return workflow.updateAppointmentParticipantRsvpAsync(organisationId, appointmentId, participantId, payload, { actor: actor })
}

export async function setAppointmentArchiveAsync(organisationId, appointmentId, { archive, reason, expectedRevision, expectedArchivedAt = null, commandId } = {}) {
  const workflow = await import('./agencyPipelineWorkflow.js')
  return workflow.setAppointmentArchiveAsync(organisationId, appointmentId, { archive: archive, reason: reason, expectedRevision: expectedRevision, expectedArchivedAt: expectedArchivedAt, commandId: commandId })
}

export async function addAppointmentOutcomeAsync(organisationId, appointmentId, payload = {}, { actor = null } = {}) {
  const workflow = await import('./agencyPipelineWorkflow.js')
  return workflow.addAppointmentOutcomeAsync(organisationId, appointmentId, payload, { actor: actor })
}

export async function listAppointmentsAsync(organisationId, { includeAll = false, agentId = '', agentEmail = '', agentKeys = [], listingId = '', leadId = '', from = null, to = null, signal } = {}) {
  const workflow = await import('./agencyPipelineWorkflow.js')
  return workflow.listAppointmentsAsync(organisationId, { includeAll: includeAll, agentId: agentId, agentEmail: agentEmail, agentKeys: agentKeys, listingId: listingId, leadId: leadId, from: from, to: to, signal: signal })
}

export async function getAppointmentsDashboardSummaryAsync(organisationId, {
    includeAll = false,
    agentId = '',
    agentEmail = '',
    agentKeys = [],
    now = new Date(),
  } = {}) {
  const workflow = await import('./agencyPipelineWorkflow.js')
  return workflow.getAppointmentsDashboardSummaryAsync(organisationId, { includeAll: includeAll, agentId: agentId, agentEmail: agentEmail, agentKeys: agentKeys, now: now })
}

export async function convertLeadToTransactionRecord(organisationId, leadId, payload = {}, { actor = null } = {}) {
  const workflow = await import('./agencyPipelineWorkflow.js')
  return workflow.convertLeadToTransactionRecord(organisationId, leadId, payload, { actor: actor })
}

export async function convertLeadToDealRecord(organisationId, leadId, payload = {}, { actor = null } = {}) {
  const workflow = await import('./agencyPipelineWorkflow.js')
  return workflow.convertLeadToDealRecord(organisationId, leadId, payload, { actor: actor })
}
