import assert from 'node:assert/strict'
import fs from 'node:fs'
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
  const transactionDetailSource = fs.readFileSync(path.join(PROJECT_ROOT, 'src', 'pages', 'AttorneyTransactionDetail.jsx'), 'utf8')

  assert.equal(workflow.getBondHybridFinanceProgressPercent('intake'), 0)
  assert.equal(workflow.getBondHybridFinanceProgressPercent('documents'), 9)
  assert.equal(workflow.getBondHybridFinanceProgressPercent('submitted_to_banks'), 18)
  assert.equal(workflow.getBondHybridFinanceProgressPercent('instruction_sent'), 91)
  assert.equal(workflow.getBondHybridFinanceProgressPercent('complete'), 100)
  assert.equal(workflow.getBondHybridFinanceProgressPercent('intake', 'completed'), 100)

  assert.match(
    transactionDetailSource,
    /const agentShouldUseOriginatorFinanceTracker =\s*isAgentTransactionView && isBondOrHybridFinance && financeManagedByForTransaction === 'bond_originator'/,
  )
  assert.doesNotMatch(
    transactionDetailSource,
    /activeWorkspaceMenu === 'finance'[\s\S]{0,500}\{isAgentTransactionView \? \(/,
    'agent finance tab must not route all finance types to BondOriginatorAgentProgressView',
  )

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

  const buyerManagedBondWorkspace = financeService.buildTransactionFinanceWorkspace({
    transaction: {
      id: 'tx-buyer-managed-bond',
      finance_type: 'bond',
      finance_managed_by: 'client',
    },
    workflowData: null,
    requiredDocumentChecklist: [
      { id: 'bond-grant', key: 'bond_grant', label: 'Bond Grant', status: 'missing' },
    ],
    viewerRole: 'agent',
  })

  assert.equal(buyerManagedBondWorkspace.financeType, 'bond')
  assert.equal(buyerManagedBondWorkspace.originatorManagedFinance, false)
  assert.equal(buyerManagedBondWorkspace.clientManagedBondFinance, true)
  assert.deepEqual(buyerManagedBondWorkspace.railGroups.map((group) => group.label), ['External Finance'])
  assert.equal(buyerManagedBondWorkspace.summaryBlocks.find((item) => item.key === 'finance_owner')?.value, 'Buyer / Attorney')

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
    'Bond Workflow',
    'Bond Workflow Stage',
    'Bond Originator',
    'Bank Applications',
    'Offers / Buyer Decision',
    'Grant Milestones',
    'Instruction to Attorney',
    'Agent proxy',
  ]) {
    assert.ok(hybridMarkup.includes(expectedText), `expected rendered finance command center to include "${expectedText}"`)
  }

  const cashMarkup = ReactDOMServer.renderToStaticMarkup(
    React.createElement(FinanceCommandCenter, {
      transaction: {
        id: 'tx-cash',
        finance_type: 'cash',
      },
      workflowData: null,
      requiredDocumentChecklist: [
        { id: 'proof-funds', key: 'proof_of_funds', label: 'Proof Of Funds', status: 'missing' },
      ],
      documents: [],
      viewerRole: 'buyer',
    }),
  )

  assert.ok(cashMarkup.includes('Proof Of Funds'), 'expected cash finance tab to render proof of funds readiness')
  assert.ok(cashMarkup.includes('Upload proof of funds'), 'expected cash finance tab to expose proof of funds upload')
  assert.ok(!cashMarkup.includes('Client Requests'), 'expected cash finance tab not to render legacy finance subnavigation or request pages')
  assert.ok(!cashMarkup.includes('Payments'), 'expected cash finance tab not to render payment workspace')
  assert.ok(!cashMarkup.includes('Audit Log'), 'expected cash finance tab not to render finance audit workspace')
  assert.ok(!cashMarkup.includes('Bond Originator Progress'), 'expected cash finance tab not to render originator progress')

  const buyerManagedBondMarkup = ReactDOMServer.renderToStaticMarkup(
    React.createElement(FinanceCommandCenter, {
      transaction: {
        id: 'tx-buyer-managed-bond',
        finance_type: 'bond',
        finance_managed_by: 'client',
      },
      workflowData: null,
      requiredDocumentChecklist: [
        { id: 'bond-grant', key: 'bond_grant', label: 'Bond Grant', status: 'missing' },
      ],
      documents: [],
      viewerRole: 'agent',
    }),
  )

  assert.ok(buyerManagedBondMarkup.includes('Bond Workflow'), 'expected buyer-managed bond tab to render the bond originator workflow surface')
  assert.ok(buyerManagedBondMarkup.includes('Submitted to Banks'), 'expected buyer-managed bond tab to use originator workflow stages')
  assert.ok(!buyerManagedBondMarkup.includes('Client Requests'), 'expected buyer-managed bond tab not to render legacy request workspace')
  assert.ok(!buyerManagedBondMarkup.includes('Bond Originator Progress'), 'expected buyer-managed bond tab not to render originator progress')

  console.log('finance tab launch-readiness checks passed')
} finally {
  await server.close()
}
