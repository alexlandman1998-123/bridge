import {
  expireStaleSuggestions,
  generateAllSuggestions,
  generateSuggestionsForLead,
  generateSuggestionsForListing,
  generateSuggestionsForRequirement,
} from './leadSuggestionService'

export function generateSuggestionsOnDemand(payload = {}) {
  if (payload.requirementId) return generateSuggestionsForRequirement(payload)
  if (payload.listingId) return generateSuggestionsForListing(payload)
  if (payload.leadId) return generateSuggestionsForLead(payload)
  return generateAllSuggestions(payload)
}

export function runSuggestionBatchRefresh({ organisationId = '', limitPerRequirement = 20, force = false } = {}) {
  return generateAllSuggestions({ organisationId, limitPerRequirement, force })
}

export async function runNightlySuggestionRefresh({ organisationId = '', expiryDays = 30, limitPerRequirement = 20 } = {}) {
  const expired = await expireStaleSuggestions({ organisationId, days: expiryDays })
  const generated = await generateAllSuggestions({ organisationId, limitPerRequirement, force: false })
  return { expired, generated }
}

export function queueRequirementSuggestionGeneration(requirement = {}, { force = false } = {}) {
  if (!requirement?.organisationId || !requirement?.requirementId || requirement.status !== 'active') return
  void generateSuggestionsForRequirement({
    organisationId: requirement.organisationId,
    requirementId: requirement.requirementId,
    force,
    generatedBy: 'requirement_trigger',
  }).catch((error) => {
    console.warn('[suggestionGenerationService] requirement suggestion generation skipped', error)
  })
}

export function queueListingSuggestionGeneration(listing = {}, { force = false } = {}) {
  const organisationId = listing?.organisationId || listing?.organisation_id
  const listingId = listing?.id || listing?.listingId || listing?.listing_id
  if (!organisationId || !listingId) return
  void generateSuggestionsForListing({
    organisationId,
    listingId,
    force,
    generatedBy: 'listing_trigger',
  }).catch((error) => {
    console.warn('[suggestionGenerationService] listing suggestion generation skipped', error)
  })
}

export const __suggestionGenerationServiceTestUtils = {
  generateSuggestionsOnDemand,
  runNightlySuggestionRefresh,
  runSuggestionBatchRefresh,
}
