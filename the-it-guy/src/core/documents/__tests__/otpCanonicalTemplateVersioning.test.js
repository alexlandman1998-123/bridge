import assert from 'node:assert/strict'
import test from 'node:test'
import {
  OTP_CANONICAL_FIELD_INVENTORY,
  OTP_CANONICAL_TEMPLATE_CONTRACT_VERSION,
} from '../otpCanonicalTemplateContract.js'
import {
  buildCanonicalOtpFieldMappingRows,
  buildCanonicalOtpTemplatePointers,
  createCanonicalOtpCandidateVersion,
  resolveCanonicalOtpTemplateState,
} from '../otpCanonicalTemplateVersioning.js'

const template = {
  id: 'template-1',
  organisation_id: 'org-1',
  module_type: 'residential',
  packet_type: 'otp',
  template_key: 'kingstons_otp',
  template_label: 'Kingstons Offer to Purchase',
  document_model: 'single_master_document',
  live_version_id: 'version-live',
  candidate_version_id: 'version-candidate',
  previous_live_version_id: 'version-previous',
}

const liveVersion = {
  id: 'version-live',
  template_id: 'template-1',
  status: 'published',
  version_tag: '2026.1',
  previous_version_id: 'version-previous',
}

test('creates a candidate alongside the current live OTP', () => {
  const candidate = createCanonicalOtpCandidateVersion({
    template,
    liveVersion,
    candidateId: 'version-candidate',
    versionTag: '2026.2-draft',
    storage: { bucket: 'legal-templates', path: 'org-1/otp/2026.2.docx', fileName: '2026 OTP.docx' },
    actorUserId: 'user-1',
    now: '2026-07-15T10:00:00.000Z',
  })

  assert.equal(candidate.status, 'draft')
  assert.equal(candidate.based_on_live_version_id, 'version-live')
  assert.equal(candidate.previous_version_id, 'version-live')
  assert.equal(candidate.canonical_contract_version, OTP_CANONICAL_TEMPLATE_CONTRACT_VERSION)
  assert.equal(candidate.storage_path, 'org-1/otp/2026.2.docx')
})

test('builds version-specific rows for every Phase 1 field', () => {
  const rows = buildCanonicalOtpFieldMappingRows({
    templateId: 'template-1',
    templateVersionId: 'version-candidate',
    organisationId: 'org-1',
    actorUserId: 'user-1',
  })

  assert.equal(rows.length, OTP_CANONICAL_FIELD_INVENTORY.length)
  assert.equal(new Set(rows.map((row) => row.field_key)).size, rows.length)
  assert.equal(rows.filter((row) => row.is_variable_legal_text).length, 2)
  assert.equal(rows.filter((row) => row.coverage_type === 'gap').length, 8)
})

test('resolves live, candidate and rollback versions without conflating them', () => {
  const state = resolveCanonicalOtpTemplateState({
    template,
    versions: [
      liveVersion,
      { id: 'version-candidate', template_id: 'template-1', status: 'awaiting_approval', based_on_live_version_id: 'version-live' },
      { id: 'version-previous', template_id: 'template-1', status: 'superseded' },
    ],
  })

  assert.equal(state.valid, true)
  assert.equal(state.live.id, 'version-live')
  assert.equal(state.candidate.id, 'version-candidate')
  assert.equal(state.previousLive.id, 'version-previous')
  assert.equal(state.canRollback, true)
})

test('rejects a candidate based on a different live version', () => {
  const state = resolveCanonicalOtpTemplateState({
    template,
    versions: [
      liveVersion,
      { id: 'version-candidate', template_id: 'template-1', status: 'draft', based_on_live_version_id: 'some-other-version' },
    ],
  })

  assert.equal(state.valid, false)
  assert.match(state.errors.join(' '), /not based on the current live version/i)
})

test('builds explicit master pointers and retains rollback history', () => {
  const pointers = buildCanonicalOtpTemplatePointers({
    liveVersion,
    candidateVersion: { id: 'version-candidate', template_id: 'template-1', status: 'approved' },
    previousLiveVersion: { id: 'version-previous', template_id: 'template-1', status: 'superseded' },
  })

  assert.deepEqual(pointers, {
    document_model: 'single_master_document',
    canonical_contract_version: OTP_CANONICAL_TEMPLATE_CONTRACT_VERSION,
    live_version_id: 'version-live',
    candidate_version_id: 'version-candidate',
    previous_live_version_id: 'version-previous',
  })
})
