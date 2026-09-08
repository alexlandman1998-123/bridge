import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createServer } from 'vite'
const server = await createServer({ configFile: false, envFile: false, logLevel: 'silent', server: { middlewareMode: true } })
try {
  const { buildTransferWorkspaceViewModel } = await server.ssrLoadModule('/src/services/attorneyWorkflow/transferWorkspaceViewModel.js')
  for (const workflowKey of ['transfer', 'bond', 'cancellation']) {
    for (const financeType of ['cash', 'bond', 'hybrid']) {
      const workflow = { facts: { financeType }, lane: { laneKey: workflowKey, steps: [] } }
      let model = buildTransferWorkspaceViewModel({ workflow, workflowKey })
      assert.equal(model.phases.reduce((n, p) => n + p.completed, 0), 0)
      assert.equal(model.phases.flatMap(p => p.tasks).length, model.tasks.length)
      const first = model.tasks[0]
      workflow.lane.steps = [{ stepKey: first.key, status: 'completed_externally' }]
      model = buildTransferWorkspaceViewModel({ workflow, workflowKey })
      assert.equal(model.phases.reduce((n, p) => n + p.completed, 0), 1)
      workflow.lane.steps[0].status = 'not_applicable'
      model = buildTransferWorkspaceViewModel({ workflow, workflowKey })
      assert.equal(model.phases.reduce((n, p) => n + p.notApplicable, 0), 1)
      assert.equal(model.phases.reduce((n, p) => n + p.total, 0), model.tasks.length - 1)
      workflow.lane.steps[0].status = 'not_started'
      model = buildTransferWorkspaceViewModel({ workflow, workflowKey })
      assert.equal(model.phases.reduce((n, p) => n + p.completed, 0), 0)
    }
  }
  const page = readFileSync(new URL('../src/pages/AttorneyTransactionDetail.jsx', import.meta.url), 'utf8')
  const header = page.slice(page.indexOf('function ArchlineMatterHeader('), page.indexOf('function ArchlineMatterHeader(') + 26000)
  assert.ok(header.includes('sharedJourneyHeaderPhases(sharedLegalJourney, workflowKey)'))
  assert.ok(header.includes('onSelectWorkflowPhase?.(stage, workflowKey)'))
  assert.ok(page.includes('focusRequest={journeyFocusRequest}'))
  console.log('PASS: Work phase semantics across 9 lane/finance combinations; shared-snapshot header and navigation wiring checked.')
} finally { await server.close() }
