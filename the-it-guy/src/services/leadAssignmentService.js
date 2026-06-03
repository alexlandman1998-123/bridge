import { createAgencyCrmLeadActivity } from '../lib/agencyCrmRepository'
import { isSupabaseConfigured, supabase } from '../lib/supabaseClient'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export const LEAD_ASSIGNMENT_QUEUES = ['unassigned', 'sales', 'rentals', 'commercial', 'developments']
export const LEAD_OWNERSHIP_STATUSES = ['awaiting_assignment', 'assigned', 'contacted', 'working', 'dormant', 'escalated']

function normalizeText(value) {
  return String(value ?? '').trim()
}

function normalizeLower(value) {
  return normalizeText(value).toLowerCase()
}

function isUuidLike(value) {
  return UUID_PATTERN.test(normalizeText(value))
}

function nullableUuid(value) {
  const normalized = normalizeText(value)
  return isUuidLike(normalized) ? normalized : null
}

function normalizeQueueId(value = 'unassigned') {
  const normalized = normalizeLower(value).replace(/\s+/g, '_')
  return LEAD_ASSIGNMENT_QUEUES.includes(normalized) ? normalized : 'unassigned'
}

function normalizeOwnershipStatus(value = '', fallback = 'assigned') {
  const normalized = normalizeLower(value).replace(/\s+/g, '_')
  return LEAD_OWNERSHIP_STATUSES.includes(normalized) ? normalized : fallback
}

function requireClient() {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is required before assigning leads.')
  }
  return supabase
}

function actorId(actor = null) {
  return nullableUuid(actor?.id || actor?.user_id || actor?.userId)
}

export function calculateSlaDueAt(assignedAt = new Date().toISOString(), slaHours = 24) {
  const assignedDate = new Date(assignedAt || Date.now())
  const base = Number.isNaN(assignedDate.getTime()) ? new Date() : assignedDate
  const hours = Math.max(1, Number(slaHours || 24))
  return new Date(base.getTime() + hours * 60 * 60 * 1000).toISOString()
}

export function getLeadSlaStatus(lead = {}, now = new Date()) {
  const ownershipStatus = normalizeOwnershipStatus(lead.ownershipStatus || lead.ownership_status, 'awaiting_assignment')
  if (ownershipStatus === 'escalated') return 'escalated'
  if (lead.firstContactedAt || lead.first_contacted_at) return 'contacted'
  const dueAt = lead.slaDueAt || lead.sla_due_at
  if (!dueAt) return lead.assignedAgentId || lead.assigned_agent_id || lead.assignedQueueId || lead.assigned_queue_id ? 'on_track' : 'awaiting_assignment'
  const dueMs = new Date(dueAt).getTime()
  const nowMs = now instanceof Date ? now.getTime() : new Date(now).getTime()
  if (Number.isNaN(dueMs) || Number.isNaN(nowMs)) return 'on_track'
  if (dueMs < nowMs) return 'overdue'
  if (dueMs - nowMs <= 60 * 60 * 1000) return 'due_soon'
  return 'on_track'
}

export function isLeadEscalationDue(lead = {}, now = new Date()) {
  return getLeadSlaStatus(lead, now) === 'overdue'
}

export function canManageLeadAssignment(actor = {}, lead = {}) {
  const role = normalizeLower(actor?.workspaceRole || actor?.organisationRole || actor?.role || actor?.roleKey)
  if (['owner', 'principal', 'admin', 'admin_staff', 'branch_manager', 'manager', 'team_lead', 'developer', 'platform_admin'].includes(role)) return true
  const id = normalizeText(actor?.id || actor?.user_id || actor?.userId)
  const assignedId = normalizeText(lead?.assignedAgentId || lead?.assigned_agent_id || lead?.assignedUserId || lead?.assigned_user_id)
  return Boolean(id && assignedId && id === assignedId)
}

export function normalizeLeadAssignment(row = {}) {
  return {
    leadId: normalizeText(row.lead_id || row.leadId || row.id),
    organisationId: normalizeText(row.organisation_id || row.organisationId),
    contactId: normalizeText(row.contact_id || row.contactId),
    listingId: normalizeText(row.listing_id || row.listingId),
    branchId: normalizeText(row.branch_id || row.branchId),
    assignedAgentId: normalizeText(row.assigned_agent_id || row.assignedAgentId),
    assignedUserId: normalizeText(row.assigned_user_id || row.assignedUserId),
    assignedQueueId: normalizeText(row.assigned_queue_id || row.assignedQueueId),
    assignedAt: row.assigned_at || row.assignedAt || null,
    firstContactedAt: row.first_contacted_at || row.firstContactedAt || null,
    slaDueAt: row.sla_due_at || row.slaDueAt || null,
    ownershipStatus: normalizeOwnershipStatus(row.ownership_status || row.ownershipStatus, 'awaiting_assignment'),
    status: normalizeText(row.status),
    stage: normalizeText(row.stage),
    leadSource: normalizeText(row.lead_source || row.leadSource),
    raw: row,
  }
}

export function normalizeAssignmentHistory(row = {}) {
  return {
    assignmentId: normalizeText(row.assignment_id || row.assignmentId || row.id),
    organisationId: normalizeText(row.organisation_id || row.organisationId),
    leadId: normalizeText(row.lead_id || row.leadId),
    previousAgentId: normalizeText(row.previous_agent_id || row.previousAgentId),
    newAgentId: normalizeText(row.new_agent_id || row.newAgentId),
    previousQueueId: normalizeText(row.previous_queue_id || row.previousQueueId),
    newQueueId: normalizeText(row.new_queue_id || row.newQueueId),
    reason: normalizeText(row.reason),
    assignmentSource: normalizeText(row.assignment_source || row.assignmentSource) || 'manual',
    assignedBy: normalizeText(row.assigned_by || row.assignedBy),
    createdAt: row.created_at || row.createdAt || null,
    raw: row,
  }
}

async function getLead(organisationId = '', leadId = '') {
  const client = requireClient()
  const { data, error } = await client
    .from('leads')
    .select('*')
    .eq('organisation_id', organisationId)
    .eq('lead_id', leadId)
    .maybeSingle()
  if (error) throw error
  if (!data) throw new Error('Lead not found.')
  return normalizeLeadAssignment(data)
}

async function getOriginalListingInterest(organisationId = '', leadId = '') {
  const client = requireClient()
  const { data, error } = await client
    .from('lead_listing_interests')
    .select('listing_id, is_original_enquiry, created_at')
    .eq('organisation_id', organisationId)
    .eq('lead_id', leadId)
    .order('is_original_enquiry', { ascending: false })
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (error) return null
  return data || null
}

async function getListing(organisationId = '', listingId = '') {
  const client = requireClient()
  const normalizedListingId = nullableUuid(listingId)
  if (!normalizedListingId) return null
  const { data, error } = await client
    .from('private_listings')
    .select('id, organisation_id, assigned_agent_id, branch_id, listing_category, property_category, listing_source')
    .eq('organisation_id', organisationId)
    .eq('id', normalizedListingId)
    .maybeSingle()
  if (error) return null
  return data || null
}

async function findBranchAgent({ organisationId = '', branchId = '' } = {}) {
  const client = requireClient()
  if (!branchId) return null
  const { data, error } = await client
    .from('organisation_users')
    .select('user_id, id, role, workspace_role, organisation_role, status, branch_id, primary_branch_id')
    .eq('organisation_id', organisationId)
    .or(`branch_id.eq.${branchId},primary_branch_id.eq.${branchId}`)
    .in('status', ['active', 'accepted'])
    .limit(20)
  if (error) return null
  return (data || []).find((row) => ['agent', 'principal', 'branch_manager', 'manager'].includes(normalizeLower(row.role || row.workspace_role || row.organisation_role))) || null
}

function queueForLead(lead = {}, listing = null) {
  const category = normalizeLower(listing?.listing_category || listing?.property_category || lead.leadSource)
  if (category.includes('rent')) return 'rentals'
  if (category.includes('commercial')) return 'commercial'
  if (category.includes('development')) return 'developments'
  return lead.branchId ? 'sales' : 'unassigned'
}

export function evaluateAssignmentRuleContext({ lead = {}, listing = null, branchAgent = null } = {}) {
  const normalizedLead = normalizeLeadAssignment(lead)
  if (listing?.assigned_agent_id || listing?.assignedAgentId) {
    return {
      type: 'agent',
      agentId: normalizeText(listing.assigned_agent_id || listing.assignedAgentId),
      queueId: '',
      reason: 'Assigned to listing agent',
      rule: 'listing_agent',
      lead: normalizedLead,
      listing,
    }
  }
  if (listing) {
    return {
      type: 'queue',
      agentId: '',
      queueId: queueForLead(normalizedLead, listing),
      reason: 'Listing agent unavailable; assigned to listing team queue',
      rule: 'listing_team_queue',
      lead: normalizedLead,
      listing,
    }
  }
  if (branchAgent?.user_id || branchAgent?.id) {
    return {
      type: 'agent',
      agentId: normalizeText(branchAgent.user_id || branchAgent.id),
      queueId: '',
      reason: 'Assigned by branch rule',
      rule: 'branch_agent',
      lead: normalizedLead,
      listing: null,
    }
  }
  return {
    type: 'queue',
    agentId: '',
    queueId: 'unassigned',
    reason: 'No listing or branch owner found; assigned to unassigned queue',
    rule: 'unassigned_queue',
    lead: normalizedLead,
    listing: null,
  }
}

export async function evaluateAssignmentRules({ organisationId = '', leadId = '' } = {}) {
  const lead = await getLead(organisationId, leadId)
  const interest = lead.listingId ? null : await getOriginalListingInterest(organisationId, lead.leadId)
  const listingId = lead.listingId || interest?.listing_id || ''
  const listing = listingId ? await getListing(organisationId, listingId) : null
  const branchAgent = await findBranchAgent({ organisationId, branchId: lead.branchId })
  return evaluateAssignmentRuleContext({ lead, listing, branchAgent })
}

export async function recordAssignmentHistory(payload = {}) {
  const client = requireClient()
  const historyPayload = {
    organisation_id: nullableUuid(payload.organisationId || payload.organisation_id),
    lead_id: nullableUuid(payload.leadId || payload.lead_id),
    previous_agent_id: nullableUuid(payload.previousAgentId || payload.previous_agent_id),
    new_agent_id: nullableUuid(payload.newAgentId || payload.new_agent_id),
    previous_queue_id: normalizeText(payload.previousQueueId || payload.previous_queue_id) || null,
    new_queue_id: normalizeText(payload.newQueueId || payload.new_queue_id) || null,
    reason: normalizeText(payload.reason) || null,
    assignment_source: normalizeText(payload.assignmentSource || payload.assignment_source) || 'manual',
    assigned_by: nullableUuid(payload.assignedBy || payload.assigned_by),
  }
  if (!historyPayload.organisation_id || !historyPayload.lead_id) throw new Error('Organisation id and lead id are required for assignment history.')
  const { data, error } = await client
    .from('lead_assignment_history')
    .insert(historyPayload)
    .select('*')
    .single()
  if (error) throw error
  return normalizeAssignmentHistory(data)
}

async function notifyLeadAssignment({ organisationId, leadId, type, reason, actor = null }) {
  try {
    return await createAgencyCrmLeadActivity(
      organisationId,
      leadId,
      {
        activityType: type,
        activityNote: reason,
        outcome: normalizeLower(type).replace(/\s+/g, '_'),
      },
      { actor },
    )
  } catch (error) {
    console.warn('[leadAssignmentService] assignment notification skipped', error)
    return null
  }
}

async function updateLeadAssignment({ organisationId, leadId, patch, reason = '', assignmentSource = 'manual', actor = null }) {
  const client = requireClient()
  const previous = await getLead(organisationId, leadId)
  const assignedAt = patch.assigned_at || new Date().toISOString()
  const updatePayload = {
    ...patch,
    updated_at: new Date().toISOString(),
  }
  const { data, error } = await client
    .from('leads')
    .update(updatePayload)
    .eq('organisation_id', organisationId)
    .eq('lead_id', leadId)
    .select('*')
    .single()
  if (error) throw error
  const lead = normalizeLeadAssignment(data)
  const history = await recordAssignmentHistory({
    organisationId,
    leadId,
    previousAgentId: previous.assignedAgentId,
    newAgentId: lead.assignedAgentId,
    previousQueueId: previous.assignedQueueId,
    newQueueId: lead.assignedQueueId,
    reason,
    assignmentSource,
    assignedBy: actorId(actor),
  })
  const notificationType = previous.assignedAgentId || previous.assignedQueueId ? 'Lead reassigned' : 'New lead assigned'
  const notification = await notifyLeadAssignment({
    organisationId,
    leadId,
    type: notificationType,
    reason,
    actor,
  })
  return {
    lead: {
      ...lead,
      assignedAt: lead.assignedAt || assignedAt,
    },
    history,
    notification,
  }
}

export async function assignLeadToAgent({ organisationId = '', leadId = '', agentId = '', reason = 'Assigned to agent', slaHours = 24 } = {}, { actor = null } = {}) {
  const normalizedOrgId = nullableUuid(organisationId)
  const normalizedLeadId = nullableUuid(leadId)
  const normalizedAgentId = nullableUuid(agentId)
  if (!normalizedOrgId || !normalizedLeadId || !normalizedAgentId) throw new Error('Valid organisation, lead, and agent ids are required.')
  const assignedAt = new Date().toISOString()
  return updateLeadAssignment({
    organisationId: normalizedOrgId,
    leadId: normalizedLeadId,
    patch: {
      assigned_agent_id: normalizedAgentId,
      assigned_user_id: normalizedAgentId,
      assigned_queue_id: null,
      assigned_at: assignedAt,
      sla_due_at: calculateSlaDueAt(assignedAt, slaHours),
      ownership_status: 'assigned',
    },
    reason,
    assignmentSource: 'manual_agent',
    actor,
  })
}

export async function assignLeadToQueue({ organisationId = '', leadId = '', queueId = 'unassigned', reason = 'Assigned to queue', slaHours = 24 } = {}, { actor = null } = {}) {
  const normalizedOrgId = nullableUuid(organisationId)
  const normalizedLeadId = nullableUuid(leadId)
  if (!normalizedOrgId || !normalizedLeadId) throw new Error('Valid organisation and lead ids are required.')
  const assignedAt = new Date().toISOString()
  const normalizedQueueId = normalizeQueueId(queueId)
  return updateLeadAssignment({
    organisationId: normalizedOrgId,
    leadId: normalizedLeadId,
    patch: {
      assigned_agent_id: null,
      assigned_user_id: null,
      assigned_queue_id: normalizedQueueId,
      assigned_at: assignedAt,
      sla_due_at: calculateSlaDueAt(assignedAt, slaHours),
      ownership_status: normalizedQueueId === 'unassigned' ? 'awaiting_assignment' : 'assigned',
    },
    reason,
    assignmentSource: 'manual_queue',
    actor,
  })
}

export function reassignLead({ organisationId = '', leadId = '', agentId = '', reason = 'Lead reassigned', slaHours = 24 } = {}, options = {}) {
  return assignLeadToAgent({ organisationId, leadId, agentId, reason, slaHours }, options)
}

export async function autoAssignLead({ organisationId = '', leadId = '', slaHours = 24 } = {}, { actor = null } = {}) {
  const decision = await evaluateAssignmentRules({ organisationId, leadId })
  if (decision.type === 'agent') {
    return {
      decision,
      ...(await updateLeadAssignment({
        organisationId,
        leadId,
        patch: {
          assigned_agent_id: decision.agentId,
          assigned_user_id: decision.agentId,
          assigned_queue_id: null,
          assigned_at: new Date().toISOString(),
          sla_due_at: calculateSlaDueAt(new Date().toISOString(), slaHours),
          ownership_status: 'assigned',
        },
        reason: decision.reason,
        assignmentSource: decision.rule,
        actor,
      })),
    }
  }
  return {
    decision,
    ...(await assignLeadToQueue({ organisationId, leadId, queueId: decision.queueId, reason: decision.reason, slaHours }, { actor })),
  }
}

export function assignLead(payload = {}, options = {}) {
  if (payload.agentId) return assignLeadToAgent(payload, options)
  if (payload.queueId) return assignLeadToQueue(payload, options)
  return autoAssignLead(payload, options)
}

export async function markLeadFirstContacted({ organisationId = '', leadId = '', contactedAt = new Date().toISOString() } = {}, { actor = null } = {}) {
  const client = requireClient()
  const normalizedOrgId = nullableUuid(organisationId)
  const normalizedLeadId = nullableUuid(leadId)
  if (!normalizedOrgId || !normalizedLeadId) throw new Error('Valid organisation and lead ids are required.')
  const { data, error } = await client
    .from('leads')
    .update({
      first_contacted_at: contactedAt,
      ownership_status: 'contacted',
      updated_at: new Date().toISOString(),
    })
    .eq('organisation_id', normalizedOrgId)
    .eq('lead_id', normalizedLeadId)
    .select('*')
    .single()
  if (error) throw error
  await notifyLeadAssignment({
    organisationId: normalizedOrgId,
    leadId: normalizedLeadId,
    type: 'Lead contacted',
    reason: 'First contact recorded for SLA tracking.',
    actor,
  })
  return normalizeLeadAssignment(data)
}

export async function listLeadAssignmentHistory({ organisationId = '', leadId = '' } = {}) {
  const client = requireClient()
  const normalizedOrgId = nullableUuid(organisationId)
  const normalizedLeadId = nullableUuid(leadId)
  if (!normalizedOrgId || !normalizedLeadId) return []
  const { data, error } = await client
    .from('lead_assignment_history')
    .select('*')
    .eq('organisation_id', normalizedOrgId)
    .eq('lead_id', normalizedLeadId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data || []).map(normalizeAssignmentHistory)
}

export async function listLeadAssignmentMetrics({ organisationId = '' } = {}) {
  const client = requireClient()
  const normalizedOrgId = nullableUuid(organisationId)
  if (!normalizedOrgId) return { unassigned: 0, assigned: 0, overdue: 0, escalated: 0, byAgent: [] }
  const { data, error } = await client
    .from('leads')
    .select('lead_id, assigned_agent_id, assigned_queue_id, ownership_status, sla_due_at, first_contacted_at')
    .eq('organisation_id', normalizedOrgId)
    .limit(2000)
  if (error) throw error
  const rows = (data || []).map(normalizeLeadAssignment)
  const byAgentMap = new Map()
  rows.forEach((lead) => {
    if (lead.assignedAgentId) byAgentMap.set(lead.assignedAgentId, (byAgentMap.get(lead.assignedAgentId) || 0) + 1)
  })
  return {
    unassigned: rows.filter((lead) => !lead.assignedAgentId && (!lead.assignedQueueId || lead.assignedQueueId === 'unassigned')).length,
    assigned: rows.filter((lead) => lead.assignedAgentId || (lead.assignedQueueId && lead.assignedQueueId !== 'unassigned')).length,
    overdue: rows.filter((lead) => getLeadSlaStatus(lead) === 'overdue').length,
    escalated: rows.filter((lead) => lead.ownershipStatus === 'escalated').length,
    byAgent: [...byAgentMap.entries()].map(([agentId, count]) => ({ agentId, count })),
  }
}

export async function identifyEscalatedLeads({ organisationId = '' } = {}) {
  const client = requireClient()
  const normalizedOrgId = nullableUuid(organisationId)
  if (!normalizedOrgId) return []
  const { data, error } = await client
    .from('leads')
    .select('*')
    .eq('organisation_id', normalizedOrgId)
    .is('first_contacted_at', null)
    .lt('sla_due_at', new Date().toISOString())
    .limit(500)
  if (error) throw error
  return (data || []).map(normalizeLeadAssignment)
}

export async function flagEscalatedLeads({ organisationId = '' } = {}, { actor = null } = {}) {
  const leads = await identifyEscalatedLeads({ organisationId })
  const results = []
  for (const lead of leads) {
    const result = await updateLeadAssignment({
      organisationId: lead.organisationId,
      leadId: lead.leadId,
      patch: {
        ownership_status: 'escalated',
      },
      reason: 'Lead overdue: first contact SLA missed.',
      assignmentSource: 'sla_escalation',
      actor,
    })
    results.push(result)
  }
  return results
}

export const __leadAssignmentServiceTestUtils = {
  calculateSlaDueAt,
  canManageLeadAssignment,
  evaluateAssignmentRuleContext,
  getLeadSlaStatus,
  isLeadEscalationDue,
  normalizeAssignmentHistory,
  normalizeLeadAssignment,
  normalizeQueueId,
  queueForLead,
}
