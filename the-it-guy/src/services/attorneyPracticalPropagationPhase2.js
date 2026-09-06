import { resolveAttorneyUpdateDestinations } from './attorneyReleasePropagation.js'

export const ATTORNEY_PRACTICAL_PHASE2_VERSION = 'attorney-practical-propagation-proof-phase2-v1'

const text = (value) => String(value || '').trim()
const issue = (code, remedy, details = {}) => ({ code, remedy, ...details })
const MUTATING_ACTION_EXCLUSIONS = new Set(['open_assigned_matter'])

export function buildAttorneyPracticalPropagationSources(phase1Evidence = {}) {
  return (phase1Evidence.walkthroughs || []).flatMap((walkthrough) =>
    (walkthrough.actions || [])
      .filter(({ key, passed }) => passed === true && !MUTATING_ACTION_EXCLUSIONS.has(key))
      .map((action) => ({
        sourceId: `${walkthrough.id}:${action.receiptId}`,
        walkthroughId: walkthrough.id,
        role: walkthrough.id?.split(':')[0] || '',
        viewport: walkthrough.id?.split(':')[1] || '',
        matterId: walkthrough.matterId,
        action: action.key,
        receiptId: action.receiptId,
        completedAt: action.completedAt,
      })),
  )
}

function predecessorBlockers({ contractFingerprint, phase1Report, phase1Evidence, phase1EvidenceFingerprint }) {
  const blockers = []
  if (phase1Report?.status !== 'PASSED') blockers.push(issue('PHASE1_NOT_PASSED', 'Complete and pass practical authenticated browser UAT before testing propagation.'))
  if (!text(contractFingerprint) || phase1Evidence?.contractFingerprint !== contractFingerprint) blockers.push(issue('PHASE1_EVIDENCE_CONTRACT_STALE', 'Use Phase 1 evidence from the current release-bar contract.'))
  if (!text(phase1EvidenceFingerprint) || phase1Report?.evidenceFingerprint !== phase1EvidenceFingerprint) blockers.push(issue('PHASE1_EVIDENCE_FINGERPRINT_MISMATCH', 'Regenerate the Phase 1 report from the exact evidence supplied to Phase 2.'))
  return blockers
}

export function buildAttorneyPracticalPhase2Decision({
  contract = {},
  contractFingerprint = '',
  phase1Report = null,
  phase1Evidence = null,
  phase1EvidenceFingerprint = '',
  evidence = null,
  evidenceFingerprint = null,
} = {}) {
  const sources = buildAttorneyPracticalPropagationSources(phase1Evidence || {})
  const blockers = predecessorBlockers({ contractFingerprint, phase1Report, phase1Evidence, phase1EvidenceFingerprint })
  if (blockers.length) return {
    version: ATTORNEY_PRACTICAL_PHASE2_VERSION,
    status: 'BLOCKED',
    executionAuthorized: false,
    sourceCount: sources.length,
    blockerCount: blockers.length,
    blockers,
    evidenceFingerprint: null,
  }
  if (!evidence) return {
    version: ATTORNEY_PRACTICAL_PHASE2_VERSION,
    status: 'READY_TO_RUN',
    executionAuthorized: true,
    sourceCount: sources.length,
    blockerCount: 0,
    blockers: [],
    evidenceFingerprint: null,
  }

  const defects = []
  if (evidence.version !== ATTORNEY_PRACTICAL_PHASE2_VERSION) defects.push(issue('EVIDENCE_VERSION_INVALID', 'Use the current Phase 2 evidence format.'))
  if (evidence.environment !== 'staging') defects.push(issue('NON_STAGING_EVIDENCE', 'Capture propagation evidence only in staging.'))
  if (evidence.contractFingerprint !== contractFingerprint) defects.push(issue('EVIDENCE_CONTRACT_STALE', 'Repeat propagation proof against the current contract.'))
  if (evidence.phase1EvidenceFingerprint !== phase1EvidenceFingerprint) defects.push(issue('SOURCE_EVIDENCE_STALE', 'Bind propagation evidence to the exact passed Phase 1 run.'))
  if (!text(evidence.startedAt) || !text(evidence.completedAt) || !text(evidence.executedBy)) defects.push(issue('RUN_METADATA_INCOMPLETE', 'Record the executor and run timestamps.'))

  const proofs = Array.isArray(evidence.proofs) ? evidence.proofs : []
  const proofIds = proofs.map(({ sourceId }) => sourceId)
  const duplicateIds = proofIds.filter((id, index) => proofIds.indexOf(id) !== index)
  if (duplicateIds.length) defects.push(issue('DUPLICATE_SOURCE_PROOF', 'Keep exactly one propagation proof per source receipt.', { sourceIds: [...new Set(duplicateIds)] }))

  const observedDestinationCoverage = new Set()
  for (const source of sources) {
    const proof = proofs.find(({ sourceId }) => sourceId === source.sourceId)
    if (!proof) {
      defects.push(issue('PROPAGATION_PROOF_MISSING', 'Trace the Phase 1 action receipt through its permitted destinations.', { sourceId: source.sourceId }))
      continue
    }
    if (proof.receiptId !== source.receiptId || proof.matterId !== source.matterId || proof.action !== source.action) defects.push(issue('SOURCE_IDENTITY_MISMATCH', 'Match proof identity to the original Phase 1 action.', { sourceId: source.sourceId }))
    const expectedDestinations = resolveAttorneyUpdateDestinations({ visibility: proof.visibility, clientRecipients: proof.clientRecipients })
    if (!['internal', 'professional_shared', 'client_visible'].includes(proof.visibility)) defects.push(issue('VISIBILITY_INVALID', 'Classify the source update with a supported visibility.', { sourceId: source.sourceId }))
    if (proof.visibility === 'client_visible' && (!Array.isArray(proof.clientRecipients) || proof.clientRecipients.length === 0)) defects.push(issue('CLIENT_RECIPIENT_REQUIRED', 'Select buyer, seller, or both for client-visible updates.', { sourceId: source.sourceId }))
    const observations = Array.isArray(proof.destinations) ? proof.destinations : []
    const observedNames = observations.map(({ destination }) => destination)
    const duplicateDestinations = observedNames.filter((name, index) => observedNames.indexOf(name) !== index)
    if (duplicateDestinations.length) defects.push(issue('DUPLICATE_DESTINATION_PROOF', 'Keep one observation per destination.', { sourceId: source.sourceId, destinations: [...new Set(duplicateDestinations)] }))
    for (const destination of expectedDestinations) {
      const observation = observations.find((item) => item.destination === destination)
      if (!observation || observation.observed !== true || !text(observation.observedAt) || !text(observation.sourceValueHash) || observation.sourceValueHash !== observation.observedValueHash) {
        defects.push(issue('DESTINATION_NOT_PROVEN', 'Prove the same persisted update at every permitted destination.', { sourceId: source.sourceId, destination }))
        continue
      }
      observedDestinationCoverage.add(destination)
      const latencySeconds = Number(observation.latencySeconds)
      if (!Number.isFinite(latencySeconds) || latencySeconds < 0 || latencySeconds > Number(contract.soak?.maximumPropagationP95Seconds || 120)) defects.push(issue('DESTINATION_LATENCY_FAILED', 'Record a valid observation within the propagation threshold.', { sourceId: source.sourceId, destination }))
    }
    const forbidden = observations.filter(({ destination, observed }) => observed === true && !expectedDestinations.includes(destination)).map(({ destination }) => destination)
    if (forbidden.length) defects.push(issue('VISIBILITY_LEAK', 'Remove data exposed outside the update visibility boundary and treat it as P0.', { sourceId: source.sourceId, destinations: forbidden }))
  }

  const unknownSources = proofs.filter(({ sourceId }) => !sources.some((source) => source.sourceId === sourceId)).map(({ sourceId }) => sourceId)
  if (unknownSources.length) defects.push(issue('UNKNOWN_SOURCE_PROOF', 'Remove proofs not backed by a passed Phase 1 receipt.', { sourceIds: unknownSources }))
  for (const destination of contract.destinations || []) if (!observedDestinationCoverage.has(destination)) defects.push(issue('DESTINATION_COVERAGE_MISSING', 'Exercise every contracted module at least once.', { destination }))
  for (const visibility of Object.keys(contract.visibility || {})) if (!proofs.some((proof) => proof.visibility === visibility)) defects.push(issue('VISIBILITY_CLASS_COVERAGE_MISSING', 'Exercise every visibility class.', { visibility }))
  const openReleaseDefects = (evidence.defects || []).filter(({ status, severity }) => status === 'open' && ['P0', 'P1'].includes(severity))
  if (openReleaseDefects.length) defects.push(issue('OPEN_P0_P1_DEFECTS', 'Close all P0/P1 propagation defects.', { defectIds: openReleaseDefects.map(({ id }) => id) }))

  return {
    version: ATTORNEY_PRACTICAL_PHASE2_VERSION,
    status: defects.length ? 'FAILED' : 'PASSED',
    executionAuthorized: true,
    sourceCount: sources.length,
    blockerCount: defects.length,
    blockers: defects,
    evidenceFingerprint,
  }
}
