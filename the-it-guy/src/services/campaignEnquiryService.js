import { supabase } from '../lib/supabaseClient'
import { emitAgencyCrmUpdated } from '../lib/agencyCrmUpdateBus'
import { listOrganisationUsersForWorkspace } from '../lib/settingsApi'
import { calendarDateKey, validCalendarDate } from './marketingCalendarModel'

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const text = (value) => String(value || '').trim()
const leadFields = 'lead_id,contact_id,assigned_agent_id,assigned_user_id,stage,status'
export const ENQUIRY_CHANNELS = { email: 'Email', whatsapp: 'WhatsApp', facebook: 'Facebook', instagram: 'Instagram', form: 'Form', phone: 'Phone', other: 'Other' }

function context(org, campaign, client) {
  if (!client || !uuid.test(org) || !uuid.test(campaign)) throw new Error('Open a saved campaign in an agency workspace first.')
}
function failure(error) {
  if (['42P01', 'PGRST205', 'PGRST202', '42883'].includes(error?.code)) return new Error('Campaign enquiries are not enabled for this workspace yet.')
  return new Error(error?.message || 'Campaign enquiries could not be loaded. Please try again.')
}
async function rows(factory) {
  const all = []
  for (let offset = 0; ; offset += 200) {
    const result = await factory().range(offset, offset + 199)
    if (result.error) throw failure(result.error)
    all.push(...(result.data || []))
    if ((result.data || []).length < 200) return all
  }
}
async function batched(client, table, fields, org, field, ids, order) {
  const all = []
  for (let index = 0; index < ids.length; index += 100) {
    all.push(...await rows(() => client.from(table).select(fields).eq('organisation_id', org).in(field, ids.slice(index, index + 100)).order(order)))
  }
  return all
}
const contactName = (contact) => [contact?.first_name, contact?.last_name].filter(Boolean).join(' ') || contact?.email || 'Contact unavailable'
const ownerId = (lead) => lead.assigned_user_id || lead.assigned_agent_id || null
const closedTask = (task) => ['completed', 'done', 'cancelled', 'canceled'].includes(text(task.status).toLowerCase())
const successfulContact = (activity) => ['call', 'email', 'whatsapp', 'meeting', 'viewing', 'phone call'].includes(text(activity.activity_type).toLowerCase())
  && ['contacted', 'connected', 'sent', 'delivered', 'completed', 'replied'].includes(text(activity.outcome).toLowerCase())

export function buildCampaignEnquiries({ links = [], leads = [], contacts = [], tasks = [], activities = [], directory = [], tasksAvailable = true, activitiesAvailable = true, userId, canManage = false }, now = new Date()) {
  const today = calendarDateKey(now)
  const leadMap = new Map(leads.map((lead) => [lead.lead_id, lead]))
  const contactMap = new Map(contacts.map((contact) => [contact.contact_id, contact]))
  const directoryMap = new Map()
  for (const row of directory) for (const id of [row.userId, row.user_id, row.id].filter(Boolean)) directoryMap.set(id, row)
  const tasksByLead = new Map(), contactsByLead = new Map()
  for (const task of tasks) {
    if (closedTask(task)) continue
    if (!tasksByLead.has(task.lead_id)) tasksByLead.set(task.lead_id, [])
    tasksByLead.get(task.lead_id).push(task)
  }
  for (const activity of activities) {
    if (!successfulContact(activity)) continue
    if (!contactsByLead.has(activity.lead_id)) contactsByLead.set(activity.lead_id, [])
    contactsByLead.get(activity.lead_id).push(activity)
  }
  for (const group of tasksByLead.values()) group.sort((a, b) => (a.due_date || '9999').localeCompare(b.due_date || '9999') || a.task_id.localeCompare(b.task_id))
  for (const group of contactsByLead.values()) group.sort((a, b) => Date.parse(b.activity_date) - Date.parse(a.activity_date))
  const entries = links.flatMap((link) => {
    const lead = leadMap.get(link.lead_id)
    if (!lead) return []
    const contact = contactMap.get(lead.contact_id)
    const assignedId = ownerId(lead)
    const agent = directoryMap.get(assignedId)
    const agentName = agent ? [agent.firstName || agent.first_name, agent.lastName || agent.last_name].filter(Boolean).join(' ') || agent.name || agent.fullName || agent.email : ''
    const openTasks = tasksByLead.get(lead.lead_id) || []
    const contactHistory = contactsByLead.get(lead.lead_id) || []
    const nextTask = openTasks[0] || null
    const taskAgent = directoryMap.get(nextTask?.assigned_agent_id)
    const taskOwnerName = taskAgent ? [taskAgent.firstName || taskAgent.first_name, taskAgent.lastName || taskAgent.last_name].filter(Boolean).join(' ') || taskAgent.fullName || taskAgent.name || taskAgent.email : nextTask?.assigned_agent_id ? 'Assigned agent' : 'Unassigned task'
    const overdue = Boolean(tasksAvailable && nextTask?.due_date && nextTask.due_date < today)
    const terminal = /^(lost|won|converted|closed|archived)$/i.test(lead.status || '') || /^(lost|won|converted|closed|archived)$/i.test(lead.stage || '')
    const awaitingContact = activitiesAvailable && !terminal && (!contactHistory.length || Date.parse(contactHistory[0].activity_date) < Date.parse(link.responded_at))
    return [{ ...link, lead, name: contactName(contact), email: contact?.email || '', phone: contact?.phone || '',
      ownerId: assignedId, ownerName: assignedId ? agentName || 'Assigned agent' : 'Unassigned',
      lastContact: contactHistory[0] || null, nextTask, taskOwnerName, overdue, awaitingContact,
      needsAttention: !terminal && (!assignedId || overdue || awaitingContact || (tasksAvailable && !nextTask)),
      canWork: canManage || Boolean(userId && [lead.assigned_user_id, lead.assigned_agent_id].includes(userId)),
    }]
  })
  return entries.sort((a, b) => Number(b.overdue) - Number(a.overdue) || Number(b.needsAttention) - Number(a.needsAttention) || b.responded_at.localeCompare(a.responded_at))
}

async function hydrateEnquiries({ organisationId, userId, canManage }, links, client, loadDirectory) {
  if (!links.length) return { entries: [], tasksAvailable: true, activitiesAvailable: true, warnings: [] }
  const ids = [...new Set(links.map((link) => link.lead_id))]
  const leads = await batched(client, 'leads', leadFields, organisationId, 'lead_id', ids, 'lead_id')
  if (!leads.length) return { entries: [], tasksAvailable: true, activitiesAvailable: true, warnings: [] }
  const visibleIds = leads.map((lead) => lead.lead_id)
  const contactIds = [...new Set(leads.map((lead) => lead.contact_id).filter(Boolean))]
  const [contacts, tasks, activities, directory] = await Promise.all([
    batched(client, 'contacts', 'contact_id,first_name,last_name,email,phone', organisationId, 'contact_id', contactIds, 'contact_id'),
    batched(client, 'tasks', 'task_id,lead_id,assigned_agent_id,title,due_date,status', organisationId, 'lead_id', visibleIds, 'task_id').then((data) => ({ data, available: true })).catch(() => ({ data: [], available: false })),
    batched(client, 'lead_activities', 'activity_id,lead_id,activity_type,activity_date,outcome', organisationId, 'lead_id', visibleIds, 'activity_id').then((data) => ({ data, available: true })).catch(() => ({ data: [], available: false })),
    loadDirectory({ organisationId }).catch(() => []),
  ])
  return {
    entries: buildCampaignEnquiries({ links, leads, contacts, tasks: tasks.data, activities: activities.data, directory, tasksAvailable: tasks.available, activitiesAvailable: activities.available, userId, canManage }),
    tasksAvailable: tasks.available, activitiesAvailable: activities.available,
    warnings: [!tasks.available && 'CRM follow-up tasks could not be loaded.', !activities.available && 'CRM contact history could not be loaded.'].filter(Boolean),
  }
}

export async function loadCampaignEnquiries({ organisationId, campaignId, userId, canManage }, { client = supabase, loadDirectory = listOrganisationUsersForWorkspace } = {}) {
  context(organisationId, campaignId, client)
  const links = await rows(() => client.from('marketing_campaign_enquiries').select('id,campaign_id,lead_id,channel,responded_at,created_at').eq('organisation_id', organisationId).eq('campaign_id', campaignId).order('responded_at', { ascending: false }).order('id'))
  return hydrateEnquiries({ organisationId, userId, canManage }, links, client, loadDirectory)
}

// One scoped CRM read per source batch, rather than loading each campaign separately.
// Source RLS still decides which linked leads, tasks and contact logs are visible.
export async function loadCampaignOverviewEnquiries({ organisationId, campaignIds, userId, canManage }, { client = supabase, loadDirectory = listOrganisationUsersForWorkspace } = {}) {
  if (!client || !uuid.test(organisationId) || !Array.isArray(campaignIds) || campaignIds.some((id) => !uuid.test(id))) throw new Error('Open campaigns in an agency workspace first.')
  const ids = [...new Set(campaignIds)]
  const links = await batched(client, 'marketing_campaign_enquiries', 'id,campaign_id,lead_id,channel,responded_at,created_at', organisationId, 'campaign_id', ids, 'id')
  return hydrateEnquiries({ organisationId, userId, canManage }, links, client, loadDirectory)
}

export async function searchCampaignLeads({ organisationId, campaignId, search }, { client = supabase } = {}) {
  context(organisationId, campaignId, client)
  const words = text(search).replace(/[\\%_,()."'<>;]/g, ' ').split(/\s+/).filter(Boolean).slice(0, 4)
  if (words.join(' ').length < 2) return []
  let query = client.from('contacts').select('contact_id,first_name,last_name,email,phone').eq('organisation_id', organisationId)
  for (const word of words) query = query.or(['first_name', 'last_name', 'email', 'phone'].map((field) => `${field}.ilike.%${word.slice(0, 80)}%`).join(','))
  const contacts = await query.order('last_name').limit(40)
  if (contacts.error) throw failure(contacts.error)
  if (!contacts.data?.length) return []
  const leads = await client.from('leads').select(leadFields).eq('organisation_id', organisationId).or('lead_domain.is.null,lead_domain.eq.agency').in('contact_id', contacts.data.map((contact) => contact.contact_id)).order('updated_at', { ascending: false }).limit(40)
  if (leads.error) throw failure(leads.error)
  return (leads.data || []).map((lead) => {
    const contact = contacts.data.find((row) => row.contact_id === lead.contact_id)
    return { id: lead.lead_id, name: contactName(contact), email: contact?.email || '', stage: lead.stage }
  })
}

export async function saveCampaignEnquiryAction({ organisationId, campaignId, leadId, action, payload }, { client = supabase } = {}) {
  context(organisationId, campaignId, client)
  if (!uuid.test(leadId)) throw new Error('Choose a saved CRM lead.')
  if (!['record', 'contact', 'follow_up', 'complete'].includes(action)) throw new Error('Choose an enquiry action.')
  const validPast = (value) => value && Number.isFinite(Date.parse(value)) && Date.parse(value) <= Date.now() + 300000
  if (action === 'record' && (!Object.hasOwn(ENQUIRY_CHANNELS, payload.channel) || !validPast(payload.respondedAt))) throw new Error('Choose a response channel and a valid response time in the past.')
  if (action !== 'record' && !uuid.test(payload.id)) throw new Error('Reopen this action before trying again.')
  if (action === 'follow_up' && (!text(payload.title) || text(payload.title).length > 180 || !validCalendarDate(payload.dueDate))) throw new Error('Enter a follow-up title of up to 180 characters and a valid due date.')
  if (action === 'contact' && (!['Call', 'Email', 'WhatsApp', 'Meeting'].includes(payload.channel) || !validPast(payload.contactedAt) || text(payload.note).length > 2000)) throw new Error('Choose a contact method, a past contact time and a note of up to 2,000 characters.')
  const result = await client.rpc('marketing_campaign_enquiry_action', { p_org: organisationId, p_campaign: campaignId, p_lead: leadId, p_action: action, p_payload: payload })
  if (result.error) throw failure(result.error)
  if (!uuid.test(result.data || '') || (action !== 'record' && result.data !== payload.id)) throw new Error('The save could not be confirmed. Refresh before trying again.')
  emitAgencyCrmUpdated({ organisationId, leadId, mutation: `campaign-enquiry-${action}` })
  return result.data
}
