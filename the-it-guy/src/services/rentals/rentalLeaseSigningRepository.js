import { isSupabaseConfigured, supabase } from '../../lib/supabaseClient.js'

const text = (value) => String(value ?? '').trim()
const requireClient = (client = supabase) => { if (!isSupabaseConfigured || !client) throw new Error('Rental lease signing requires Supabase configuration.'); return client }

export async function getRentalLeaseSigningWorkspace(tenancyId, { client = supabase } = {}) {
  const db = requireClient(client)
  const summary = await db.rpc('rental_get_tenancy_workspace_summary', { p_tenancy_id: text(tenancyId) })
  if (summary.error) throw summary.error
  const leaseId = summary.data?.lease?.id
  if (!leaseId) throw new Error('This tenancy has no lease.')
  const version = await db.from('rental_lease_versions').select('id, version_number, status, is_current, effective_start_date, effective_end_date, occupation_date, monthly_rent, deposit_amount, terms_json').eq('lease_id', leaseId).eq('is_current', true).maybeSingle()
  if (version.error) throw version.error
  const signers = version.data ? await db.from('rental_lease_signers').select('id, signer_role, signer_name, signer_email, status, signed_at, signed_document_link, evidence_note').eq('lease_version_id', version.data.id).order('signer_role') : { data: [], error: null }
  if (signers.error) throw signers.error
  return { ...(summary.data || {}), version: version.data || null, signers: signers.data || [] }
}

export async function saveRentalLeaseDraft({ leaseId, expectedVersion, terms } = {}, { client = supabase } = {}) {
  const result = await requireClient(client).rpc('rental_save_lease_draft', { p_lease_id: text(leaseId), p_expected_version: Number(expectedVersion), p_terms_json: terms || {} })
  if (result.error) throw result.error
  return result.data
}

export async function prepareRentalLeaseSigning({ leaseId, expectedVersion, signers } = {}, { client = supabase } = {}) {
  const result = await requireClient(client).rpc('rental_prepare_lease_signing', { p_lease_id: text(leaseId), p_expected_version: Number(expectedVersion), p_signers: signers || [] })
  if (result.error) throw result.error
  return result.data
}

export async function recordRentalLeaseSignature({ signerId, outcome = 'signed', documentLink, evidenceNote } = {}, { client = supabase } = {}) {
  const result = await requireClient(client).rpc('rental_record_lease_signature', { p_signer_id: text(signerId), p_outcome: text(outcome), p_document_link: text(documentLink) || null, p_evidence_note: text(evidenceNote) || null })
  if (result.error) throw result.error
  return result.data
}
