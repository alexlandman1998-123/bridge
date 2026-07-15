import assert from 'node:assert/strict'
import test from 'node:test'
import { runLegalClausePackScenarioMatrix } from '../legalClausePackScenarioMatrix.js'
import { listPublishableLegalClausePackKeys } from '../legalClausePackCoverage.js'
import { buildOtpLaunchReadiness } from '../otpLaunchReadiness.js'
import { OTP_RUNTIME_ASSEMBLY_VERSION } from '../otpRuntimeAssembly.js'

const approval = {
  locked: true,
  approval_status: 'approved',
  approved_at: '2026-07-15T10:00:00.000Z',
  approved_by_role: 'transferring_attorney',
}

function packSection(key) {
  return {
    section_key: key,
    section_type: 'legal_text',
    legal_text: `${key} approved wording`,
    condition_json: { rule: { field: 'legal_active_clause_packs', operator: 'contains', value: key } },
    metadata_json: { clause_pack_keys: [key], governance: approval },
  }
}

function buildCertifiedTemplate({ live = false, mutate = null } = {}) {
  const sections = [
    { section_key: 'definitions', section_type: 'legal_text', legal_text: 'Standard OTP core', metadata_json: { governance: approval } },
    { section_key: 'schedule_1', section_type: 'dynamic_fields', legal_text: '{{purchase_price}}', metadata_json: { governance: approval } },
    ...listPublishableLegalClausePackKeys().map(packSection),
    { section_key: 'signature_pages', section_type: 'signature_zone', legal_text: 'Signatures' },
  ]
  const matrix = runLegalClausePackScenarioMatrix({ template: { governance_version: 1 }, sections })
  const template = {
    id: 'candidate-1',
    template_label: 'Governed OTP',
    status: live ? 'published' : 'approved',
    is_active: live,
    is_default: live,
    governance_version: 1,
    approved_at: '2026-07-15T10:00:00.000Z',
    sections,
    metadata_json: {
      otp_runtime_assembly_version: OTP_RUNTIME_ASSEMBLY_VERSION,
      legal_clause_pack_scenario_matrix_version: matrix.schemaVersion,
      last_clause_pack_scenario_matrix: {
        scenarioCount: matrix.scenarioCount,
        passedCount: matrix.passedCount,
        failedCount: matrix.failedCount,
        canPublish: matrix.canPublish,
        templateFingerprint: matrix.templateFingerprint,
        certificationKey: matrix.certificationKey,
      },
    },
  }
  return mutate ? mutate(template) : template
}

test('marks a fully reviewed certified draft ready for controlled activation', () => {
  const readiness = buildOtpLaunchReadiness({
    candidateTemplate: buildCertifiedTemplate(),
    liveTemplate: { id: 'legacy-live', is_default: true, is_active: true, status: 'published' },
  })
  assert.equal(readiness.status, 'ready_for_activation')
  assert.equal(readiness.canActivate, true)
  assert.equal(readiness.steps.filter((step) => step.key !== 'activation').every((step) => step.passed), true)
})

test('marks the activated governed template ready for live generation', () => {
  const template = buildCertifiedTemplate({ live: true })
  const readiness = buildOtpLaunchReadiness({ candidateTemplate: template, liveTemplate: template })
  assert.equal(readiness.status, 'live_governed')
  assert.equal(readiness.canGenerateLive, true)
})

test('blocks rollout after wording changes invalidate certification', () => {
  const template = buildCertifiedTemplate({
    mutate: (candidate) => ({
      ...candidate,
      sections: candidate.sections.map((section, index) => index === 0 ? { ...section, legal_text: 'Changed core wording' } : section),
    }),
  })
  const readiness = buildOtpLaunchReadiness({ candidateTemplate: template })
  assert.equal(readiness.canActivate, false)
  assert.equal(readiness.matrix.matchesTemplate, false)
  assert.ok(readiness.blockers.some((message) => message.includes('certification')))
})

test('retains the prior live template as a rollback anchor', () => {
  const template = buildCertifiedTemplate({ live: true })
  template.metadata_json.otp_rollout = {
    previousTemplateId: 'legacy-live',
    previousTemplateLabel: 'Legacy OTP',
    activatedAt: '2026-07-15T11:00:00.000Z',
  }
  const readiness = buildOtpLaunchReadiness({ candidateTemplate: template, liveTemplate: template })
  assert.equal(readiness.rollback.templateId, 'legacy-live')
})
