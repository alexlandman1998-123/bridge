import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  resolveMandateTemplateRoutingProfile,
  scoreMandateTemplateCandidate,
  selectMandateTemplateCandidate,
} from '../src/core/documents/mandateTemplateRouting.js'

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
assert.equal(
  packageJson.scripts?.['test:mandate-template-variant-pack-phase4'],
  'node scripts/mandate-template-variant-pack-phase4.test.mjs',
  'package.json should expose the mandate template variant pack Phase 4 contract.',
)

const settingsSource = await readFile(new URL('../src/pages/settings/SettingsSigningTemplatesPage.jsx', import.meta.url), 'utf8')
for (const token of [
  "{ key: 'default', label: 'All mandate situations' }",
  'creatingMandateVariants',
  'mandateVariantCoverageRows',
  'missingMandateVariantOptions',
  'createMandateVariantTemplate',
  'handleCreateMissingMandateVariantTemplates',
  'mandate_variant_scaffold',
  'Variant Pack',
  'Create Missing Variants',
]) {
  assert.ok(settingsSource.includes(token), `Template settings should include ${token}.`)
}

for (const routeKey of [
  'company_full_title',
  'company_sectional_title',
  'trust_full_title',
  'trust_sectional_title',
  'individual_full_title',
  'individual_sectional_title',
  'individual_spouse_consent_full_title',
  'individual_spouse_consent_sectional_title',
]) {
  assert.ok(settingsSource.includes(routeKey), `Template settings should expose route ${routeKey}.`)
}

const companyFullTitleProfile = resolveMandateTemplateRoutingProfile({
  placeholders: {
    seller_entity_type: 'company',
    property_title_type: 'full_title',
  },
})
const defaultTemplate = {
  id: 'default',
  template_key: 'mandate_default_v1',
  is_default: true,
  status: 'published',
  metadata_json: {
    mandate_template_variant: 'default',
  },
}
const untaggedTemplate = {
  id: 'untagged',
  template_key: 'mandate_agency_generic',
  status: 'published',
  metadata_json: {},
}
const companyFullTitleTemplate = {
  id: 'company-full-title',
  template_key: 'mandate_company_full_title',
  status: 'published',
  metadata_json: {
    mandate_template_variant: 'company_full_title',
  },
}

assert.equal(
  scoreMandateTemplateCandidate(defaultTemplate, { scenarioProfile: companyFullTitleProfile }).compatible,
  true,
  'Default route metadata should behave as a fallback, not a mismatch.',
)
assert.equal(
  scoreMandateTemplateCandidate(defaultTemplate, { scenarioProfile: companyFullTitleProfile }).score,
  scoreMandateTemplateCandidate(untaggedTemplate, { scenarioProfile: companyFullTitleProfile }).score,
  'Default and untagged fallback templates should tie before ownership/default tie breakers.',
)
assert.equal(
  selectMandateTemplateCandidate([defaultTemplate, companyFullTitleTemplate], {
    scenarioProfile: companyFullTitleProfile,
  }).template.id,
  'company-full-title',
  'Specific route templates should outrank default fallback templates.',
)

console.log('Mandate template variant pack Phase 4 contract passed.')
