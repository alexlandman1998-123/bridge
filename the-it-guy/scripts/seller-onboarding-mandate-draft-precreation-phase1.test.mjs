import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

// This former precreation check now protects its permanent retirement.
const source = await readFile(new URL('../src/services/privateListingService.js', import.meta.url), 'utf8')
assert.doesNotMatch(source, /deferSellerOnboardingFollowUp\('mandate editable draft/)
assert.doesNotMatch(source, /import\(['"][^'"]*(?:packetService|documentPacketsApi)/)
assert.match(source, /export async function precreateSellerMandateDraftFromOnboarding\(\) \{\s*assertDocumentGeneratorAvailable\(\)/)
assert.match(source, /seller requirements sync after onboarding submit/)
assert.match(source, /export async function uploadPrivateListingDocument/)
console.log('Seller onboarding remains independent of the retired generator.')
