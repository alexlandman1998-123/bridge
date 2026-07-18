import { documentGeneratorProtectedTables } from './documentGeneratorAccessBoundary.js'

const solutions = {
  H2_H1_NOT_READY: 'Complete cross-tenant H1 isolation before certifying same-tenant least privilege.',
  H2_CONTROLLED_TARGETS_MISSING: 'Complete the controlled OTP and mandate pair used by the access tests.',
  H2_ACTOR_MEMBERSHIP_INVALID: 'Use an active ordinary member in every controlled target organisation.',
  H2_ACTOR_HAS_PACKET_AUTHORITY: 'Use a member who is not an administrator, assigned agent, or packet creator.',
  H2_POLICY_CONTRACT_INVALID: 'Deploy the packet-scoped authority helper and deny both controlled packets to the unassigned actor.',
  H2_CATALOGUE_BOUNDARY_INVALID: 'Deploy migration 202607180026 and remove broad or writable grants from the A–G evidence tables.',
  H2_TABLE_PROBE_MISSING: 'Add every protected A–G table to the same-tenant denial probe.',
  H2_SAME_TENANT_TABLE_EXPOSED: 'Replace broad organisation-member access with packet-scoped RLS for the exposed table.',
  H2_STORAGE_PROBE_MISSING: 'Probe generated and final PDFs for both mandate and OTP.',
  H2_SAME_TENANT_STORAGE_EXPOSED: 'Bind generated and final PDF storage access to packet authority rather than organisation membership alone.',
  H2_RPC_BOUNDARY_INVALID: 'Require packet authority before launch, PDF, completion, or recovery evidence is returned.',
  H2_EDGE_BOUNDARY_INVALID: 'Reject unassigned members before finalisation, delivery, watchdog, or recovery operations.',
  H2_PROBE_MUTATED_DATA: 'Stop the H2 run; least-privilege verification must remain read-only.',
}
const blocker = (code, detail) => ({ code, ...(detail ? { detail } : {}), solution: solutions[code] })

export function assessDocumentGeneratorLeastPrivilegeBoundary({ h1 = {}, targetCount = 0, targetOrganisationCount = 0, actorMembershipOrganisationCount = 0, actorAuthorizedTargetCount = 0, policyProbes = [], catalogue = {}, tableProbes = [], storageProbes = [], rpcProbes = {}, edgeProbes = {}, mutatedData = false } = {}) {
  const blockers = []
  const hasTargets = Number(targetCount) >= 2 && Number(targetOrganisationCount) >= 1
  if (h1.status !== 'READY_FOR_H2' || h1.ready !== true) blockers.push(blocker('H2_H1_NOT_READY'))
  if (!hasTargets) blockers.push(blocker('H2_CONTROLLED_TARGETS_MISSING'))
  if (hasTargets && Number(actorMembershipOrganisationCount) !== Number(targetOrganisationCount)) blockers.push(blocker('H2_ACTOR_MEMBERSHIP_INVALID'))
  if (hasTargets && Number(actorAuthorizedTargetCount) !== 0) blockers.push(blocker('H2_ACTOR_HAS_PACKET_AUTHORITY'))
  const policies = Array.isArray(policyProbes) ? policyProbes : []
  if (hasTargets && (policies.length !== Number(targetCount) || policies.some((row) => row.allowed !== false || row.contractAvailable !== true))) blockers.push(blocker('H2_POLICY_CONTRACT_INVALID'))
  if (catalogue.contract !== 'h2-generator-v1' || Number(catalogue.packetScopedPolicyTableCount) !== Number(catalogue.expectedPolicyTableCount) || Number(catalogue.rlsTableCount) !== Number(catalogue.expectedRlsTableCount) || Number(catalogue.directPipelineWriteGrantCount) !== 0 || Number(catalogue.serviceEvidenceClientGrantCount) !== 0) blockers.push(blocker('H2_CATALOGUE_BOUNDARY_INVALID'))
  const rows = Array.isArray(tableProbes) ? tableProbes : []
  const missingTables = documentGeneratorProtectedTables.filter((table) => !rows.some((row) => row.table === table))
  if (missingTables.length) blockers.push(blocker('H2_TABLE_PROBE_MISSING', missingTables.join(', ')))
  const exposedTables = rows.filter((row) => row.protected !== true).map((row) => row.table)
  if (exposedTables.length) blockers.push(blocker('H2_SAME_TENANT_TABLE_EXPOSED', exposedTables.join(', ')))
  const artifacts = Array.isArray(storageProbes) ? storageProbes : []
  for (const packetType of ['otp', 'mandate']) for (const artifactType of ['generated', 'final']) if (!artifacts.some((row) => row.packetType === packetType && row.artifactType === artifactType)) blockers.push(blocker('H2_STORAGE_PROBE_MISSING', `${packetType}:${artifactType}`))
  const exposedArtifacts = artifacts.filter((row) => row.protected !== true).map((row) => `${row.packetType}:${row.artifactType}`)
  if (exposedArtifacts.length) blockers.push(blocker('H2_SAME_TENANT_STORAGE_EXPOSED', exposedArtifacts.join(', ')))
  if (!rpcProbes.launchChainRejected || !rpcProbes.generatedPdfAccessRejected || !rpcProbes.completionStatusRejected || !rpcProbes.recoveryRehearsalRejected) blockers.push(blocker('H2_RPC_BOUNDARY_INVALID'))
  if (!edgeProbes.mandateFinalizerRejected || !edgeProbes.otpFinalizerRejected || !edgeProbes.dispatcherRejected || !edgeProbes.watchdogRejected || !edgeProbes.recoveryRejected) blockers.push(blocker('H2_EDGE_BOUNDARY_INVALID'))
  if (mutatedData !== false) blockers.push(blocker('H2_PROBE_MUTATED_DATA'))
  const unique = [...new Map(blockers.map((item) => [`${item.code}:${item.detail || ''}`, item])).values()]
  return { ready: unique.length === 0, blockers: unique }
}
