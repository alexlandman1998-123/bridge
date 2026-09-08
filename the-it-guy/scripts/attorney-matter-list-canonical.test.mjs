import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createServer } from 'vite'

const server = await createServer({ configFile: false, envFile: false, logLevel: 'silent', server: { middlewareMode: true } })
try {
  const { buildMatterListProgress, fetchMatterListProgress } = await server.ssrLoadModule('/src/services/attorneyMatterProgress.js')
  const { getApplicableAttorneyTaskDefinitions, resolveMatterWorkflowPlan } = await server.ssrLoadModule('/src/services/attorneyWorkflow/matterWorkflowPlanService.js')
  const { resolvePortalPropertyLabel } = await server.ssrLoadModule('/src/services/portalCanonicalFieldFallbacks.js')
  const { buildAttorneyMatterWorkspaceFromSnapshot } = await server.ssrLoadModule('/src/services/attorneyMatterWorkspace.js')
  const { fetchAttorneyMatterTransactions } = await server.ssrLoadModule('/src/services/attorneyOperations.js')
  const transaction = { id: 'matter', stage: 'OTP Signed', next_action: 'Upload the signed OTP to the transaction documents.', finance_type: 'cash' }
  const lane = { id: 'lane', transaction_id: 'matter', process_type: 'transfer' }
  for (const finance_type of ['cash', 'bond', 'hybrid']) {
    for (const laneKey of ['transfer', 'bond', 'cancellation']) {
      const t = { ...transaction, finance_type, routing_profile_json: { financeType: finance_type, requiresBondAttorney: true, requiresCancellationAttorney: true } }
      const definitions = getApplicableAttorneyTaskDefinitions({ laneKey, workflowPlan: resolveMatterWorkflowPlan(t.routing_profile_json), facts: { financeType: finance_type } })
      const rows = definitions.map(task => ({ subprocess_id: 'lane', step_key: task.key, status: 'not_started' }))
      let progress = buildMatterListProgress(t, laneKey, lane, rows)
      assert.equal(progress.completedCount, 0)
      assert.equal(progress.percent, 0)
      assert.equal(progress.nextAction, definitions[0].label)
      rows[0].status = 'in_progress'
      assert.equal(buildMatterListProgress(t, laneKey, lane, rows).percent, 0)
      rows[0].status = 'completed_externally'
      rows[1].status = 'not_applicable'
      progress = buildMatterListProgress(t, laneKey, lane, rows)
      assert.equal(progress.completedCount, 1)
      assert.equal(progress.totalCount, definitions.length - 1)
      assert.equal(progress.nextAction, definitions[2].label)
      rows[0].status = 'not_started'
      assert.equal(buildMatterListProgress(t, laneKey, lane, rows).completedCount, 0)
      rows.forEach(row => { row.status = 'completed' })
      assert.equal(buildMatterListProgress(t, laneKey, lane, rows).percent, 100)
    }
  }
  assert.equal(buildMatterListProgress(transaction, 'transfer', null).totalCount, 0)
  const property = resolvePortalPropertyLabel({ transaction, unit: { unit_number: '007' }, development: { name: 'Junoah Estate', address: '99 Leith Road' } })
  assert.equal(property, '99 Leith Road · Unit 007')
  const progress = buildMatterListProgress(transaction, 'transfer', lane)
  const workspace = buildAttorneyMatterWorkspaceFromSnapshot({ access: { scope: 'firm' }, rows: [{ transactionId: 'matter', matterNumber: 'MAT-TEST', matterType: 'Transfer', propertyLabel: property, workflowProgress: progress, assignedFirmName: 'Tuckers Attorneys' }] }, { view: 'all' })
  const row = workspace.tableRows[0]
  assert.equal(row.propertyAddress, property)
  assert.equal(row.stage.completedCount, 0)
  assert.equal(row.nextAction, progress.nextAction)
  assert.equal(row.assignedAttorney.firmName, 'Tuckers Attorneys')
  const client = { from(table) { const query = { select() { return this }, in() { return this }, order() { return this }, then(resolve) { return Promise.resolve({ data: table === 'transaction_subprocesses' ? [lane] : [{ subprocess_id: 'lane', step_key: 'instruction_received', status: 'completed' }] }).then(resolve) } }; return query } }
  const fetched = await fetchMatterListProgress(client, [transaction])
  assert.equal(fetched.get('matter').steps.get('lane')[0].status, 'completed')
  const selections = []
  const compatibilityClient = { from() { return { select(fields) { selections.push(fields); return this }, in() { return Promise.resolve(selections.length === 1
    ? { error: { code: '42703', message: 'column transactions.property_image_url does not exist' } }
    : { data: [{ ...transaction, unit_id: 'unit007', development_id: 'estate', listing_id: 'listing', purchase_price: 2190000 }] }) } } } }
  const loaded = await fetchAttorneyMatterTransactions(compatibilityClient, ['matter'])
  assert.equal(selections[1], '*')
  assert.equal(loaded[0].unit_id, 'unit007')
  assert.equal(loaded[0].listing_id, 'listing')
  assert.equal(loaded[0].purchase_price, 2190000)
  const page = readFileSync(new URL('../src/pages/AttorneyMattersPage.jsx', import.meta.url), 'utf8')
  assert.ok(page.includes('arch9-attorney-matter-list-snapshot-v2'))
  assert.ok(page.includes('Staff allocation pending'))
  const assignments = readFileSync(new URL('../src/services/transactionAttorneyAssignments.js', import.meta.url), 'utf8')
  assert.ok(assignments.includes("[row.assignment_status, row.status].includes('removed')"))
  console.log('PASS: 9 lane/finance combinations, zero/completed/external/N/A/reopened outcomes, live-shape property fixture, table mapping, firm label and batched persisted-state loading.')
} finally { await server.close() }
