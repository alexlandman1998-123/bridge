import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { createRequire } from 'node:module'
import { JSDOM } from 'jsdom'
import { normalizeTaskConfirmations, readTaskConfirmations } from '../src/core/transactions/legalTaskConfirmations.js'
import { normalizeAttorneyWorkflowWorkPacket } from '../src/constants/attorneyWorkflowUsability.js'
import { buildTransferWorkspaceViewModel } from '../src/services/attorneyWorkflow/transferWorkspaceViewModel.js'
import { buildLegalTaskWorkbenchModel } from '../src/core/transactions/legalTaskWorkbenchModel.js'

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
await click('Save confirmations')
assert.match(document.body.textContent, /Save failed/)
assert.equal(button('Yes').getAttribute('aria-pressed'), 'true')
fail = false
await click('Save confirmations')
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
assert.deepEqual(model.confirmationRequirements.map(item => [item.id, item.answers, item.allowNote]), [
  ['transfer_instruction_received', ['yes', 'no'], false],
  ['otp_received_and_reviewed', ['yes', 'no'], false],
])
assert.deepEqual(model.outstandingRequirements.map(item => item.label), ['Instruction received from instructing agency'])
assert.equal(model.requirementActions[model.outstandingRequirements[0].id]?.label, 'Review OTP')
assert.equal(model.contextualActions.some(action => action.id === 'open_parties'), false)
let reviews = [], reviewFails = true
await render(React.createElement(Workbench, { model, phases: vm.phases, selectedTaskKey: vm.selectedTask.key, selectedPhaseKey: vm.selectedTask.phaseKey, onSaveConfirmations: async () => true, onReviewDocument: async (...args) => { reviews.push(args); if (reviewFails) throw new Error('Review unavailable'); return { message: 'Document approved.' } } }))
assert.doesNotMatch(document.querySelector('[aria-label="Transfer instruction received from the instructing party."]').textContent, /Not applicable/, 'Stage 1 confirmations are strictly Yes/No')
assert.ok(document.body.textContent.indexOf('Supporting documents') < document.body.textContent.indexOf('Required action'), 'supporting documents lead Stage 1 work')
await click('Review OTP')
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
  onSaveMatterNumber: async value => { savedMatterNumber = value },
  onLoadMatterTeam: async () => ({ firms: [{ id: 'firm-1', name: 'Tuckers Attorneys' }], members: { primaryAttorneys: [{ userId: 'attorney-1', label: 'Alex Conveyancer' }], secretaries: [{ userId: 'secretary-1', label: 'Sam Secretary' }] } }),
  onSaveMatterTeam: async payload => { savedTeam = payload; return { id: 'assignment-1', ...payload } },
}))
const matterInput = [...document.querySelectorAll('input')].find(node => node.placeholder === 'Enter the firm matter number')
await change(matterInput, 'MAT-2026-1001')
await click('Save matter number')
assert.equal(savedMatterNumber, 'MAT-2026-1001')
await click('Manage matter team')
const selects = document.querySelectorAll('[role="dialog"] select')
await change(selects[1], 'attorney-1')
await change(selects[2], 'secretary-1')
await click('Save allocation')
assert.deepEqual(savedTeam, { assignmentId: '', firmId: 'firm-1', attorneyUserId: 'attorney-1', secretaryId: 'secretary-1' })
const sourceVm = buildTransferWorkspaceViewModel({ workflowKey: 'transfer', selectedTaskKey: 'otp_source_docs_checked', documents: [doc, { id: 'property-doc', displayName: 'Title deed', requiredDocumentKey: 'seller_property_documents', ready: true }], workflow: { title: 'Transfer', lane: { laneKey: 'transfer', permissions: { canUpdateStage: true }, steps: [{ id: 'step-3', stepKey: 'otp_source_docs_checked', status: 'in_progress' }] } } })
const sourceModel = buildLegalTaskWorkbenchModel({ task: sourceVm.selectedTask, taskContext: sourceVm.selectedTaskContext, workActions: sourceVm.selectedTaskContext.workActions, statusActions: sourceVm.availableActions.primary })
assert.equal(sourceModel.transferOtpSourceTask, true)
assert.deepEqual(sourceModel.confirmationRequirements.map(item => item.answers), [['yes', 'no'], ['yes', 'no']])
assert.ok(Object.values(sourceModel.requirementActions).some(action => action.label === 'Review OTP'))
assert.ok(Object.values(sourceModel.requirementActions).some(action => action.label === 'Review property documents'))
const titleVm = buildTransferWorkspaceViewModel({ workflowKey: 'transfer', selectedTaskKey: 'title_deed_checked', documents: [{ id: 'title-doc', displayName: 'Title deed', requiredDocumentKey: 'seller_property_documents', ready: true }], workflow: { title: 'Transfer', lane: { laneKey: 'transfer', permissions: { canUpdateStage: true }, steps: [{ id: 'step-4', stepKey: 'title_deed_checked', status: 'in_progress' }] } } })
const titleModel = buildLegalTaskWorkbenchModel({ task: titleVm.selectedTask, taskContext: titleVm.selectedTaskContext, workActions: titleVm.selectedTaskContext.workActions, statusActions: titleVm.availableActions.primary })
assert.equal(titleModel.transferTitleDeedTask, true)
assert.deepEqual(titleModel.confirmationRequirements.map(item => item.answers), [['yes', 'no'], ['yes', 'no']])
assert.ok(Object.values(titleModel.requirementActions).every(action => action.label === 'Review ownership documents'))
const bondVm = buildTransferWorkspaceViewModel({ workflowKey: 'transfer', selectedTaskKey: 'existing_bond_confirmed', workflow: { title: 'Transfer', lane: { laneKey: 'transfer', permissions: { canUpdateStage: true }, steps: [{ id: 'step-5', stepKey: 'existing_bond_confirmed', status: 'in_progress' }] } } })
const bondModel = buildLegalTaskWorkbenchModel({ task: bondVm.selectedTask, taskContext: bondVm.selectedTaskContext, workActions: bondVm.selectedTaskContext.workActions, statusActions: bondVm.availableActions.primary })
assert.equal(bondModel.transferExistingBondTask, true)
assert.deepEqual(bondModel.confirmationRequirements.map(item => item.answers), [['yes', 'no', 'not_applicable'], ['yes', 'no', 'not_applicable']])
assert.equal(bondModel.contextualActions.some(action => action.id === 'open_parties'), false)
await act(async () => root.unmount())
dom.window.close()
console.log('Inline work: confirmation persistence, failure handling, document approval/correction and appointment delivery retry PASS')
