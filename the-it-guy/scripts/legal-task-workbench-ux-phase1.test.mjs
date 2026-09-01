import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { buildLegalTaskWorkbenchModel } from '../src/core/transactions/legalTaskWorkbenchModel.js'

function buildTask(overrides = {}) {
  return {
    key: 'buyer_fica_received',
    label: 'Buyer FICA received',
    description: 'Review the buyer FICA evidence.',
    displayStatus: 'in_progress',
    statusLabel: 'In progress',
    ownerLabel: 'Transfer Attorney',
    dueDate: null,
    completionReadiness: { canComplete: true, warnings: [] },
    dependencySummary: { advisory: false },
    operationalContract: {
      version: 'phase1',
      laneLabel: 'Transfer',
      taskType: 'review_evidence',
      visibilityPolicy: {
        clientVisibleAllowed: true,
        defaultVisibility: 'client_visible',
        clientAudience: ['buyer'],
      },
    },
    ...overrides,
  }
}

const routineModel = buildLegalTaskWorkbenchModel({ task: buildTask(), workflowTasks: [] })
assert.equal(routineModel.showOwner, false, 'routine tasks should not repeat the default owner')
assert.equal(routineModel.clientUpdate.visible, true, 'client visibility remains available to the update flow')

const escalatedModel = buildLegalTaskWorkbenchModel({
  task: buildTask({ displayStatus: 'blocked', statusLabel: 'Blocked' }),
  workflowTasks: [],
})
assert.equal(escalatedModel.showOwner, true, 'blocked tasks should expose ownership for escalation')

const componentSource = readFileSync(new URL('../src/components/attorney/workflow/LegalTaskWorkbench.jsx', import.meta.url), 'utf8')
assert.doesNotMatch(componentSource, /No task exceptions\./, 'healthy-state filler copy should be removed')
assert.doesNotMatch(componentSource, /Workflow healthy/, 'healthy workflow summaries should remain hidden')
assert.doesNotMatch(componentSource, /No due date/, 'unset due dates should not render as task metadata')
assert.match(componentSource, /aria-label=\{`\$\{workflowLabel\} checkpoints`\}/, 'the navigator label should match every legal workflow lane')
assert.equal((componentSource.match(/model\.clientUpdate\.label/g) || []).length, 1, 'client visibility should appear only in the status update flow')

console.log('Legal task workbench UX Phase 1 checks passed.')
