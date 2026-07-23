import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  buildAttorneyMatterGuidance,
  buildAttorneyMatterToday,
} from '../src/core/transactions/attorneyMatterToday.js'

function workflow({ key, title, statusKey = 'in_progress', readiness = [], actions = [], evidence = [] }) {
  return {
    key,
    title,
    detailKey: key,
    required: true,
    statusKey,
    statusLabel: statusKey === 'blocked' ? 'Blocked' : 'On track',
    progressPercent: 35,
    nextStep: 'Review workflow',
    lane: { laneKey: key },
    actionSummary: {
      currentStageLabel: `${title} checkpoint`,
      attentionSummary: `${title} needs attention.`,
      readinessChecklist: readiness,
      evidenceChecklist: evidence,
      nextActions: actions,
      primaryNextAction: actions[0] || null,
    },
  }
}

const transfer = workflow({
  key: 'transfer',
  title: 'Transfer Attorney',
  readiness: [
    { id: 'assignment', complete: true, missingCount: 0, severity: 'low' },
    { id: 'documents', complete: false, missingCount: 2, severity: 'high' },
  ],
  actions: [{ id: 'request-fica', label: 'Request buyer FICA', type: 'request_document', priority: 'high' }],
})
const cancellation = workflow({
  key: 'cancellation',
  title: 'Bond Cancellation',
  statusKey: 'blocked',
  readiness: [
    { id: 'assignment', complete: false, missingCount: 1, severity: 'critical' },
    { id: 'data', complete: false, missingCount: 2, severity: 'high' },
  ],
  actions: [{ id: 'assign-cancellation', label: 'Assign cancellation attorney', type: 'assign_attorney', priority: 'critical' }],
  evidence: [{ id: 'bank-proof', label: 'Cancellation bank recorded', complete: false }],
})

const guidance = buildAttorneyMatterGuidance([transfer, cancellation])
assert.equal(guidance.recommendedWorkflowKey, 'cancellation', 'blocked workstream should be recommended first')
assert.equal(guidance.outstandingCount, 3)
assert.equal(guidance.workstreams[0].readiness[0].label, 'Responsible person assigned')
assert.equal(guidance.workstreams[0].nextActions[0].type, 'assign_attorney')
assert.equal(guidance.workstreams[0].evidence[0].label, 'Cancellation bank recorded')

const today = buildAttorneyMatterToday({
  transaction: { stage: 'transfer' },
  lifecycleStage: 'transfer',
  workflows: [transfer, cancellation],
})
assert.equal(today.guidance.workstreams.length, 2)
assert.equal(today.guidance.recommendedWorkflowKey, 'cancellation')

const source = await readFile(new URL('../src/pages/AttorneyTransactionDetail.jsx', import.meta.url), 'utf8')
const overviewStart = source.indexOf('function ArchlineOverviewWorkspace')
const overviewEnd = source.indexOf('function ArchlineWorkflowWorkspace', overviewStart)
const overviewSource = source.slice(overviewStart, overviewEnd)
for (const expected of [
  'What needs to happen next?',
  'To finish this checkpoint',
  'Do these next',
  'onExecuteWorkflowAction(selectedGuide.workflow, action)',
  'handleWorkflowActionCommand(workflow?.lane, action)',
  'openLegalWorkflowDetail(workflow?.detailKey)',
]) {
  assert.ok(source.includes(expected), `Phase 2 guided Today workspace should include: ${expected}`)
}

for (const expected of [
  '<section className="space-y-4">',
  '<ArchlinePanel title="Matter Progress" className="p-4">',
  '<div className="grid gap-4 lg:grid-cols-3">',
  '<ArchlinePanel title="Key Dates" className="p-4">',
  '<ArchlinePanel title="Financial Summary" className="p-4">',
  '<ArchlinePanel title="Parties" className="p-4">',
  '<div className="grid gap-4 xl:grid-cols-2">',
  '<ArchlinePanel title="Matter Notes"',
  '<ArchlinePanel title="Document Checklist" className="p-4">',
]) {
  assert.ok(overviewSource.includes(expected), `Matter overview should include updated layout element: ${expected}`)
}

assert.ok(overviewStart >= 0 && overviewEnd > overviewStart, 'Matter overview workspace source should be discoverable.')
assert.doesNotMatch(overviewSource, /xl:grid-cols-\[minmax\(0,1fr\)_minmax\(320px,0\.36fr\)\]/)
assert.doesNotMatch(overviewSource, /<aside className="space-y-4 xl:sticky xl:top-4 xl:self-start">/)
assert.doesNotMatch(overviewSource, /<ArchlinePanel title="Quick Actions"/)
assert.doesNotMatch(overviewSource, /<ArchlinePanel title="Tasks"/)

console.log('Attorney matter guidance Phase 2 checks passed.')
