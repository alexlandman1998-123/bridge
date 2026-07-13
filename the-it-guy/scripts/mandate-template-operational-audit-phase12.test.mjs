import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  MANDATE_TEMPLATE_OPERATIONAL_AUDIT_VERSION,
  buildMandateTemplateAuditTemplateRow,
  buildMandateTemplateOperationalAudit,
} from '../src/core/documents/mandateTemplateOperationalAudit.js'

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
assert.equal(
  packageJson.scripts?.['test:mandate-template-operational-audit-phase12'],
  'node scripts/mandate-template-operational-audit-phase12.test.mjs',
  'package.json should expose the mandate template operational audit Phase 12 contract.',
)

assert.equal(MANDATE_TEMPLATE_OPERATIONAL_AUDIT_VERSION, 'mandate_template_operational_audit_v1')

function universalSection(extra = {}) {
  return {
    sectionKey: 'introduction_purpose',
    sectionLabel: 'Introduction and Purpose',
    legalText: 'The Seller appoints the Agency to market the Property under this estate agency mandate and pay commission.',
    placeholderKeysText: 'seller_full_name, property_address, mandate_type, mandate_start_date, mandate_end_date, commission_structure, asking_price, agent_full_name, organisation_name',
    ...extra,
  }
}

function fullTitleSection() {
  return {
    sectionKey: 'property_full_title_pack',
    sectionLabel: 'Full Title Property Pack',
    legalText: 'The full title Property details include erf number, title deed, municipal rates, and servitude information.',
    placeholderKeysText: 'erf_number, title_deed_number, rates_account_number, servitude_details',
  }
}

function companyAuthoritySection() {
  return {
    sectionKey: 'seller_company_authority_pack',
    sectionLabel: 'Seller Company Authority Pack',
    legalText: 'The company or close corporation signatory is duly authorised by directors resolution to bind the Seller.',
    placeholderKeysText: 'seller_company_registration_number, seller_representative_name, seller_representative_capacity, seller_resolution_date, seller_authority_basis',
  }
}

const companyFullTitleTemplate = {
  id: 'company-full-title-live',
  template_key: 'mandate_company_full_title',
  template_label: 'Company Full Title Mandate',
  packet_type: 'mandate',
  status: 'published',
  metadata_json: {
    mandate_template_variant: 'company_full_title',
  },
  sections: [
    universalSection(),
    companyAuthoritySection(),
    fullTitleSection(),
  ],
}

const companyFullTitleRow = buildMandateTemplateAuditTemplateRow(companyFullTitleTemplate)
assert.equal(companyFullTitleRow.status, 'ready')
assert.equal(companyFullTitleRow.validForGeneration, true)
assert.equal(companyFullTitleRow.scanSource, 'section_scan')
assert.equal(companyFullTitleRow.blockingCount, 0)

const badDefaultTemplate = {
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
}

const legacyTrustSectionalTemplate = {
  id: 'trust-sectional-legacy',
  template_key: 'mandate_trust_sectional_legacy',
  template_label: 'Legacy Trust Sectional Mandate',
  packet_type: 'mandate',
  status: 'published',
  metadata_json: {
    mandate_template_variant: 'trust_sectional_title',
  },
}

const staleCompanySectionalTemplate = {
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
}

const draftIndividualFullTitleTemplate = {
  id: 'individual-full-title-draft',
  template_key: 'mandate_individual_full_title_draft',
  template_label: 'Individual Full Title Mandate Draft',
  packet_type: 'mandate',
  status: 'draft',
  metadata_json: {
    mandate_template_variant: 'individual_full_title',
  },
}

const audit = buildMandateTemplateOperationalAudit([
  companyFullTitleTemplate,
  badDefaultTemplate,
  legacyTrustSectionalTemplate,
  staleCompanySectionalTemplate,
  draftIndividualFullTitleTemplate,
  {
    id: 'otp-template',
    packet_type: 'otp',
    status: 'published',
  },
], { includeDefaultRoute: true })

assert.equal(audit.auditVersion, MANDATE_TEMPLATE_OPERATIONAL_AUDIT_VERSION)
assert.equal(audit.status, 'blocked')
assert.equal(audit.summary.totalTemplates, 6)
assert.equal(audit.summary.mandateTemplateCount, 5)
assert.equal(audit.summary.liveTemplateCount, 4)
assert.equal(audit.summary.verifiedLiveTemplateCount, 1)
assert.equal(audit.summary.blockedLiveTemplateCount, 1)
assert.equal(audit.summary.unverifiedLiveTemplateCount, 2)
assert.equal(audit.summary.draftOnlyRouteCount, 1)
assert.ok(audit.summary.missingRouteCount > 0)

const badDefaultRow = audit.templateRows.find((row) => row.templateId === 'default-live-bad')
assert.equal(badDefaultRow.status, 'blocked')
assert.ok(badDefaultRow.blockers.some((issue) => issue.code === 'FORBIDDEN_UNCONDITIONAL_SIGNAL'))
assert.ok(badDefaultRow.blockerMessages.some((message) => message.includes('Sectional title property wording')))

const legacyRow = audit.templateRows.find((row) => row.templateId === 'trust-sectional-legacy')
assert.equal(legacyRow.status, 'unverified')
assert.equal(legacyRow.scanSource, 'none')

const staleRow = audit.templateRows.find((row) => row.templateId === 'company-sectional-stale')
assert.equal(staleRow.status, 'stale_scan')
assert.equal(staleRow.scanSource, 'persisted_scan')
assert.equal(staleRow.scanCurrent, false)

const individualRoute = audit.routeRows.find((row) => row.routeKey === 'individual_full_title')
assert.equal(individualRoute.status, 'draft_only')

const missingRoute = audit.routeRows.find((row) => row.routeKey === 'individual_sectional_title')
assert.equal(missingRoute.status, 'missing')

for (const code of [
  'FIX_LIVE_TEMPLATE_CONTENT',
  'SCAN_LEGACY_LIVE_TEMPLATE',
  'REFRESH_STALE_TEMPLATE_SCAN',
  'CREATE_MISSING_ROUTE_TEMPLATE',
  'PUBLISH_DRAFT_ROUTE_TEMPLATE',
  'ROUTE_LIVE_TEMPLATE_UNVERIFIED',
]) {
  assert.ok(audit.actions.some((action) => action.code === code), `Operational audit should produce action ${code}.`)
}

const auditSource = await readFile(new URL('../src/core/documents/mandateTemplateOperationalAudit.js', import.meta.url), 'utf8')
for (const token of [
  'buildMandateTemplateOperationalAudit',
  'buildMandateTemplateAuditTemplateRow',
  'buildMandateTemplatePublishGateReport',
  'listMandateTemplateContentRules',
  'CREATE_MISSING_ROUTE_TEMPLATE',
  'REFRESH_STALE_TEMPLATE_SCAN',
  'SCAN_LEGACY_LIVE_TEMPLATE',
  'ROUTE_LIVE_TEMPLATE_UNVERIFIED',
]) {
  assert.ok(auditSource.includes(token), `Operational audit source should include ${token}.`)
}

const settingsSource = await readFile(new URL('../src/pages/settings/SettingsSigningTemplatesPage.jsx', import.meta.url), 'utf8')
for (const token of [
  'buildMandateTemplateOperationalAudit',
  'mandateOperationalAudit',
  'Operational Audit',
  'blockedLiveTemplateCount',
  'unverifiedLiveTemplateCount',
  'Missing routes',
]) {
  assert.ok(settingsSource.includes(token), `Settings page should surface operational audit token ${token}.`)
}

console.log('Mandate template operational audit Phase 12 contract passed.')
