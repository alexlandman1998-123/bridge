import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const service = readFileSync(new URL('../src/services/attorneyWorkflow/attorneyWorkflowLaneService.js', import.meta.url), 'utf8')
const page = readFileSync(new URL('../src/pages/AttorneyTransactionDetail.jsx', import.meta.url), 'utf8')

assert.match(service, /void dispatchCommittedProgressNotifications\(client, normalizedTransactionId\)\.catch\(\(\) => \{\}\)/)

const submitStart = page.indexOf('async function submitWorkflowStepUpdate')
const submitEnd = page.indexOf('async function handleQuickWorkflowStepUpdate', submitStart)
const submit = page.slice(submitStart, submitEnd)
assert.match(submit, /void refreshWorkflowAfterChange\(next\)\.catch/)
assert.doesNotMatch(submit, /await refreshWorkflowAfterChange\(next\)/)
assert.match(submit, /Task saved\. The workspace could not refresh yet/)

console.log('Attorney post-commit action reliability contract passed')

// Execute the real save and permission guard with controlled I/O. A hanging
// refresh/delivery must not prevent a committed save from being acknowledged.
const guard = service.slice(service.indexOf('async function assertCanUpdateLane('), service.indexOf('async function assertCanRequestLaneDocument('))
const update = service.slice(service.indexOf('export async function updateAttorneyWorkflowStepStatus('), service.indexOf('export async function getAttorneyUpdateOptionsForTransaction(')).replace('export ', '')
function harness({ allowed = true, publishAllowed = true, commitError = null, holdCommit = false } = {}) {
  const calls = { permissions: [], visibility: [], reads: 0, commits: 0, refreshes: 0, deliveries: 0 }
  const permission = { canUpdateLane: allowed }
  let releaseCommit
  const commitGate = holdCommit ? new Promise(resolve => { releaseCommit = resolve }) : Promise.resolve()
  const query = {
    select() { return this }, eq() { return this },
    async maybeSingle() { calls.reads++; return { data: { id: 'step', step_key: 'instruction_received', updated_at: 'before' } } },
  }
  const receipt = { matterStage: 'attorney_preparation', updatedAt: 'after', revision: 2 }
  const dependencies = {
    LANE_META: Object.fromEntries(['transfer', 'bond', 'cancellation'].map(lane => [lane, { attorneyRole: `${lane}_attorney` }])),
    requireClient: () => ({ from: () => query }),
    getAuthenticatedUser: async () => ({ id: 'actor' }),
    getAttorneyLegalPermissionContext: async args => { calls.permissions.push(args); return permission },
    normalizeLaneKey: value => value,
    normalizeAttorneyStageKey: value => value,
    normalizeStepStatus: value => value,
    normalizeVisibility: value => value,
    fetchLaneForUpdate: async () => ({ id: 'lane' }),
    isMissingSchemaError: () => false,
    getAttorneyStageDefinition: () => ({ operationalContract: {} }),
    assertAttorneyTaskStatusAction: () => {},
    buildAttorneyTaskMutationPacket: (contract, { workPacket }) => workPacket,
    buildWorkPacketMetadata: workPacket => ({ workPacket }),
    assertCanPublishVisibility: (context, visibility) => {
      assert.equal(context, permission, 'visibility must use the exact permission result from this save')
      calls.visibility.push(visibility)
      if (!publishAllowed) throw new Error('Publication denied')
    },
    assertTransferTaxGateBeforeLodgement: async () => {},
    commitSharedJourneyTask: async (client, payload) => {
      calls.commits++
      assert.equal(payload.p_expected_step_updated_at, 'before')
      await commitGate
      return { data: commitError ? null : receipt, error: commitError }
    },
    dispatchCommittedProgressNotifications: () => { calls.deliveries++; return new Promise(() => {}) },
    getAttorneyWorkflowOperationsForTransaction: () => { calls.refreshes++; return new Promise(() => {}) },
  }
  const save = new Function(...Object.keys(dependencies), `${guard}; ${update}; return updateAttorneyWorkflowStepStatus;`)(...Object.values(dependencies))
  return { save, calls, receipt, releaseCommit }
}
const input = { transactionId: 'matter', laneKey: 'transfer', stepKey: 'instruction_received', commandId: 'command', status: 'in_progress', visibility: 'internal' }
for (const laneKey of ['transfer', 'bond', 'cancellation']) {
  const fixture = harness()
  const result = await fixture.save({ ...input, laneKey })
  assert.equal(fixture.calls.permissions.length, 1)
  assert.deepEqual(fixture.calls.permissions[0], { userId: 'actor', transactionId: 'matter', attorneyRole: `${laneKey}_attorney` })
  assert.equal(fixture.calls.refreshes, 0, 'saving must not start a duplicate workflow read')
  assert.equal(fixture.calls.deliveries, 1, 'hanging notification delivery is independent of save acknowledgement')
  assert.equal(result.refreshRequired, true, 'page must refresh persisted workflow in the background')
  assert.deepEqual(result.canonicalMatter.workflowMutation, fixture.receipt)
  assert.equal(result.canonicalMatter.updatedAt, 'after')
  await fixture.save({ ...input, laneKey })
  assert.equal(fixture.calls.permissions.length, 2, 'each new save checks fresh access')
}
const denied = harness({ allowed: false })
await assert.rejects(denied.save(input), /You do not have permission/)
assert.equal(denied.calls.reads, 0)
assert.equal(denied.calls.commits, 0)
const deniedVisibility = harness({ publishAllowed: false })
await assert.rejects(deniedVisibility.save(input), /Publication denied/)
assert.equal(deniedVisibility.calls.commits, 0)
const failed = harness({ commitError: new Error('Database refused save') })
await assert.rejects(failed.save(input), /Database refused save/)
assert.equal(failed.calls.deliveries, 0)
for (const status of ['completed_externally', 'not_applicable']) {
  const fixture = harness()
  await assert.rejects(fixture.save({ ...input, status }), /Record a reason/)
  assert.equal(fixture.calls.commits, 0)
}
const pending = harness({ holdCommit: true })
let acknowledged = false
const saving = pending.save(input).then(result => { acknowledged = true; return result })
while (!pending.calls.commits) await new Promise(resolve => setImmediate(resolve))
assert.equal(acknowledged, false, 'do not show success before the database commit')
pending.releaseCommit()
await saving
assert.equal(acknowledged, true)
console.log('Attorney task saves: one permission lookup per save, denial/visibility/reasons enforced, commit required, no post-commit read wait')

// Exercise the page handler too: the save controls must release while its
// persisted-data refresh is pending, and refresh failure must say saved.
function pageHarness({ refreshFails = false } = {}) {
  const calls = { busy: [], errors: [], refreshes: 0 }
  const dependencies = {
    transaction: { id: 'matter' },
    setWorkflowSaving: value => calls.busy.push(value),
    setWorkflowError: value => calls.errors.push(value),
    updateAttorneyWorkflowStepStatus: async () => ({ refreshRequired: true }),
    getWorkflowStepSubmitKey: step => step.key,
    setWorkflowStepDraft: () => {},
    setWorkflowInlineStepDraft: () => {},
    refreshWorkflowAfterChange: async result => {
      assert.equal(result.refreshRequired, true)
      calls.refreshes++
      if (refreshFails) throw new Error('Read failed')
      return new Promise(() => {})
    },
  }
  const submitSave = new Function(...Object.keys(dependencies), `${submit}; return submitWorkflowStepUpdate;`)(...Object.values(dependencies))
  return { submitSave, calls }
}
for (const refreshFails of [false, true]) {
  const fixture = pageHarness({ refreshFails })
  assert.equal(await fixture.submitSave({ laneKey: 'transfer', step: { key: 'instruction_received' }, status: 'in_progress' }), true)
  assert.deepEqual(fixture.calls.busy, [true, false])
  assert.equal(fixture.calls.refreshes, 1)
  if (refreshFails) assert.match(fixture.calls.errors.at(-1), /Task saved.*reload/)
}
console.log('Attorney page: save controls release during background refresh; refresh errors preserve saved outcome')
