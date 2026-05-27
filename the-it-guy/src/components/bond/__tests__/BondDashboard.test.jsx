/* global require, __dirname, process */
const assert = require('node:assert/strict')
const path = require('node:path')
const { createServer } = require('vite')
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const { MemoryRouter } = require('react-router-dom')

const PROJECT_ROOT = path.resolve(__dirname, '../../../..')

function render(Component, props) {
  return renderToStaticMarkup(
    React.createElement(
      MemoryRouter,
      null,
      React.createElement(Component, props),
    ),
  )
}

function makeSnapshot(overrides = {}) {
  return {
    reportingScope: {
      workspaceKind: 'bond_company',
      workspaceRole: 'consultant',
      scopeLevel: 'assigned',
      dashboardMode: 'consultant',
    },
    userDisplayName: 'Alex',
    attentionCount: 4,
    roleFocus: {
      attentionText: 'Personal finance files to move today.',
      workloadHeading: 'My Consultant Load',
      focusChips: ['My Applications', 'Follow-ups'],
    },
    priorityActions: [
      {
        key: 'missing_documents',
        title: 'Missing Documents',
        icon: 'file-warning',
        tone: 'amber',
        href: '/applications?queue=missing_documents',
        helper: 'Files blocked by outstanding client paperwork.',
        count: 2,
        trendLabel: '2 updated this week',
      },
    ],
    pipelineOverview: [
      {
        key: 'lead',
        label: 'Lead',
        href: '/applications?queue=my_applications',
        count: 1,
        totalBondValueLabel: 'R 2 100 000',
        atRiskCount: 0,
      },
    ],
    teamWorkload: [
      {
        key: 'consultant-1',
        name: 'Alex Consultant',
        initials: 'AC',
        activeApplications: 3,
        awaitingDocs: 1,
        submitted: 1,
        overdue: 1,
      },
    ],
    recentBankActivity: [
      {
        transactionId: 'tx-1',
        bank: 'Nedbank',
        client: 'Client One',
        property: 'Sandton • Unit 12',
        action: 'Respond to bank query',
        statusLabel: 'Bank Feedback',
        timeLabel: '2h ago',
        statusTone: 'warning',
      },
    ],
    atRiskApplications: [
      {
        transactionId: 'tx-1',
        client: 'Client One',
        property: 'Sandton • Unit 12',
        bank: 'Nedbank',
        bondValue: 'R 2 100 000',
        reason: 'Bank feedback needs action',
        daysOverdue: 2,
        financeStage: 'Bank Feedback',
      },
    ],
    performanceSnapshot: [
      {
        key: 'approval_rate',
        label: 'Approval Rate',
        value: '67%',
        comparison: '+5% vs last month',
      },
    ],
    totalApplications: 3,
    emptyState: {
      title: 'No applications require attention right now',
      description: 'Personal finance files to move today.',
    },
    availableRanges: [{ key: 'this_month', label: 'This Month' }],
    ...overrides,
  }
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

    const commandCenterMarkup = render(BondDashboard, {
      user: { role: 'bond_originator' },
      workspaceId: 'workspace-1',
      initialState: {
        loading: false,
        error: '',
        snapshot: makeSnapshot(),
        reportingScope: makeSnapshot().reportingScope,
      },
    })
    assert.match(commandCenterMarkup, /Good morning, Alex/)
    assert.match(commandCenterMarkup, /Missing Documents/)
    assert.match(commandCenterMarkup, /Finance stages across the current bond book/)
    assert.match(commandCenterMarkup, /Recent Bank Activity/)
    assert.match(commandCenterMarkup, /Search applications, clients, banks/)

    const emptyMarkup = render(BondDashboard, {
      user: { role: 'bond_originator' },
      workspaceId: 'workspace-1',
      initialState: {
        loading: false,
        error: '',
        snapshot: makeSnapshot({
          totalApplications: 0,
          attentionCount: 0,
          priorityActions: [],
          pipelineOverview: [],
          teamWorkload: [],
          recentBankActivity: [],
          atRiskApplications: [],
          performanceSnapshot: [],
        }),
        reportingScope: makeSnapshot().reportingScope,
      },
    })
    assert.match(emptyMarkup, /No applications require attention right now/)

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
        snapshot: null,
        reportingScope: null,
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
