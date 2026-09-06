import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { buildAttorneyPracticalWalkthroughMatrix } from '../src/services/attorneyPracticalUatPhase1.js'
import { ATTORNEY_PRACTICAL_PHASE2_VERSION, buildAttorneyPracticalPhase2Decision, buildAttorneyPracticalPropagationSources } from '../src/services/attorneyPracticalPropagationPhase2.js'
import { resolveAttorneyUpdateDestinations } from '../src/services/attorneyReleasePropagation.js'

const bytes = readFileSync(new URL('../config/attorney-practical-release-bar.json', import.meta.url))
const contract = JSON.parse(bytes)
const contractFingerprint = createHash('sha256').update(bytes).digest('hex')
const phase1Evidence = {
  contractFingerprint,
  walkthroughs: buildAttorneyPracticalWalkthroughMatrix(contract).map((item) => ({
    id: item.id,
    matterId: `matter-${item.role}`,
    actions: item.requiredActions.map((key) => ({ key, passed: true, receiptId: `${item.id}:${key}`, completedAt: '2026-09-06T11:00:00.000Z' })),
  })),
}
const phase1EvidenceFingerprint = createHash('sha256').update(JSON.stringify(phase1Evidence)).digest('hex')
const phase1Report = { status: 'PASSED', evidenceFingerprint: phase1EvidenceFingerprint }
const sources = buildAttorneyPracticalPropagationSources(phase1Evidence)
assert.equal(sources.length, 24)
assert.equal(buildAttorneyPracticalPhase2Decision({ contract, contractFingerprint }).status, 'BLOCKED')
assert.equal(buildAttorneyPracticalPhase2Decision({ contract, contractFingerprint, phase1Report, phase1Evidence, phase1EvidenceFingerprint }).status, 'READY_TO_RUN')

const visibilitySequence = ['internal', 'professional_shared', 'client_visible']
const evidence = {
  version: ATTORNEY_PRACTICAL_PHASE2_VERSION,
  environment: 'staging',
  contractFingerprint,
  phase1EvidenceFingerprint,
  executedBy: 'UAT owner',
  startedAt: '2026-09-06T12:00:00.000Z',
  completedAt: '2026-09-06T13:00:00.000Z',
  proofs: sources.map((source, index) => {
    const visibility = visibilitySequence[index % visibilitySequence.length]
    const clientRecipients = visibility === 'client_visible' ? ['buyer', 'seller'] : []
    return {
      sourceId: source.sourceId,
      receiptId: source.receiptId,
      matterId: source.matterId,
      action: source.action,
      visibility,
      clientRecipients,
      destinations: resolveAttorneyUpdateDestinations({ visibility, clientRecipients }).map((destination) => ({ destination, observed: true, observedAt: '2026-09-06T12:01:00.000Z', latencySeconds: 60, sourceValueHash: 'same-value', observedValueHash: 'same-value' })),
    }
  }),
  defects: [],
}
const passed = buildAttorneyPracticalPhase2Decision({ contract, contractFingerprint, phase1Report, phase1Evidence, phase1EvidenceFingerprint, evidence, evidenceFingerprint: 'phase2-sha256' })
assert.equal(passed.status, 'PASSED')
assert.equal(passed.evidenceFingerprint, 'phase2-sha256')
const leak = structuredClone(evidence)
leak.proofs[0].destinations.push({ destination: 'buyer_portal', observed: true, observedAt: '2026-09-06T12:01:00.000Z', latencySeconds: 60, sourceValueHash: 'same-value', observedValueHash: 'same-value' })
assert.equal(buildAttorneyPracticalPhase2Decision({ contract, contractFingerprint, phase1Report, phase1Evidence, phase1EvidenceFingerprint, evidence: leak }).status, 'FAILED')
const mismatch = structuredClone(evidence)
mismatch.proofs[1].destinations[0].observedValueHash = 'different-value'
assert.equal(buildAttorneyPracticalPhase2Decision({ contract, contractFingerprint, phase1Report, phase1Evidence, phase1EvidenceFingerprint, evidence: mismatch }).status, 'FAILED')
console.log('Attorney practical propagation proof Phase 2 gate passed.')
