import assert from 'node:assert/strict'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'

const server = await createServer({ configFile: false, envFile: false, logLevel: 'silent', esbuild: { jsx: 'automatic' }, server: { middlewareMode: true } })
try {
  const { default: Workbench } = await server.ssrLoadModule('/src/components/attorney/workflow/LegalTaskWorkbench.jsx')
  const model = {
    taskKey: 'instruction_received', taskLabel: 'Instruction Received', taskType: 'collect_documents',
    taskDescription: 'The instruction and source documents have been received.',
    status: 'not_started', statusLabel: 'Not Started', phaseLabel: 'Instruction', workflowLabel: 'Transfer',
    outstandingRequirements: [{ id: 'otp', label: 'Sales agreement / OTP', description: 'sales_agreement_or_otp' }],
    requirementActions: { otp: { id: 'review', label: 'Review documents' } },
    confirmationRequirements: [], completedRequirements: [], documents: [], notes: [], activity: [],
    requirementsSatisfied: false, completionMessage: 'Evidence is advisory.',
    canMarkInProgress: true, markInProgressLabel: 'Start task', canComplete: true,
    completeAction: { id: 'mark_complete', label: 'Complete task' },
  }
  const render = (overrides = {}) => renderToStaticMarkup(createElement(Workbench, {
    model: { ...model, ...overrides }, selectedPhaseKey: 'instruction',
    phases: [{ key: 'instruction', label: 'Instruction', completed: 0, total: 5, tasks: [] }],
  }))
  const html = render()
  assert.match(html, /0 \/ 5 complete/)
  assert.doesNotMatch(html, /sales_agreement_or_otp|applicable tasks complete|Outstanding items are advisory:/)
  assert.match(html, /Required action/)
  assert.match(html, /Supporting documents/)
  assert.doesNotMatch(html, /Task guidance|Current legal task|Attention required/)
  assert.match(html, /Review documents/)
  assert.match(html, /Save progress/)
  assert.match(html, /Complete task/)
  const documentHtml = render({ documents: [
    { id: 'attached', displayName: 'Attached OTP', ready: true },
    { id: 'missing', displayName: 'Duplicate missing OTP', ready: false },
  ] })
  assert.match(documentHtml, /Attached OTP/)
  assert.doesNotMatch(documentHtml, /Duplicate missing OTP/)
  assert.doesNotMatch(documentHtml, /More status options/)
  assert.match(render({ outstandingRequirements: [{ id: 'otp', label: 'OTP', description: 'Check all signatures.' }] }), /<summary[^>]*>Details<\/summary><p[^>]*>Check all signatures\./)
  assert.doesNotMatch(render({ completeAction: null }), /Complete task<\/button>/)
  assert.match(render({ canComplete: false }), /disabled=""[^>]*>[\s\S]*Complete task/)
  console.log('Work tab simplification: task-first rendering, labels and action gates passed')
} finally {
  await server.close()
}
