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
assert.match(workflowSource, /Upload the signed OTP before moving to Signed OTP received\./)

const server = await createServer({ root: process.cwd(), logLevel: 'silent', server: { middlewareMode: true } })
try {
  const workflow = await server.ssrLoadModule('/src/lib/workflowEngine.js')
  const definition = await server.ssrLoadModule('/src/services/buyerProcessDefinitionService.js')

  assert.deepEqual(workflow.BUYER_WORKFLOW_STAGES, [
    'Captured',
    'Qualification',
    'Viewing',
    'Buyer onboarding sent',
    'Signed OTP received',
    'Transaction',
    'On hold',
    'Lost',
    'Closed won',
    'Closed lost',
  ])
  assert.equal(workflow.BUYER_WORKFLOW_STAGES.includes('Ready to Generate OTP'), false)
  assert.equal(workflow.BUYER_WORKFLOW_STAGES.includes('OTP Generated'), false)

  assert.equal(workflow.normalizeBuyerWorkflowStage('New Lead'), 'Captured')
  assert.equal(workflow.normalizeBuyerWorkflowStage('Contacted'), 'Captured')
  assert.equal(workflow.normalizeBuyerWorkflowStage('Qualified'), 'Qualification')
  assert.equal(workflow.normalizeBuyerWorkflowStage('Viewing Completed'), 'Viewing')
  assert.equal(workflow.normalizeBuyerWorkflowStage('Offer + Onboarding Link Sent'), 'Buyer onboarding sent')
  assert.equal(workflow.normalizeBuyerWorkflowStage('Offer Submitted'), 'Signed OTP received')
  assert.equal(workflow.normalizeBuyerWorkflowStage('Ready for OTP generation'), 'Signed OTP received')
  assert.equal(workflow.normalizeBuyerWorkflowStage('OTP Generated'), 'Signed OTP received')
  assert.equal(workflow.normalizeBuyerWorkflowStage('Signed by All Parties'), 'Transaction')
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
    toStage: 'Signed OTP received',
    actor,
  })
  assert.equal(illegal.allowed, false)
  assert.equal(illegal.allowedTargetKeys.includes(definition.BUYER_PROCESS_STAGE_KEYS.qualification), true)
  assert.match(illegal.reason, /Captured cannot move directly to Signed OTP received/)

  const qualification = await workflow.validateBuyerStageTransition({
    lead,
    leadId: lead.leadId,
    fromStage: 'Captured',
    toStage: 'Qualification',
    actor,
  })
  assert.equal(qualification.allowed, true)
  assert.equal(qualification.fromStage, 'Captured')
  assert.equal(qualification.toStage, 'Qualification')
  assert.equal(qualification.fromStageKey, definition.BUYER_PROCESS_STAGE_KEYS.captured)
  assert.equal(qualification.toStageKey, definition.BUYER_PROCESS_STAGE_KEYS.qualification)

  const offerReceived = await workflow.validateBuyerStageTransition({
    lead: { ...lead, stage: 'Viewing' },
    leadId: lead.leadId,
    fromStage: 'Viewing Completed',
    toStage: 'Ready to Generate OTP',
    actor,
  })
  assert.equal(offerReceived.allowed, true)
  assert.equal(offerReceived.toStage, 'Signed OTP received')
  assert.equal(offerReceived.toStageKey, definition.BUYER_PROCESS_STAGE_KEYS.offerReceived)
  assert.equal(offerReceived.requirements[0].requirement.key, 'offer_document_uploaded')
  assert.equal(offerReceived.requirements[0].skipped, true)

  const blockedRole = await workflow.validateBuyerStageTransition({
    lead,
    leadId: lead.leadId,
    fromStage: 'Captured',
    toStage: 'Qualification',
    actor: { role: 'bond_originator' },
  })
  assert.equal(blockedRole.allowed, false)
  assert.match(blockedRole.reason, /cannot move buyer workflow stages/)
} finally {
  await server.close()
}

console.log('buyer process workflow engine Phase 2 contract passed')
