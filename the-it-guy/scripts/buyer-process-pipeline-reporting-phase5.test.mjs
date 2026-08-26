import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createServer } from 'vite'

const appRoot = resolve(import.meta.dirname, '..')
const packageJson = JSON.parse(readFileSync(resolve(appRoot, 'package.json'), 'utf8'))
const agencyPipelinePageSource = readFileSync(resolve(appRoot, 'src/pages/agency/AgencyPipelinePage.jsx'), 'utf8')
const agencyPipelineServiceSource = readFileSync(resolve(appRoot, 'src/lib/agencyPipelineService.js'), 'utf8')

assert.equal(
  packageJson.scripts?.['test:buyer-process-pipeline-reporting-phase5'],
  'node scripts/buyer-process-pipeline-reporting-phase5.test.mjs',
  'package.json should expose the buyer process pipeline + reporting Phase 5 contract.',
)

const canonicalBuyerStages = [
  'Captured',
  'Contacted',
  'Qualified',
  'Viewing',
  'Transaction Setup',
  'Offer',
  'Transaction',
  'On hold',
  'Lost',
  'Closed won',
  'Closed lost',
]

const buyerKanbanBlock = agencyPipelinePageSource.slice(
  agencyPipelinePageSource.indexOf('const BUYER_LEAD_KANBAN_STAGE_META'),
  agencyPipelinePageSource.indexOf('const SELLER_LEAD_KANBAN_STAGES'),
)

assert.match(buyerKanbanBlock, /getBuyerProcessDefinition\(\)\.stages\.map/)
assert.match(buyerKanbanBlock, /contacted/)
assert.match(buyerKanbanBlock, /qualified/)
assert.match(buyerKanbanBlock, /transaction_setup/)
assert.match(buyerKanbanBlock, /offer/)
assert.match(buyerKanbanBlock, /transaction/)
assert.doesNotMatch(buyerKanbanBlock, /qualification:/)
assert.doesNotMatch(buyerKanbanBlock, /Deal \/ OTP/)
assert.doesNotMatch(buyerKanbanBlock, /stageValue: 'Finance'/)
assert.doesNotMatch(buyerKanbanBlock, /stageValue: 'Transfer'/)
assert.doesNotMatch(buyerKanbanBlock, /Registered \/ Closed/)

assert.match(agencyPipelinePageSource, /function getLeadStageOptionsForType/)
assert.match(agencyPipelinePageSource, /Buyer Process Stage Mix/)
assert.match(agencyPipelinePageSource, /principalReporting\.buyerStageRows/)
assert.match(agencyPipelinePageSource, /normalizeLeadKanbanStage\(leadFilter\.stage, 'buyer'\)/)

assert.match(agencyPipelineServiceSource, /buyerStageRows: Array\.from\(buyerStages\.values\(\)\)/)
assert.match(agencyPipelineServiceSource, /ACTIVE_BUYER_PROCESS_STAGE_KEYS/)

const server = await createServer({ root: appRoot, logLevel: 'silent', server: { middlewareMode: true } })

try {
  const agencyPipelineService = await server.ssrLoadModule('/src/lib/agencyPipelineService.js')
  const lifecycleService = await server.ssrLoadModule('/src/services/leadLifecyclePresentationService.js')

  for (const stage of canonicalBuyerStages) {
    assert(
      agencyPipelineService.LEAD_STAGES.includes(stage),
      `LEAD_STAGES should include canonical buyer process stage "${stage}".`,
    )
  }

  const onboardingPresentation = lifecycleService.resolveLeadLifecyclePresentation({
    leadCategory: 'buyer',
    stage: 'Offer + Onboarding Link Sent',
  })
  assert.equal(onboardingPresentation.key, 'transaction_setup')
  assert.equal(onboardingPresentation.label, 'Transaction Setup')
  assert.equal(onboardingPresentation.columnId, 'transaction_setup')

  const legacyOtpPresentation = lifecycleService.resolveLeadLifecyclePresentation({
    leadCategory: 'buyer',
    stage: 'Ready to Generate OTP',
  })
  assert.equal(legacyOtpPresentation.key, 'offer')
  assert.equal(legacyOtpPresentation.label, 'Offer')
  assert.equal(legacyOtpPresentation.columnId, 'offer')

  const legacyFinancePresentation = lifecycleService.resolveLeadLifecyclePresentation({
    leadCategory: 'buyer',
    stage: 'Finance',
  })
  assert.equal(legacyFinancePresentation.key, 'transaction')
  assert.equal(legacyFinancePresentation.label, 'Transaction')
  assert.equal(legacyFinancePresentation.columnId, 'transaction')

  const reporting = agencyPipelineService.buildPrincipalReporting({
    leads: [
      { leadId: 'lead_1', leadCategory: 'buyer', stage: 'Captured', leadSource: 'Website' },
      { leadId: 'lead_2', leadCategory: 'buyer', stage: 'Offer Submitted', leadSource: 'Website' },
      { leadId: 'lead_3', leadCategory: 'buyer', stage: 'Finance', leadSource: 'Referral' },
      { leadId: 'lead_4', leadCategory: 'seller', stage: 'Mandate Sent', leadSource: 'Referral' },
    ],
  })

  const buyerStageCounts = Object.fromEntries(reporting.buyerStageRows.map((row) => [row.key, row.count]))
  assert.equal(buyerStageCounts.captured, 1)
  assert.equal(buyerStageCounts.offer, 1)
  assert.equal(buyerStageCounts.transaction, 1)
  assert.equal(buyerStageCounts.lost, 0)
  assert.equal(reporting.conversion.dealsCreated, 1)

  const metrics = agencyPipelineService.buildPipelineMetrics({
    leads: [
      { leadId: 'lead_1', stage: 'Captured' },
      { leadId: 'lead_2', stage: 'OTP Transaction' },
      { leadId: 'lead_3', stage: 'Lost' },
      { leadId: 'lead_4', stage: 'Closed won' },
      { leadId: 'lead_5', stage: 'Finance' },
    ],
  })
  assert.equal(metrics.activeOpportunities, 3)
} finally {
  await server.close()
}

console.log('Buyer process Phase 5 pipeline + reporting contract passed.')
