import { getRentalLeadMetadata, isRentalLead } from '../../services/rentals/rentalLeadClassificationModel'
import { isRentalLeadOperational } from '../../services/rentals/rentalLeadOutcomeModel'

const text = (value) => String(value ?? '').trim()
const key = (value) => text(value).toLowerCase().replace(/[\s-]+/g, '_')
const leadId = (row) => text(row.leadId || row.lead_id || row.id)
const orgId = (row) => text(row.organisationId || row.organisation_id).toLowerCase()
const dateFormatter = new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Johannesburg', year: 'numeric', month: '2-digit', day: '2-digit' })
const labelFormatter = new Intl.DateTimeFormat('en-ZA', { timeZone: 'Africa/Johannesburg', dateStyle: 'medium' })
const closed = new Set(['completed', 'complete', 'done', 'cancelled', 'canceled', 'closed', 'closed_lost', 'closed_won', 'lost', 'won', 'converted', 'archived', 'deleted', 'withdrawn'])

function dayKey(date) {
  const parts = Object.fromEntries(dateFormatter.formatToParts(date).map(({ type, value }) => [type, value]))
  return `${parts.year}-${parts.month}-${parts.day}`
}

function parseDate(value) {
  if (!value) return null
  const input = text(value)
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(input) ? `${input}T00:00:00+02:00` : /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/.test(input) ? `${input}+02:00` : input)
  return Number.isNaN(date.getTime()) ? null : date
}

function dateDetails(value, now) {
  const date = parseDate(value)
  if (!date) return { dueDate: '', dueLabel: 'No due date', overdue: false, rankDate: Infinity }
  const overdue = /^\d{4}-\d{2}-\d{2}$/.test(value) ? dayKey(date) < dayKey(now) : date < now
  return { dueDate: value, dueLabel: `${overdue ? 'Overdue · ' : dayKey(date) === dayKey(now) ? 'Today · ' : ''}${labelFormatter.format(date)}`, overdue, rankDate: date.getTime() }
}

function assignedTo(row, ids, email) {
  const assignedId = text(row.assignedAgentId || row.assigned_agent_id || row.assignedUserId || row.assigned_user_id).toLowerCase()
  if (assignedId) return ids.has(assignedId)
  const assignedEmail = text(row.assignedAgentEmail || row.assigned_agent_email).toLowerCase()
  return Boolean(assignedEmail && email && assignedEmail === email)
}

function hasAssignment(row) {
  return Boolean(row.assignedAgentId || row.assigned_agent_id || row.assignedUserId || row.assigned_user_id || row.assignedAgentEmail || row.assigned_agent_email)
}

export function buildAgentNeedsAttention({ agent = {}, leads = [], tasks = [], contacts = [], activities = [], now = new Date() } = {}) {
  const organisationId = orgId(agent)
  const ids = new Set([agent.userId, agent.user_id, agent.id, agent.organisationUserId].map((value) => text(value).toLowerCase()).filter(Boolean))
  const email = text(agent.email).toLowerCase()
  if (!organisationId || (!ids.size && !email)) return []
  const inOrganisation = (row) => orgId(row) === organisationId
  const contactsById = new Map(contacts.filter(inOrganisation).map((row) => [text(row.contactId || row.contact_id), row]))
  const contacted = new Set(activities.filter(inOrganisation).filter((row) => key(row.activityType || row.activity_type) === 'lead_contacted').map(leadId))
  const leadById = new Map()
  const items = []
  for (const lead of leads) {
    const id = leadId(lead)
    if (!id || !inOrganisation(lead) || closed.has(key(lead.stage)) || closed.has(key(lead.status)) || lead.convertedDealId || lead.convertedTransactionId || lead.converted_transaction_id) continue
    const rental = isRentalLead(lead)
    if (rental && !isRentalLeadOperational(lead)) continue
    // Keep all visible leads for task linkage. Explicit task assignments take
    // precedence; otherwise the task inherits its lead's assignee.
    const contact = contactsById.get(text(lead.contactId || lead.contact_id)) || {}
    const name = [contact.firstName || contact.first_name, contact.lastName || contact.last_name].filter(Boolean).join(' ') || text(lead.name) || 'Unnamed client'
    const property = text(lead.enquiredPropertyTitle || lead.enquired_property_title || lead.sellerPropertyAddress || lead.seller_property_address || lead.propertyInterest || lead.property_interest)
    const href = `${rental ? '/agent/rentals/pipeline/leads' : '/pipeline/leads'}/${encodeURIComponent(id)}`
    const metadata = rental ? getRentalLeadMetadata(lead) : {}
    const context = { lead, name, property, href, followUpTab: rental ? metadata.role === 'landlord' ? 'Appointments' : 'Activity' : 'activity' }
    leadById.set(id, context)
    const stage = key(rental ? metadata.stage || lead.stage : lead.stage || lead.status)
    if (!assignedTo(lead, ids, email) || !['new', 'new_lead', 'new_enquiry', 'captured'].includes(stage) || lead.firstContactedAt || lead.first_contacted_at || ['contacted', 'qualified', 'working'].includes(key(lead.status)) || ['contacted', 'working', 'dormant'].includes(key(lead.ownershipStatus || lead.ownership_status)) || contacted.has(id)) continue
    const due = dateDetails(lead.slaDueAt || lead.sla_due_at, now)
    const received = parseDate(lead.createdAt || lead.created_at)
    items.push({ id: `lead:${id}`, kind: 'lead', name, property, reason: 'New lead awaiting contact', ...due, receivedLabel: received ? `Received ${labelFormatter.format(received)}` : '', actionLabel: 'Open lead', href, urgency: due.overdue ? 0 : 2, rankDate: Number.isFinite(due.rankDate) ? due.rankDate : received?.getTime() ?? Infinity })
  }
  const seenTasks = new Set()
  for (const task of tasks) {
    const id = text(task.taskId || task.task_id || task.id)
    const context = leadById.get(text(task.leadId || task.lead_id))
    const value = task.dueDate || task.due_date
    const date = parseDate(value)
    if (!id || seenTasks.has(id) || !inOrganisation(task) || !context || closed.has(key(task.status)) || !date || dayKey(date) > dayKey(now)) continue
    if (!assignedTo(hasAssignment(task) ? task : context.lead, ids, email)) continue
    seenTasks.add(id)
    const due = dateDetails(value, now)
    items.push({ id: `task:${id}`, kind: 'follow-up', name: context.name, property: context.property, reason: text(task.title) || 'Follow-up due', ...due, actionLabel: 'Open follow-up', href: `${context.href}?tab=${context.followUpTab}`, urgency: due.overdue ? 0 : 1 })
  }
  return items.sort((left, right) => left.urgency - right.urgency || left.rankDate - right.rankDate || left.id.localeCompare(right.id)).slice(0, 5)
}
