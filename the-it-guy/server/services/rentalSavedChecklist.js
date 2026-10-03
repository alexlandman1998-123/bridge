import { RENTAL_REQUIREMENT_FIELDS, mapRentalRequirement } from '../../src/services/rentals/rentalSavedRequirementModel.js'
export async function readRentalSavedChecklist(db, application) {
  const result = await db.from('rental_onboarding_requirement_summaries').select(RENTAL_REQUIREMENT_FIELDS).eq('application_id', application.id).eq('organisation_id', application.organisation_id)
  if (result.error) throw new Error('Unable to load the saved rental checklist. Check that the checklist migrations are applied and retry.')
  return (result.data || []).map(mapRentalRequirement)
}
