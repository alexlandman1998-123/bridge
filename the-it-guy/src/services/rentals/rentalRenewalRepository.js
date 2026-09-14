import { isSupabaseConfigured, supabase } from '../../lib/supabaseClient.js'

const text = (value) => String(value ?? '').trim()
const requireClient = (client = supabase) => { if (!isSupabaseConfigured || !client) throw new Error('Rental renewals require Supabase configuration.'); return client }

export async function getRentalTenancyRenewal(tenancyId, { client = supabase } = {}) {
  const db = requireClient(client)
  const result = await db.from('rental_renewals').select('id, tenancy_id, source_lease_version_id, status, proposal_version, proposed_terms, response_due_on, decision_note, decided_at, created_at, updated_at').eq('tenancy_id', text(tenancyId)).order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (result.error) throw result.error
  if (!result.data) return null
  const generated = await db.from('rental_renewal_lease_versions').select('renewal_lease_version_id, signing_status, generated_at').eq('renewal_id', result.data.id).maybeSingle()
  if (generated.error) throw generated.error
  return { ...result.data, generatedLeaseVersion: generated.data || null }
}

export async function openRentalRenewal({ tenancyId, responseDueOn } = {}, { client = supabase } = {}) {
  const result = await requireClient(client).rpc('rental_open_renewal', { p_tenancy_id: text(tenancyId), p_response_due_on: responseDueOn || null })
  if (result.error) throw result.error
  return result.data
}

export async function saveRentalRenewalTerms({ renewalId, expectedProposalVersion, terms, responseDueOn } = {}, { client = supabase } = {}) {
  const result = await requireClient(client).rpc('rental_save_renewal_terms', { p_renewal_id: text(renewalId), p_expected_version: Number(expectedProposalVersion), p_terms: terms || {}, p_response_due_on: responseDueOn || null })
  if (result.error) throw result.error
  return result.data
}

export async function decideRentalRenewal({ renewalId, expectedProposalVersion, decision, note } = {}, { client = supabase } = {}) {
  const result = await requireClient(client).rpc('rental_decide_renewal', { p_renewal_id: text(renewalId), p_expected_version: Number(expectedProposalVersion), p_decision: text(decision), p_note: text(note) || null })
  if (result.error) throw result.error
  return result.data
}

export async function generateRentalRenewalLeaseVersion({ renewalId, expectedProposalVersion } = {}, { client = supabase } = {}) {
  const result = await requireClient(client).rpc('rental_generate_renewal_lease_version', { p_renewal_id: text(renewalId), p_expected_proposal_version: Number(expectedProposalVersion) })
  if (result.error) throw result.error
  return result.data
}
