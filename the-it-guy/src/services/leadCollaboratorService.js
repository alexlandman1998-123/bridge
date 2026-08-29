import { isSupabaseConfigured, supabase } from '../lib/supabaseClient'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function normalizeText(value) {
  return String(value ?? '').trim()
}

function requireUuid(value, label) {
  const normalized = normalizeText(value)
  if (!UUID_PATTERN.test(normalized)) throw new Error(`A valid ${label} is required.`)
  return normalized
}

function requireClient() {
  if (!isSupabaseConfigured || !supabase) throw new Error('Supabase is required before assigning lead collaborators.')
  return supabase
}

function mapAssignment(row = {}) {
  return {
    id: normalizeText(row.id),
    organisationId: normalizeText(row.organisation_id),
    leadId: normalizeText(row.lead_id),
    userId: normalizeText(row.user_id),
    role: normalizeText(row.assignment_role) || 'collaborator',
    createdBy: normalizeText(row.created_by),
    createdAt: row.created_at || null,
  }
}

export async function listLeadCollaborators({ organisationId = '', leadId = '' } = {}) {
  const client = requireClient()
  const orgId = requireUuid(organisationId, 'organisation id')
  const persistedLeadId = leadId ? requireUuid(leadId, 'lead id') : ''
  let query = client
    .from('lead_agent_assignments')
    .select('id, organisation_id, lead_id, user_id, assignment_role, created_by, created_at')
    .eq('organisation_id', orgId)
    .eq('status', 'active')
  if (persistedLeadId) query = query.eq('lead_id', persistedLeadId)
  const { data, error } = await query
  if (error) throw error
  return (Array.isArray(data) ? data : []).map(mapAssignment)
}

export async function addLeadCollaborator({ organisationId = '', leadId = '', userId = '' } = {}) {
  const client = requireClient()
  const payload = {
    organisation_id: requireUuid(organisationId, 'organisation id'),
    lead_id: requireUuid(leadId, 'lead id'),
    user_id: requireUuid(userId, 'agent id'),
    assignment_role: 'collaborator',
    status: 'active',
    updated_at: new Date().toISOString(),
  }
  const { data, error } = await client
    .from('lead_agent_assignments')
    .upsert(payload, { onConflict: 'organisation_id,lead_id,user_id' })
    .select('id, organisation_id, lead_id, user_id, assignment_role, created_by, created_at')
    .single()
  if (error) throw error
  return mapAssignment(data)
}

export async function removeLeadCollaborator({ organisationId = '', leadId = '', userId = '' } = {}) {
  const client = requireClient()
  const { error } = await client
    .from('lead_agent_assignments')
    .update({ status: 'removed', updated_at: new Date().toISOString() })
    .eq('organisation_id', requireUuid(organisationId, 'organisation id'))
    .eq('lead_id', requireUuid(leadId, 'lead id'))
    .eq('user_id', requireUuid(userId, 'agent id'))
  if (error) throw error
  return true
}
