import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import React from 'react'
import ReactDOMServer from 'react-dom/server'
import { createServer } from 'vite'

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const server = await createServer({
  root: PROJECT_ROOT,
  logLevel: 'silent',
  server: { middlewareMode: true },
})

try {
  const workflow = await server.ssrLoadModule('/src/core/transactions/bondHybridFinanceWorkflow.js')
  const financeService = await server.ssrLoadModule('/src/services/transactionFinanceService.js')
  const financeCommandModule = await server.ssrLoadModule('/src/components/transaction/TransactionFinanceCommandCenter.jsx')
  const transactionDetailSource = await readFile(new URL('../src/pages/AttorneyTransactionDetail.jsx', import.meta.url), 'utf8')

  assert.equal(workflow.getBondHybridFinanceProgressPercent('intake'), 0)
  assert.equal(workflow.getBondHybridFinanceProgressPercent('documents'), 9)
  assert.equal(workflow.getBondHybridFinanceProgressPercent('submitted_to_banks'), 18)
  assert.equal(workflow.getBondHybridFinanceProgressPercent('instruction_sent'), 91)
  assert.equal(workflow.getBondHybridFinanceProgressPercent('complete'), 100)
  assert.equal(workflow.getBondHybridFinanceProgressPercent('intake', 'completed'), 100)

  const hybridWorkspace = financeService.buildTransactionFinanceWorkspace({
    transaction: {
      id: 'tx-hybrid',
      finance_type: 'combination',
      purchase_price: 2500000,
      cash_portion: 500000,
    },
    workflowData: {
      workflow: {
        current_stage: 'intake',
        status: 'active',
      },
      applications: [],
      quotes: [],
      decisions: [],
    },
    requiredDocumentChecklist: [
      { id: 'id-doc', key: 'id_document', label: 'ID Document', status: 'missing' },
      { id: 'proof-funds', key: 'proof_of_funds_cash_component', label: 'Proof Of Funds', status: 'missing' },
    ],
    viewerRole: 'agent',
    activeViewerPermissions: {
      canUploadDocuments: true,
      canProxyFinanceWorkflow: true,
    },
  })

  assert.equal(hybridWorkspace.financeType, 'combination')
  assert.deepEqual(hybridWorkspace.railGroups.map((group) => group.label), ['Bond Portion', 'Cash Portion'])
  assert.equal(hybridWorkspace.bond.stage, 'intake')
  assert.equal(hybridWorkspace.cash.proofUploaded, false)
  assert.equal(hybridWorkspace.permissions.canProxyFinanceWorkflow, true)
  assert.equal(hybridWorkspace.permissions.canManageApplications, false)
  assert.equal(hybridWorkspace.summaryBlocks.find((item) => item.key === 'finance_owner')?.value, 'Bond Originator')

  const cashWorkspace = financeService.buildTransactionFinanceWorkspace({
    transaction: {
      id: 'tx-cash',
      finance_type: 'cash',
    },
    workflowData: null,
    requiredDocumentChecklist: [
      { id: 'proof-funds', key: 'proof_of_funds', label: 'Proof Of Funds', status: 'missing' },
    ],
    viewerRole: 'agent',
  })

  assert.equal(cashWorkspace.financeType, 'cash')
  assert.deepEqual(cashWorkspace.railGroups.map((group) => group.label), ['Cash Finance'])
  assert.equal(cashWorkspace.summaryBlocks.find((item) => item.key === 'finance_owner')?.value, 'Buyer / Attorney')

  assert.ok(transactionDetailSource.includes('function AgentFinanceWorkspace'), 'agent finance workspace should exist on transaction detail')
  assert.ok(transactionDetailSource.includes('buildAgentFinanceWorkspaceModel'), 'agent finance workspace model should be derived locally')
  assert.ok(transactionDetailSource.includes('isFinanceAssistanceDeclined(transaction || {})'), 'agent finance model should respect declined bond assistance persisted on the transaction')
  assert.equal(transactionDetailSource.includes('BondOriginatorAgentProgressView'), false, 'agent finance tab should not render the bond-originator-only progress view')

  const financeBranchStart = transactionDetailSource.indexOf("activeWorkspaceMenu === 'finance' && workspaceRole !== 'attorney'")
  const financeBranchEnd = transactionDetailSource.indexOf("{workspaceRole === 'bond_originator' && activeWorkspaceMenu === 'workflow'", financeBranchStart)
  const agentFinanceBranch = transactionDetailSource.slice(financeBranchStart, financeBranchEnd)
  assert.ok(agentFinanceBranch.includes('<AgentFinanceWorkspace'), 'agent finance branch should render the finance-type-aware workspace')
  for (const expectedText of ['Proof Of Funds', 'Bond Grant', 'Documents Submitted', 'Outstanding', 'Banks Waiting']) {
    assert.ok(transactionDetailSource.includes(expectedText), `agent finance workspace should include "${expectedText}"`)
  }

  const FinanceCommandCenter = financeCommandModule.default
  const hybridMarkup = ReactDOMServer.renderToStaticMarkup(
    React.createElement(FinanceCommandCenter, {
      transaction: {
        id: 'tx-hybrid',
        finance_type: 'combination',
        purchase_price: 2500000,
        cash_portion: 500000,
      },
      workflowData: {
        workflow: {
          current_stage: 'intake',
          status: 'active',
        },
        applications: [],
        quotes: [],
        decisions: [],
      },
      requiredDocumentChecklist: [
        { id: 'id-doc', key: 'id_document', label: 'ID Document', status: 'missing' },
        { id: 'proof-address', key: 'proof_of_address', label: 'Proof of Address', status: 'missing' },
        { id: 'proof-funds', key: 'proof_of_funds_cash_component', label: 'Proof Of Funds', status: 'missing' },
      ],
      documents: [],
      viewerRole: 'agent',
      activeViewerPermissions: {
        canUploadDocuments: true,
        canProxyFinanceWorkflow: true,
      },
      financeReadinessHandoff: {
        statusLabel: 'Inputs Outstanding',
        statusTone: 'warning',
        summaryLine: 'Inputs Outstanding: Monthly income, Monthly expenses.',
        scoreLabel: '28% · Needs Attention',
        affordabilityRangeLabel: 'R 210 000 - R 250 000',
        repaymentEstimateLabel: 'Repayment pending',
        depositStrengthLabel: 'Strong deposit position',
        recommendedAction: 'Complete readiness inputs before originator review.',
        topMissingItems: ['Monthly income', 'Monthly expenses'],
        topRiskFlags: [],
      },
    }),
  )

  for (const expectedText of [
    'Finance Workspace',
    'Bond Workflow',
    'Bond Workflow Stage',
    'Checklist',
    'Documents',
    'Bank Applications',
    'Offers / Buyer Decision',
    'Grant Milestones',
    'Instruction to Attorney',
    'Bond Originator',
    'Agent proxy',
    'Mark Complete',
  ]) {
    assert.ok(hybridMarkup.includes(expectedText), `expected rendered finance command center to include "${expectedText}"`)
  }

  console.log('finance tab launch-readiness checks passed')
} finally {
  await server.close()
}
