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

export function assessLegalDocumentCanaryAcceptance({ n2 = {}, claim = null, canaries = [], storeAvailable = true, now = Date.now() } = {}) {
  const blockers = []
  const push = (code, solution, detail = null) => blockers.push({ code, detail, solution })
  if (n2.status !== 'READY_FOR_N3' || n2.ready !== true) push('N3_N2_NOT_READY', 'Resolve N2 and open the exact rollout safety envelope before accepting canaries.')
  if (!claim || claim.status !== 'claimed') push('N3_RELEASE_CLAIM_MISSING', 'Restore the valid M3 claim before selecting rollout canaries.')
  if (!storeAvailable) push('N3_CANARY_STORE_UNAVAILABLE', 'Restore read access to packet, signing, artifact, publication, and delivery evidence before rollout.')
  const rows = Array.isArray(canaries) ? canaries : []
  const byType = new Map(rows.map((row) => [packetType(row.packetType), row]))
  if (rows.length !== 2 || !byType.has('otp') || !byType.has('mandate')) push('N3_CANARY_PAIR_INCOMPLETE', 'Complete one OTP and one mandate through final delivery after the M3 claim.')
  const targetIds = new Set(n2.rolloutEnvelope?.target?.organisationIds || [])
  const claimStart = timestamp(claim?.claimedAt)
  const claimExpiry = timestamp(claim?.expiresAt)
  const packetIds = new Set()
  const versionIds = new Set()
  for (const row of rows) {
    const type = packetType(row.packetType)
    if (row.status !== 'passed' || (row.reasons || []).length) push('N3_CANARY_LIFECYCLE_INVALID', 'Repeat the affected canary through one coherent current version and investigate its G1 lifecycle reasons.', type)
    if (!targetIds.has(normalize(row.organisationId))) push('N3_CANARY_OUTSIDE_COHORT', 'Run canaries only inside the exact N2 organisation cohort.', type)
    if (!normalize(row.packetId) || packetIds.has(row.packetId) || !normalize(row.versionId) || versionIds.has(row.versionId)) push('N3_CANARY_IDENTITY_INVALID', 'Use distinct OTP and mandate packets with distinct exact current versions.', type)
    packetIds.add(row.packetId)
    versionIds.add(row.versionId)
    const generated = timestamp(row.milestoneTimes?.generated)
    const delivered = timestamp(row.milestoneTimes?.delivered)
    if (claimStart === null || claimExpiry === null || generated === null || delivered === null || generated < claimStart || delivered < generated || delivered >= claimExpiry || delivered > now + 60_000) push('N3_CANARY_OUTSIDE_CLAIM_WINDOW', 'Generate and finally deliver the canary after claim time and before claim expiry.', type)
    if (!/^[a-f0-9]{64}$/i.test(normalize(row.finalArtifactSha256))) push('N3_CANARY_ARTIFACT_DIGEST_INVALID', 'Regenerate the final canary artifact through the governed finalisation path.', type)
  }
  return {
    ready: blockers.length === 0,
    blockers: [...new Map(blockers.map((row) => [`${row.code}:${row.detail || ''}`, row])).values()],
    acceptedCanaries: rows.map((row) => ({ packetType: packetType(row.packetType), packetId: row.packetId || null, versionId: row.versionId || null, organisationId: row.organisationId || null, finalArtifactSha256: row.finalArtifactSha256 || null, generatedAt: row.milestoneTimes?.generated || null, deliveredAt: row.milestoneTimes?.delivered || null, status: row.status || 'unknown' })),
  }
}
