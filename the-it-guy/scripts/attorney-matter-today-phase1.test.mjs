import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  ATTORNEY_GOLDEN_PATH_STAGES,
  buildAttorneyMatterToday,
} from '../src/core/transactions/attorneyMatterToday.js'

assert.equal(ATTORNEY_GOLDEN_PATH_STAGES.length, 10, 'the conveyancing golden path must remain ten stages')
assert.deepEqual(
  ATTORNEY_GOLDEN_PATH_STAGES.map((stage) => stage.key),
  ['instruction', 'decision', 'assignment', 'review', 'documents', 'clearances', 'signing', 'lodgement_ready', 'lodgement', 'registration'],
)

const documentMatter = buildAttorneyMatterToday({
  transaction: { stage: 'transfer' },
  lifecycleStage: 'transfer',
  requiredDocumentRows: [
    {
      id: 'rates-clearance',
      displayName: 'Rates clearance certificate',
      requiredParty: 'Municipality',
      status: 'missing',
      statusLabel: 'Missing',
      blocksStage: true,
      satisfiesRequirement: false,
    },
  ],
  primaryAction: {
    title: 'Request rates clearance certificate',
    description: 'The clearance certificate is blocking preparation.',
    primaryActionLabel: 'Open documents',
    primaryActionTarget: 'documents',
    dueDate: '2026-07-17T09:00:00.000Z',
  },
  activityFeed: [
    { id: 'system', category: 'system', title: 'System sync', createdAt: '2026-07-18T10:00:00.000Z' },
    { id: 'message', kind: 'comment', category: 'notes', title: 'Seller update', createdAt: '2026-07-18T09:00:00.000Z' },
  ],
  now: '2026-07-18T12:00:00.000Z',
})

assert.equal(documentMatter.currentStage.key, 'documents')
assert.equal(documentMatter.nextAction.target, 'documents')
assert.equal(documentMatter.waitingOn.label, 'Municipality')
assert.equal(documentMatter.blockers.length, 1)
assert.equal(documentMatter.latestCommunication.id, 'message')
assert.equal(documentMatter.escalation.state, 'overdue')

const registeredMatter = buildAttorneyMatterToday({
  transaction: { registration_date: '2026-07-18' },
  lifecycleStage: 'registration',
  requiredDocumentRows: [],
})
assert.equal(registeredMatter.currentStage.key, 'registration')
assert.equal(registeredMatter.stages.filter((stage) => stage.state === 'completed').length, 9)
assert.equal(registeredMatter.escalation.state, 'clear')

const source = await readFile(new URL('../src/pages/AttorneyTransactionDetail.jsx', import.meta.url), 'utf8')
assert.match(source, /\{ id: 'today', label: 'Today' \},\s*\{ id: 'overview', label: 'Full overview' \}/)
assert.match(source, /useState\('today'\)/)
assert.match(source, /activeWorkspaceMenu === 'today'/)
assert.match(source, /<AttorneyMatterTodayView/)
assert.match(source, /onOpenWorkspace=\{handleOverviewActionTarget\}/)

console.log('Attorney matter Today Phase 1 checks passed.')
