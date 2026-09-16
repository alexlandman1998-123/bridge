import { isSupabaseConfigured, supabase } from '../../lib/supabaseClient.js'

const text = (value) => String(value ?? '').trim()
const requireClient = (client = supabase) => { if (!isSupabaseConfigured || !client) throw new Error('Owner workspace requires Supabase configuration.'); return client }
const unavailable = (error = {}) => { const missing = ['42P01', 'PGRST204', 'PGRST205'].includes(String(error.code || '').toUpperCase()); return new Error(missing ? 'Owner workspace migrations have not been applied to this environment yet.' : (error.message || 'Owner workspace request failed.')) }
const mapProfile = (row = {}) => ({ id: text(row.id), organisationId: text(row.organisation_id), partyId: text(row.party_id), assignedManagerId: text(row.assigned_manager_id), ownerType: text(row.owner_type), ownerReference: text(row.owner_reference), complianceStatus: text(row.compliance_status), bankingStatus: text(row.banking_status), portalStatus: text(row.portal_status), preferredContactChannel: text(row.preferred_contact_channel), metadata: row.metadata_json || {} })
const mapApproval = (row = {}) => ({ id: text(row.id), propertyId: text(row.property_id), approvalType: text(row.approval_type), status: text(row.status), summary: text(row.summary), dueAt: row.due_at || null, resolvedAt: row.resolved_at || null, createdAt: row.created_at || null })
const mapActivity = (row = {}) => ({ id: text(row.id), propertyId: text(row.property_id), activityType: text(row.activity_type), description: text(row.description), occurredAt: row.occurred_at || null })

export async function getRentalOwnerProfile({ organisationId = '', partyId = '' } = {}, { client = supabase } = {}) {
  if (!text(organisationId) || !text(partyId)) return null
  const result = await requireClient(client).from('rental_owner_profiles').select('*').eq('organisation_id', text(organisationId)).eq('party_id', text(partyId)).maybeSingle()
  if (result.error) throw unavailable(result.error)
  return result.data ? mapProfile(result.data) : null
}
export async function upsertRentalOwnerProfile(values = {}, { client = supabase } = {}) {
  const organisationId = text(values.organisationId); const partyId = text(values.partyId)
  if (!organisationId || !partyId) throw new Error('An existing landlord contact is required for an owner profile.')
  const payload = { organisation_id: organisationId, party_id: partyId, assigned_manager_id: text(values.assignedManagerId) || null, owner_type: text(values.ownerType) || 'individual', owner_reference: text(values.ownerReference) || null, compliance_status: text(values.complianceStatus) || 'not_started', banking_status: text(values.bankingStatus) || 'not_started', portal_status: text(values.portalStatus) || 'not_invited', preferred_contact_channel: text(values.preferredContactChannel) || null, metadata_json: values.metadata && typeof values.metadata === 'object' ? values.metadata : {}, created_by: text(values.createdBy) || null }
  const result = await requireClient(client).from('rental_owner_profiles').upsert(payload, { onConflict: 'organisation_id,party_id' }).select('*').single()
  if (result.error) throw unavailable(result.error)
  return mapProfile(result.data)
}
export async function listRentalOwnerApprovals(profileId = '', { client = supabase } = {}) {
  if (!text(profileId)) return []
  const result = await requireClient(client).from('rental_owner_approvals').select('*').eq('owner_profile_id', text(profileId)).order('created_at', { ascending: false })
  if (result.error) throw unavailable(result.error)
  return (result.data || []).map(mapApproval)
}
export async function listRentalOwnerActivity(profileId = '', { client = supabase } = {}) {
  if (!text(profileId)) return []
  const result = await requireClient(client).from('rental_owner_activity').select('*').eq('owner_profile_id', text(profileId)).order('occurred_at', { ascending: false }).limit(50)
  if (result.error) throw unavailable(result.error)
  return (result.data || []).map(mapActivity)
}
export async function createRentalOwnerActivity(values = {}, { client = supabase } = {}) {
  if (!text(values.organisationId) || !text(values.profileId) || !text(values.description)) throw new Error('Owner activity needs an owner profile and description.')
  const result = await requireClient(client).from('rental_owner_activity').insert({ organisation_id: text(values.organisationId), owner_profile_id: text(values.profileId), property_id: text(values.propertyId) || null, activity_type: text(values.activityType) || 'profile_updated', description: text(values.description), occurred_by: text(values.occurredBy) || null }).select('*').single()
  if (result.error) throw unavailable(result.error)
  return mapActivity(result.data)
}
