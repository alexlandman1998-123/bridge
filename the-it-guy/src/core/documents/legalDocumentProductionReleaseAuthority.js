const MAX_EVIDENCE_AGE_MINUTES = 15

const SOLUTIONS = Object.freeze({
  M1_L1_NOT_CERTIFIED: 'Complete the L1 remediation plan until the consolidated certificate reports READY_FOR_L2.',
  M1_L3_GATE_NOT_COMPLETE: 'Complete each L3-authorised wave and rerun L3 until it reports READY_FOR_L4.',
  M1_OTP_COVERAGE_MISSING: 'Complete and retain one controlled OTP generation-to-final-delivery journey.',
  M1_MANDATE_COVERAGE_MISSING: 'Complete and retain one controlled mandate generation-to-final-delivery journey.',
  M1_RELEASE_ENVIRONMENT_UNCONFIRMED: 'Set LEGAL_DOCUMENT_RELEASE_ENVIRONMENT to the deliberately selected environment and rerun M1.',
  M1_RELEASE_ENVIRONMENT_MISMATCH: 'Make the explicit release environment match the governed pilot configuration.',
  M1_RELEASE_PROJECT_UNCONFIRMED: 'Set LEGAL_DOCUMENT_RELEASE_PROJECT_REF to the deliberately selected Supabase project ref and rerun M1.',
  M1_TARGET_PROJECT_MISSING: 'Record the exact activation targetProjectRef through the guarded A3 workflow.',
  M1_RELEASE_PROJECT_MISMATCH: 'Make the explicit release project, A3 activation project, and governed configuration project identical.',
  M1_PILOT_NOT_ACTIVE: 'Complete guarded A3 activation and verify its runtime secret digests before release.',
  M1_RELEASE_PREPARATION_NOT_APPROVED: 'Record accountable release-preparation approval for the exact controlled cohort.',
  M1_RELEASE_COHORT_EMPTY: 'Approve and activate a non-empty controlled organisation cohort.',
  M1_ACTIVATED_COHORT_MISMATCH: 'Make the effective, approved, and activated organisation allowlists identical.',
  M1_EVIDENCE_STALE: 'Rerun M1 to rebuild L1-L3 evidence within the 15-minute release window.',
  M1_NON_READ_ONLY_EVIDENCE: 'Restore read-only certification evidence; release authority cannot depend on a verifier that mutated state.',
  M1_Q3_EXPANSION_NOT_VERIFIED: 'Complete fresh Q3 post-activation verification for the expanded cohort before issuing new authority.',
  M1_Q3_ACTIVATION_BINDING_INVALID: 'Make Q3 verification reference the exact expanded-cohort activation receipt.',
})

function normalize(value) {
  return String(value || '').trim()
}

function ids(value) {
  return [...new Set((Array.isArray(value) ? value : []).map(normalize).filter(Boolean))].sort()
}

export function assessLegalDocumentProductionReleaseAuthority({ l3 = {}, pilot = {}, confirmation = {}, expansion = {}, now = Date.now(), maxEvidenceAgeMinutes = MAX_EVIDENCE_AGE_MINUTES } = {}) {
  const codes = []
  const evidence = l3.evidence || {}
  const coverage = evidence.coverage || {}
  const activation = pilot.activation || {}
  const preparation = pilot.releasePreparation || {}
  const configuredIds = ids(pilot.organisationIds)
  const approvedIds = ids(preparation.organisationIds)
  const activatedIds = ids(activation.activatedOrganisationIds)
  const configuredEnvironment = normalize(pilot.environment).toLowerCase()
  const confirmedEnvironment = normalize(confirmation.environment).toLowerCase()
  const configuredProjectRef = normalize(activation.targetProjectRef)
  const certifiedProjectRef = normalize(evidence.activationProjectRef)
  const confirmedProjectRef = normalize(confirmation.projectRef)

  if (evidence.l1Status !== 'READY_FOR_L2') codes.push('M1_L1_NOT_CERTIFIED')
  if (l3.status !== 'READY_FOR_L4' || l3.gateComplete !== true) codes.push('M1_L3_GATE_NOT_COMPLETE')
  if (coverage.otp !== true) codes.push('M1_OTP_COVERAGE_MISSING')
  if (coverage.mandate !== true) codes.push('M1_MANDATE_COVERAGE_MISSING')
  if (!confirmedEnvironment) codes.push('M1_RELEASE_ENVIRONMENT_UNCONFIRMED')
  else if (!configuredEnvironment || confirmedEnvironment !== configuredEnvironment) codes.push('M1_RELEASE_ENVIRONMENT_MISMATCH')
  if (!confirmedProjectRef) codes.push('M1_RELEASE_PROJECT_UNCONFIRMED')
  if (!configuredProjectRef) codes.push('M1_TARGET_PROJECT_MISSING')
  if (confirmedProjectRef && configuredProjectRef && (confirmedProjectRef !== configuredProjectRef || (certifiedProjectRef && certifiedProjectRef !== configuredProjectRef))) codes.push('M1_RELEASE_PROJECT_MISMATCH')
  if (pilot.enabled !== true || activation.status !== 'active') codes.push('M1_PILOT_NOT_ACTIVE')
  if (preparation.status !== 'approved' || !preparation.approvedBy || !preparation.approvedAt || !preparation.approvalReference) codes.push('M1_RELEASE_PREPARATION_NOT_APPROVED')
  if (!configuredIds.length || !approvedIds.length || !activatedIds.length) codes.push('M1_RELEASE_COHORT_EMPTY')
  else if (configuredIds.join(',') !== approvedIds.join(',') || configuredIds.join(',') !== activatedIds.join(',')) codes.push('M1_ACTIVATED_COHORT_MISMATCH')
  const timestamps = [l3.checkedAt, evidence.l2CheckedAt, evidence.l1CheckedAt]
  const stale = timestamps.some((value) => {
    const parsed = Date.parse(value || '')
    return !Number.isFinite(parsed) || parsed > now + 60_000 || now - parsed > maxEvidenceAgeMinutes * 60_000
  })
  if (stale) codes.push('M1_EVIDENCE_STALE')
  if (l3.mutatedData !== false || evidence.l2MutatedData !== false || evidence.l1MutatedData !== false) codes.push('M1_NON_READ_ONLY_EVIDENCE')
  if (expansion.required === true) {
    if (expansion.q3?.status !== 'READY_FOR_M1' || expansion.q3?.ready !== true || expansion.q3?.mutatedData !== false) codes.push('M1_Q3_EXPANSION_NOT_VERIFIED')
    if (!normalize(expansion.activationDigest) || expansion.q3?.verification?.sourceActivationDigest !== expansion.activationDigest || normalize(activation.expansionActivationDigest) !== expansion.activationDigest) codes.push('M1_Q3_ACTIVATION_BINDING_INVALID')
  }

  const uniqueCodes = [...new Set(codes)]
  return {
    authorized: uniqueCodes.length === 0,
    blockers: uniqueCodes.map((code) => ({ code, solution: SOLUTIONS[code] })),
    releaseTarget: { environment: confirmedEnvironment || null, projectRef: confirmedProjectRef || null, organisationIds: configuredIds },
    evidenceAgeLimitMinutes: maxEvidenceAgeMinutes,
  }
}

export { MAX_EVIDENCE_AGE_MINUTES as LEGAL_DOCUMENT_M1_MAX_EVIDENCE_AGE_MINUTES }
