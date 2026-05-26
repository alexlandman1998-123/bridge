/* global require, __dirname, process */
const assert = require('node:assert/strict')
const path = require('node:path')
const { createServer } = require('vite')
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')

const PROJECT_ROOT = path.resolve(__dirname, '../../../..')

function render(Component, props) {
  return renderToStaticMarkup(React.createElement(Component, props))
}

;(async () => {
  const server = await createServer({
    root: PROJECT_ROOT,
    logLevel: 'silent',
    server: { middlewareMode: true },
  })

  try {
    const module = await server.ssrLoadModule('/src/components/bond/BondDashboard.jsx')
    const BondDashboard = module.default

    const independentMarkup = render(BondDashboard, {
      user: { role: 'bond_originator' },
      workspaceId: 'workspace-1',
      initialState: {
        loading: false,
        error: '',
        context: { isIndependentOriginator: true },
        summary: { totalApplications: 0 },
        queues: {},
        reportingScope: { workspaceKind: 'personal_originator', workspaceRole: 'owner', scopeLevel: 'workspace_hq' },
        filters: { visibleFilters: {}, options: {} },
      },
    })
    assert.match(independentMarkup, /Independent workspace/)
    assert.match(independentMarkup, /No bond applications yet/)

    const assignedConsultantMarkup = render(BondDashboard, {
      user: { role: 'bond_originator' },
      workspaceId: 'workspace-1',
      initialState: {
        loading: false,
        error: '',
        context: {},
        summary: { totalApplications: 2, myApplications: 1, processingQueue: 0, missingDocuments: 1, bankFeedbackPending: 0, submissionReady: 0, overdueApplications: 0, complianceReview: 0, managerEscalations: 0, approvedApplications: 0, declinedOrBlockedApplications: 0 },
        queues: {
          my_applications: [
            {
              transactionId: 'tx-1',
              applicationReference: 'APP-001',
              clientName: 'Client One',
              propertyName: 'Sandton',
              stage: 'Finance',
              financeStatus: 'application_in_progress',
              primaryConsultantUserId: 'consultant-1',
              processorUserId: 'processor-1',
              nextAction: 'Collect docs',
              blockerReason: '',
              overdue: false,
              lastUpdatedAt: '2026-05-20T10:00:00.000Z',
            },
          ],
        },
        reportingScope: { workspaceKind: 'bond_company', workspaceRole: 'consultant', scopeLevel: 'assigned' },
        filters: { visibleFilters: {}, options: {} },
      },
    })
    assert.match(assignedConsultantMarkup, /My assigned applications/)
    assert.match(assignedConsultantMarkup, /APP-001/)

    const missingWorkspaceMarkup = render(BondDashboard, {
      user: { role: 'bond_originator' },
      workspaceId: '',
    })
    assert.match(missingWorkspaceMarkup, /We could not load your Bond workspace context/)

    const serviceErrorMarkup = render(BondDashboard, {
      user: { role: 'bond_originator' },
      workspaceId: 'workspace-1',
      initialState: {
        loading: false,
        error: 'failed',
        context: null,
        summary: null,
        queues: {},
        reportingScope: null,
        filters: null,
      },
    })
    assert.match(serviceErrorMarkup, /Please switch workspace or try again/)

    console.log('BondDashboard component tests passed')
  } finally {
    await server.close()
  }
})().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
