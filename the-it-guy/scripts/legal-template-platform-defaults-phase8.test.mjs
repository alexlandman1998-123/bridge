import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  buildPlatformDefaultReleaseRemediationPlan,
  PLATFORM_DEFAULT_REMEDIATION_CONTRACT,
  PLATFORM_DEFAULT_REMEDIATION_WRITE_FLAG,
} from '../src/core/documents/platformDefaultReleaseRemediation.js'

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const remediationSource = await readFile(new URL('../src/core/documents/platformDefaultReleaseRemediation.js', import.meta.url), 'utf8')
const prepareSource = await readFile(new URL('./prepare-legal-template-platform-defaults-phase8.mjs', import.meta.url), 'utf8')
const phase1Doc = await readFile(new URL('../../docs/legal-template-platform-defaults-phase1.md', import.meta.url), 'utf8')

const digest = (char) => `sha256:${char.repeat(64)}`

function metadata(packetType, overrides = {}) {
  return {
    render_mode: 'native_structured',
    inherit_organisation_branding: true,
    default_signer_roles: packetType === 'mandate' ? ['seller', 'agent'] : ['purchaser_1', 'seller', 'agent'],
    legal_review_status: 'approved',
    legal_approved_at: '2025-01-01T00:00:00.000Z',
    legal_approval_reference: `phase8-${packetType}-approval`,
    legal_approved_by: 'External Counsel',
    legal_approval_content_digest: digest(packetType === 'mandate' ? 'a' : 'b'),
    legal_counsel_review_evidence_digest: digest(packetType === 'mandate' ? 'c' : 'd'),
    legal_b1_manifest_digest: digest(packetType === 'mandate' ? 'e' : 'f'),
    legal_b3_applied_at: '2025-01-01T00:01:00.000Z',
    legal_b3_applied_by: 'service_role',
    legal_b3_application_reference: `phase8-${packetType}-b3`,
    legal_phase4_b3_release_contract: 'phase4-b3-integrity-v1',
    platform_default_can_route_without_org_template: true,
    ...overrides,
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
    updated_at: '2025-01-01T00:02:00.000Z',
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
      : `This clause is final Ultron boilerplate wording for release remediation fixture ${index + 1}.`,
    placeholder_keys: [],
    metadata_json: {},
  }))
}

function provenance(templateRow) {
  const metadataRow = templateRow.metadata_json
  return {
    template_id: templateRow.id,
    audit_event_id: `${templateRow.id}-audit`,
    content_digest: metadataRow.legal_approval_content_digest,
    review_evidence_digest: metadataRow.legal_counsel_review_evidence_digest,
    b1_manifest_digest: metadataRow.legal_b1_manifest_digest,
    review_reference: metadataRow.legal_approval_reference,
    reviewed_by: metadataRow.legal_approved_by,
    reviewed_at: metadataRow.legal_approved_at,
    b3_applied_at: metadataRow.legal_b3_applied_at,
    b3_applied_by: metadataRow.legal_b3_applied_by,
    b3_application_reference: metadataRow.legal_b3_application_reference,
    release_contract: metadataRow.legal_phase4_b3_release_contract,
  }
}

function cleanFixture() {
  const mandate = template('mandate')
  const otp = template('otp')
  return {
    templates: [mandate, otp],
    sections: [
      ...sections(mandate.id, 10),
      ...sections(otp.id, 12),
    ],
    provenanceRows: [provenance(mandate), provenance(otp)],
  }
}

assert.equal(
  packageJson.scripts?.['test:legal-template-platform-defaults-phase8'],
  'node scripts/legal-template-platform-defaults-phase8.test.mjs',
  'package.json should expose the Phase 8 remediation contract.',
)
assert.equal(
  packageJson.scripts?.['prepare:legal-template-platform-defaults-phase8'],
  'node --env-file=.env --env-file=.env.staging.local scripts/prepare-legal-template-platform-defaults-phase8.mjs',
  'package.json should expose the Phase 8 dry-run planner.',
)

for (const token of [
  'PLATFORM_DEFAULT_REMEDIATION_CONTRACT',
  'LEGAL_TEMPLATE_PLATFORM_DEFAULTS_PHASE8_WRITE',
  'buildPlatformDefaultReleaseRemediationPlan',
  'normalise_global_default_route',
  'apply_b3_runtime_release',
  'bridge_apply_legal_document_counsel_approvals',
  'PHASE8_MANDATE_COUNSEL_REVIEW_REQUIRED',
  'protectedProvenanceReady',
  'mutatedData: false',
]) {
  assert.ok(remediationSource.includes(token), `Phase 8 remediation should expose: ${token}`)
}

for (const token of [
  '--apply',
  PLATFORM_DEFAULT_REMEDIATION_WRITE_FLAG,
  '--confirm-project-ref',
  '--applied-by',
  '--reference',
  'document_packet_template_release_provenance_phase4',
  'PHASE8_PROTECTED_PROVENANCE_TABLE_MISSING',
  'bridge_apply_legal_document_counsel_approvals',
  'supabase_update',
]) {
  assert.ok(prepareSource.includes(token), `Phase 8 operator script should guard: ${token}`)
}

assert.doesNotMatch(
  prepareSource,
  /\.update\([\s\S]{0,600}legal_phase4_b3_release_contract/,
  'Phase 8 must not directly write B3 legal release metadata; it should use the B3 RPC.',
)

assert.ok(
  phase1Doc.includes('Phase 8 adds a guarded remediation planner'),
  'Phase 1 phase ladder should describe the Phase 8 remediation planner.',
)

const clean = buildPlatformDefaultReleaseRemediationPlan(cleanFixture())
assert.equal(clean.contract, PLATFORM_DEFAULT_REMEDIATION_CONTRACT)
assert.equal(clean.status, 'NO_REPAIR_NEEDED', JSON.stringify(clean, null, 2))
assert.equal(clean.mutatedData, false)
assert.equal(clean.actionCount, 0)
assert.equal(clean.blockerCount, 0)
assert.equal(clean.packets.every((packet) => packet.protectedProvenanceReady), true)

const liveLike = cleanFixture()
liveLike.templates[0] = template('mandate', {
  id: 'mandate-template-id',
  is_active: false,
  is_default: false,
  metadata_json: {
    render_mode: 'native_structured',
    inherit_organisation_branding: true,
    default_signer_roles: ['seller', 'agent'],
  },
})
liveLike.templates[1] = template('otp', {
  id: 'otp-template-id',
  metadata_json: metadata('otp', {
    legal_phase4_b3_release_contract: '',
    platform_default_can_route_without_org_template: undefined,
  }),
})
liveLike.sections = [
  ...sections('mandate-template-id', 10),
  ...sections('otp-template-id', 12),
]
liveLike.provenanceRows = []

const plan = buildPlatformDefaultReleaseRemediationPlan(liveLike)
assert.equal(plan.status, 'PARTIAL_REPAIR_AVAILABLE', JSON.stringify(plan, null, 2))
assert.ok(plan.actions.some((item) => item.type === 'normalise_global_default_route' && item.packetType === 'mandate'))
assert.ok(plan.actions.some((item) => item.type === 'apply_b3_runtime_release' && item.packetType === 'otp'))
assert.ok(plan.blockers.some((item) => item.code === 'PHASE8_MANDATE_COUNSEL_REVIEW_REQUIRED'))
assert.ok(plan.warnings.some((item) => item.code === 'PHASE8_OTP_ROUTE_MARKER_DEFERRED'))

const missingApprovedBy = cleanFixture()
delete missingApprovedBy.templates[1].metadata_json.legal_approved_by
missingApprovedBy.provenanceRows = [provenance(missingApprovedBy.templates[0])]
const manual = buildPlatformDefaultReleaseRemediationPlan(missingApprovedBy)
assert.equal(manual.status, 'BLOCKED_MANUAL_REVIEW_REQUIRED')
assert.ok(manual.blockers.some((item) => item.code === 'PHASE8_OTP_COUNSEL_REVIEW_REQUIRED'))

console.log('Legal template platform defaults Phase 8 remediation contract passed.')
