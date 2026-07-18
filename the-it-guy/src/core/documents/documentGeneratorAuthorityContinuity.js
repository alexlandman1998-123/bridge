import { documentGeneratorProtectedTables } from './documentGeneratorAccessBoundary.js'

export const documentGeneratorAuthorisedReadTables = [
  'document_packets', 'document_packet_versions', 'document_packet_signers', 'document_signing_fields',
  'document_packet_events', 'document_signing_field_layouts', 'document_signing_dispatches',
  'legal_final_transaction_publications', 'legal_final_completion_receipts',
  'legal_final_completion_retry_attempts', 'documents',
]

const solutions = {
  H3_H2_NOT_READY: 'Complete H2 same-tenant least privilege before authority continuity testing.',
  H3_CONTROLLED_TARGETS_MISSING: 'Complete the controlled mandate and OTP pair used by H3.',
  H3_AUTHORISED_ACTOR_INVALID: 'Use an active administrator, assigned agent, or packet creator with authority over both targets.',
  H3_REVOKED_ACTOR_INVALID: 'Use an authenticated actor with an inactive or revoked membership record in every target organisation.',
  H3_POLICY_CONTINUITY_BROKEN: 'Repair packet authority so authorised users pass and revoked users fail immediately.',
  H3_AUTHORISED_TABLE_PATH_BROKEN: 'Restore complete packet-scoped reads for the authorised actor on the listed workflow surfaces.',
  H3_REVOKED_TABLE_PATH_EXPOSED: 'Remove residual workflow-row visibility from the revoked actor.',
  H3_AUTHORISED_STORAGE_PATH_BROKEN: 'Restore generated and signed PDF downloads for the authorised packet actor.',
  H3_REVOKED_STORAGE_PATH_EXPOSED: 'Remove generated or signed PDF access from inactive and revoked memberships.',
  H3_AUTHORISED_RPC_PATH_BROKEN: 'Restore launch, PDF, completion and recovery evidence for legitimate packet actors.',
  H3_REVOKED_RPC_PATH_EXPOSED: 'Make every packet evidence RPC conditional on active membership.',
  H3_AUTHORISED_EDGE_PATH_BROKEN: 'Restore legitimate finaliser and read-only recovery endpoint authority.',
  H3_REVOKED_EDGE_PATH_EXPOSED: 'Reject revoked members before version processing or recovery rehearsal.',
  H3_PROBE_MUTATED_DATA: 'Stop H3; continuity probes must use read-only operations and nonexistent finaliser versions.',
}
const blocker = (code, detail) => ({ code, ...(detail ? { detail } : {}), solution: solutions[code] })

export function assessDocumentGeneratorAuthorityContinuity({ h2 = {}, targetCount = 0, targetOrganisationCount = 0, authorisedActorAvailable = false, authorisedTargetCount = 0, revokedActorAvailable = false, revokedMembershipOrganisationCount = 0, revokedActiveMembershipCount = 0, authorisedPolicyProbes = [], revokedPolicyProbes = [], authorisedTableProbes = [], revokedTableProbes = [], authorisedStorageProbes = [], revokedStorageProbes = [], authorisedRpcProbes = {}, revokedRpcProbes = {}, authorisedEdgeProbes = {}, revokedEdgeProbes = {}, mutatedData = false } = {}) {
  const blockers = []
  const hasTargets = Number(targetCount) >= 2 && Number(targetOrganisationCount) >= 1
  if (h2.status !== 'READY_FOR_H3' || h2.ready !== true) blockers.push(blocker('H3_H2_NOT_READY'))
  if (!hasTargets) blockers.push(blocker('H3_CONTROLLED_TARGETS_MISSING'))
  if (!authorisedActorAvailable || Number(authorisedTargetCount) !== Number(targetCount)) blockers.push(blocker('H3_AUTHORISED_ACTOR_INVALID'))
  if (!revokedActorAvailable || Number(revokedMembershipOrganisationCount) !== Number(targetOrganisationCount) || Number(revokedActiveMembershipCount) !== 0) blockers.push(blocker('H3_REVOKED_ACTOR_INVALID'))
  const allowed = Array.isArray(authorisedPolicyProbes) ? authorisedPolicyProbes : []
  const denied = Array.isArray(revokedPolicyProbes) ? revokedPolicyProbes : []
  if (hasTargets && (allowed.length !== Number(targetCount) || denied.length !== Number(targetCount) || allowed.some((row) => row.allowed !== true) || denied.some((row) => row.allowed !== false))) blockers.push(blocker('H3_POLICY_CONTINUITY_BROKEN'))
  const positiveRows = Array.isArray(authorisedTableProbes) ? authorisedTableProbes : []
  const missingPositive = documentGeneratorAuthorisedReadTables.filter((table) => !positiveRows.some((row) => row.table === table && row.complete === true))
  if (missingPositive.length) blockers.push(blocker('H3_AUTHORISED_TABLE_PATH_BROKEN', missingPositive.join(', ')))
  const revokedRows = Array.isArray(revokedTableProbes) ? revokedTableProbes : []
  const exposedRevoked = documentGeneratorProtectedTables.filter((table) => !revokedRows.some((row) => row.table === table && row.protected === true))
  if (exposedRevoked.length) blockers.push(blocker('H3_REVOKED_TABLE_PATH_EXPOSED', exposedRevoked.join(', ')))
  for (const packetType of ['otp', 'mandate']) for (const artifactType of ['generated', 'final']) {
    if (!authorisedStorageProbes.some((row) => row.packetType === packetType && row.artifactType === artifactType && row.accessible === true && row.validPdf === true)) blockers.push(blocker('H3_AUTHORISED_STORAGE_PATH_BROKEN', `${packetType}:${artifactType}`))
    if (!revokedStorageProbes.some((row) => row.packetType === packetType && row.artifactType === artifactType && row.protected === true)) blockers.push(blocker('H3_REVOKED_STORAGE_PATH_EXPOSED', `${packetType}:${artifactType}`))
  }
  const rpcKeys = ['launchChain', 'generatedPdfAccess', 'completionStatus', 'recoveryRehearsal']
  if (rpcKeys.some((key) => authorisedRpcProbes[key] !== true)) blockers.push(blocker('H3_AUTHORISED_RPC_PATH_BROKEN'))
  if (rpcKeys.some((key) => revokedRpcProbes[key] !== true)) blockers.push(blocker('H3_REVOKED_RPC_PATH_EXPOSED'))
  if (!authorisedEdgeProbes.mandateFinalizerAccepted || !authorisedEdgeProbes.otpFinalizerAccepted || !authorisedEdgeProbes.recoveryAccepted) blockers.push(blocker('H3_AUTHORISED_EDGE_PATH_BROKEN'))
  if (!revokedEdgeProbes.mandateFinalizerRejected || !revokedEdgeProbes.otpFinalizerRejected || !revokedEdgeProbes.recoveryRejected) blockers.push(blocker('H3_REVOKED_EDGE_PATH_EXPOSED'))
  if (mutatedData !== false) blockers.push(blocker('H3_PROBE_MUTATED_DATA'))
  const unique = [...new Map(blockers.map((item) => [`${item.code}:${item.detail || ''}`, item])).values()]
  return { ready: unique.length === 0, blockers: unique }
}
