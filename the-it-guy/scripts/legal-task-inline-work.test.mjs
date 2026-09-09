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
let reviews = [], reviewFails = true
await render(React.createElement(Workbench, { model, phases: vm.phases, selectedTaskKey: vm.selectedTask.key, selectedPhaseKey: vm.selectedTask.phaseKey, onReviewDocument: async (...args) => { reviews.push(args); if (reviewFails) throw new Error('Review unavailable'); return { message: 'Document approved.' } } }))
await act(async () => [...document.querySelectorAll('button')].find(node => node.textContent.includes('Signed OTP')).click())
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
await act(async () => root.unmount())
dom.window.close()
console.log('Inline work: confirmation persistence, failure handling, document approval/correction and appointment delivery retry PASS')
