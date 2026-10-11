import { isSupabaseConfigured, supabase } from '../lib/supabaseClient'
import { validateClientContactDetails } from '../core/clients/clientIdentity'

const missingIdentitySchema = (error) => ['42P01', 'PGRST205', 'PGRST202'].includes(error?.code)

async function readAllRows(query) {
  const rows = []
  for (let offset = 0; ; offset += 500) {
    const result = await query().range(offset, offset + 499)
    if (result.error) return result
    rows.push(...(result.data || []))
    if ((result.data || []).length < 500) return { data: rows, error: null }
  }
}

export async function loadClientIdentities(organisationId) {
  if (!isSupabaseConfigured || !supabase) return { available: false, profiles: [], identifiers: [], links: [], canManage: false }
  const results = await Promise.all([
    readAllRows(() => supabase.from('agency_client_profiles').select('*').eq('organisation_id', organisationId).order('id')),
    readAllRows(() => supabase.from('agency_client_identifiers').select('client_id,kind,value').eq('organisation_id', organisationId).order('id')),
    readAllRows(() => supabase.from('agency_client_links').select('client_id,source_kind,source_id').eq('organisation_id', organisationId).order('id')),
    supabase.rpc('bridge_agency_open_operations', { p_organisation_id: organisationId }),
  ])
  if (results.slice(0, 3).some((result) => missingIdentitySchema(result.error))) return { available: false, profiles: [], identifiers: [], links: [], canManage: false }
  for (const result of results) if (result.error) throw result.error
  return { available: true, profiles: results[0].data || [], identifiers: results[1].data || [], links: results[2].data || [], canManage: results[3].data === true }
}

export async function saveClientIdentity(client, details) {
  if (!client?.identityId) throw new Error('Permanent client profiles are not available yet.')
  const clean = validateClientContactDetails(details)
  const { data, error } = await supabase.rpc('agency_client_update', {
    p_client_id: client.identityId, p_expected_version: client.identityVersion,
    p_name: clean.name, p_emails: clean.emails, p_phones: clean.phones,
  })
  if (error) throw error
  return data
}

export async function mergeClientIdentities(primary, secondary, reason) {
  if (!primary?.identityId || !secondary?.identityId) throw new Error('Both clients need permanent profiles before merging.')
  if (!String(reason || '').trim()) throw new Error('Record why these profiles belong to the same client.')
  const { data, error } = await supabase.rpc('agency_client_merge', {
    p_primary_id: primary.identityId, p_secondary_id: secondary.identityId,
    p_primary_version: primary.identityVersion, p_secondary_version: secondary.identityVersion,
    p_reason: String(reason).trim(),
  })
  if (error) throw error
  return data
}

export async function loadClientMergeHistory(client) {
  if (!client?.identityId) return []
  const { data, error } = await supabase.from('agency_client_merge_audit').select('id,primary_id,secondary_id,actor_id,reason,created_at')
    .eq('organisation_id', client.organisationId).in('primary_id', [client.identityId, ...(client.mergedIdentityIds || [])]).order('created_at', { ascending: false })
  if (error) throw error
  return data || []
}
