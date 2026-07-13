import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  MANDATE_TEMPLATE_CONTENT_PACK_KEYS,
  MANDATE_TEMPLATE_CONTENT_RULE_VERSION,
  getMandateTemplateContentRule,
  getMandateTemplateSignalGroup,
  listMandateTemplateContentRules,
  listMandateTemplateSignalGroups,
  mandateTemplateSignalGroupIsAllowedForRoute,
  resolveMandateTemplateContentRuleProfile,
} from '../src/core/documents/mandateTemplateContentRules.js'

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
assert.equal(
  packageJson.scripts?.['test:mandate-template-content-rules-phase8'],
  'node scripts/mandate-template-content-rules-phase8.test.mjs',
  'package.json should expose the mandate template content rules Phase 8 contract.',
)

assert.equal(MANDATE_TEMPLATE_CONTENT_RULE_VERSION, 'mandate_template_content_rules_v1')

const routeRules = listMandateTemplateContentRules()
assert.deepEqual(
  routeRules.map((rule) => rule.key),
  [
    'default',
    'company_full_title',
    'company_sectional_title',
    'trust_full_title',
    'trust_sectional_title',
    'individual_full_title',
    'individual_sectional_title',
    'individual_spouse_consent_full_title',
    'individual_spouse_consent_sectional_title',
  ],
  'Phase 8 should define every mandate route we auto-select.',
)

const signalGroups = listMandateTemplateSignalGroups()
assert.deepEqual(
  signalGroups.map((group) => group.key),
  [
    'universal_mandate',
    'full_title',
    'sectional_title',
    'individual_capacity',
    'company_authority',
    'trust_authority',
    'spouse_consent',
  ],
  'Phase 8 should define all content signal groups the scanner will use.',
)

const defaultRule = getMandateTemplateContentRule('default')
for (const groupKey of ['full_title', 'sectional_title', 'individual_capacity', 'company_authority', 'trust_authority', 'spouse_consent']) {
  assert.ok(
    defaultRule.forbiddenUnconditionalSignalGroups.includes(groupKey),
    `Default mandate should forbid unconditional ${groupKey} wording.`,
  )
}
for (const packKey of Object.values(MANDATE_TEMPLATE_CONTENT_PACK_KEYS)) {
  assert.ok(defaultRule.allowedConditionalPackKeys.includes(packKey), `Default mandate should allow conditional pack ${packKey}.`)
}

const companyFullTitle = resolveMandateTemplateContentRuleProfile('company_full_title')
assert.equal(companyFullTitle.sellerProfile, 'company')
assert.equal(companyFullTitle.propertyProfile, 'full_title')
assert.ok(companyFullTitle.requiredSignalGroups.some((group) => group.key === 'company_authority'))
assert.ok(companyFullTitle.requiredSignalGroups.some((group) => group.key === 'full_title'))
assert.ok(companyFullTitle.forbiddenUnconditionalSignalGroups.some((group) => group.key === 'sectional_title'))
assert.equal(mandateTemplateSignalGroupIsAllowedForRoute('company_authority', 'company_full_title'), true)
assert.equal(mandateTemplateSignalGroupIsAllowedForRoute('sectional_title', 'company_full_title'), false)
assert.equal(
  mandateTemplateSignalGroupIsAllowedForRoute('sectional_title', 'default', {
    conditionalPackKey: MANDATE_TEMPLATE_CONTENT_PACK_KEYS.propertySectionalTitle,
  }),
  true,
  'Default mandate may contain sectional wording only inside the sectional conditional pack.',
)

const trustSectional = resolveMandateTemplateContentRuleProfile('trust_sectional_title')
assert.ok(trustSectional.requiredSignalGroups.some((group) => group.key === 'trust_authority'))
assert.ok(trustSectional.requiredSignalGroups.some((group) => group.key === 'sectional_title'))
assert.ok(trustSectional.forbiddenUnconditionalSignalGroups.some((group) => group.key === 'company_authority'))
assert.ok(trustSectional.forbiddenUnconditionalSignalGroups.some((group) => group.key === 'full_title'))

const spouseSectional = resolveMandateTemplateContentRuleProfile('individual_spouse_consent_sectional_title')
assert.ok(spouseSectional.requiredSignalGroups.some((group) => group.key === 'individual_capacity'))
assert.ok(spouseSectional.requiredSignalGroups.some((group) => group.key === 'spouse_consent'))
assert.ok(spouseSectional.requiredSignalGroups.some((group) => group.key === 'sectional_title'))
assert.ok(spouseSectional.forbiddenUnconditionalSignalGroups.some((group) => group.key === 'company_authority'))

const sectionalSignals = getMandateTemplateSignalGroup('sectional_title')
for (const token of ['property_unit_number', 'property_section_number', 'sectional_title_number', 'body_corporate_details', 'levy_amount']) {
  assert.ok(sectionalSignals.fieldKeys.includes(token), `Sectional rules should detect ${token}.`)
}
for (const phrase of ['body corporate', 'participation quota', 'share block']) {
  assert.ok(sectionalSignals.phrases.includes(phrase), `Sectional rules should detect phrase "${phrase}".`)
}

const fullTitleSignals = getMandateTemplateSignalGroup('full_title')
assert.ok(fullTitleSignals.fieldKeys.includes('erf_number'))
assert.ok(fullTitleSignals.phrases.includes('title deed'))

const companySignals = getMandateTemplateSignalGroup('company_authority')
assert.ok(companySignals.fieldKeys.includes('seller_company_registration_number'))
assert.ok(companySignals.phrases.includes('directors resolution'))

const trustSignals = getMandateTemplateSignalGroup('trust_authority')
assert.ok(trustSignals.fieldKeys.includes('seller_trustee_names'))
assert.ok(trustSignals.phrases.includes('letters of authority'))

const spouseSignals = getMandateTemplateSignalGroup('spouse_consent')
assert.ok(spouseSignals.fieldKeys.includes('seller_spouse_full_name'))
assert.ok(spouseSignals.phrases.includes('married in community of property'))

const source = await readFile(new URL('../src/core/documents/mandateTemplateContentRules.js', import.meta.url), 'utf8')
for (const token of [
  'MANDATE_TEMPLATE_CONTENT_SIGNAL_GROUPS',
  'forbiddenUnconditionalSignalGroups',
  'allowedConditionalPackKeys',
  'recommendedPackKeys',
  'Move sectional wording into the Sectional Title Property Pack',
]) {
  assert.ok(source.includes(token), `Content rules source should include ${token}.`)
}

console.log('Mandate template content rules Phase 8 contract passed.')
