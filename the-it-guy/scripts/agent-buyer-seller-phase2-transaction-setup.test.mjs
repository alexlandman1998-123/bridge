import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import {
  BUYER_PROCESS_STAGE_KEYS,
  canTransitionBuyerProcessStage,
  getBuyerProcessDefinition,
  getBuyerProcessDefinitionByProfile,
  normalizeBuyerProcessStageKey,
} from '../src/services/buyerProcessDefinitionService.js'
import { KINGSTONS_BUYER_PROCESS_PROFILE } from '../src/services/buyerProcessProfileService.js'

const appRoot = resolve(import.meta.dirname, '..')
const pipelineSource = readFileSync(resolve(appRoot, 'src/pages/agency/AgencyPipelinePage.jsx'), 'utf8')
const workflowSource = readFileSync(resolve(appRoot, 'src/lib/workflowEngine.js'), 'utf8')

for (const definition of [
  getBuyerProcessDefinition({}),
  getBuyerProcessDefinitionByProfile(KINGSTONS_BUYER_PROCESS_PROFILE),
]) {
  assert.equal(definition.activeStageKeys.includes(BUYER_PROCESS_STAGE_KEYS.offer), false)
  assert.equal(definition.stages.some((stage) => stage.label === 'Offer'), false)
  assert.deepEqual(
    definition.activeStageKeys.slice(-2),
    [BUYER_PROCESS_STAGE_KEYS.transactionSetup, BUYER_PROCESS_STAGE_KEYS.transaction],
  )
  const signedOtpGate = definition.evidenceGates.find((gate) => gate.key === 'otp_document_uploaded')
  assert.equal(signedOtpGate.requiredForStage, BUYER_PROCESS_STAGE_KEYS.transaction)
}

for (const historicalStage of [
  'Offer',
  'Offer Submitted',
  'Ready to Generate OTP',
  'OTP Generated',
  'Signed by All Parties',
  'Signed OTP Received',
]) {
  assert.equal(
    normalizeBuyerProcessStageKey(historicalStage),
    BUYER_PROCESS_STAGE_KEYS.transactionSetup,
    `${historicalStage} should remain readable without recreating an Offer workflow stage.`,
  )
}

assert.equal(canTransitionBuyerProcessStage('Viewing', 'Transaction Setup'), true)
assert.equal(canTransitionBuyerProcessStage('Transaction Setup', 'Transaction'), true)
assert.equal(canTransitionBuyerProcessStage('Viewing', 'Offer'), true, 'Historical Offer input should resolve to Transaction Setup.')

assert.doesNotMatch(pipelineSource, /Transaction Setup \/ Offer/)
assert.doesNotMatch(pipelineSource, /Open Setup \/ Offer/)
assert.doesNotMatch(pipelineSource, /Offer: Upload Signed OTP/)
assert.doesNotMatch(pipelineSource, /label: 'Offer'/)
assert.match(pipelineSource, /createAndSendBuyerOnboardingForLead\(\{/)
assert.match(pipelineSource, /async function handleBuyerJourneyStartTransactionSetupAction/)
assert.match(
  pipelineSource,
  /async function handleOtpQuickStartOpenUpload[\s\S]+openOtpUploadWizard\(\)/,
  'OTP quick start should open the existing signed upload wizard instead of the retired offer-link workflow.',
)
assert.equal(
  (pipelineSource.match(/createAndSendOfferLinkForLead\(/g) || []).length,
  1,
  'The retired offer-link implementation may remain as guarded compatibility code, but no live caller may invoke it.',
)
assert.match(workflowSource, /Upload the signed OTP before moving to Transaction\./)
assert.doesNotMatch(workflowSource, /before moving to Offer/)

console.log('Agent/buyer/seller Phase 2 Transaction Setup checks passed.')
