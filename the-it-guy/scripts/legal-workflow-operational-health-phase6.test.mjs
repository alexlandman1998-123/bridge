import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { buildLegalWorkflowOperationalHealthModel } from '../src/core/transactions/legalWorkflowOperationalHealthModel.js'
import { buildLegalTaskWorkbenchModel } from '../src/core/transactions/legalTaskWorkbenchModel.js'

const now = new Date('2026-09-01T12:00:00.000Z')
const tasks = [
  {
    key: 'blocked-transfer',
    label: 'Rates figures requested',
    phaseKey: 'rates',
    phaseLabel: 'Rates and clearance',
    displayStatus: 'blocked',
    dueDate: '2026-08-30T12:00:00.000Z',
    updatedAt: '2026-08-31T12:00:00.000Z',
    missingDocumentCount: 0,
  },
  {
    key: 'stale-bond',
    label: 'Bank approval to lodge',
    phaseKey: 'bond_documents',
    phaseLabel: 'Documents and guarantees',
    displayStatus: 'in_progress',
    updatedAt: '2026-08-20T12:00:00.000Z',
    missingDocumentCount: 2,
  },
  {
    key: 'waiting-cancellation',
    label: 'Cancellation figures received',
    phaseKey: 'cancellation_figures',
    phaseLabel: 'Notice and figures',
    displayStatus: 'waiting',
    updatedAt: '2026-08-31T12:00:00.000Z',
    missingDocumentCount: 0,
  },
  {
    key: 'completed-task',
    label: 'Instruction received',
    displayStatus: 'completed',
    dueDate: '2026-08-01T12:00:00.000Z',
    updatedAt: '2026-08-01T12:00:00.000Z',
    missingDocumentCount: 5,
  },
]

const health = buildLegalWorkflowOperationalHealthModel({ tasks, now, staleAfterDays: 7 })
assert.equal(health.status, 'critical')
assert.equal(health.label, 'Intervention needed')
assert.equal(health.counts.total, 3)
assert.equal(health.counts.critical, 1)
assert.equal(health.counts.blocked, 1)
assert.equal(health.counts.overdue, 1)
assert.equal(health.counts.stale, 1)
assert.equal(health.counts.missingDocuments, 1)
assert.equal(health.counts.followUpMissing, 1)
assert.equal(health.primaryException.taskKey, 'blocked-transfer')
assert.deepEqual(health.primaryException.reasons.map((reason) => reason.code), ['blocked', 'overdue'])
assert.equal(health.exceptions.some((item) => item.taskKey === 'completed-task'), false)
assert.equal(health.progressPercent, 25)

const healthy = buildLegalWorkflowOperationalHealthModel({
  now,
  tasks: [
    { key: 'done', label: 'Done', displayStatus: 'completed' },
    { key: 'current', label: 'Current', displayStatus: 'in_progress', updatedAt: '2026-08-31T12:00:00.000Z' },
  ],
})
assert.equal(healthy.status, 'clear')
assert.equal(healthy.counts.total, 0)
assert.equal(healthy.progressPercent, 50)

const selectedTask = {
  ...tasks[1],
  description: 'Prepare the bond lodgement approval.',
  statusLabel: 'In Progress',
  completionReadiness: { canComplete: false, warnings: [] },
  operationalContract: {
    version: 'phase1',
    laneLabel: 'Bond registration',
    taskType: 'confirm_milestone',
    visibilityPolicy: { clientVisibleAllowed: true, defaultVisibility: 'client_visible', clientAudience: ['buyer'] },
  },
}
const workbench = buildLegalTaskWorkbenchModel({ task: selectedTask, workflowTasks: tasks })
assert.equal(workbench.operationalHealth.status, 'critical')
assert.equal(workbench.operationalHealth.primaryException.taskKey, 'blocked-transfer')

const componentSource = readFileSync(new URL('../src/components/attorney/workflow/LegalTaskWorkbench.jsx', import.meta.url), 'utf8')
assert.match(componentSource, /operationalHealth=\{model\.operationalHealth\}/)
assert.match(componentSource, /operationalHealth\?\.exceptions/)
assert.match(componentSource, /phaseExceptions\.get/)

const pageSource = readFileSync(new URL('../src/pages/AttorneyTransactionDetail.jsx', import.meta.url), 'utf8')
assert.match(pageSource, /workflowTasks: viewModel\.tasks/)

console.log('Legal workflow Phase 6 operational health checks passed.')
