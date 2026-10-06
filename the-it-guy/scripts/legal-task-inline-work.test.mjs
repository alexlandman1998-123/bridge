import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { createRequire } from 'node:module'
import { JSDOM } from 'jsdom'
import { normalizeTaskConfirmations, readTaskConfirmations } from '../src/core/transactions/legalTaskConfirmations.js'
import { normalizeAttorneyWorkflowWorkPacket } from '../src/constants/attorneyWorkflowUsability.js'
import { buildTransferWorkspaceViewModel } from '../src/services/attorneyWorkflow/transferWorkspaceViewModel.js'
import { buildLegalTaskWorkbenchModel, getLegalTaskChecklistProgress } from '../src/core/transactions/legalTaskWorkbenchModel.js'

const dom = new JSDOM('<div id="root"></div>', { url: 'https://test.invalid' })
globalThis.window = dom.window
globalThis.document = dom.window.document
globalThis.HTMLElement = dom.window.HTMLElement
globalThis.IS_REACT_ACT_ENVIRONMENT = true
const { default: React, act } = await import('react')
const { createRoot } = await import('react-dom/client')
const require = createRequire(import.meta.url)
async function component(name) {
  const result = await build({ entryPoints: [`src/components/attorney/workflow/${name}.jsx`], bundle: true, write: false, format: 'cjs', platform: 'node', jsx: 'automatic', external: ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime'] })
  const module = { exports: {} }
  new Function('require', 'module', 'exports', result.outputFiles[0].text)(require, module, module.exports)
  return module.exports.default
}
const Confirmations = await component('TaskConfirmations')
const Appointment = await component('LegalTaskAppointmentForm')
const Workbench = await component('LegalTaskWorkbench')
let root = createRoot(document.getElementById('root'))
const render = element => act(async () => root.render(element))
const button = text => [...document.querySelectorAll('button')].find(node => node.textContent.trim() === text)
const click = async text => { const node = button(text); assert.ok(node, `Missing button: ${text}`); await act(async () => node.click()) }
const change = async (node, value) => {
  await act(async () => {
    Object.getOwnPropertyDescriptor(Object.getPrototypeOf(node), 'value').set.call(node, value)
    node.dispatchEvent(new dom.window.Event('input', { bubbles: true }))
    node.dispatchEvent(new dom.window.Event('change', { bubbles: true }))
  })
}

let saved = {}, fail = true
const confirmationProps = { taskKey: 'title_deed_checked', items: [{ id: 'ownership', label: 'Ownership checked' }], onSave: async draft => { if (fail) throw new Error('Save failed'); saved = normalizeTaskConfirmations(draft); return true } }
await render(React.createElement(Confirmations, confirmationProps))
await click('Yes')
await click('Save answers')
assert.match(document.body.textContent, /Save failed/)
assert.equal(button('Yes').getAttribute('aria-pressed'), 'true')
fail = false
await click('Save answers')
await act(async () => root.unmount())
root = createRoot(document.getElementById('root'))
await render(React.createElement(Confirmations, { ...confirmationProps, saved }))
assert.equal(button('Yes').getAttribute('aria-pressed'), 'true', 'saved answer survives remount')
assert.deepEqual(normalizeAttorneyWorkflowWorkPacket({ laneKey: 'transfer', stageKey: 'title_deed_checked', taskConfirmations: saved }).taskConfirmations, saved)
assert.deepEqual(normalizeTaskConfirmations({ wrong: { answer: 'maybe' }, ...saved }), saved)
assert.deepEqual(readTaskConfirmations([{ timestamp: '2026-09-09', metadata: { workPacket: { laneKey: 'transfer', stageKey: 'title_deed_checked', taskConfirmations: saved } } }], 'transfer', 'title_deed_checked'), saved)

let creates = 0, resends = 0, received, busyStates = []
await render(React.createElement(Appointment, { task: { label: 'Signing scheduled' }, recipient: { name: 'Buyer', email: 'buyer@example.test' }, onBusyChange: value => busyStates.push(value), onCreate: async draft => { creates++; received = draft; return { appointmentId: 'saved-appointment', delivery: { status: 'failed' }, message: 'Appointment saved, but email failed.' } }, onResend: async id => { assert.equal(id, 'saved-appointment'); resends++ } }))
await change(document.querySelector('input[type="date"]'), '2026-12-10')
await change(document.querySelector('input[type="time"]'), '10:30')
await change([...document.querySelectorAll('input')].at(-1), 'Firm offices')
await click('Schedule & send invite')
assert.equal(creates, 1)
assert.equal(received.startTime, '10:30')
assert.equal(received.location, 'Firm offices')
assert.match(document.body.textContent, /email failed/)
assert.equal(button('Schedule & send invite'), undefined)
await click('Resend invite')
assert.equal(resends, 1)
assert.equal(creates, 1, 'delivery retry must not create a second appointment')
assert.deepEqual(busyStates, [true, false, true, false])

const doc = { id: 'document-1', displayName: 'Signed OTP', requiredDocumentKey: 'sales_agreement_or_otp', fileUrl: 'https://test.invalid/otp.pdf', status: 'uploaded', ready: true }
const vm = buildTransferWorkspaceViewModel({ workflowKey: 'transfer', selectedTaskKey: 'instruction_received', documents: [doc], workflow: { title: 'Transfer', lane: { laneKey: 'transfer', permissions: { canUpdateStage: true }, steps: [{ id: 'step-1', stepKey: 'instruction_received', status: 'in_progress' }] } } })
const model = buildLegalTaskWorkbenchModel({ task: vm.selectedTask, taskContext: vm.selectedTaskContext, workActions: vm.selectedTaskContext.workActions, statusActions: vm.availableActions.primary })
assert.equal(model.transferInstructionTask, true)
assert.deepEqual(vm.selectedTask.checklistProgress, { total: model.confirmationRows.length, completed: 0, answered: 0 }, 'overview counts the same checklist as the task workspace')
assert.deepEqual(getLegalTaskChecklistProgress([
  { id: 'manual' }, { id: 'negative' }, { id: 'party', authoritative: true, authoritativeAnswer: 'yes' },
], { manual: { answer: 'yes' }, negative: { answer: 'no' }, party: { answer: 'no' }, retired: { answer: 'yes' } }),
{ total: 3, completed: 2, answered: 3 }, 'count current saved and authoritative items, without counting retired answers or treating No as confirmed')
assert.deepEqual(model.confirmationRequirements.map(item => [item.id, item.answers, item.allowNote]), [
  ['transfer_instruction_received', ['yes', 'no'], false],
  ['otp_received_and_reviewed', ['yes', 'no'], true],
])
assert.deepEqual(model.outstandingRequirements.map(item => item.label), ['Instruction received from instructing agency'])
assert.equal(model.requirementActions[model.outstandingRequirements[0].id]?.label, 'View instruction source')
assert.equal(model.contextualActions.some(action => action.id === 'open_parties'), false)
let reviews = [], reviewFails = true
const uploads = []
const statusActions = []
const seenStatusActions = []
let nextTaskKey = '', backToStages = 0
await render(React.createElement(Workbench, { model, phases: vm.phases, selectedTaskKey: vm.selectedTask.key, selectedPhaseKey: vm.selectedTask.phaseKey, focusedStage: true, onBackToStages: () => { backToStages++ }, onSelectTask: taskKey => { nextTaskKey = taskKey }, onSaveConfirmations: async () => true, onRunAction: action => { statusActions.push(action.id); seenStatusActions.push(action) }, onOpenDocuments: (...args) => uploads.push(args), onReviewDocument: async (...args) => { reviews.push(args); if (reviewFails) throw new Error('Review unavailable'); return { message: 'Document approved.' } } }))
assert.equal(document.querySelector('[aria-label="Transfer stages"]'), null, 'focused workspace must not show the old stage rail')
assert.ok(document.querySelector('[aria-label="Task sections"]'), 'focused task has internal tabs')
assert.match(document.body.textContent, /Task 1 of 5 in this stage/)
assert.match(document.body.textContent, /Checklist · 0 of 4 items confirmed/)
const documentsTab = [...document.querySelectorAll('[aria-label="Task sections"] button')].find(node => node.textContent.startsWith('Documents ('))
assert.ok(documentsTab)
await act(async () => documentsTab.click())
assert.equal(documentsTab.getAttribute('aria-current'), 'page')
const dropZone = [...document.querySelectorAll('div')].find(node => node.className?.includes?.('border-dashed') && node.textContent.includes('Drop a file here'))
assert.ok(dropZone, 'Documents tab provides a drop target')
const droppedFile = new dom.window.File(['sample'], 'sample.pdf', { type: 'application/pdf' })
const dropEvent = new dom.window.Event('drop', { bubbles: true, cancelable: true })
Object.defineProperty(dropEvent, 'dataTransfer', { value: { files: [droppedFile] } })
await act(async () => dropZone.dispatchEvent(dropEvent))
assert.equal(uploads[0][2].name, 'sample.pdf')
await click('Checklist')
assert.ok(document.querySelector('a[href="https://test.invalid/otp.pdf"]'), 'the OTP is accessible directly from its review card')
await click('Back to Instruction & File Opening')
assert.equal(backToStages, 1, 'the task provides a visible return to all stages')
assert.equal(document.querySelector('[aria-label="Task context"]'), null, 'task work has no duplicate context sidebar')
assert.ok(document.querySelector('[aria-label="Task status and owner"]'), 'task context remains in the header')
assert.ok(document.querySelector('.legal-task-continuation'), 'next task is available below the working area')
await click('Go to next task')
assert.equal(nextTaskKey, vm.phases.find(phase => phase.key === vm.selectedTask.phaseKey).tasks[1].key)
const completeTaskButton = button('Complete task')
const nextTaskButton = button('Go to next task')
assert.ok(completeTaskButton)
await click('Yes')
assert.equal(completeTaskButton.disabled, true, 'unsaved answers must block task completion')
assert.equal(nextTaskButton.disabled, true, 'unsaved answers must block Next task')
assert.equal(button('Back to Instruction & File Opening').disabled, false, 'return stays available so the parent can offer save or discard')
await click('Details')
await click('Checklist')
assert.equal(button('Yes').getAttribute('aria-pressed'), 'true', 'switching sections retains the draft answer')
assert.equal(nextTaskButton.disabled, true, 'switching sections cannot bypass the unsaved-answer guard')
await click('Save answers')
assert.equal(completeTaskButton.disabled, false, 'completion is available again after answers save')
assert.equal(nextTaskButton.disabled, false, 'Next task is available again after answers save')
await click('Complete task')
assert.deepEqual(statusActions, ['mark_complete'], 'completion still uses the existing status action')
await act(async () => document.querySelector('[aria-label="Task options"]').click())
await click('Mark complete manually')
assert.equal(seenStatusActions.at(-1).manualOverride, true, 'manual completion is identified for the audit packet')
assert.doesNotMatch(document.querySelector('[aria-label="Transfer instruction received from the instructing party."]').textContent, /Not applicable/, 'Stage 1 confirmations are strictly Yes/No')
assert.doesNotMatch(document.body.textContent, /Current task|Required action/, 'duplicate task and action cards are removed')
assert.ok(document.body.textContent.indexOf('Instruction record') < document.body.textContent.indexOf('Supporting documents'), 'editable confirmations lead Stage 1 work')
await click('View instruction source')
assert.match(document.body.textContent, /Signed OTP/)
await click('Approve document')
assert.match(document.body.textContent, /Review unavailable/)
assert.equal(reviews[0][0].id, 'document-1')
assert.equal(button('Request correction').disabled, true)
reviewFails = false
await click('Approve document')
assert.match(document.body.textContent, /Document approved/)
await change(document.querySelector('[role="dialog"] textarea'), 'Upload the signed page')
await click('Request correction')
assert.deepEqual(reviews.at(-1).slice(1), ['reject', 'Upload the signed page'])
assert.equal(window.location.pathname, '/', 'review stays in the workspace')
const matterVm = buildTransferWorkspaceViewModel({ workflowKey: 'transfer', selectedTaskKey: 'matter_opened', workflow: { title: 'Transfer', lane: { laneKey: 'transfer', permissions: { canUpdateStage: true }, steps: [{ id: 'step-2', stepKey: 'matter_opened', status: 'in_progress' }] } } })
const matterModel = buildLegalTaskWorkbenchModel({ task: matterVm.selectedTask, taskContext: matterVm.selectedTaskContext, workActions: matterVm.selectedTaskContext.workActions, statusActions: matterVm.availableActions.primary })
assert.equal(matterModel.transferMatterOpeningTask, true)
let savedMatterNumber = '', savedTeam = null
await render(React.createElement(Workbench, {
  model: matterModel, phases: matterVm.phases, selectedTaskKey: matterVm.selectedTask.key, selectedPhaseKey: matterVm.selectedTask.phaseKey,
  onSaveConfirmations: async () => true,
  onSaveMatterNumber: async value => { savedMatterNumber = value },
  onLoadMatterTeam: async () => ({ firms: [{ id: 'firm-1', name: 'Tuckers Attorneys' }], members: { primaryAttorneys: [{ userId: 'attorney-1', label: 'Alex Conveyancer' }], secretaries: [{ userId: 'secretary-1', label: 'Sam Secretary' }] } }),
  onSaveMatterTeam: async payload => { savedTeam = payload; return { id: 'assignment-1', ...payload } },
}))
const matterInput = [...document.querySelectorAll('input')].find(node => node.placeholder === 'Enter the firm matter number')
await change(matterInput, 'MAT-2026-1001')
await click('Save matter number')
assert.equal(savedMatterNumber, 'MAT-2026-1001')
assert.equal(matterInput.value, 'MAT-2026-1001', 'acknowledged matter number must not revert while refresh is pending')
await click('Manage matter team')
const selects = document.querySelectorAll('[role="dialog"] select')
await change(selects[1], 'attorney-1')
await change(selects[2], 'secretary-1')
await click('Save allocation')
assert.deepEqual(savedTeam, { assignmentId: '', firmId: 'firm-1', attorneyUserId: 'attorney-1', secretaryId: 'secretary-1' })
const sourceVm = buildTransferWorkspaceViewModel({ workflowKey: 'transfer', selectedTaskKey: 'otp_source_docs_checked', documents: [doc, { id: 'property-doc', displayName: 'Title deed', requiredDocumentKey: 'seller_property_documents', ready: true }], workflow: { title: 'Transfer', lane: { laneKey: 'transfer', permissions: { canUpdateStage: true }, steps: [{ id: 'step-3', stepKey: 'otp_source_docs_checked', status: 'in_progress' }] } } })
const sourceModel = buildLegalTaskWorkbenchModel({ task: sourceVm.selectedTask, taskContext: sourceVm.selectedTaskContext, workActions: sourceVm.selectedTaskContext.workActions, statusActions: sourceVm.availableActions.primary })
assert.equal(sourceModel.transferOtpSourceTask, true)
assert.deepEqual(sourceModel.confirmationRequirements.map(item => item.answers), [['yes', 'no'], ['yes', 'no'], ['yes', 'no', 'not_applicable']])
assert.ok(Object.values(sourceModel.requirementActions).some(action => action.label === 'Review OTP'))
assert.ok(Object.values(sourceModel.requirementActions).some(action => action.label === 'Review property documents'))
let savedSource = null
await render(React.createElement(Workbench, {
  model: sourceModel, phases: sourceVm.phases, selectedTaskKey: sourceVm.selectedTask.key, selectedPhaseKey: sourceVm.selectedTask.phaseKey,
  onSaveConfirmations: async () => true, onSaveSourceDetails: async value => { savedSource = value },
}))
assert.doesNotMatch(document.body.textContent, /Current task|Required action/)
await change(document.querySelector('input[placeholder="Enter purchase price"]'), '2190000')
await change(document.querySelector('input[placeholder="Enter the property description"]'), 'Erf 42')
await click('Save source details')
assert.deepEqual(savedSource, { purchasePrice: '2190000', propertyDescription: 'Erf 42' })
const titleVm = buildTransferWorkspaceViewModel({ workflowKey: 'transfer', selectedTaskKey: 'title_deed_checked', documents: [{ id: 'title-doc', displayName: 'Title deed', requiredDocumentKey: 'seller_property_documents', ready: true }], workflow: { title: 'Transfer', lane: { laneKey: 'transfer', permissions: { canUpdateStage: true }, steps: [{ id: 'step-4', stepKey: 'title_deed_checked', status: 'in_progress' }] } } })
const titleModel = buildLegalTaskWorkbenchModel({ task: titleVm.selectedTask, taskContext: titleVm.selectedTaskContext, workActions: titleVm.selectedTaskContext.workActions, statusActions: titleVm.availableActions.primary })
assert.equal(titleModel.transferTitleDeedTask, true)
assert.deepEqual(titleModel.confirmationRequirements.map(item => item.answers), [['yes', 'no'], ['yes', 'no']])
assert.ok(Object.values(titleModel.requirementActions).every(action => action.label === 'Review ownership documents'))
let savedTitle = null
await render(React.createElement(Workbench, {
  model: titleModel, phases: titleVm.phases, selectedTaskKey: titleVm.selectedTask.key, selectedPhaseKey: titleVm.selectedTask.phaseKey,
  onSaveConfirmations: async () => true, onSaveTitleDetails: async value => { savedTitle = value },
}))
await change(document.querySelector('input[placeholder="Enter title deed or erf number"]'), 'T12345')
await change([...document.querySelectorAll('select')].find(node => node.parentElement.textContent.includes('Property tenure')), 'freehold')
await click('Save ownership details')
assert.deepEqual(savedTitle, { identifier: 'T12345', tenure: 'freehold' })
const bondVm = buildTransferWorkspaceViewModel({ workflowKey: 'transfer', selectedTaskKey: 'existing_bond_confirmed', workflow: { title: 'Transfer', lane: { laneKey: 'transfer', permissions: { canUpdateStage: true }, steps: [{ id: 'step-5', stepKey: 'existing_bond_confirmed', status: 'in_progress' }] } } })
const bondModel = buildLegalTaskWorkbenchModel({ task: bondVm.selectedTask, taskContext: bondVm.selectedTaskContext, workActions: bondVm.selectedTaskContext.workActions, statusActions: bondVm.availableActions.primary })
assert.equal(bondModel.transferExistingBondTask, true)
assert.deepEqual(bondModel.confirmationRequirements.map(item => item.answers), [['yes', 'no', 'not_applicable'], ['yes', 'no', 'not_applicable']])
assert.equal(bondModel.contextualActions.some(action => action.id === 'open_parties'), false)
let savedBondAnswers = null, savedBondDecision = null
await render(React.createElement(Workbench, {
  model: bondModel, phases: bondVm.phases, selectedTaskKey: bondVm.selectedTask.key, selectedPhaseKey: bondVm.selectedTask.phaseKey,
  onSaveConfirmations: async value => { savedBondAnswers = value; return true },
  onSaveBondCancellationDecision: async value => { savedBondDecision = value },
}))
for (const [label, answer] of [['Seller existing bond position captured.', 'Yes'], ['Cancellation lane is required or explicitly not required.', 'No']]) {
  const group = [...document.querySelectorAll('[role="group"]')].find(node => node.getAttribute('aria-label') === label)
  assert.ok(group, `Missing confirmation row: ${label}`)
  await act(async () => [...group.querySelectorAll('button')].find(node => node.textContent === answer).click())
}
await click('Save answers')
assert.equal(savedBondAnswers.seller_existing_bond_position.answer, 'yes')
assert.deepEqual(savedBondDecision, { existingBond: 'yes', cancellationRequired: 'no' })
await act(async () => root.unmount())
console.log('Inline work: confirmation persistence, failure handling, document approval/correction and appointment delivery retry PASS')

root = createRoot(document.getElementById('root'))
// Comments are task records, retain drafts through tabs/refresh and retry uncertain saves safely.
for (const lane of ['transfer', 'bond', 'cancellation']) {
  const taskKey = `${lane}_comment_fixture`
  const commentModel = { ...model, lane, taskKey, taskLabel: `${lane} task`, notes: [], readOnly: false }
  let calls = [], failComment = true, dirty = false, pendingResolve
  const props = { model: commentModel, focusedStage: true, embedded: true, taskMeta: { key: taskKey },
    onTaskDirtyChange: (key, value) => { assert.equal(key, taskKey); dirty = value },
    onSaveTaskComment: async draft => {
      calls.push(draft)
      if (failComment) throw new Error('Comment save unavailable')
      if (pendingResolve === 'defer') await new Promise(resolve => { pendingResolve = resolve })
      return { updateId: `${lane}-saved-comment` }
    } }
  await render(React.createElement(Workbench, { ...props, key: lane }))
  await click('Notes (0)')
  let input = [...document.querySelectorAll('textarea')].find(node => node.closest('form')?.textContent.includes('Save comment'))
  assert.ok(input)
  await change(input, 'Waiting for the signed pack')
  assert.equal(dirty, true)
  await click('Checklist')
  await render(React.createElement(Workbench, { ...props, model: { ...commentModel, note: 'A refreshed outcome' }, key: lane }))
  await click('Notes (0)')
  assert.equal(input.value, 'Waiting for the signed pack', 'refreshes and section changes preserve the comment draft')
  await act(async () => input.closest('form').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true })))
  assert.match(document.body.textContent, /Comment save unavailable/)
  assert.equal(input.value, 'Waiting for the signed pack')
  failComment = false
  pendingResolve = 'defer'
  await act(async () => { input.closest('form').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true })) })
  await act(async () => { input.closest('form').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true })) })
  assert.equal(calls.length, 2, 'pending clicks cannot start duplicate saves')
  assert.equal(calls[0].commandId, calls[1].commandId, 'retrying identical text preserves the idempotency key')
  await act(async () => pendingResolve())
  assert.equal(dirty, false)
  assert.equal(input.value, '')
  assert.match(document.body.textContent, /Comment saved/)
  const serverNote = { id: `update_${lane}-saved-comment`, body: 'Waiting for the signed pack', visibility: 'internal' }
  await render(React.createElement(Workbench, { ...props, model: { ...commentModel, notes: [serverNote] }, key: lane }))
  assert.equal([...document.querySelectorAll('article')].filter(node => node.textContent.includes(serverNote.body)).length, 1, 'background acknowledgement must not duplicate the visible note')
  await render(React.createElement(Workbench, { model: { ...commentModel, readOnly: true }, focusedStage: true, key: `${lane}-read-only` }))
  assert.equal(button('Save comment'), undefined, 'no save callback is exposed for a read-only task')
}

let reviewDirty = false, reviewBusyState = false
const reviewProps = { model, focusedStage: true, embedded: true, onSaveConfirmations: async () => true, onTaskDirtyChange: (_key, value) => { reviewDirty = value },
  onTaskBusyChange: value => { reviewBusyState = value }, onReviewDocument: async () => { throw new Error('Version changed') } }
await render(React.createElement(Workbench, { ...reviewProps, key: 'review-draft' }))
await click('View instruction source')
let reviewInput = document.querySelector('[role="dialog"] textarea')
await change(reviewInput, 'The signature page is missing')
assert.equal(reviewDirty, true, 'review drafts participate in the task navigation warning')
await render(React.createElement(Workbench, { ...reviewProps, model: { ...model, note: 'Refreshed checklist note' }, key: 'review-draft' }))
assert.ok(document.querySelector('[role="dialog"]'), 'an unrelated note refresh must not close document review')
assert.equal(reviewInput.value, 'The signature page is missing')
const originalConfirm = window.confirm
window.confirm = () => false
await click('Close')
assert.ok(document.querySelector('[role="dialog"]'), 'cancelled discard keeps the document preview open')
await click('Request correction')
assert.match(document.body.textContent, /Version changed/)
assert.equal(reviewInput.value, 'The signature page is missing', 'a failed review preserves the correction reason')
assert.equal(reviewBusyState, false)
window.confirm = () => true
await click('Close')
assert.equal(document.querySelector('[role="dialog"]'), null)
assert.equal(reviewDirty, false)
window.confirm = originalConfirm
console.log('Panel persistence: comments, stable retries, task scope, dirty guards and review refresh recovery PASS')
await act(async () => root.unmount())

// Exercise the actual record controls and save callbacks across all three lanes.
const { getLegalTaskContent } = await import('../src/core/transactions/legalTaskContent.js')
for (const [laneKey, taskKey] of [['transfer', 'registered'], ['bond', 'bank_approval_to_lodge_received'], ['cancellation', 'cancellation_registered']]) {
  root = createRoot(document.getElementById('root'))
  const vm = buildTransferWorkspaceViewModel({ workflowKey: laneKey, selectedTaskKey: taskKey, workflow: { lane: { laneKey, permissions: { canUpdateStage: true }, steps: [{ id: 'record-step', stepKey: taskKey, status: 'in_progress' }] } } })
  const model = buildLegalTaskWorkbenchModel({ task: vm.selectedTask, taskContext: vm.selectedTaskContext, workActions: vm.selectedTaskContext.workActions, statusActions: vm.availableActions.primary })
  const content = getLegalTaskContent(laneKey, taskKey)
  let savedRecord, shouldFail = true, saves = 0
  const props = { taskKey, items: model.confirmationRows, onSave: async draft => { saves++; if (shouldFail) throw new Error('Record save unavailable'); savedRecord = normalizeTaskConfirmations(draft); return true } }
  await render(React.createElement(Confirmations, props))
  const recordNode = document.querySelector('[data-task-record]')
  assert.equal(recordNode.dataset.taskRecord, content.spec.label)
  assert.equal(recordNode.querySelectorAll('fieldset').length, 1, 'single records are immediately editable')
  assert.equal([...recordNode.querySelectorAll('button')].some(node => /Add item/.test(node.textContent)), false)
  await change(recordNode.querySelector('input[type=date]'), '2026-10-06')
  const referenceInput = [...recordNode.querySelectorAll('label')].find(node => node.textContent.includes(content.spec.fields[1].label)).querySelector('input')
  await change(referenceInput, `${laneKey}-REF-2026`)
  await click('Save answers')
  assert.equal(saves, 0, 'a typed record needs an explicit confirmation answer')
  assert.match(document.body.textContent, /Choose Yes, No or Not applicable/)
  await act(async () => recordNode.closest('.legal-task-confirmation').querySelector('button').click())
  await click('Save answers')
  assert.equal(saves, 1)
  assert.match(document.body.textContent, /Record save unavailable/)
  assert.equal(referenceInput.value, `${laneKey}-REF-2026`, 'failed saves retain the record')
  // A server refresh must not overwrite unsaved fields.
  await render(React.createElement(Confirmations, { ...props, saved: { older: { answer: 'yes' } } }))
  assert.equal(referenceInput.value, `${laneKey}-REF-2026`)
  shouldFail = false
  await click('Save answers')
  assert.equal(savedRecord[content.rowId].items[0].date, '2026-10-06')
  assert.equal(savedRecord[content.rowId].items[0].reference, `${laneKey}-REF-2026`)
  await act(async () => root.unmount())
  root = createRoot(document.getElementById('root'))
  await render(React.createElement(Confirmations, { ...props, saved: savedRecord, disabled: true }))
  assert.equal(document.querySelector('[data-task-record] input[type=date]').value, '2026-10-06', 'saved record survives remount')
  assert.equal(document.querySelector('[data-task-record] fieldset').disabled, true, 'read-only users cannot change record fields')
  assert.equal(button('Save answers').disabled, true)
  await act(async () => root.unmount())
}
root = createRoot(document.getElementById('root'))
const submissionContent = getLegalTaskContent('bond', 'bond_documents_sent_to_bank')
let submissionSaved, submissionSaves = 0
const submissionItems = [{ id: submissionContent.rowId, label: 'Submission recorded', answers: ['yes', 'no'], register: submissionContent.spec }]
await render(React.createElement(Confirmations, { taskKey: 'bond_documents_sent_to_bank', items: submissionItems,
  saved: { [submissionContent.rowId]: { answer: 'no', items: [{ id: 'initial', kind: 'initial_submission', sentOn: '2026-10-05', packReference: 'pack-v1', retainedOlderField: 'preserve' }] } },
  onSave: async draft => { submissionSaves++; submissionSaved = normalizeTaskConfirmations(draft); return true } }))
await click('Add bank submission')
let recordFieldsets = document.querySelectorAll('[data-task-record] fieldset')
assert.equal(recordFieldsets.length, 2)
await change(recordFieldsets[1].querySelector('input[type=date]'), '2026-10-06')
await change(recordFieldsets[1].querySelector('select'), 'resubmission')
await click('Yes')
await click('Save answers')
assert.equal(submissionSaves, 1)
assert.equal(submissionSaved[submissionContent.rowId].items[0].retainedOlderField, 'preserve', 'editing preserves older saved fields and entries')
assert.equal(submissionSaved[submissionContent.rowId].items[1].kind, 'resubmission')
assert.equal(submissionSaved[submissionContent.rowId].items.length, 2)
await act(async () => root.unmount())
root = createRoot(document.getElementById('root'))
const conditionContent = getLegalTaskContent('bond', 'bank_conditions_resolved')
const precedingConditions = [{ id: 'condition-1', description: 'Provide signed annexure', owner: 'Bond secretary', status: 'outstanding' }]
let conditionSaved
await render(React.createElement(Confirmations, { taskKey: 'bank_conditions_resolved', items: [{ id: conditionContent.rowId, label: 'Conditions resolved', answers: ['yes', 'no'], register: { ...conditionContent.spec, initialItems: precedingConditions } }], onSave: async draft => { conditionSaved = normalizeTaskConfirmations(draft); return true } }))
assert.equal(document.querySelector('[data-task-record] input').value, 'Provide signed annexure')
assert.equal(button('Yes').getAttribute('aria-pressed'), 'false', 'carried conditions require a fresh decision')
assert.equal(button('Save answers').disabled, true, 'loading earlier conditions does not silently save or dirty the current task')
await change(document.querySelector('[data-task-record] select'), 'resolved')
await click('Yes')
await click('Save answers')
assert.equal(conditionSaved[conditionContent.rowId].items[0].status, 'resolved')
assert.equal(precedingConditions[0].status, 'outstanding', 'current review never mutates an earlier task record')
await act(async () => root.unmount())
console.log('Task-specific records: three-lane editing, failed saves, refresh, reload, read-only and bank resubmissions PASS')

dom.window.close()
