import { isSupabaseConfigured, supabase } from '../../lib/supabaseClient.js'
import { createRentalApplicantAccess } from './rentalApplicantAccessModel.js'
import { mapPersistedRentalApplication } from './rentalApplicationRepository.js'
const text = value => String(value ?? '').trim()
const client = db => {
  if (!db || (!isSupabaseConfigured && db === supabase)) throw new Error('Rental applications require a configured connection.')
  return db
}
function failure(error) {
  return new Error(['42883','PGRST202'].includes(error?.code) ? 'Tenant application linking is not yet available in this environment.' : error?.message || 'Unable to prepare the tenant application.')
}
export async function listRentalTenantApplicationChoices(organisationId, branchId = '', { client: db = supabase } = {}) {
  if (!text(organisationId)) return []
  const result = await client(db).rpc('rental_tenant_application_choices', { p_organisation_id: organisationId, p_branch_id: text(branchId) || null })
  if (result.error) throw failure(result.error)
  if (!Array.isArray(result.data)) throw new Error('The saved rental vacancies could not be confirmed.')
  return result.data
}
export async function prepareRentalTenantApplication(organisationId, leadId, vacancyId, { client: db = supabase } = {}) {
  if (!text(organisationId) || !text(leadId) || !text(vacancyId)) throw new Error('Choose a tenant lead and its saved rental vacancy.')
  const result = await client(db).rpc('rental_prepare_tenant_application', { p_organisation_id: organisationId, p_lead_id: leadId, p_vacancy_id: vacancyId })
  if (result.error) throw failure(result.error)
  if (!result.data?.id || result.data.lead_id !== leadId || result.data.vacancy_id !== vacancyId || result.data.organisation_id !== organisationId) throw new Error('The application connection could not be confirmed. Refresh this tenant lead.')
  return mapPersistedRentalApplication(result.data)
}
export async function issueRentalTenantApplicationInvite(application, { expiresInMinutes = 10080, client: db = supabase } = {}) {
  if (!application?.id || application.status !== 'draft') throw new Error('Open the submitted application to collect its outstanding documents.')
  const access = await createRentalApplicantAccess({ applicationId: application.id, expiresInMinutes })
  const result = await client(db).rpc('rental_issue_tenant_application_access', { p_application_id: application.id, p_expected_version: application.version, p_token_hash: access.tokenHash, p_expires_at: access.expiresAt })
  if (result.error) throw failure(result.error)
  if (!result.data?.id || result.data.application?.id !== application.id) throw new Error('The application link could not be confirmed. Refresh before preparing another link.')
  return { ...access, id: result.data.id, expiresAt: result.data.expiresAt, application: mapPersistedRentalApplication(result.data.application) }
}

export async function revokeRentalTenantApplicationInvite(application, { client: db = supabase } = {}) {
  if (!application?.id || application.status !== 'draft') throw new Error('Only a draft application invitation can be revoked.')
  const result = await client(db).rpc('rental_revoke_tenant_application_access', { p_application_id: application.id, p_expected_version: application.version })
  if (result.error) throw failure(result.error)
  if (result.data?.id !== application.id || !result.data.application_data?.onboarding?.revokedAt) throw new Error('Invitation revocation could not be confirmed. Refresh its saved details.')
  return mapPersistedRentalApplication(result.data)
}
