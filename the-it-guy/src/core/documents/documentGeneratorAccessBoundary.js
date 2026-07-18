function text(value) { return typeof value === 'string' ? value.trim() : '' }

export const documentGeneratorProtectedTables = [
  'document_packets',
  'document_packet_versions',
  'document_packet_signers',
  'document_signing_fields',
  'document_packet_events',
  'document_signing_field_layouts',
  'document_signing_dispatches',
  'document_signer_sessions',
  'legal_final_artifact_evidence',
  'legal_final_artifact_deliveries',
  'legal_final_artifact_publications',
  'legal_final_delivery_claims',
  'legal_final_transaction_publications',
  'legal_final_completion_receipts',
  'legal_final_completion_retry_attempts',
  'documents',
]

const solutions = {
  H1_G4_NOT_READY: 'Complete the G4 recovery rehearsal before certifying the access boundary.',
  H1_CONTROLLED_TARGETS_MISSING: 'Complete one controlled OTP and mandate in the same organisation through G4.',
  H1_UNRELATED_ACTOR_NOT_ISOLATED: 'Use a staging actor with no membership in the controlled organisation.',
  H1_TABLE_PROBE_MISSING: 'Add the missing A–G table to the H1 cross-tenant probe.',
  H1_CROSS_TENANT_TABLE_EXPOSED: 'Revoke the unrelated row path and bind its RLS policy to packet-scoped organisation authority.',
  H1_STORAGE_PROBE_MISSING: 'Provide both generated and final PDF storage evidence for the mandate and OTP.',
  H1_CROSS_TENANT_STORAGE_EXPOSED: 'Restrict generated and signed PDF storage policies to users who can access the bound packet.',
  H1_RPC_BOUNDARY_INVALID: 'Require packet-scoped access before returning launch, PDF-access, recovery, or completion evidence.',
  H1_EDGE_BOUNDARY_INVALID: 'Restore authentication and service authority checks on finalisation, delivery, watchdog and recovery endpoints.',
  H1_PROBE_MUTATED_DATA: 'Stop the H1 run: boundary verification must use read-only or nonexistent-version probes only.',
}
const blocker = (code, detail) => ({ code, ...(detail ? { detail } : {}), solution: solutions[code] })

export function assessDocumentGeneratorAccessBoundary({ g4 = {}, targetCount = 0, unrelatedMembershipCount = 0, tableProbes = [], storageProbes = [], rpcProbes = {}, edgeProbes = {}, mutatedData = false } = {}) {
  const blockers = []
  if (g4.status !== 'READY_FOR_H1' || g4.ready !== true) blockers.push(blocker('H1_G4_NOT_READY'))
  if (Number(targetCount) < 2) blockers.push(blocker('H1_CONTROLLED_TARGETS_MISSING'))
  if (Number(unrelatedMembershipCount) !== 0) blockers.push(blocker('H1_UNRELATED_ACTOR_NOT_ISOLATED'))
  const rows = Array.isArray(tableProbes) ? tableProbes : []
  const missingTables = documentGeneratorProtectedTables.filter((table) => !rows.some((row) => row.table === table))
  if (missingTables.length) blockers.push(blocker('H1_TABLE_PROBE_MISSING', missingTables.join(', ')))
  const exposedTables = rows.filter((row) => row.protected !== true).map((row) => row.table)
  if (exposedTables.length) blockers.push(blocker('H1_CROSS_TENANT_TABLE_EXPOSED', exposedTables.join(', ')))
  const artifacts = Array.isArray(storageProbes) ? storageProbes : []
  for (const packetType of ['otp', 'mandate']) for (const artifactType of ['generated', 'final']) {
    if (!artifacts.some((row) => row.packetType === packetType && row.artifactType === artifactType)) blockers.push(blocker('H1_STORAGE_PROBE_MISSING', `${packetType}:${artifactType}`))
  }
  const exposedArtifacts = artifacts.filter((row) => row.protected !== true).map((row) => `${row.packetType}:${row.artifactType}`)
  if (exposedArtifacts.length) blockers.push(blocker('H1_CROSS_TENANT_STORAGE_EXPOSED', exposedArtifacts.join(', ')))
  if (!rpcProbes.launchChainRejected || !rpcProbes.generatedPdfAccessRejected || !rpcProbes.completionStatusRejected || !rpcProbes.recoveryRehearsalRejected) blockers.push(blocker('H1_RPC_BOUNDARY_INVALID'))
  if (!edgeProbes.mandateFinalizerRejected || !edgeProbes.otpFinalizerRejected || !edgeProbes.dispatcherRejected || !edgeProbes.watchdogRejected || !edgeProbes.recoveryRejected) blockers.push(blocker('H1_EDGE_BOUNDARY_INVALID'))
  if (mutatedData !== false) blockers.push(blocker('H1_PROBE_MUTATED_DATA'))
  const unique = [...new Map(blockers.map((item) => [`${item.code}:${item.detail || ''}`, item])).values()]
  return { ready: unique.length === 0, blockers: unique, protectedTableCount: documentGeneratorProtectedTables.length }
}
