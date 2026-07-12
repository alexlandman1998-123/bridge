#!/usr/bin/env node
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function read(relativePath) {
  return fs.readFileSync(path.join(projectRoot, relativePath), 'utf8')
}

function sliceBetween(source, start, end) {
  const startIndex = source.indexOf(start)
  const endIndex = source.indexOf(end, startIndex + start.length)
  assert.notEqual(startIndex, -1, `${start} should exist`)
  assert.notEqual(endIndex, -1, `${end} should exist after ${start}`)
  return source.slice(startIndex, endIndex)
}

const mattersSource = read('src/pages/AttorneyMattersPage.jsx')
const detailSource = read('src/pages/AttorneyTransactionDetail.jsx')
const packageSource = read('package.json')
const auditSource = read('docs/audits/attorney-workflow-phase1-queue-actions.md')

const rowActionsSource = sliceBetween(mattersSource, 'function RowActions', 'function canAcceptIncomingMatter')
const incomingActionsSource = sliceBetween(mattersSource, 'function IncomingRowActions', 'function WaitingOnChips')
const incomingTableSource = sliceBetween(mattersSource, 'function IncomingMattersTable', 'function BulkActionBar')
const bulkSource = sliceBetween(mattersSource, 'function BulkActionBar', 'function MattersTable')

assert.match(mattersSource, /const ATTORNEY_QUEUE_ACTION_TARGETS = \{/, 'Attorney queue actions should have a target map')
assert.match(mattersSource, /function MatterActionLink/, 'Queue actions should route through a shared action link')
assert.match(mattersSource, /function getMatterActionHref/, 'Queue actions should share a transaction href resolver')
assert.match(mattersSource, /attorneyWorkspaceTarget: actionConfig\.menu/, 'Queue action links should carry a transaction workspace target')
assert.match(mattersSource, /const href = getMatterActionHref\(row\)[\s\S]*navigate\(href/, 'Row open should use the shared transaction href resolver')
assert.doesNotMatch(mattersSource, /\|\|\s*['"]#['"]/, 'Queue actions should not fall back to a no-op hash link')
assert.doesNotMatch(mattersSource, /to=\{row\.actionHref\}/, 'Queue links should not bypass the shared href resolver')

for (const action of ['assign_attorney', 'request_document', 'generated_documents', 'schedule_appointment', 'activity']) {
  assert.match(rowActionsSource, new RegExp(`action="${action}"`), `Generic row menu should route ${action}`)
}

for (const action of ['follow_up_otp', 'request_document', 'assign_attorney', 'message_client']) {
  assert.match(incomingActionsSource, new RegExp(`action="${action}"`), `Incoming row menu should route ${action}`)
}

assert.match(incomingActionsSource, /onAcceptMatter\?\.\(row\)/, 'Incoming accept remains a real command')
assert.match(incomingActionsSource, /onDeclineMatter\?\.\(row\)/, 'Incoming decline remains a real command')
assert.match(incomingTableSource, /MatterActionLink[\s\S]*action="request_document"/, 'Incoming hover document action should navigate to documents')
assert.match(incomingTableSource, /MatterActionLink[\s\S]*action="message_client"/, 'Incoming hover client message action should navigate to activity')

for (const deadEndLabel of [
  'Reassign',
  'Generate Document',
  'Schedule Appointment',
  'Archive',
  'Assign Attorney',
  'Email Client',
  'Email Clients',
  'Assign Assistant',
  'Generate Documents',
]) {
  assert.doesNotMatch(rowActionsSource, new RegExp(`>${deadEndLabel}<`), `Generic row menu should not expose dead-end ${deadEndLabel}`)
  assert.doesNotMatch(incomingActionsSource, new RegExp(`>${deadEndLabel}<`), `Incoming row menu should not expose dead-end ${deadEndLabel}`)
  assert.doesNotMatch(bulkSource, new RegExp(`>${deadEndLabel}<`), `Bulk bar should not expose dead-end ${deadEndLabel}`)
}

assert.match(bulkSource, /Open selected matter/, 'Bulk bar should keep only a real open-selected action')
assert.match(bulkSource, /onOpenSelected/, 'Bulk bar open-selected action should be wired to page state')
assert.doesNotMatch(bulkSource, /const actions = incoming/, 'Bulk bar should not render static fake action arrays')

assert.match(detailSource, /function normalizeAttorneyQueueWorkspaceTarget/, 'Transaction detail should normalize queue action target tabs')
assert.match(detailSource, /location\.state\?\.attorneyWorkspaceTarget/, 'Transaction detail should consume queue action target state')
assert.match(detailSource, /setWorkspaceMenu\(\(previous\) => \(previous === nextMenu \? previous : nextMenu\)\)/, 'Transaction detail should switch to the requested tab')

assert.match(packageSource, /"test:attorney-workflow-phase1-queue-actions":\s*"node scripts\/attorney-workflow-phase1-queue-actions\.test\.mjs"/)
assert.match(packageSource, /"verify:attorney-workflow-phase1-queue-actions":\s*"node scripts\/attorney-workflow-phase1-queue-actions\.test\.mjs"/)
assert.match(auditSource, /# Attorney Workflow Phase 1 Queue Actions/)
assert.match(auditSource, /Decision: GO TO PHASE 2 WITH QUEUE ACTIONS WIRED OR ROUTED/)

console.log('attorney workflow Phase 1 queue action tests passed')
