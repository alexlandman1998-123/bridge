import { createAgencyCrmLeadTask, listAgencyCrmLeadContacts, updateAgencyCrmLeadTask } from '../../lib/agencyCrmRepository'
import { buildRentalLeadFollowUpDraft, sortRentalLeadFollowUps, validateRentalLeadFollowUp } from './rentalLeadFollowUpModel'
import { getRentalLeadWorkspace, listRentalLeads } from './rentalLeadService'

const text = (value) => String(value ?? '').trim()

export async function listRentalLeadFollowUps(organisationId, options = {}) {
  const [leads, records] = await Promise.all([
    listRentalLeads(organisationId, options),
    listAgencyCrmLeadContacts(organisationId, { includePrimaryRecords: false, includeRelatedRecords: true, includeLocalFallback: false, paginateRelatedRecords: true }),
  ])
  if (records.tasksAvailable === false) throw new Error('Rental follow-ups could not be loaded. Check your access and refresh to retry.')
  const leadById = new Map(leads.map((lead) => [lead.id, lead]))
  const tasks = (records.tasks || [])
    .filter((task) => leadById.has(text(task.leadId)))
    .map((task) => ({ ...task, lead: leadById.get(text(task.leadId)) }))
  return sortRentalLeadFollowUps(tasks)
}

export async function createRentalLeadFollowUp(lead = {}, values = {}, context = {}) {
  const { lead: currentLead } = await getRentalLeadWorkspace(context.organisationId, lead.id, context.scope || {})
  const draft = { ...buildRentalLeadFollowUpDraft(currentLead), ...values, leadId: currentLead.id }
  const errors = validateRentalLeadFollowUp(draft)
  if (errors.length) throw new Error(errors.join(' '))
  return createAgencyCrmLeadTask(context.organisationId, currentLead.id, {
    title: text(draft.title), description: text(draft.description), dueDate: draft.dueDate,
    priority: draft.priority,
    assignedAgent: { id: text(currentLead.assignedAgentId || context.assignedAgent?.id || context.actor?.id) },
    status: 'Pending',
  }, { actor: context.actor || {} })
}

export async function completeRentalLeadFollowUp(task = {}, context = {}) {
  if (!text(task.taskId) || !text(task.leadId)) throw new Error('A linked follow-up task is required.')
  const workspace = await getRentalLeadWorkspace(context.organisationId, task.leadId, { ...(context.scope || {}), includeClosed: true })
  if (!(workspace.tasks || []).some((item) => text(item.taskId) === text(task.taskId))) throw new Error('This follow-up is not linked to the visible rental lead.')
  return updateAgencyCrmLeadTask(context.organisationId, task.taskId, { status: 'Completed' }, { actor: context.actor || {} })
}
