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

function test(name, fn) {
  try {
    const result = fn()
    if (result && typeof result.then === 'function') {
      return result.then(() => console.log(`ok - ${name}`))
    }
    console.log(`ok - ${name}`)
    return Promise.resolve()
  } catch (error) {
    console.error(`not ok - ${name}`)
    throw error
  }
}

try {
  const financeService = await server.ssrLoadModule('/src/services/transactionFinanceService.js')
  const financeCommandModule = await server.ssrLoadModule('/src/components/transaction/TransactionFinanceCommandCenter.jsx')
  const { buildTransactionFinanceWorkspace } = financeService
  const FinanceCommandCenter = financeCommandModule.default

  await test('client-managed bond finance uses external rail and disables originator controls', () => {
    const workspace = buildTransactionFinanceWorkspace({
      transaction: {
        id: 'tx-client-managed-bond',
        finance_type: 'bond',
        finance_managed_by: 'client',
        next_action: '',
      },
      workflowData: {
        workflow: {
          currentStage: 'intake',
          status: 'active',
        },
        applications: [],
        quotes: [],
        offers: [],
        decisions: [],
      },
      requiredDocumentChecklist: [
        { id: 'approval', key: 'bank_approval_letter', label: 'Bank approval letter', status: 'missing' },
      ],
      viewerRole: 'bond_originator',
      activeViewerPermissions: {
        canEditFinanceWorkflow: true,
        canUploadDocuments: true,
      },
    })

    assert.equal(workspace.originatorManagedFinance, false)
    assert.equal(workspace.clientManagedBondFinance, true)
    assert.deepEqual(workspace.railGroups.map((group) => group.label), ['External Finance'])
    assert.equal(workspace.permissions.canManageApplications, false)
    assert.equal(workspace.permissions.canManageOffers, false)
    assert.equal(workspace.permissions.canMarkInstructionSent, false)
    assert.equal(workspace.summaryBlocks.find((item) => item.key === 'next_action')?.value, 'Upload external finance approval documents')
  })

  await test('originator-managed bond finance keeps originator rail and controls', () => {
    const workspace = buildTransactionFinanceWorkspace({
      transaction: {
        id: 'tx-originator-bond',
        finance_type: 'bond',
        finance_managed_by: 'bond_originator',
      },
      workflowData: {
        workflow: {
          currentStage: 'intake',
          status: 'active',
        },
        applications: [],
        quotes: [],
        offers: [],
        decisions: [],
      },
      requiredDocumentChecklist: [],
      viewerRole: 'bond_originator',
      activeViewerPermissions: {
        canEditFinanceWorkflow: true,
        canUploadDocuments: true,
      },
    })

    assert.equal(workspace.originatorManagedFinance, true)
    assert.equal(workspace.clientManagedBondFinance, false)
    assert.deepEqual(workspace.railGroups.map((group) => group.label), ['Bond Finance'])
    assert.equal(workspace.permissions.canManageApplications, true)
    assert.equal(workspace.permissions.canManageOffers, true)
  })

  await test('client-managed command center hides originator-only workflow sections', () => {
    const markup = ReactDOMServer.renderToStaticMarkup(
      React.createElement(FinanceCommandCenter, {
        transaction: {
          id: 'tx-client-managed-render',
          finance_type: 'bond',
          finance_managed_by: 'client',
        },
        workflowData: {
          workflow: {
            currentStage: 'intake',
            status: 'active',
          },
          applications: [],
          quotes: [],
          offers: [],
          decisions: [],
        },
        requiredDocumentChecklist: [
          { id: 'approval', key: 'bank_approval_letter', label: 'Bank approval letter', status: 'missing' },
        ],
        documents: [],
        viewerRole: 'agent',
        activeViewerPermissions: {
          canUploadDocuments: true,
          canProxyFinanceWorkflow: true,
        },
      }),
    )

    assert.match(markup, /External Finance Documents/)
    assert.match(markup, /Buyer \/ Attorney/)
    assert.doesNotMatch(markup, /Bank Applications/)
    assert.doesNotMatch(markup, /Instruction to Attorney/)
    assert.doesNotMatch(markup, /Bond Application Owner/)
  })

  await test('unit detail bond workspace and structure cards are owner-aware', () => {
    const source = fs.readFileSync(path.join(PROJECT_ROOT, 'src', 'pages', 'UnitDetail.jsx'), 'utf8')

    assert.match(source, /const isOriginatorManagedFinance = isBondOrHybridFinance && financeManagedByForTransaction === 'bond_originator'/)
    assert.match(source, /canViewBondWorkspaceTab = \['developer', 'agent'\]\.includes\(workspaceRole\) && isOriginatorManagedFinance/)
    assert.match(source, /canViewBondWorkspaceTab && \(activeWorkspaceMenu === 'bond' \|\| \(isAgentWorkspace && activeWorkspaceMenu === 'financials'\)\)/)
    assert.match(source, /role: 'External Finance'/)
    assert.match(source, /Buyer-arranged approval evidence/)
  })

  console.log('finance owner phase 5 operational controls tests passed')
} finally {
  await server.close()
}
