import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  assessPlatformDefaultReleaseGate,
  PLATFORM_DEFAULT_RELEASE_GATE_CONTRACT,
} from '../src/core/documents/platformDefaultReleaseGate.js'

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const releaseGateSource = await readFile(new URL('../src/core/documents/platformDefaultReleaseGate.js', import.meta.url), 'utf8')
const verifierSource = await readFile(new URL('./verify-legal-template-platform-defaults-phase7.mjs', import.meta.url), 'utf8')
const adminData = await readFile(new URL('../../apps/admin/src/lib/adminData.js', import.meta.url), 'utf8')
const adminApp = await readFile(new URL('../../apps/admin/src/App.jsx', import.meta.url), 'utf8')
const phase1Doc = await readFile(new URL('../../docs/legal-template-platform-defaults-phase1.md', import.meta.url), 'utf8')

function metadata(packetType) {
  return {
    render_mode: 'native_structured',
    inherit_organisation_branding: true,
    default_signer_roles: packetType === 'mandate' ? ['seller', 'agent'] : ['purchaser_1', 'seller', 'agent'],
    legal_review_status: 'approved',
    legal_approved_at: '2025-01-01T00:00:00.000Z',
    legal_approval_reference: `phase7-${packetType}-approval`,
    legal_approval_content_digest: `sha256:phase7-${packetType}-content`,
    legal_counsel_review_evidence_digest: `sha256:phase7-${packetType}-evidence`,
    legal_b1_manifest_digest: `sha256:phase7-${packetType}-b1`,
    legal_b3_applied_at: '2025-01-01T00:01:00.000Z',
    legal_b3_applied_by: 'service_role',
    legal_b3_application_reference: `phase7-${packetType}-b3`,
    legal_phase4_b3_release_contract: 'phase4-b3-integrity-v1',
    platform_default_can_route_without_org_template: true,
  }
}

function template(packetType, overrides = {}) {
  return {
    id: `${packetType}-template-id`,
    organisation_id: null,
    module_type: 'agency',
    packet_type: packetType,
    template_key: `${packetType}_default_v1`,
    template_label: `${packetType.toUpperCase()} Ultron boilerplate`,
    template_format: 'structured',
    status: 'published',
    is_default: true,
    is_active: true,
    version_tag: 'v1',
    metadata_json: metadata(packetType),
    ...overrides,
  }
}

function sections(templateId, count) {
  return Array.from({ length: count }, (_, index) => ({
    id: `${templateId}-section-${index + 1}`,
    template_id: templateId,
    section_key: index === count - 1 ? 'signature_pages' : `clause_${index + 1}`,
    section_label: index === count - 1 ? 'Signatures' : `Clause ${index + 1}`,
    section_type: index === count - 1 ? 'signature_zone' : 'legal_text',
    sort_order: index,
    legal_text: index === count - 1
      ? 'The parties sign this document on the dates recorded below.'
      : `This clause is final Ultron boilerplate wording for release gate fixture ${index + 1}.`,
    placeholder_keys: index === 0 ? ['property.address'] : [],
    metadata_json: {},
  }))
}

function fixture() {
  const mandate = template('mandate')
  const otp = template('otp')
  return {
    templates: [mandate, otp],
    sections: [
      ...sections(mandate.id, 10),
      ...sections(otp.id, 12),
    ],
  }
}

assert.equal(
  packageJson.scripts?.['test:legal-template-platform-defaults-phase7'],
  'node scripts/legal-template-platform-defaults-phase7.test.mjs',
  'package.json should expose the Phase 7 release gate contract.',
)
assert.equal(
  packageJson.scripts?.['verify:legal-template-platform-defaults-phase7'],
  'node --env-file=.env --env-file=.env.staging.local scripts/verify-legal-template-platform-defaults-phase7.mjs',
  'package.json should expose the read-only Phase 7 Supabase verifier.',
)

for (const token of [
  'PLATFORM_DEFAULT_RELEASE_GATE_CONTRACT',
  'assessPlatformDefaultReleaseGate',
  'P7_GLOBAL_MANDATE_DEFAULT_CARDINALITY',
  'P7_GLOBAL_OTP_DEFAULT_CARDINALITY',
  'P7_SCENARIO_LOGIC_INVALID',
  'mutatedData: false',
  'customisationContract',
  'readinessContract',
]) {
  assert.ok(releaseGateSource.includes(token), `release gate should carry Phase 7 contract evidence: ${token}`)
}

for (const token of [
  'createClient',
  'document_packet_templates',
  'document_template_sections',
  'assessPlatformDefaultReleaseGate',
  'mutatedData',
]) {
  assert.ok(verifierSource.includes(token), `Phase 7 verifier should be a read-only release gate: ${token}`)
}

for (const token of [
  'Platform default templates are immutable. Create an organisation draft before editing.',
  'customisePlatformDefaultTemplate',
  'customised_from_platform_default',
]) {
  assert.ok(adminData.includes(token), `Phase 7 release gate depends on Phase 5 clone safety: ${token}`)
}

for (const token of [
  'Create Organisation Draft',
  'Ultron platform defaults are locked.',
  'selectedTemplateIsPlatformDefault',
]) {
  assert.ok(adminApp.includes(token), `Phase 7 release gate depends on visible platform-default edit locking: ${token}`)
}

assert.ok(
  phase1Doc.includes('Phase 7 adds a read-only release gate'),
  'Phase 1 phase ladder should describe the Phase 7 release gate.',
)

const clean = assessPlatformDefaultReleaseGate(fixture())
assert.equal(clean.contract, PLATFORM_DEFAULT_RELEASE_GATE_CONTRACT)
assert.equal(clean.status, 'GO', JSON.stringify(clean.blockers, null, 2))
assert.equal(clean.ready, true)
assert.equal(clean.mutatedData, false)
assert.equal(clean.blockerCount, 0)
assert.equal(clean.evidence.templates.mandate.evidence.sectionCount, 10)
assert.equal(clean.evidence.templates.otp.evidence.sectionCount, 12)
assert.equal(clean.evidence.scenarioLogic.ready, true)
assert.equal(clean.evidence.customisationContract.organisationDraftRequiredForEdits, true)
assert.equal(clean.evidence.readinessContract.approvedPlatformDefaultCountsAsReady, true)

const duplicateMandate = fixture()
duplicateMandate.templates.push(template('mandate', { id: 'second-mandate-template-id' }))
duplicateMandate.sections.push(...sections('second-mandate-template-id', 10))
const duplicateReport = assessPlatformDefaultReleaseGate(duplicateMandate)
assert.equal(duplicateReport.status, 'NO_GO')
assert.ok(
  duplicateReport.blockers.some((item) => item.code === 'P7_GLOBAL_MANDATE_DEFAULT_CARDINALITY'),
  'duplicate global mandate defaults should block release.',
)

const missingB3 = fixture()
delete missingB3.templates[1].metadata_json.legal_b3_applied_at
const missingB3Report = assessPlatformDefaultReleaseGate(missingB3)
assert.equal(missingB3Report.status, 'NO_GO')
assert.ok(
  missingB3Report.blockers.some((item) => item.code === 'P7_GLOBAL_OTP_NOT_RUNTIME_RELEASED'),
  'missing B3 runtime release should block OTP platform default release.',
)

console.log('Legal template platform defaults Phase 7 release gate contract passed.')
