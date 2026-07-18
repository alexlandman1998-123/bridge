import { documentGeneratorProtectedTables } from './documentGeneratorAccessBoundary.js'

const solutions = {
  H4_H3_NOT_READY: 'Complete H3 authority continuity and revocation before public-surface certification.',
  H4_CONTROLLED_TARGETS_MISSING: 'Complete the controlled mandate and OTP pair used by the public-surface probe.',
  H4_ANONYMOUS_TABLE_EXPOSED: 'Remove anonymous row access from every packet, signing, publication and recovery table.',
  H4_ANONYMOUS_STORAGE_EXPOSED: 'Keep generated and signed PDFs private and issue only short-lived signer- or packet-authorised links.',
  H4_PERSISTED_URL_EXPOSED: 'Remove or expire persistent generated/final file URLs and retain private bucket/path identity.',
  H4_ANONYMOUS_RPC_EXPOSED: 'Revoke anonymous execution or require packet authority on internal evidence RPCs.',
  H4_ANONYMOUS_OPERATION_EXPOSED: 'Reject anonymous finalisation, delivery, watchdog and completion-recovery operations.',
  H4_FAKE_TOKEN_BOUNDARY_INVALID: 'Return the same sanitised INVALID_SIGNING_TOKEN response before any signer data or mutation.',
  H4_SIGNER_SCOPE_INVALID: 'Repair signer-to-field and certified-PDF binding for the affected mandate or OTP.',
  H4_PUBLIC_RESPONSE_OVERSHARED: 'Deploy the sanitised signer response that excludes internal organisation, packet, version, layout, dispatch and storage identifiers.',
  H4_PROBE_MUTATED_DATA: 'Stop H4; public-boundary verification must not use a real token or mutate signing state.',
}
const blocker = (code, detail) => ({ code, ...(detail ? { detail } : {}), solution: solutions[code] })

export function assessDocumentGeneratorPublicSurfaceBoundary({ h3 = {}, targetCount = 0, tableProbes = [], storageProbes = [], publicUrlProbes = [], rpcProbes = {}, operationProbes = {}, fakeTokenProbes = {}, signerSurfaceEvidence = [], mutatedData = false } = {}) {
  const blockers = []
  if (h3.status !== 'READY_FOR_H4' || h3.ready !== true) blockers.push(blocker('H4_H3_NOT_READY'))
  if (Number(targetCount) < 2) blockers.push(blocker('H4_CONTROLLED_TARGETS_MISSING'))
  const rows = Array.isArray(tableProbes) ? tableProbes : []
  const exposedTables = documentGeneratorProtectedTables.filter((table) => !rows.some((row) => row.table === table && row.protected === true))
  if (exposedTables.length) blockers.push(blocker('H4_ANONYMOUS_TABLE_EXPOSED', exposedTables.join(', ')))
  const artifacts = Array.isArray(storageProbes) ? storageProbes : []
  for (const packetType of ['otp', 'mandate']) for (const artifactType of ['generated', 'final']) if (!artifacts.some((row) => row.packetType === packetType && row.artifactType === artifactType && row.protected === true)) blockers.push(blocker('H4_ANONYMOUS_STORAGE_EXPOSED', `${packetType}:${artifactType}`))
  const urls = Array.isArray(publicUrlProbes) ? publicUrlProbes : []
  for (const packetType of ['otp', 'mandate']) for (const artifactType of ['generated', 'final']) if (!urls.some((row) => row.packetType === packetType && row.artifactType === artifactType && row.protected === true)) blockers.push(blocker('H4_PERSISTED_URL_EXPOSED', `${packetType}:${artifactType}`))
  if (!rpcProbes.packetAuthorityRejected || !rpcProbes.launchChainRejected || !rpcProbes.generatedPdfAccessRejected || !rpcProbes.completionStatusRejected || !rpcProbes.recoveryRehearsalRejected) blockers.push(blocker('H4_ANONYMOUS_RPC_EXPOSED'))
  if (!operationProbes.mandateFinalizerRejected || !operationProbes.otpFinalizerRejected || !operationProbes.dispatcherRejected || !operationProbes.watchdogRejected || !operationProbes.recoveryRejected) blockers.push(blocker('H4_ANONYMOUS_OPERATION_EXPOSED'))
  if (!fakeTokenProbes.resolveRejected || !fakeTokenProbes.actionRejected || !fakeTokenProbes.responsesSanitised) blockers.push(blocker('H4_FAKE_TOKEN_BOUNDARY_INVALID'))
  const evidence = Array.isArray(signerSurfaceEvidence) ? signerSurfaceEvidence : []
  for (const packetType of ['otp', 'mandate']) {
    const row = evidence.find((item) => item.packetType === packetType)
    if (!row || row.contract !== 'h4-generator-v1' || row.currentVersion !== true || row.certifiedPdfBound !== true || Number(row.signerCount) < 1 || Number(row.invalidTokenCount) !== 0 || Number(row.signersWithoutFields) !== 0 || Number(row.signersWithoutRequiredSignature) !== 0 || Number(row.ambiguousUnscopedFieldCount) !== 0 || Number(row.deliveredDispatchCount) < 1) blockers.push(blocker('H4_SIGNER_SCOPE_INVALID', packetType))
    if (!row || row.internalIdentifiersExcluded !== true || !Array.isArray(row.publicResponseKeys) || row.mutatedData !== false) blockers.push(blocker('H4_PUBLIC_RESPONSE_OVERSHARED', packetType))
  }
  if (mutatedData !== false) blockers.push(blocker('H4_PROBE_MUTATED_DATA'))
  const unique = [...new Map(blockers.map((item) => [`${item.code}:${item.detail || ''}`, item])).values()]
  return { ready: unique.length === 0, blockers: unique }
}
