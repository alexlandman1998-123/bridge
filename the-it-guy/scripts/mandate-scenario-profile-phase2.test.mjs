import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { mapSellerOnboardingToMandateData } from '../src/core/documents/mandateDataMapper.js'
import {
  isFullTitleMandateProperty,
  isSectionalMandateProperty,
  resolveMandateScenarioProfile,
  withMandateScenarioPlaceholders,
} from '../src/core/documents/mandateScenarioProfile.js'
import {
  listCanonicalMergeFields,
  normalizeMergeFieldPayload,
} from '../src/core/documents/mergeFieldRegistry.js'
import { evaluateVisibilityRules } from '../src/core/documents/sectionVisibilityRules.js'

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const packetWorkflow = await readFile(new URL('../src/core/documents/packetWorkflow.js', import.meta.url), 'utf8')
const settingsPage = await readFile(new URL('../src/pages/settings/SettingsSigningTemplatesPage.jsx', import.meta.url), 'utf8')

assert.equal(
  packageJson.scripts?.['test:mandate-scenario-profile-phase2'],
  'node scripts/mandate-scenario-profile-phase2.test.mjs',
  'package.json should expose the mandate scenario profile Phase 2 contract.',
)

const companyFullTitle = mapSellerOnboardingToMandateData({
  onboardingSubmission: {
    ownershipType: 'company',
    companyName: 'Example Seller Pty Ltd',
    companyRegistrationNumber: '2024/123456/07',
    companyDirectorName: 'Pat Director',
    authorisedRepresentativeCapacity: 'Director',
    propertyType: 'residential',
    propertyStructureType: 'freehold',
    propertyAddress: '10 Full Title Road',
    mandateType: 'sole',
  },
})

assert.equal(companyFullTitle.placeholders.seller_clause_profile, 'company')
assert.equal(companyFullTitle.placeholders.property_title_type, 'full_title')
assert.equal(companyFullTitle.placeholders.property_clause_profile, 'full_title')
assert.equal(companyFullTitle.placeholders.mandate_template_variant, 'company_full_title')
assert.match(companyFullTitle.placeholders.mandate_active_clause_packs, /seller_company_authority_pack/)
assert.match(companyFullTitle.placeholders.mandate_active_clause_packs, /property_full_title_pack/)
assert.doesNotMatch(companyFullTitle.placeholders.mandate_active_clause_packs, /property_sectional_title_pack/)

const marriedSectional = mapSellerOnboardingToMandateData({
  onboardingSubmission: {
    ownershipType: 'married_cop',
    sellerFirstName: 'Sam',
    sellerSurname: 'Seller',
    spouseFullName: 'Taylor Seller',
    spouseIdNumber: '9001015009087',
    spouseEmail: 'taylor@example.com',
    propertyType: 'apartment',
    propertyStructureType: 'sectional_title',
    unitNumber: '12',
    sectionNumber: '12',
    schemeName: 'Example Heights',
    propertyAddress: '12 Sectional Street',
    mandateType: 'sole',
  },
})

assert.equal(marriedSectional.placeholders.seller_clause_profile, 'individual_spouse_consent')
assert.equal(marriedSectional.placeholders.property_title_type, 'sectional_title')
assert.equal(marriedSectional.placeholders.property_clause_profile, 'sectional_title')
assert.equal(marriedSectional.placeholders.mandate_template_variant, 'individual_spouse_consent_sectional_title')
assert.match(marriedSectional.placeholders.mandate_active_clause_packs, /seller_individual_capacity_pack/)
assert.match(marriedSectional.placeholders.mandate_active_clause_packs, /seller_spouse_consent_pack/)
assert.match(marriedSectional.placeholders.mandate_active_clause_packs, /property_sectional_title_pack/)

const enriched = withMandateScenarioPlaceholders({
  seller_entity_type: 'Trust',
  property_title_type: 'share_block',
})
assert.equal(enriched.seller_clause_profile, 'trust')
assert.equal(enriched.property_clause_profile, 'sectional_title')
assert.equal(enriched.mandate_template_variant, 'trust_sectional_title')
assert.equal(isSectionalMandateProperty({ placeholders: enriched }), true)
assert.equal(isFullTitleMandateProperty({ placeholders: enriched }), false)

assert.deepEqual(
  resolveMandateScenarioProfile({
    placeholders: { seller_entity_type: 'individual', property_title_type: 'agricultural_holding' },
  }).activeClausePacks,
  ['seller_individual_capacity_pack', 'property_full_title_pack'],
)

const mandateFieldKeys = new Set(listCanonicalMergeFields({ packetType: 'mandate' }).map((field) => field.key))
for (const key of [
  'property_title_type',
  'mandate_template_variant',
  'mandate_clause_profile',
  'seller_clause_profile',
  'property_clause_profile',
]) {
  assert.equal(mandateFieldKeys.has(key), true, `Mandate registry should include ${key}.`)
}

const normalized = normalizeMergeFieldPayload({
  propertyStructureType: 'freehold',
  mandateVariant: 'company_full_title',
}, { packetType: 'mandate' }).payload
assert.equal(normalized.property_title_type, 'freehold')
assert.equal(normalized.mandate_template_variant, 'company_full_title')

assert.equal(
  evaluateVisibilityRules({ field: 'property_title_type', operator: 'in', value: 'full_title, agricultural_holding' }, companyFullTitle.placeholders),
  true,
  'Template visibility rules should resolve property title type aliases.',
)

for (const token of [
  "property_full_title_pack",
  "property_sectional_title_pack",
  "field: 'property_title_type'",
  "value: 'full_title, agricultural_holding'",
  "value: 'sectional_title, share_block'",
]) {
  assert.ok(settingsPage.includes(token), `Starter mandate template should include Phase 2 property pack support: ${token}`)
}

for (const token of [
  'withMandateScenarioPlaceholders',
  'isFullTitleMandateProperty',
  'isSectionalMandateProperty',
  "key: 'property_full_title_pack'",
  "key: 'property_sectional_title_pack'",
]) {
  assert.ok(packetWorkflow.includes(token), `Packet workflow should expose Phase 2 mandate scenario support: ${token}`)
}

console.log('Mandate scenario profile Phase 2 contract passed.')
