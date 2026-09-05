import { createAgencyCrmLeadTask, listAgencyCrmLeadContacts, updateAgencyCrmLeadTask } from '../../lib/agencyCrmRepository'
import { buildRentalLeadFollowUpDraft, sortRentalLeadFollowUps, validateRentalLeadFollowUp } from './rentalLeadFollowUpModel'
import { listRentalLeads } from './rentalLeadService'

const text = (value) => String(value ?? '').trim()

export async function listRentalLeadFollowUps(organisationId, options = {}) {
  const [leads, records] = await Promise.all([
    listRentalLeads(organisationId, options),
    listAgencyCrmLeadContacts(organisationId, { includePrimaryRecords: false, includeRelatedRecords: true, includeLocalFallback: false }),
  ])
  const leadById = new Map(leads.map((lead) => [lead.id, lead]))
  const assignedAgentId = text(options.assignedAgentId)
  const tasks = (records.tasks || [])
    .filter((task) => leadById.has(text(task.leadId)))
    .filter((task) => !assignedAgentId || text(task.assignedAgentId) === assignedAgentId || options.includeAllOrganisationLeads === true)
    .map((task) => ({ ...task, lead: leadById.get(text(task.leadId)) }))
  return sortRentalLeadFollowUps(tasks)
}

export async function createRentalLeadFollowUp(lead = {}, values = {}, context = {}) {
  const draft = { ...buildRentalLeadFollowUpDraft(lead), ...values, leadId: lead.id }
  const errors = validateRentalLeadFollowUp(draft)
  if (errors.length) throw new Error(errors.join(' '))
  return createAgencyCrmLeadTask(context.organisationId, lead.id, {
    title: text(draft.title), description: text(draft.description), dueDate: draft.dueDate,
    priority: draft.priority, assignedAgent: context.assignedAgent || context.actor || {}, status: 'Pending',
  }, { actor: context.actor || {} })
}

export async function completeRentalLeadFollowUp(task = {}, context = {}) {
  if (!text(task.taskId)) throw new Error('A follow-up task is required.')
  return updateAgencyCrmLeadTask(context.organisationId, task.taskId, { status: 'Completed' }, { actor: context.actor || {} })
}
