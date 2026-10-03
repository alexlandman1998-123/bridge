import { RENTAL_REQUIREMENT_FIELDS, mapRentalRequirement } from './rentalSavedRequirementModel.js'
import { isSupabaseConfigured, supabase } from '../../lib/supabaseClient.js'

export async function listRentalOnboardingRequirements({ applicationId = '', landlordLeadId = '' } = {}, { client = supabase } = {}) {
  if (Boolean(applicationId) === Boolean(landlordLeadId)) throw new Error('Choose one rental application or landlord lead.')
  if (!client || (client === supabase && !isSupabaseConfigured)) throw new Error('Rental requirements require Supabase configuration.')
  const result = await client.from('rental_onboarding_requirement_summaries').select(`${RENTAL_REQUIREMENT_FIELDS}, organisation_id`).eq(applicationId ? 'application_id' : 'landlord_lead_id', applicationId || landlordLeadId).order('scope_key').order('subject_id').order('purpose')
  if (result.error) throw new Error(['42P01', 'PGRST204', 'PGRST205'].includes(result.error.code) ? 'The saved rental checklist foundation has not been applied to this environment.' : result.error.message || 'Unable to load rental requirements.')
  return (result.data || []).map((row) => ({ ...mapRentalRequirement(row), organisationId: row.organisation_id }))
}
