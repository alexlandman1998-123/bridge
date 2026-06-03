import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { createServer } from 'vite'

const migrationSource = await fs.readFile(new URL('../../supabase/migrations/202606030008_lead_listing_suggestions.sql', import.meta.url), 'utf8')
assert.match(migrationSource, /create table if not exists public\.lead_listing_suggestions/)
for (const field of [
  'suggestion_id',
  'organisation_id',
  'lead_id',
  'requirement_id',
  'listing_id',
  'score',
  'reasons',
  'status',
  'generated_by',
  'generated_at',
  'reviewed_by',
  'reviewed_at',
  'accepted_at',
  'rejected_at',
  'metadata',
]) {
  assert.match(migrationSource, new RegExp(field), `migration should include ${field}`)
}
for (const status of ['pending', 'accepted', 'rejected', 'expired', 'converted']) {
  assert.match(migrationSource, new RegExp(status), `migration should allow ${status}`)
}
assert.match(migrationSource, /unique \(lead_id, requirement_id, listing_id\)/)
assert.match(migrationSource, /enable row level security/)
assert.match(migrationSource, /bridge_is_active_member/)

const suggestionServiceSource = await fs.readFile(new URL('../src/services/leadSuggestionService.js', import.meta.url), 'utf8')
for (const method of [
  'generateSuggestionsForRequirement',
  'generateSuggestionsForLead',
  'generateSuggestionsForListing',
  'generateAllSuggestions',
  'acceptSuggestion',
  'rejectSuggestion',
  'expireSuggestion',
  'getSuggestionsForLead',
  'getSuggestionsForListing',
]) {
  assert.match(suggestionServiceSource, new RegExp(`export (async )?function ${method}`), `suggestion service should export ${method}`)
}
assert.match(suggestionServiceSource, /scoreListingAgainstRequirement/)
assert.match(suggestionServiceSource, /findListingsForRequirement/)
assert.match(suggestionServiceSource, /upsertLeadListingInterest/)
assert.match(suggestionServiceSource, /source: 'automated_suggestion'/)
assert.match(suggestionServiceSource, /isAgentSelected: true/)
assert.doesNotMatch(suggestionServiceSource, /openai|machine learning|sendWhatsApp|sendEmail|createTransaction/i)

const generationServiceSource = await fs.readFile(new URL('../src/services/suggestionGenerationService.js', import.meta.url), 'utf8')
for (const method of [
  'generateSuggestionsOnDemand',
  'runSuggestionBatchRefresh',
  'runNightlySuggestionRefresh',
  'queueRequirementSuggestionGeneration',
  'queueListingSuggestionGeneration',
]) {
  assert.match(generationServiceSource, new RegExp(`export (async )?function ${method}`), `generation service should export ${method}`)
}

const requirementServiceSource = await fs.readFile(new URL('../src/services/leadRequirementService.js', import.meta.url), 'utf8')
assert.match(requirementServiceSource, /queueRequirementSuggestionGeneration/)
assert.match(requirementServiceSource, /budget_max/)
assert.match(requirementServiceSource, /property_types/)

const listingServiceSource = await fs.readFile(new URL('../src/services/privateListingService.js', import.meta.url), 'utf8')
assert.match(listingServiceSource, /queueListingSuggestionGeneration/)
assert.match(listingServiceSource, /asking_price/)
assert.match(listingServiceSource, /listing_status/)

const leadWorkspaceSource = await fs.readFile(new URL('../src/pages/AgentLeadsPage.jsx', import.meta.url), 'utf8')
for (const copy of ['Suggestions', 'Accept', 'Reject', 'Open Listing', 'Regenerate']) {
  assert.match(leadWorkspaceSource, new RegExp(copy), `lead workspace should render ${copy}`)
}
assert.match(leadWorkspaceSource, /acceptSuggestion/)
assert.match(leadWorkspaceSource, /rejectSuggestion/)

const listingWorkspaceSource = await fs.readFile(new URL('../src/pages/AgentListingDetail.jsx', import.meta.url), 'utf8')
for (const copy of ['Suggested Leads', 'Generate', 'Accept', 'Reject', 'Open Lead']) {
  assert.match(listingWorkspaceSource, new RegExp(copy), `listing workspace should render ${copy}`)
}
assert.match(listingWorkspaceSource, /getSuggestionsForListing/)
assert.match(listingWorkspaceSource, /generateSuggestionsForListing/)

const analyticsSource = await fs.readFile(new URL('../src/services/leadAnalyticsService.js', import.meta.url), 'utf8')
assert.match(analyticsSource, /lead_listing_suggestions/)
assert.match(analyticsSource, /getSuggestionMetrics/)
assert.match(analyticsSource, /suggestionToViewingRate/)

const reportingPageSource = await fs.readFile(new URL('../src/pages/AgentReportingPage.jsx', import.meta.url), 'utf8')
for (const copy of ['Suggestions Generated', 'Suggestions Accepted', 'Suggestions Rejected', 'Suggestion to Viewing']) {
  assert.match(reportingPageSource, new RegExp(copy), `analytics dashboard should render ${copy}`)
}

const server = await createServer({
  root: process.cwd(),
  logLevel: 'silent',
  server: { middlewareMode: true },
})

try {
  const { __leadSuggestionServiceTestUtils } = await server.ssrLoadModule('/src/services/leadSuggestionService.js')
  const {
    buildSuggestionPayload,
    isSuggestionEligibleListing,
    mapLeadListingSuggestion,
    normalizeStatus,
    shouldRegenerate,
  } = __leadSuggestionServiceTestUtils

  const suggestion = mapLeadListingSuggestion({
    suggestion_id: '11111111-1111-4111-8111-111111111111',
    organisation_id: '22222222-2222-4222-8222-222222222222',
    lead_id: '33333333-3333-4333-8333-333333333333',
    requirement_id: '44444444-4444-4444-8444-444444444444',
    listing_id: '55555555-5555-4555-8555-555555555555',
    score: '82',
    reasons: [{ text: 'Price within budget' }],
    status: 'pending',
    generated_at: '2026-06-03T08:00:00.000Z',
  })
  assert.equal(suggestion.score, 82)
  assert.equal(suggestion.status, 'pending')
  assert.equal(suggestion.reasons[0].text, 'Price within budget')

  const payload = buildSuggestionPayload({
    organisationId: '22222222-2222-4222-8222-222222222222',
    leadId: '33333333-3333-4333-8333-333333333333',
    requirementId: '44444444-4444-4444-8444-444444444444',
    listingId: '55555555-5555-4555-8555-555555555555',
    score: 74,
    reasons: ['Area match'],
    status: 'pending',
  })
  assert.equal(payload.organisation_id, '22222222-2222-4222-8222-222222222222')
  assert.equal(payload.status, 'pending')
  assert.equal(payload.reasons[0], 'Area match')
  assert.throws(() => buildSuggestionPayload({ organisationId: 'bad-id' }), /Valid organisation/)

  assert.equal(normalizeStatus('Accepted'), 'accepted')
  assert.equal(normalizeStatus('unknown'), 'pending')
  assert.equal(isSuggestionEligibleListing({ status: 'active' }), true)
  assert.equal(isSuggestionEligibleListing({ status: 'sold' }), false)
  assert.equal(isSuggestionEligibleListing({ listingVisibility: 'archived' }), false)
  assert.equal(shouldRegenerate(null), true)
  assert.equal(shouldRegenerate({ status: 'pending' }), true)
  assert.equal(shouldRegenerate({ status: 'rejected' }), false)
  assert.equal(shouldRegenerate({ status: 'rejected' }, { force: true }), true)
  assert.equal(shouldRegenerate({ status: 'accepted' }, { force: true }), false)

  const { __leadAnalyticsServiceTestUtils } = await server.ssrLoadModule('/src/services/leadAnalyticsService.js')
  const { getSuggestionMetrics } = __leadAnalyticsServiceTestUtils
  const metrics = getSuggestionMetrics({
    suggestions: [
      { suggestion_id: 'sug-1', lead_id: 'lead-1', listing_id: 'listing-1', status: 'accepted' },
      { suggestion_id: 'sug-2', lead_id: 'lead-2', listing_id: 'listing-2', status: 'rejected' },
      { suggestion_id: 'sug-3', lead_id: 'lead-3', listing_id: 'listing-3', status: 'pending' },
    ],
    interests: [
      { interest_id: 'interest-1', lead_id: 'lead-1', listing_id: 'listing-1', source: 'automated_suggestion' },
    ],
    appointments: [
      { appointment_id: 'appt-1', lead_id: 'lead-1', listing_id: 'listing-1' },
    ],
    offers: [
      { id: 'offer-1', lead_id: 'lead-1', listing_id: 'listing-1' },
    ],
    transactions: [
      { id: 'tx-1', originating_buyer_lead_id: 'lead-1', listing_id: 'listing-1' },
    ],
  })
  assert.equal(metrics.generated, 3)
  assert.equal(metrics.accepted, 1)
  assert.equal(metrics.rejected, 1)
  assert.equal(metrics.pending, 1)
  assert.equal(metrics.suggestionToViewingRate, 33.3)
  assert.equal(metrics.suggestionToOfferRate, 33.3)
  assert.equal(metrics.suggestionToTransactionRate, 33.3)
} finally {
  await server.close()
}

console.log('lead suggestions tests passed')
