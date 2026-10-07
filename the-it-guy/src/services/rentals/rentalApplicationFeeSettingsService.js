import { supabase } from '../../lib/supabaseClient.js'
export async function getRentalApplicationFeeSettings(organisationId, { client = supabase } = {}) {
  const [result, access] = await Promise.all([
    client.from('rental_application_fee_settings').select('amount, payment_instructions, version').eq('organisation_id', organisationId).maybeSingle(),
    client.rpc('bridge_current_workspace_role', { workspace_id: organisationId }),
  ])
  if (result.error) throw result.error
  if (access.error) throw access.error
  return { amount: result.data?.amount ?? 0, paymentInstructions: result.data?.payment_instructions || '', version: result.data?.version ?? 0, canEdit: ['owner', 'principal', 'director', 'partner'].includes(access.data) }
}
export async function saveRentalApplicationFeeSettings(organisationId, settings, { client = supabase } = {}) {
  const result = await client.rpc('rental_save_application_fee_settings', { p_organisation_id: organisationId, p_amount: Number(settings.amount), p_payment_instructions: settings.paymentInstructions, p_expected_version: settings.version })
  if (result.error) throw result.error
  return result.data
}
