import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { transform } from 'esbuild'
import React, { act, useState, useRef, useMemo, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { JSDOM } from 'jsdom'
import { buildLegalTaskWorkbenchModel } from '../src/core/transactions/legalTaskWorkbenchModel.js'
import { buildTransferWorkspaceViewModel } from '../src/services/attorneyWorkflow/transferWorkspaceViewModel.js'
import { readTaskConfirmations, normalizeTaskConfirmations } from '../src/core/transactions/legalTaskConfirmations.js'

// Exercise the actual workspace handlers with React, isolating its task view
// from the rest of the transaction page and all hosted services.
const dom = new JSDOM('<div id="root"></div>', { url: 'https://test.invalid' })
globalThis.window = dom.window
globalThis.document = dom.window.document
globalThis.IS_REACT_ACT_ENVIRONMENT = true
const source = readFileSync(new URL('../src/pages/AttorneyTransactionDetail.jsx', import.meta.url), 'utf8')
const start = source.indexOf('function ArchlineTransferWorkspace(')
const end = source.indexOf('\n  if (selectedTask?.operationalContract)', start)
const returnEnd = source.indexOf('\n  }', end) + 4
const component = source.slice(start, returnEnd) + '\nreturn null\n}'
const { code } = await transform(component, { loader: 'jsx', jsxFactory: 'React.createElement' })
let props, currentModel, failure = false, calls = 0
const resolved = status => ['completed', 'completed_externally', 'not_applicable'].includes(status)
const Workspace = new Function('React', 'useState', 'useRef', 'useMemo', 'useEffect',
  'buildTransferWorkspaceViewModel', 'buildLegalTaskWorkbenchModel', 'WORKFLOW_STATUS_META',
  'isAttorneyTaskResolved', 'LegalTaskWorkbench', 'readTaskConfirmations', 'normalizeTaskConfirmations', code + '\nreturn ArchlineTransferWorkspace')(
  React, useState, useRef, useMemo, useEffect, buildTransferWorkspaceViewModel,
  buildLegalTaskWorkbenchModel, { not_started: {} }, resolved,
  next => { props = next; currentModel = next.model; return null },
  readTaskConfirmations, normalizeTaskConfirmations,
)
let record = { id: 'step-1', stepKey: 'instruction_received', status: 'not_started', comment: '' }
const workflow = () => ({ title: 'Transfer Attorney', lane: {
  laneKey: 'transfer', currentStage: 'instruction_received',
  // Empty action projection reproduces the previously inert fallback button.
  permissions: { canUpdateStage: false }, steps: [structuredClone(record)],
  dataRequirements: [], documentRequirements: [],
} })
const save = async (task, status, note, packet) => {
  calls++
  if (failure) throw new Error('Connection lost')
  record = { ...record, status, comment: note, ...(packet?.taskConfirmations ? { taskConfirmations: packet.taskConfirmations } : {}) }
  return true
}
let root = createRoot(document.getElementById('root'))
const render = () => root.render(React.createElement(Workspace, { workflow: workflow(), onUpdateStep: save, selectionStorageKey: 'test-task' }))
const flush = callback => act(async () => { await callback() })
try {
  await flush(render)
  assert.ok(currentModel.completeAction)
  assert.ok(currentModel.outcomeActions.some(action => action.id === 'mark_not_applicable'))
  const submit = async (id, note = 'Evidence checked by attorney') => {
    const action = currentModel.statusActions.find(item => item.id === id)
    assert.ok(action, id)
    await flush(() => props.onRunAction(action))
    await flush(() => props.onStatusDraftChange({ ...props.statusDraft, note, reason: note }))
    await flush(() => props.onSubmitStatusDraft({ preventDefault() {} }))
  }
  failure = true
  await submit('mark_complete')
  assert.equal(record.status, 'not_started')
  assert.equal(props.statusDraft.open, true)
  assert.match(props.error, /Connection lost/)
  failure = false
  await submit('mark_not_applicable', '')
  assert.match(props.error, /Add a reason/)
  assert.equal(calls, 1, 'missing reasons must not call the mutation')
  await submit('mark_complete')
  assert.equal(record.status, 'completed')
  assert.equal(props.statusDraft.open, false)
  assert.match(props.successMessage, /saved/)
  // Discard component memory, then rebuild from the saved record.
  const reload = async () => {
    await flush(() => root.unmount())
    window.sessionStorage.setItem('test-task', 'instruction_received')
    root = createRoot(document.getElementById('root'))
    await flush(render)
  }
  await reload()
  assert.equal(currentModel.taskResolved, true)
  assert.ok(currentModel.outcomeActions.some(action => action.id === 'reopen_task'))
  await submit('reopen_task')
  await reload()
  assert.equal(currentModel.taskResolved, false)
  await submit('mark_not_applicable', 'Does not apply to this transaction')
  await reload()
  assert.equal(currentModel.status, 'not_applicable')
  await submit('reopen_task')
  await reload()
  await submit('complete_externally', 'Originals reviewed at the firm')
  await reload()
  assert.equal(currentModel.status, 'completed_externally')
  assert.equal(calls, 6)
  await submit('reopen_task')
  await reload()
  const confirmations = { instruction: { answer: 'yes', note: 'Instruction reviewed' } }
  await flush(async () => assert.equal(await props.onSaveConfirmations(confirmations), true))
  await reload()
  assert.deepEqual(currentModel.confirmations, confirmations, 'task answers must survive rebuilding the workspace')
  console.log('Task save handlers: fallback completion, failure feedback, outcomes and reload passed')
} finally {
  await flush(() => root.unmount())
  dom.window.close()
}
