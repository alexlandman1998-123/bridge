import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')

const server = await createServer({
  root: PROJECT_ROOT,
  logLevel: 'silent',
  server: { middlewareMode: true },
})

const consultantId = '11111111-1111-4111-8111-111111111111'
const processorId = '22222222-2222-4222-8222-222222222222'
const managerId = '33333333-3333-4333-8333-333333333333'

function makeTransaction(id, overrides = {}) {
  return {
    id,
    organisation_id: 'workspace-1',
    bond_workspace_id: 'workspace-1',
    primary_bond_consultant_user_id: consultantId,
    assigned_bond_processor_user_id: processorId,
    assigned_bond_manager_user_id: managerId,
    finance_type: 'bond',
    finance_status: 'application_in_progress',
    updated_at: '2026-05-23T10:00:00.000Z',
    ...overrides,
  }
}

function makeWorkflow(stage, instruction = {}, overrides = {}) {
  return {
    workflow: {
      currentStage: stage,
      status: 'active',
      lastUpdatedAt: '2026-05-23T10:00:00.000Z',
    },
    applications: [],
    quotes: [],
    offers: [],
    events: [],
    decisions: [],
    acceptedOffer: null,
    instruction,
    ...overrides,
  }
}

try {
  const diagnosticsService = await server.ssrLoadModule('/src/services/bondOperationalDiagnosticsService.js')
  const financeService = await server.ssrLoadModule('/src/services/transactionFinanceService.js')

  const healthyGrantSubmitted = {
    transaction: makeTransaction('tx-grant-submitted', {
      finance_status: 'documents_pending',
    }),
    transactionFinanceWorkflow: makeWorkflow('grant_submitted', {
      grantReceived: true,
      grantDocumentId: 'doc-grant',
      grantSigned: true,
      signedGrantDocumentId: 'doc-signed-grant',
      grantSubmitted: true,
      grantSubmittedAt: '2026-05-23T09:30:00.000Z',
    }),
  }

  const missingGrantDocument = {
    transaction: makeTransaction('tx-missing-grant-doc'),
    transactionFinanceWorkflow: makeWorkflow('grant_received'),
  }

  const missingInstructionEvidence = {
    transaction: makeTransaction('tx-missing-instruction-evidence'),
    transactionFinanceWorkflow: makeWorkflow('instruction_sent', {
      grantReceived: true,
      grantDocumentId: 'doc-grant',
      grantSigned: true,
      signedGrantDocumentId: 'doc-signed-grant',
      grantSubmitted: true,
      grantSubmittedAt: '2026-05-23T09:30:00.000Z',
      instructionSent: true,
    }),
  }

  const legacyOnlyGrantSigned = {
    transaction: makeTransaction('tx-legacy-grant-signed', {
      finance_status: 'Grant signed',
      transactionFinanceWorkflow: null,
    }),
  }

  const diagnostics = diagnosticsService.buildBondOperationalDiagnostics([
    healthyGrantSubmitted,
    missingGrantDocument,
    missingInstructionEvidence,
    legacyOnlyGrantSigned,
  ], { generatedAt: '2026-07-05T10:00:00.000Z' })

  assert.equal(diagnostics.status, 'critical')
  assert.equal(diagnostics.totals.rows, 4)
  assert.equal(diagnostics.stageCoverage.find((stage) => stage.key === 'grant_submitted')?.count, 1)
  assert.equal(diagnostics.actionQueues.find((item) => item.queueKey === 'ready_for_instruction')?.count, 1)
  assert.equal(diagnostics.actionQueues.find((item) => item.queueKey === 'ready_for_instruction')?.href, '/bond/applications?view=grant-submitted')
  assert.equal(diagnostics.issues.some((issue) => issue.code === 'missing_grant_document' && issue.transactionId === 'tx-missing-grant-doc'), true)
  assert.equal(diagnostics.issues.some((issue) => issue.code === 'missing_instruction_evidence' && issue.transactionId === 'tx-missing-instruction-evidence'), true)
  assert.equal(diagnostics.issues.some((issue) => issue.code === 'legacy_stage_only' && issue.transactionId === 'tx-legacy-grant-signed'), true)

  const missingGrantIssue = diagnostics.issues.find((issue) => issue.code === 'missing_grant_document')
  assert.equal(missingGrantIssue.actionLabel, 'Attach grant document')
  assert.equal(missingGrantIssue.actionHref, '/bond/files/tx-missing-grant-doc?diagnostic=missing_grant_document')
  assert.equal(missingGrantIssue.queueHref, '/bond/applications?view=grant-received')
  assert.equal(missingGrantIssue.ownerRole, 'Bond Originator')

  const grantRemediation = diagnostics.remediationPlan.find((item) => item.code === 'missing_grant_document')
  assert.equal(grantRemediation.count, 2)
  assert.equal(grantRemediation.actionLabel, 'Attach grant document')
  assert.equal(grantRemediation.actionHref, '/bond/applications?view=grant-received')
  assert.deepEqual(grantRemediation.transactionIds, ['tx-missing-grant-doc', 'tx-legacy-grant-signed'])

  const submittedRow = diagnostics.rows.find((row) => row.transactionId === 'tx-grant-submitted')
  assert.equal(submittedRow.status, 'healthy')
  assert.equal(submittedRow.stage, 'grant_submitted')
  assert.equal(submittedRow.expectedQueueKey, 'ready_for_instruction')
  assert.equal(submittedRow.actionHref, '/bond/files/tx-grant-submitted')
  assert.equal(submittedRow.issues.some((issue) => issue.code === 'stale_legacy_finance_status'), true)

  const financeWorkspace = financeService.buildTransactionFinanceWorkspace({
    transaction: makeTransaction('tx-finance-workspace', {
      finance_status: 'quote_accepted',
    }),
    workflowData: makeWorkflow('grant_submitted', {
      grantReceived: true,
      grantDocumentId: 'doc-grant',
      grantSigned: true,
      signedGrantDocumentId: 'doc-signed-grant',
      grantSubmitted: true,
      grantSubmittedAt: '2026-05-23T09:30:00.000Z',
    }, {
      acceptedOffer: {
        id: 'quote-1',
        bankName: 'FNB',
        decisionAt: '2026-05-22T12:00:00.000Z',
      },
      quotes: [{ id: 'quote-1', bankName: 'FNB', quoteStatus: 'accepted' }],
      offers: [{ id: 'quote-1', bankName: 'FNB', quoteStatus: 'accepted' }],
    }),
    requiredDocumentChecklist: [{ id: 'fica', label: 'FICA', status: 'uploaded', uploadedAt: '2026-05-20T09:00:00.000Z' }],
    viewerRole: 'bond_originator',
  })

  assert.equal(financeWorkspace.bond.stage, 'grant_submitted')
  assert.equal(financeWorkspace.bond.stageLabel, 'Grant Submitted')
  assert.equal(financeWorkspace.summaryBlocks.find((item) => item.key === 'next_action')?.value, 'Send instruction to attorney')
  assert.equal(financeWorkspace.railGroups[0].steps.some((step) => step.key === 'grant_submitted'), true)

  console.log('bondOperationalDiagnosticsService tests passed')
} finally {
  await server.close()
}
