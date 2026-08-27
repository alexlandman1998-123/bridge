import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createServer } from 'vite'

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
assert.equal(
  packageJson.scripts?.['test:buyer-process-workflow-engine-phase2'],
  'node scripts/buyer-process-workflow-engine-phase2.test.mjs',
  'package.json should expose the buyer process workflow engine Phase 2 contract.',
)

const workflowSource = await readFile(new URL('../src/lib/workflowEngine.js', import.meta.url), 'utf8')
assert.match(workflowSource, /buyerProcessDefinitionService/)
assert.doesNotMatch(workflowSource, /Prepare OTP generation readiness/)
assert.doesNotMatch(workflowSource, /before OTP generation/)
assert.match(workflowSource, /Upload the signed OTP before moving to Transaction\./)

const server = await createServer({ root: process.cwd(), logLevel: 'silent', server: { middlewareMode: true } })
try {
  const workflow = await server.ssrLoadModule('/src/lib/workflowEngine.js')
  const definition = await server.ssrLoadModule('/src/services/buyerProcessDefinitionService.js')

  assert.deepEqual(workflow.BUYER_WORKFLOW_STAGES, [
    'Captured',
    'Contacted',
    'Qualified',
    'Viewing',
    'Transaction Setup',
    'Transaction',
    'On hold',
    'Lost',
    'Closed won',
    'Closed lost',
  ])
  assert.equal(workflow.BUYER_WORKFLOW_STAGES.includes('Ready to Generate OTP'), false)
  assert.equal(workflow.BUYER_WORKFLOW_STAGES.includes('OTP Generated'), false)

  assert.equal(workflow.normalizeBuyerWorkflowStage('New Lead'), 'Captured')
  assert.equal(workflow.normalizeBuyerWorkflowStage('Contacted'), 'Contacted')
  assert.equal(workflow.normalizeBuyerWorkflowStage('Qualified'), 'Qualified')
  assert.equal(workflow.normalizeBuyerWorkflowStage('Qualification'), 'Qualified')
  assert.equal(workflow.normalizeBuyerWorkflowStage('Viewing Completed'), 'Viewing')
  assert.equal(workflow.normalizeBuyerWorkflowStage('Offer + Onboarding Link Sent'), 'Transaction Setup')
  assert.equal(workflow.normalizeBuyerWorkflowStage('Offer Submitted'), 'Transaction Setup')
  assert.equal(workflow.normalizeBuyerWorkflowStage('Ready for OTP generation'), 'Transaction Setup')
  assert.equal(workflow.normalizeBuyerWorkflowStage('OTP Generated'), 'Transaction Setup')
  assert.equal(workflow.normalizeBuyerWorkflowStage('Signed by All Parties'), 'Transaction Setup')
  assert.equal(workflow.normalizeBuyerWorkflowStage('Finance'), 'Transaction')

  assert.equal(workflow.isBuyerWorkflowStage('Offer Submitted'), true)
  assert.equal(workflow.isBuyerWorkflowStage('Ready to Generate OTP'), true)
  assert.equal(workflow.isBuyerWorkflowStage('not a buyer stage'), false)

  const actor = { id: '00000000-0000-4000-8000-000000000001', role: 'agent' }
  const lead = {
    leadId: '00000000-0000-4000-8000-000000000002',
    stage: 'Captured',
  }

  const illegal = await workflow.validateBuyerStageTransition({
    lead,
    leadId: lead.leadId,
    fromStage: 'Captured',
    toStage: 'Offer',
    actor,
  })
  assert.equal(illegal.allowed, false)
  assert.equal(illegal.allowedTargetKeys.includes(definition.BUYER_PROCESS_STAGE_KEYS.contacted), true)
  assert.match(illegal.reason, /Captured cannot move directly to Transaction Setup/)

  const contacted = await workflow.validateBuyerStageTransition({
    lead,
    leadId: lead.leadId,
    fromStage: 'Captured',
    toStage: 'Contacted',
    actor,
  })
  assert.equal(contacted.allowed, true)
  assert.equal(contacted.fromStage, 'Captured')
  assert.equal(contacted.toStage, 'Contacted')
  assert.equal(contacted.fromStageKey, definition.BUYER_PROCESS_STAGE_KEYS.captured)
  assert.equal(contacted.toStageKey, definition.BUYER_PROCESS_STAGE_KEYS.contacted)

  const qualification = await workflow.validateBuyerStageTransition({
    lead: { ...lead, stage: 'Contacted' },
    leadId: lead.leadId,
    fromStage: 'Contacted',
    toStage: 'Qualified',
    actor,
  })
  assert.equal(qualification.allowed, true)
  assert.equal(qualification.fromStageKey, definition.BUYER_PROCESS_STAGE_KEYS.contacted)
  assert.equal(qualification.toStageKey, definition.BUYER_PROCESS_STAGE_KEYS.qualified)

  const transactionSetup = await workflow.validateBuyerStageTransition({
    lead: { ...lead, stage: 'Viewing' },
    leadId: lead.leadId,
    fromStage: 'Viewing Completed',
    toStage: 'Transaction Setup',
    actor,
  })
  assert.equal(transactionSetup.allowed, true)
  assert.equal(transactionSetup.toStage, 'Transaction Setup')
  assert.equal(transactionSetup.toStageKey, definition.BUYER_PROCESS_STAGE_KEYS.transactionSetup)

  const legacyOfferAlias = await workflow.validateBuyerStageTransition({
    lead: { ...lead, stage: 'Transaction Setup' },
    leadId: lead.leadId,
    fromStage: 'Transaction Setup',
    toStage: 'Ready to Generate OTP',
    actor,
  })
  assert.equal(legacyOfferAlias.allowed, false)
  assert.match(legacyOfferAlias.reason, /already in that workflow stage/)

  const blockedRole = await workflow.validateBuyerStageTransition({
    lead,
    leadId: lead.leadId,
    fromStage: 'Contacted',
    toStage: 'Qualified',
    actor: { role: 'bond_originator' },
  })
  assert.equal(blockedRole.allowed, false)
  assert.match(blockedRole.reason, /cannot move buyer workflow stages/)
} finally {
  await server.close()
}

console.log('buyer process workflow engine Phase 2 contract passed')
