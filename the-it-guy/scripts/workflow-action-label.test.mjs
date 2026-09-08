import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { workflowActionLabel, workflowTaskButtonLabel } from '../src/lib/workflowActionLabel.js'

const action = Object.freeze({ id: 'capture-finance', label: 'Capture finance type', description: '', type: 'capture_details', target: 'attorney', priority: 'high', laneKey: 'transfer', stageKey: 'instruction_received', relatedId: null })
assert.throws(() => renderToStaticMarkup(React.createElement('button', null, action)), /Objects are not valid as a React child/)
for (const [task, expected] of [
  [{ action, command: { label: 'Capture details' } }, 'Capture details'],
  [{ action }, 'Capture finance type'],
  [{ action: 'Open' }, 'Open'],
  [{ action: {} }, 'Complete Action'],
  [{ action: { label: {} }, command: { label: {} } }, 'Complete Action'],
  [null, 'Complete Action'],
]) {
  assert.equal(workflowTaskButtonLabel(task), expected)
  assert.equal(renderToStaticMarkup(React.createElement('button', null, workflowTaskButtonLabel(task))), `<button>${expected}</button>`)
}
assert.equal(workflowActionLabel(action), action.label)
assert.equal(workflowActionLabel('Workflow complete'), 'Workflow complete')
assert.equal(workflowActionLabel({}, 'Workflow review'), 'Workflow review')
const page = readFileSync(new URL('../src/pages/AttorneyTransactionDetail.jsx', import.meta.url), 'utf8')
assert.ok(page.includes('{workflowTaskButtonLabel(nextAction)}'))
assert.ok(!page.includes('{nextAction.action ||'))
assert.ok(page.includes('action: primaryAction,'), 'Keep the dispatch payload intact')
console.log('PASS: workflow action objects render labels safely; command labels, legacy strings, malformed data and dispatch payload covered.')
