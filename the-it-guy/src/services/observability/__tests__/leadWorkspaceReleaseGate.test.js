import assert from 'node:assert/strict'
import { evaluateLeadWorkspaceReleaseGate } from '../leadWorkspaceReleaseGate.js'

const passingInput = {
  trace: {
    outcome: 'ready',
    stages: [{ stage: 'route_chunk_loading' }, { stage: 'core_lead_ready' }, { stage: 'workspace_ready' }],
  },
  observation: {
    visualShellVariants: ['shared-workspace-shell'],
    terminalEmptyStateViolations: [],
    sellerMisclassificationViolations: [],
    maxShellHeightDeltaPx: 0,
  },
  readyMs: 4_500,
  bundleReport: {
    routes: [{ rawBytes: 380_000, rawBudgetBytes: 465_000, gzipBytes: 110_000, gzipBudgetBytes: 130_000 }],
  },
}

const passing = evaluateLeadWorkspaceReleaseGate(passingInput)
assert.equal(passing.status, 'passed')
assert.deepEqual(passing.failedChecks, [])

const failing = evaluateLeadWorkspaceReleaseGate({
  ...passingInput,
  trace: { outcome: 'ready', stages: [{ stage: 'workspace_ready' }] },
  observation: {
    visualShellVariants: ['route', 'context'],
    terminalEmptyStateViolations: ['Lead not found'],
    sellerMisclassificationViolations: ['Buyer lead'],
    maxShellHeightDeltaPx: 80,
  },
  readyMs: 31_000,
  bundleReport: {
    routes: [{ rawBytes: 500_000, rawBudgetBytes: 465_000, gzipBytes: 140_000, gzipBudgetBytes: 130_000 }],
  },
})
assert.equal(failing.status, 'failed')
assert.deepEqual(failing.failedChecks, [
  'CORE_LEAD_READY',
  'READY_TIME_BUDGET',
  'ONE_VISUAL_LOADING_SHELL',
  'NO_TERMINAL_EMPTY_STATE_FLASH',
  'NO_SELLER_AS_BUYER_FLASH',
  'STABLE_LOADING_SHELL_HEIGHT',
  'ROUTE_BUNDLES_WITHIN_BUDGET',
])

console.log('lead workspace release gate tests passed')
