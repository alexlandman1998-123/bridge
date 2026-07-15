import {
  OTP_CANONICAL_REFERENCE_MATRIX_VERSION,
  buildCanonicalOtpCertificationFingerprint,
  isCanonicalOtpTemplate,
} from './otpCanonicalReferenceMatrix.js'

function normalizeText(value) {
  return String(value ?? '').trim()
}

function asRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

export function resolveCanonicalOtpReferenceMatrixGovernance(template = {}) {
  const metadata = asRecord(template.metadata_json || template.metadataJson)
  const canonical = isCanonicalOtpTemplate(template)
  const lastRun = asRecord(metadata.last_canonical_otp_reference_matrix || metadata.lastCanonicalOtpReferenceMatrix)
  const contractVersion = normalizeText(
    template.canonical_otp_reference_matrix_version ||
    metadata.canonical_otp_reference_matrix_version ||
    lastRun.schemaVersion,
  )
  const adopted = canonical && Boolean(contractVersion)
  const supported = !adopted || contractVersion === OTP_CANONICAL_REFERENCE_MATRIX_VERSION
  const scenarioCount = Number(lastRun.scenarioCount || 0)
  const passedCount = Number(lastRun.passedCount || 0)
  const failedCount = Number(lastRun.failedCount || 0)
  const storedTemplateFingerprint = normalizeText(lastRun.templateFingerprint || lastRun.template_fingerprint)
  const currentTemplateFingerprint = canonical ? buildCanonicalOtpCertificationFingerprint(template) : null
  const matchesTemplate = Boolean(storedTemplateFingerprint && currentTemplateFingerprint && storedTemplateFingerprint === currentTemplateFingerprint)
  const passed = Boolean(adopted && supported && matchesTemplate && lastRun.canPublish === true && scenarioCount > 0 && passedCount === scenarioCount && failedCount === 0)
  const blockingReasons = canonical ? [
    ...(!adopted ? ['matrix_contract_not_adopted'] : []),
    ...(adopted && !supported ? ['matrix_contract_unsupported'] : []),
    ...(adopted && supported && !storedTemplateFingerprint ? ['matrix_fingerprint_missing'] : []),
    ...(adopted && supported && storedTemplateFingerprint && !matchesTemplate ? ['matrix_result_stale'] : []),
    ...(adopted && supported && matchesTemplate && !passed ? ['matrix_failed'] : []),
  ] : []
  return {
    schemaVersion: OTP_CANONICAL_REFERENCE_MATRIX_VERSION,
    contractVersion: contractVersion || null,
    canonical,
    adopted,
    supported,
    runtimeEnforced: adopted,
    passed,
    storedTemplateFingerprint: storedTemplateFingerprint || null,
    currentTemplateFingerprint,
    matchesTemplate,
    certificationKey: normalizeText(lastRun.certificationKey || lastRun.certification_key) || null,
    blockingReasons,
    scenarioCount,
    passedCount,
    failedCount,
    failedScenarioKeys: Array.isArray(lastRun.failedScenarioKeys) ? lastRun.failedScenarioKeys : [],
    validatedAt: lastRun.validatedAt || null,
  }
}
