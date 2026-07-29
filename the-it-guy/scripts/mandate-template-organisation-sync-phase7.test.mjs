import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { PHASE4_B3_RELEASE_CONTRACT } from '../src/core/documents/legalTemplateApproval.js'
import {
  buildMandateTemplateVNextApprovalDigestPayload,
  stringifyMandateTemplateApprovalDigestPayload,
} from '../src/core/documents/mandateTemplateApprovalReleaseGate.js'
import {
  MANDATE_TEMPLATE_ORGANISATION_SYNC_CONTRACT,
  MANDATE_TEMPLATE_ORGANISATION_SYNC_VERSION,
  buildMandateTemplateOrganisationSyncPlan,
  formatMandateTemplateOrganisationSyncMarkdown,
} from '../src/core/documents/mandateTemplateOrganisationSync.js'
import {
  listMandateTemplateWordingVNextSections,
} from '../src/core/documents/mandateTemplateWordingVNext.js'

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
assert.equal(
  packageJson.scripts?.['test:mandate-template-organisation-sync-phase7'],
  'node scripts/mandate-template-organisation-sync-phase7.test.mjs',
  'package.json should expose the mandate template organisation sync Phase 7 contract.',
)
assert.equal(
  packageJson.scripts?.['report:mandate-template-organisation-sync'],
  'node scripts/report-mandate-template-organisation-sync.mjs',
  'package.json should expose the mandate template organisation sync reporter.',
)

const sections = listMandateTemplateWordingVNextSections()
const rendererSource = await readFile(new URL('../../supabase/functions/generate-mandate/index.ts', import.meta.url), 'utf8')
const expectedContentDigest = `sha256:${createHash('sha256').update(stringifyMandateTemplateApprovalDigestPayload(
  buildMandateTemplateVNextApprovalDigestPayload({ sections }),
)).digest('hex')}`
const generatedAt = '2026-07-28T12:00:00.000Z'
const approvalEvidence = {
  status: 'approved',
  approvedAt: generatedAt,
  reference: 'COUNSEL-MANDATE-VNEXT-001',
  contentDigest: expectedContentDigest,
  reviewEvidenceDigest: 'sha256:review-evidence',
  b1ManifestDigest: 'sha256:b1-manifest',
  b3AppliedAt: generatedAt,
  b3AppliedBy: 'service_role',
  b3ApplicationReference: 'B3-MANDATE-VNEXT-001',
  phase4B3ReleaseContract: PHASE4_B3_RELEASE_CONTRACT,
}

const blocked = buildMandateTemplateOrganisationSyncPlan({
  organisations: [{ id: 'org-1', name: 'Pilot Agency' }],
  sections,
  rendererSource,
  expectedContentDigest,
  generatedAt,
})

assert.equal(blocked.version, MANDATE_TEMPLATE_ORGANISATION_SYNC_VERSION)
assert.equal(blocked.contract, MANDATE_TEMPLATE_ORGANISATION_SYNC_CONTRACT)
assert.equal(blocked.mutatedData, false)
assert.equal(blocked.status, 'SYNC_BLOCKED_PHASE6_GATE')
assert.equal(blocked.syncAllowed, false)
assert.equal(blocked.summary.actionCount, 0)
assert.ok(blocked.blockers.some((blocker) => blocker.code === 'PHASE7_PHASE6_RELEASE_GATE_NOT_PASSED'))

const createPlan = buildMandateTemplateOrganisationSyncPlan({
  organisations: [{ id: 'org-1', name: 'Pilot Agency' }],
  sections,
  rendererSource,
  approvalEvidence,
  expectedContentDigest,
  generatedAt,
})

assert.equal(createPlan.status, 'SYNC_READY_FOR_DRAFT_CREATION')
assert.equal(createPlan.syncAllowed, true)
assert.equal(createPlan.releaseGate.releaseAllowed, true)
assert.equal(createPlan.summary.targetCount, 1)
assert.equal(createPlan.summary.actionCount, 1)
assert.equal(createPlan.targetPlans[0].action, 'create_draft')

const createInput = createPlan.targetPlans[0].templateInput
assert.equal(createInput.organisationId, 'org-1')
assert.equal(createInput.packetType, 'mandate')
assert.equal(createInput.moduleType, 'agency')
assert.equal(createInput.templateStatus, 'draft')
assert.equal(createInput.templateFormat, 'structured')
assert.equal(createInput.isDefault, false)
assert.equal(createInput.isActive, false)
assert.equal(createInput.metadataJson.render_mode, 'native_structured')
assert.equal(createInput.metadataJson.inherit_organisation_branding, true)
assert.equal(createInput.metadataJson.mandate_vnext_source_content_digest, expectedContentDigest)
assert.equal(createInput.metadataJson.mandate_vnext_phase7_sync.contract, MANDATE_TEMPLATE_ORGANISATION_SYNC_CONTRACT)
assert.equal(createInput.metadataJson.legal_approval_content_digest, expectedContentDigest)
assert.equal(createInput.sections.length, 16)
assert.equal(createInput.canonicalDefinition.documentType, 'mandate')
assert.equal(createInput.canonicalDefinition.sourceMode, 'native')
assert.ok(createInput.sections.every((section) => section.metadataJson.organisation_synced_copy === true))
assert.ok(createInput.sections.every((section) => section.metadataJson.phase7_sync_contract === MANDATE_TEMPLATE_ORGANISATION_SYNC_CONTRACT))
assert.ok(createInput.sections.find((section) => section.sectionKey === 'signature_pages').metadataJson.native_pdf_layout.suppress_section_body)
for (const section of createInput.sections) {
  assert.doesNotMatch(section.sectionLabel, /\b(packet|pack)\b/i)
  assert.doesNotMatch((section.legalText.split(/\r?\n/)[0] || ''), /\b(packet|pack)\b/i)
}

const revisionPlan = buildMandateTemplateOrganisationSyncPlan({
  organisations: [{ id: 'org-1', name: 'Pilot Agency' }],
  existingTemplates: [{
    id: 'existing-template-1',
    organisation_id: 'org-1',
    module_type: 'agency',
    packet_type: 'mandate',
    template_key: 'mandate_default_v1',
    template_label: 'Current Mandate',
    template_format: 'structured',
    status: 'published',
    is_active: true,
    is_default: true,
    revision_number: 3,
    metadata_json: {
      render_mode: 'native_structured',
      custom_clause_note: 'preserve metadata',
    },
  }],
  sections,
  rendererSource,
  approvalEvidence,
  expectedContentDigest,
  generatedAt,
})

assert.equal(revisionPlan.status, 'SYNC_READY_FOR_DRAFT_CREATION')
assert.equal(revisionPlan.targetPlans[0].action, 'create_revision')
assert.equal(revisionPlan.targetPlans[0].templateInput.revisionParentTemplateId, 'existing-template-1')
assert.equal(revisionPlan.targetPlans[0].templateInput.revisionNumber, 4)
assert.equal(revisionPlan.targetPlans[0].templateInput.metadataJson.custom_clause_note, 'preserve metadata')
assert.ok(revisionPlan.warnings.some((warning) => warning.code === 'PHASE7_EXISTING_TEMPLATE_IMMUTABLE_REVISION_REQUIRED'))

const alreadySyncedPlan = buildMandateTemplateOrganisationSyncPlan({
  organisations: [{ id: 'org-1', name: 'Pilot Agency' }],
  existingTemplates: [{
    id: 'synced-template-1',
    organisation_id: 'org-1',
    module_type: 'agency',
    packet_type: 'mandate',
    template_key: 'mandate_vnext_org_1',
    template_label: 'Mandate vNext',
    template_format: 'structured',
    status: 'published',
    is_active: true,
    is_default: true,
    metadata_json: {
      mandate_vnext_phase7_sync: {
        source_content_digest: expectedContentDigest,
      },
    },
  }],
  sections,
  rendererSource,
  approvalEvidence,
  expectedContentDigest,
  generatedAt,
})

assert.equal(alreadySyncedPlan.status, 'SYNC_ALREADY_CURRENT')
assert.equal(alreadySyncedPlan.syncAllowed, true)
assert.equal(alreadySyncedPlan.summary.actionCount, 0)
assert.equal(alreadySyncedPlan.summary.alreadySyncedCount, 1)
assert.equal(alreadySyncedPlan.targetPlans[0].action, 'already_synced')

const alreadySyncedDraftBeatsActivePlan = buildMandateTemplateOrganisationSyncPlan({
  organisations: [{ id: 'org-1', name: 'Pilot Agency' }],
  existingTemplates: [
    {
      id: 'active-template-1',
      organisation_id: 'org-1',
      module_type: 'agency',
      packet_type: 'mandate',
      template_key: 'mandate_default_v1',
      template_label: 'Current Mandate',
      template_format: 'structured',
      status: 'published',
      is_active: true,
      is_default: true,
      revision_number: 3,
      metadata_json: {},
    },
    {
      id: 'synced-draft-template-1',
      organisation_id: 'org-1',
      module_type: 'agency',
      packet_type: 'mandate',
      template_key: 'mandate_vnext_org_1',
      template_label: 'Mandate vNext',
      template_format: 'structured',
      status: 'draft',
      is_active: false,
      is_default: false,
      metadata_json: {
        mandate_vnext_phase7_sync: {
          source_content_digest: expectedContentDigest,
        },
      },
    },
  ],
  sections,
  rendererSource,
  approvalEvidence,
  expectedContentDigest,
  generatedAt,
})

assert.equal(alreadySyncedDraftBeatsActivePlan.status, 'SYNC_ALREADY_CURRENT')
assert.equal(alreadySyncedDraftBeatsActivePlan.summary.actionCount, 0)
assert.equal(alreadySyncedDraftBeatsActivePlan.summary.alreadySyncedCount, 1)
assert.equal(alreadySyncedDraftBeatsActivePlan.targetPlans[0].action, 'already_synced')
assert.equal(alreadySyncedDraftBeatsActivePlan.targetPlans[0].existingTemplateId, 'synced-draft-template-1')

const invalidTargetPlan = buildMandateTemplateOrganisationSyncPlan({
  organisations: [{ name: 'Missing ID Agency' }],
  sections,
  rendererSource,
  approvalEvidence,
  expectedContentDigest,
  generatedAt,
})

assert.equal(invalidTargetPlan.status, 'SYNC_BLOCKED_TARGETS')
assert.equal(invalidTargetPlan.syncAllowed, false)
assert.ok(invalidTargetPlan.blockers.some((blocker) => blocker.code === 'PHASE7_ORGANISATION_ID_MISSING'))

const markdown = formatMandateTemplateOrganisationSyncMarkdown(createPlan)
for (const token of [
  'Mandate Template vNext Phase 7 Organisation Template Sync',
  'SYNC_READY_FOR_DRAFT_CREATION',
  'draft',
  'bridge_publish_template_revision_b4',
  'does not mutate live data',
]) {
  assert.ok(markdown.includes(token), `markdown should include ${token}`)
}

const source = await readFile(new URL('../src/core/documents/mandateTemplateOrganisationSync.js', import.meta.url), 'utf8')
for (const token of [
  'MANDATE_TEMPLATE_ORGANISATION_SYNC_VERSION',
  'MANDATE_TEMPLATE_ORGANISATION_SYNC_CONTRACT',
  'buildMandateTemplateOrganisationSyncPlan',
  'formatMandateTemplateOrganisationSyncMarkdown',
  'draft_or_revision_only',
  'bridge_publish_template_revision_b4',
]) {
  assert.ok(source.includes(token), `source should include ${token}`)
}

assert.doesNotMatch(source, /\.insert\(/, 'Phase 7 organisation sync core must not insert data.')
assert.doesNotMatch(source, /\.update\(/, 'Phase 7 organisation sync core must not update data.')
assert.doesNotMatch(source, /\.upsert\(/, 'Phase 7 organisation sync core must not upsert data.')
assert.doesNotMatch(source, /\.delete\(/, 'Phase 7 organisation sync core must not delete data.')

console.log('Mandate template organisation sync Phase 7 contract passed.')
