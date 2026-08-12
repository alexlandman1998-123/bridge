import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const privateListingService = await readFile(
  new URL('../src/services/privateListingService.js', import.meta.url),
  'utf8',
)

const helperStart = privateListingService.indexOf('export async function persistSellerProfileOnboardingFormData')
assert.notEqual(helperStart, -1, 'Phase 2 seller profile canonical persistence helper should be exported.')

const nextExport = privateListingService.indexOf('\nexport ', helperStart + 1)
const helperSource = privateListingService.slice(helperStart, nextExport === -1 ? undefined : nextExport)

assert.match(
  privateListingService,
  /function mergeSellerProfileCanonicalFormData\(existing = \{\}, patch = \{\}, options = \{\}, path = \[\]\)[\s\S]*?isPlainObject\(value\) && isPlainObject\(base\[key\]\)[\s\S]*?mergeSellerProfileCanonicalFormData\(base\[key\], value, options, nextPath\)/,
  'Seller profile persistence should merge nested profile data without replacing untouched onboarding sections.',
)
assert.match(
  privateListingService,
  /function shouldApplySellerProfileFormDataValue\(value, options = \{\}, path = \[\]\)[\s\S]*?if \(typeof value === 'string'\) return allowEmpty \|\| value\.trim\(\) !== ''[\s\S]*?if \(Array\.isArray\(value\)\) return allowEmpty \|\| value\.length > 0/,
  'Seller profile persistence should skip blank strings and empty arrays by default.',
)
assert.match(
  helperSource,
  /fetchSellerPortalOnboardingRowByToken\(client, normalizedToken, normalizedListingId\)/,
  'Seller profile persistence should resolve the canonical row by token or linked listing id.',
)
assert.match(
  helperSource,
  /\.from\('private_listing_seller_onboarding'\)/,
  'Seller profile persistence should write to private_listing_seller_onboarding.',
)
assert.doesNotMatch(
  helperSource,
  /\.from\('onboarding_form_data'\)/,
  'Seller profile persistence must not write to buyer onboarding_form_data.',
)
assert.match(
  helperSource,
  /form_data: nextFormData/,
  'Seller profile persistence should save the merged canonical form data.',
)
assert.match(
  helperSource,
  /existing\?\.id[\s\S]*?\.update\(payload\)[\s\S]*?\.eq\('id', existing\.id\)[\s\S]*?:[\s\S]*?\.insert\(payload\)/,
  'Seller profile persistence should update an existing row or insert when a linked listing has no row.',
)
assert.match(
  helperSource,
  /select\('id, private_listing_id, token, status, seller_type, ownership_structure, marital_regime, form_data, submitted_at, created_at, updated_at'\)/,
  'Seller profile persistence should return the canonical onboarding row needed by Phase 3.',
)

console.log('Seller onboarding profile canonical persistence Phase 2 contract passed.')
