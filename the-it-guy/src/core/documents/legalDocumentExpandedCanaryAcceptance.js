function normalize(value) {
  return String(value || '').trim()
}

function timestamp(value) {
  const parsed = Date.parse(value || '')
  return Number.isFinite(parsed) ? parsed : null
}

function packetType(value) {
  const type = normalize(value).toLowerCase()
  return type === 'salesmandate' || type === 'sales_mandate' ? 'mandate' : type
}

export function assessLegalDocumentExpandedCanaryAcceptance({ s2 = {}, claim = null, activation = null, canaries = [], storeAvailable = true, now = Date.now() } = {}) {
  const blockers = []
  const push = (code, solution, detail = null) => blockers.push({ code, detail, solution })
  const envelope = s2.rolloutEnvelope || {}
  const added = normalize(activation?.addedOrganisationId)
  if (s2.status !== 'READY_FOR_S3' || s2.ready !== true) push('S3_S2_NOT_READY', 'Resolve S2 and open the exact expanded rollout safety envelope before accepting canaries.')
  if (!claim || claim.status !== 'claimed') push('S3_RELEASE_CLAIM_MISSING', 'Restore the valid R3 claim before selecting expanded-cohort canaries.')
  if (!activation || activation.status !== 'activated' || !normalize(activation.activationDigest)) push('S3_ACTIVATION_RECORD_MISSING', 'Restore the exact Q2 expanded-cohort activation record.')
  if (!storeAvailable) push('S3_CANARY_STORE_UNAVAILABLE', 'Restore read access to packet, signing, artifact, publication, and delivery evidence before rollout.')
  if (!added || envelope.canaryOrganisationId !== added || envelope.sourceActivationDigest !== activation?.activationDigest || claim?.sourceActivationDigest !== activation?.activationDigest) push('S3_CANARY_TARGET_BINDING_INVALID', 'Bind both canaries to the exact organisation added by the current Q2 activation.')
  const rows = Array.isArray(canaries) ? canaries : []
  const byType = new Map(rows.map((row) => [packetType(row.packetType), row]))
  if (rows.length !== 2 || !byType.has('otp') || !byType.has('mandate')) push('S3_CANARY_PAIR_INCOMPLETE', 'Complete one OTP and one mandate for the added organisation through final delivery after the R3 claim.')
  const claimStart = timestamp(claim?.claimedAt)
  const claimExpiry = timestamp(claim?.expiresAt)
  const packetIds = new Set()
  const versionIds = new Set()
  for (const row of rows) {
    const type = packetType(row.packetType)
    if (row.status !== 'passed' || (row.reasons || []).length) push('S3_CANARY_LIFECYCLE_INVALID', 'Halt and investigate the affected added-organisation canary lifecycle.', type)
    if (normalize(row.organisationId) !== added) push('S3_CANARY_NOT_IN_ADDED_ORGANISATION', 'Run both OTP and mandate canaries only for the organisation added by Q2.', type)
    if (!normalize(row.packetId) || packetIds.has(row.packetId) || !normalize(row.versionId) || versionIds.has(row.versionId)) push('S3_CANARY_IDENTITY_INVALID', 'Use distinct OTP and mandate packets with distinct exact current versions.', type)
    packetIds.add(row.packetId)
    versionIds.add(row.versionId)
    const generated = timestamp(row.milestoneTimes?.generated)
    const delivered = timestamp(row.milestoneTimes?.delivered)
    if (claimStart === null || claimExpiry === null || generated === null || delivered === null || generated < claimStart || delivered < generated || delivered >= claimExpiry || delivered > now + 60_000) push('S3_CANARY_OUTSIDE_CLAIM_WINDOW', 'Generate and finally deliver each canary after claim time and before claim expiry.', type)
    if (!/^[a-f0-9]{64}$/i.test(normalize(row.finalArtifactSha256))) push('S3_CANARY_ARTIFACT_DIGEST_INVALID', 'Regenerate the final canary artifact through the governed finalisation path.', type)
  }
  return {
    ready: blockers.length === 0,
    blockers: [...new Map(blockers.map((row) => [`${row.code}:${row.detail || ''}`, row])).values()],
    acceptedCanaries: rows.map((row) => ({ packetType: packetType(row.packetType), packetId: row.packetId || null, versionId: row.versionId || null, organisationId: row.organisationId || null, finalArtifactSha256: row.finalArtifactSha256 || null, generatedAt: row.milestoneTimes?.generated || null, deliveredAt: row.milestoneTimes?.delivered || null, status: row.status || 'unknown' })),
  }
}
