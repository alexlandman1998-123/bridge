import assert from 'node:assert/strict'
import test from 'node:test'
import {
  OTP_CANONICAL_REFERENCE_MATRIX_VERSION,
  OTP_CANONICAL_REQUIRED_CAPABILITIES,
  OTP_CANONICAL_REFERENCE_SCENARIOS,
  buildCanonicalOtpCertificationFingerprint,
  runCanonicalOtpReferenceMatrix,
} from '../otpCanonicalReferenceMatrix.js'
import { resolveCanonicalOtpReferenceMatrixGovernance } from '../otpCanonicalReferenceMatrixGovernance.js'
import { resolveOtpReferenceMatrixGovernance } from '../otpReferenceMatrixGovernance.js'

function canonicalTemplate(overrides = {}) {
  return {
    id: 'canonical-candidate',
    packet_type: 'otp',
    document_model: 'single_master_document',
    canonical_contract_version: 'kingstons_2026_otp_contract_v1',
    canonical_runtime_binding_version: 'kingstons_2026_otp_runtime_v1',
    canonical_template_asset_version: 'kingstons_2026_otp_docx_v1',
    template_storage_bucket: 'legal-templates',
    template_storage_path: 'otp/candidates/kingstons-2026-v1.docx',
    template_file_name: 'kingstons-2026-otp-canonical-v1.docx',
    metadata_json: {},
    ...overrides,
  }
}

test('certifies six understandable canonical OTP reference transactions', () => {
  const result = runCanonicalOtpReferenceMatrix({ template: canonicalTemplate() })

  assert.equal(result.schemaVersion, OTP_CANONICAL_REFERENCE_MATRIX_VERSION)
  assert.equal(result.scenarioCount, 6)
  assert.equal(result.passedCount, 6)
  assert.equal(result.failedCount, 0)
  assert.equal(result.canPublish, true)
  assert.equal(result.assetEvidence.tokenCount, 118)
  assert.deepEqual(result.safetyChecks, [{ key: 'unapproved_exception_blocked', label: 'Unapproved legal wording is blocked', passed: true }])
  assert.deepEqual(result.missingCapabilities, [])
  assert.deepEqual([...result.exercisedCapabilities].sort(), [...OTP_CANONICAL_REQUIRED_CAPABILITIES].sort())
  assert.ok(result.scenarios.every((scenario) => scenario.passed && scenario.tokenCount === 118))
})

test('keeps entity classification separate from marital classification', () => {
  const result = runCanonicalOtpReferenceMatrix({ template: canonicalTemplate() })
  const company = result.scenarios.find((scenario) => scenario.key === 'company_bond')
  const trust = result.scenarios.find((scenario) => scenario.key === 'trust_cash')

  assert.equal(company.passed, true)
  assert.equal(trust.passed, true)
  assert.equal(company.issues.length, 0)
  assert.equal(trust.issues.length, 0)
})

test('fails certification when a required capability is removed', () => {
  const sourceScenarios = OTP_CANONICAL_REFERENCE_SCENARIOS.filter((scenario) => scenario.key !== 'attorney_approved_exception')
  const result = runCanonicalOtpReferenceMatrix({ template: canonicalTemplate(), scenarios: sourceScenarios })

  assert.equal(sourceScenarios.length, 5)
  assert.equal(result.canPublish, false)
  assert.deepEqual(result.missingCapabilities, ['approved_exception'])
})

test('binds saved certification to the exact canonical template identity', () => {
  const template = canonicalTemplate()
  const matrix = runCanonicalOtpReferenceMatrix({ template })
  const savedTemplate = {
    ...template,
    metadata_json: {
      canonical_otp_reference_matrix_version: matrix.schemaVersion,
      last_canonical_otp_reference_matrix: {
        schemaVersion: matrix.schemaVersion,
        scenarioCount: matrix.scenarioCount,
        passedCount: matrix.passedCount,
        failedCount: matrix.failedCount,
        failedScenarioKeys: [],
        templateFingerprint: matrix.templateFingerprint,
        certificationKey: matrix.certificationKey,
        canPublish: matrix.canPublish,
        validatedAt: '2026-07-15T10:00:00.000Z',
      },
    },
  }
  const governed = resolveCanonicalOtpReferenceMatrixGovernance(savedTemplate)
  const stale = resolveCanonicalOtpReferenceMatrixGovernance({ ...savedTemplate, template_storage_path: 'otp/candidates/replaced.docx' })

  assert.equal(governed.passed, true)
  assert.equal(governed.matchesTemplate, true)
  assert.equal(stale.passed, false)
  assert.ok(stale.blockingReasons.includes('matrix_result_stale'))
  assert.notEqual(buildCanonicalOtpCertificationFingerprint(template), buildCanonicalOtpCertificationFingerprint({ ...template, template_storage_path: 'changed.docx' }))
})

test('dispatches canonical and legacy templates to their own governance contracts', () => {
  const canonical = resolveOtpReferenceMatrixGovernance(canonicalTemplate())
  const legacy = resolveOtpReferenceMatrixGovernance({ id: 'legacy', sections: [] })

  assert.equal(canonical.schemaVersion, OTP_CANONICAL_REFERENCE_MATRIX_VERSION)
  assert.notEqual(legacy.schemaVersion, OTP_CANONICAL_REFERENCE_MATRIX_VERSION)
  assert.equal(canonical.canonical, true)
})
