import assert from 'node:assert/strict'
import test from 'node:test'

import { simulate } from './bond-rls-phase5g-sensitive-mutation-policy-simulation.mjs'

test('Phase 5G simulation matches Phase 5F-sensitive expectations and keeps mismatches at zero', async () => {
  const phase5fReport = {
    input: {
      transactions: 4,
      users: 4,
    },
    scenarioOutcomes: [
      {
        scenarioId: 'hq-assign-in-workspace',
        transactionId: 'txn-1',
        actorUserId: 'user-hq',
        actorRole: 'hq_manager',
        workspaceRole: 'hq_manager',
        scopeLevel: 'workspace_hq',
        action: 'bond.assign_processor',
        currentAllowed: true,
        phase5fAllowed: true,
        expectedPhase5f: true,
        expectedDifference: null,
        finalClassification: null,
        reason: 'Workspace HQ operators may mutate assignment inside their workspace.',
        canonicalReason: 'Workspace HQ operators may mutate assignment inside their workspace.',
        exclusionStatus: { excluded: false, exclusionType: null },
        targetScopeLevel: 'workspace_hq',
      },
      {
        scenarioId: 'regional-submit-missing-permission',
        transactionId: 'txn-2',
        actorUserId: 'user-rm',
        actorRole: 'regional_manager',
        workspaceRole: 'regional_manager',
        scopeLevel: 'region',
        action: 'bond.submit_to_banks',
        currentAllowed: true,
        phase5fAllowed: false,
        expectedPhase5f: false,
        expectedDifference: 'expectedSensitiveTightening',
        finalClassification: 'expectedSensitiveTightening',
        reason: 'Regional submit-to-bank access stays limited to in-region records with explicit permission.',
        canonicalReason: 'Regional submit-to-bank access stays limited to in-region records with explicit permission.',
        exclusionStatus: { excluded: false, exclusionType: null },
        targetScopeLevel: 'region',
      },
      {
        scenarioId: 'participant-submit-denied',
        transactionId: 'txn-3',
        actorUserId: 'user-participant',
        actorRole: 'transaction_participant',
        workspaceRole: null,
        scopeLevel: null,
        action: 'bond.submit_to_banks',
        currentAllowed: false,
        phase5fAllowed: false,
        expectedPhase5f: false,
        expectedDifference: null,
        finalClassification: null,
        reason: 'Participant-only users cannot perform sensitive bond mutations.',
        canonicalReason: 'Participant-only users cannot perform sensitive bond mutations.',
        exclusionStatus: { excluded: false, exclusionType: null },
        targetScopeLevel: null,
      },
      {
        scenarioId: 'manual-review-excluded',
        transactionId: 'txn-4',
        actorUserId: 'user-branch',
        actorRole: 'branch_manager',
        workspaceRole: 'branch_manager',
        scopeLevel: 'branch',
        action: 'bond.assign_consultant',
        currentAllowed: true,
        phase5fAllowed: false,
        expectedPhase5f: false,
        expectedDifference: null,
        finalClassification: 'manualReviewMutationExcluded',
        reason: 'Manual review rows remain on the legacy compatibility path.',
        canonicalReason: 'excluded_manual_review',
        exclusionStatus: { excluded: true, exclusionType: 'manual_review' },
        targetScopeLevel: 'branch',
      },
      {
        scenarioId: 'accepted-legacy-excluded',
        transactionId: 'txn-5',
        actorUserId: 'user-originator',
        actorRole: 'personal_originator',
        workspaceRole: 'personal_originator',
        scopeLevel: 'assigned',
        action: 'bond.clear_assignment',
        currentAllowed: true,
        phase5fAllowed: false,
        expectedPhase5f: false,
        expectedDifference: null,
        finalClassification: 'excludedLegacyMutationCompat',
        reason: 'Accepted unresolved legacy rows remain on the compatibility path.',
        canonicalReason: 'excluded_accepted_unresolved_legacy',
        exclusionStatus: { excluded: true, exclusionType: 'accepted_unresolved_legacy' },
        targetScopeLevel: 'assigned',
      },
    ],
  }

  const report = await simulate({ phase5fReport, sampleLimit: 4 })

  assert.equal(report.categories.currentAllows_phase5gAllows, 1)
  assert.equal(report.categories.currentAllows_phase5gDenies, 3)
  assert.equal(report.categories.currentDenies_phase5gAllows, 0)
  assert.equal(report.categories.currentDenies_phase5gDenies, 1)
  assert.equal(report.categories.expectedSensitiveTightening, 1)
  assert.equal(report.categories.expectedCanonicalExpansion, 0)
  assert.equal(report.categories.unexpectedAllow, 0)
  assert.equal(report.categories.unexpectedDeny, 0)
  assert.equal(report.categories.phase5gCanonicalReadyEnforced, 3)
  assert.equal(report.categories.phase5gLegacyExcluded, 1)
  assert.equal(report.categories.manualReviewMutationExcluded, 1)
  assert.equal(report.actionBreakdown['bond.submit_to_banks'].phase5gDenies, 2)
})
