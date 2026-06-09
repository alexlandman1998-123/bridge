import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const source = await readFile(new URL('../src/pages/AgentListings.jsx', import.meta.url), 'utf8')

assert.match(
  source,
  /function validateQuickListingMinimumFields\(\{ form, assignedAgentKey, requireAssignedAgent = true \}\)/,
  'Quick Add should have a dedicated minimum validation path with optional assigned-agent enforcement.',
)

assert.match(
  source,
  /Property address or listing title is required\./,
  'Quick Add draft creation should allow property address or listing title as the location anchor.',
)

assert.match(
  source,
  /sellerOnboardingStatus: 'not_started'/,
  'Quick Add Supabase persistence must not mark seller onboarding completed.',
)

assert.doesNotMatch(
  source,
  /sellerOnboardingStatus: 'completed'/,
  'Quick Add should not persist completed onboarding for agent-captured listings.',
)

assert.match(
  source,
  /function getQuickListingMandateStatus\(form = \{\}\) \{\n\s+return hasQuickListingSignedMandate\(form\) \? 'signed' : 'not_started'/,
  'Quick Add should persist only DB-safe mandate statuses.',
)

assert.doesNotMatch(
  source,
  /const mandateStatus = mandateSigned && mandateUploaded \? 'signed_uploaded' : 'missing'/,
  'Quick Add should not use local-only mandate status values for persisted status decisions.',
)

assert.match(
  source,
  /listingStatus: resolvedListingIsActive \? 'listing_review' : resolvedListingStatus/,
  'Supabase Quick Add should create as listing review before any signed mandate upload promotes it to active.',
)

assert.match(
  source,
  /sellerUpdatePayload\.listingStatus = 'active'/,
  'Quick Add should promote to active only after signed mandate upload succeeds.',
)

assert.match(
  source,
  /Upload the signed mandate before marking the listing Active\./,
  'Active listing selection should remain guarded by signed mandate upload.',
)

console.log('quick-add-listing-bypass tests passed')
