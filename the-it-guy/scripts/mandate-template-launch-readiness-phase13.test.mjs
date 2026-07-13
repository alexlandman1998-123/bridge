import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  MANDATE_TEMPLATE_LAUNCH_READINESS_VERSION,
  buildMandateTemplateLaunchReadiness,
} from '../src/core/documents/mandateTemplateLaunchReadiness.js'
import {
  listMandateTemplateContentRules,
} from '../src/core/documents/mandateTemplateContentRules.js'

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
assert.equal(
  packageJson.scripts?.['test:mandate-template-launch-readiness-phase13'],
  'node scripts/mandate-template-launch-readiness-phase13.test.mjs',
  'package.json should expose the mandate template launch readiness Phase 13 contract.',
)

assert.equal(MANDATE_TEMPLATE_LAUNCH_READINESS_VERSION, 'mandate_template_launch_readiness_v1')

function condition(field, value) {
  return {
    field,
    operator: 'in',
    value,
  }
}

function universalSection(extra = {}) {
  return {
    sectionKey: 'introduction_purpose',
    sectionLabel: 'Introduction and Purpose',
    legalText: 'The Seller appoints the Agency to market the Property under this estate agency mandate and pay commission.',
    placeholderKeysText: 'seller_full_name, property_address, mandate_type, mandate_start_date, mandate_end_date, commission_structure, asking_price, agent_full_name, organisation_name',
    ...extra,
  }
}

function individualCapacitySection(extra = {}) {
  return {
    sectionKey: 'seller_individual_capacity_pack',
    sectionLabel: 'Individual Seller Capacity Pack',
    legalText: 'The individual seller confirms contractual capacity and marital status before signing.',
    placeholderKeysText: 'seller_marital_status, seller_id_number',
    ...extra,
  }
}

function companyAuthoritySection(extra = {}) {
  return {
    sectionKey: 'seller_company_authority_pack',
    sectionLabel: 'Seller Company Authority Pack',
    legalText: 'The company or close corporation signatory is duly authorised by directors resolution to bind the Seller.',
    placeholderKeysText: 'seller_company_registration_number, seller_representative_name, seller_representative_capacity, seller_resolution_date, seller_authority_basis',
    ...extra,
  }
}

function trustAuthoritySection(extra = {}) {
  return {
    sectionKey: 'seller_trust_authority_pack',
    sectionLabel: 'Seller Trust Authority Pack',
    legalText: 'The trust registration, trustees, trust deed and letters of authority confirm the authorised trustee may bind the Seller.',
    placeholderKeysText: 'seller_trust_registration_number, seller_trustee_names',
    ...extra,
  }
}

function spouseConsentSection(extra = {}) {
  return {
    sectionKey: 'seller_spouse_consent_pack',
    sectionLabel: 'Seller Spouse Consent Pack',
    legalText: 'Where the Seller is married in community of property, spouse consent is recorded and the spouse will sign as co-signer.',
    placeholderKeysText: 'seller_spouse_full_name, seller_spouse_id_number, seller_spouse_email, seller_spouse_consent_required',
    ...extra,
  }
}

function fullTitleSection(extra = {}) {
  return {
    sectionKey: 'property_full_title_pack',
    sectionLabel: 'Full Title Property Pack',
    legalText: 'The full title Property includes erf number, title deed, municipal rates, land extent and servitude information.',
    placeholderKeysText: 'erf_number, title_deed_number, rates_account_number, servitude_details',
    ...extra,
  }
}

function sectionalTitleSection(extra = {}) {
  return {
    sectionKey: 'property_sectional_title_pack',
    sectionLabel: 'Sectional Title Property Pack',
    legalText: 'The sectional title Property includes body corporate details, levy, participation quota, scheme rules and unit number.',
    placeholderKeysText: 'property_unit_number, property_section_number, sectional_title_number, body_corporate_details, levy_amount, participation_quota',
    ...extra,
  }
}

function sectionsForRoute(routeKey = 'default') {
  if (routeKey === 'default') {
    return [
      universalSection(),
      individualCapacitySection({ conditionJson: condition('seller_entity_type', 'individual') }),
      companyAuthoritySection({ conditionJson: condition('seller_entity_type', 'company, close_corporation') }),
      trustAuthoritySection({ conditionJson: condition('seller_entity_type', 'trust') }),
      spouseConsentSection({ conditionJson: condition('seller_spouse_consent_required', 'Yes') }),
      fullTitleSection({ conditionJson: condition('property_title_type', 'full_title, agricultural_holding') }),
      sectionalTitleSection({ conditionJson: condition('property_title_type', 'sectional_title, share_block') }),
    ]
  }

  const sections = [universalSection()]
  if (routeKey.includes('individual')) sections.push(individualCapacitySection())
  if (routeKey.includes('company')) sections.push(companyAuthoritySection())
  if (routeKey.includes('trust')) sections.push(trustAuthoritySection())
  if (routeKey.includes('spouse_consent')) sections.push(spouseConsentSection())
  if (routeKey.includes('full_title')) sections.push(fullTitleSection())
  if (routeKey.includes('sectional_title')) sections.push(sectionalTitleSection())
  return sections
}

function liveTemplateForRoute(routeKey = 'default') {
  return {
    id: `mandate-${routeKey}`,
    template_key: `mandate_${routeKey}`,
    template_label: `${routeKey.replace(/_/g, ' ')} mandate`,
    packet_type: 'mandate',
    status: 'published',
    metadata_json: {
      mandate_template_variant: routeKey,
    },
    sections: sectionsForRoute(routeKey),
  }
}

const completeTemplates = listMandateTemplateContentRules().map((rule) => liveTemplateForRoute(rule.key))
const readyGate = buildMandateTemplateLaunchReadiness(completeTemplates, { includeDefaultRoute: true })
assert.equal(readyGate.status, 'ready')
assert.equal(readyGate.canEnableMandateAutomation, true)
assert.equal(readyGate.canGenerateWithoutFallback, true)
assert.equal(readyGate.summary.requiredRouteCount, completeTemplates.length)
assert.equal(readyGate.summary.readyRouteCount, completeTemplates.length)
assert.equal(readyGate.summary.blockedRouteCount, 0)
assert.equal(readyGate.blockers.length, 0)
assert.equal(readyGate.warnings.length, 0)

const blockedGate = buildMandateTemplateLaunchReadiness([
  liveTemplateForRoute('company_full_title'),
  {
    id: 'default-live-bad',
    template_key: 'mandate_default',
    template_label: 'Default Mandate',
    packet_type: 'mandate',
    status: 'published',
    metadata_json: {
      mandate_template_variant: 'default',
    },
    sections: [
      universalSection({
        sectionKey: 'property_details',
        sectionLabel: 'Property Details',
        legalText: 'The Seller must provide body corporate levy and sectional title scheme rules for the Property.',
        placeholderKeysText: 'property_address, body_corporate_details, levy_amount',
      }),
    ],
  },
  {
    id: 'trust-sectional-legacy',
    template_key: 'mandate_trust_sectional_legacy',
    template_label: 'Legacy Trust Sectional Mandate',
    packet_type: 'mandate',
    status: 'published',
    metadata_json: {
      mandate_template_variant: 'trust_sectional_title',
    },
  },
  {
    id: 'company-sectional-stale',
    template_key: 'mandate_company_sectional_stale',
    template_label: 'Company Sectional Mandate',
    packet_type: 'mandate',
    status: 'published',
    metadata_json: {
      mandate_template_variant: 'company_sectional_title',
      last_mandate_content_scan: {
        gateVersion: 'mandate_template_publish_gate_legacy',
        ruleVersion: 'mandate_template_content_rules_legacy',
        routeKey: 'company_sectional_title',
        isValidForPublish: true,
        blockers: [],
        warnings: [],
      },
    },
  },
  {
    id: 'individual-full-title-draft',
    template_key: 'mandate_individual_full_title_draft',
    template_label: 'Individual Full Title Mandate Draft',
    packet_type: 'mandate',
    status: 'draft',
    metadata_json: {
      mandate_template_variant: 'individual_full_title',
    },
  },
], { includeDefaultRoute: true })

assert.equal(blockedGate.status, 'blocked')
assert.equal(blockedGate.canEnableMandateAutomation, false)
assert.equal(blockedGate.canGenerateWithoutFallback, false)
assert.ok(blockedGate.summary.blockedRouteCount > 0)
assert.ok(blockedGate.summary.blockerCount >= 5)

for (const code of [
  'MANDATE_LAUNCH_ROUTE_MISSING',
  'MANDATE_LAUNCH_ROUTE_DRAFT_ONLY',
  'MANDATE_LAUNCH_ROUTE_UNVERIFIED',
  'MANDATE_LAUNCH_ROUTE_BLOCKED',
  'MANDATE_LAUNCH_LIVE_TEMPLATE_BLOCKED',
  'MANDATE_LAUNCH_LIVE_TEMPLATE_STALE_SCAN',
  'MANDATE_LAUNCH_LIVE_TEMPLATE_UNVERIFIED',
]) {
  assert.ok(blockedGate.blockers.some((issue) => issue.code === code), `Launch readiness should block with ${code}.`)
}

assert.ok(blockedGate.blockerMessages.some((message) => message.includes('before live automation')))

const launchReadinessSource = await readFile(new URL('../src/core/documents/mandateTemplateLaunchReadiness.js', import.meta.url), 'utf8')
for (const token of [
  'MANDATE_TEMPLATE_LAUNCH_READINESS_VERSION',
  'buildMandateTemplateLaunchReadiness',
  'canEnableMandateAutomation',
  'MANDATE_LAUNCH_ROUTE_MISSING',
  'MANDATE_LAUNCH_LIVE_TEMPLATE_STALE_SCAN',
  'buildMandateTemplateOperationalAudit',
]) {
  assert.ok(launchReadinessSource.includes(token), `Launch readiness source should include ${token}.`)
}

const settingsSource = await readFile(new URL('../src/pages/settings/SettingsSigningTemplatesPage.jsx', import.meta.url), 'utf8')
for (const token of [
  'buildMandateTemplateLaunchReadiness',
  'mandateLaunchReadiness',
  'Launch Readiness',
  'Mandate automation is locked',
  'Blocked routes',
]) {
  assert.ok(settingsSource.includes(token), `Settings page should surface launch readiness token ${token}.`)
}

console.log('Mandate template launch readiness Phase 13 contract passed.')
