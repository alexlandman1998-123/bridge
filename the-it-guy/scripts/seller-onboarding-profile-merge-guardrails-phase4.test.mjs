import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const privateListingService = await readFile(
  new URL('../src/services/privateListingService.js', import.meta.url),
  'utf8',
)
const agencyPipelinePage = await readFile(
  new URL('../src/pages/agency/AgencyPipelinePage.jsx', import.meta.url),
  'utf8',
)

const protectedKeysStart = privateListingService.indexOf('const SELLER_PROFILE_CANONICAL_PROTECTED_FORM_DATA_KEYS = new Set([')
assert.notEqual(protectedKeysStart, -1, 'Phase 4 should define protected seller onboarding/disclosure sections.')
const protectedKeysEnd = privateListingService.indexOf('])', protectedKeysStart)
const protectedKeysSource = privateListingService.slice(protectedKeysStart, protectedKeysEnd)
for (const protectedKey of ['property_disclosure', 'property_condition_disclosure', 'required_documents', 'canonical_seller_facts']) {
  assert.ok(protectedKeysSource.includes(`'${protectedKey}'`), `Phase 4 should protect ${protectedKey}.`)
}
assert.match(
  privateListingService,
  /function isProtectedSellerProfileCanonicalPath\(path = \[\], \{ allowProtectedSectionOverride = false \} = \{\}\)[\s\S]*?allowProtectedSectionOverride[\s\S]*?SELLER_PROFILE_CANONICAL_PROTECTED_FORM_DATA_KEYS\.has\(part\)/,
  'Phase 4 should skip protected sections unless an explicit protected-section override is passed.',
)
assert.match(
  privateListingService,
  /function isSellerProfileExplicitClearPath\(path = \[\], explicitClearFields = \[\]\)[\s\S]*?some\(\(field\) => field === normalizedPath\)/,
  'Phase 4 should require explicit clear field paths for targeted clearing.',
)
assert.match(
  privateListingService,
  /const allowEmpty = Boolean\(options\.allowEmptyOverride \|\| isSellerProfileExplicitClearPath\(path, options\.explicitClearFields\)\)/,
  'Phase 4 should allow empty overwrites only through global or field-specific explicit clearing.',
)
assert.match(
  privateListingService,
  /const nextPath = \[\.\.\.path, key\][\s\S]*?if \(isProtectedSellerProfileCanonicalPath\(nextPath, options\)\) continue[\s\S]*?shouldApplySellerProfileFormDataValue\(value, options, nextPath\)/,
  'Phase 4 should evaluate protected and empty-value guardrails per nested merge path.',
)
assert.match(
  privateListingService,
  /allowProtectedSectionOverride = false,[\s\S]*?explicitClearFields = \[\],[\s\S]*?mergeSellerProfileCanonicalFormData\(existingFormData, formData, \{[\s\S]*?allowProtectedSectionOverride,[\s\S]*?explicitClearFields,/,
  'Phase 4 should expose protected-section and explicit-clear options on the canonical persistence helper.',
)

const handlerStart = agencyPipelinePage.indexOf('async function handleSaveSellerLeadEditDetails(event)')
assert.notEqual(handlerStart, -1, 'Seller profile save handler should exist.')
const nextHandler = agencyPipelinePage.indexOf('\n  async function ', handlerStart + 1)
const handlerSource = agencyPipelinePage.slice(handlerStart, nextHandler === -1 ? undefined : nextHandler)

assert.doesNotMatch(
  handlerSource,
  /allowProtectedSectionOverride:\s*true|allowEmptyOverride:\s*true/,
  'Seller profile save should not bypass Phase 4 guardrails by default.',
)

console.log('Seller onboarding profile merge guardrails Phase 4 contract passed.')
