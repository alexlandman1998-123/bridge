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
  const stageItems = [
    { key: 'lead', label: 'Lead', state: 'complete' },
    { key: 'bond_app', label: 'Bond App', state: 'complete' },
    { key: 'docs', label: 'Docs', state: 'active' },
    { key: 'submission', label: 'Submission', state: 'pending' },
    { key: 'feedback', label: 'Feedback', state: 'pending' },
    { key: 'approval', label: 'Approval', state: 'pending' },
  ]

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
    headerSummary: {
      activeApplications: 13,
      awaitingDocuments: 4,
      readyForReview: 2,
      bankResponsesToday: 3,
      text: '13 active applications • 4 awaiting documents • 2 ready for review • 3 bank responses today',
    },
    heroKpis: [
      { key: 'active_applications', label: 'Active Applications', value: '13', microContext: '4 awaiting docs • 2 ready for review', trend: '4 awaiting docs', tone: 'neutral', sparkline: [32, 45, 50] },
      { key: 'approval_rate', label: 'Approval Rate', value: '72%', microContext: '9 approved • 4 pending', trend: '+2 vs last month', tone: 'success', sparkline: [55, 62, 72] },
      { key: 'average_approval_time', label: 'Avg Approval Time', value: '7 days', microContext: 'Healthy against target', trend: 'on target', tone: 'success', sparkline: [40, 35, 30] },
      { key: 'bond_value', label: 'Bond Value In Progress', value: 'R 21 000 000', microContext: '13 finance files included', trend: '13 files', tone: 'neutral', sparkline: [50, 70, 84] },
      { key: 'registration_conversion', label: 'Registration Conversion', value: '54%', microContext: 'On track to registration', trend: 'healthy', tone: 'success', sparkline: [42, 48, 54] },
      { key: 'commission_pipeline', label: 'Commission Pipeline', value: 'R 252 000', microContext: 'R 80 000 confirmed • R 172 000 estimated', trend: 'R 80 000 confirmed', tone: 'success', sparkline: [28, 46, 64] },
    ],
    activeApplications: [
      {
        id: '11111111-1111-4111-8111-111111111111',
        buyerName: 'Client One',
        propertyLabel: 'Sandton • Unit 12',
        developmentName: 'The Ridge',
        agentName: 'Ava Agent',
        consultantName: 'Alex Consultant',
        bankName: 'Nedbank',
        financeType: 'Bond',
        bondValue: 'R 2 100 000',
        applicationAge: '6d active',
        currentStage: 'Docs',
        progressPercent: 50,
        stageItems,
        statusLabel: 'Waiting',
        statusTone: 'warning',
        nextAction: 'Collect latest payslip',
        riskFlags: ['2 documents outstanding'],
        href: '/transactions/11111111-1111-4111-8111-111111111111',
        requestDocsHref: '/documents?role=bond_originator',
        reviewHref: '/applications?queue=submission_readiness',
        filterKeys: ['all', 'awaiting_docs'],
      },
    ],
    bankBreakdown: [
      { bank: 'Nedbank', approved: 3, pending: 2, declined: 0, total: 5, approvalRate: 60 },
      { bank: 'FNB', approved: 2, pending: 1, declined: 0, total: 3, approvalRate: 67 },
    ],
    bankLeadTimes: [
      { bank: 'Nedbank', leadTimeDays: 6 },
      { bank: 'FNB', leadTimeDays: 9 },
    ],
    pipelineFlow: [
      { key: 'lead', label: 'Lead', count: 2, valueLabel: '2 files' },
      { key: 'bond_app', label: 'Bond App', count: 3, valueLabel: '3 files' },
      { key: 'docs_collection', label: 'Docs Collection', count: 4, valueLabel: '4 files' },
      { key: 'pre_approval', label: 'Pre-Approval', count: 1, valueLabel: '1 file' },
      { key: 'submitted', label: 'Submission', count: 2, valueLabel: '2 files' },
      { key: 'bank_feedback', label: 'Bank Feedback', count: 1, valueLabel: '1 file' },
      { key: 'approved', label: 'Approval', count: 1, valueLabel: '1 file' },
      { key: 'registered', label: 'Registration', count: 0, valueLabel: '0 files' },
    ],
    buyerDemographics: {
      bondVsCash: { bond: 8, cash: 2, hybrid: 3 },
      clientType: { individual: 9, company: 2, trust: 1, foreign_buyer: 1 },
      bankDistribution: [
        { bank: 'Nedbank', active: 3, submitted: 2, approved: 1, total: 6 },
        { bank: 'FNB', active: 2, submitted: 1, approved: 1, total: 4 },
      ],
    },
    operationalHeatmap: [
      {
        key: 'nedbank',
        label: 'Nedbank',
        total: 6,
        stages: [
          { key: 'lead', label: 'Lead', count: 1, riskCount: 0, intensity: 0.2 },
          { key: 'bond_app', label: 'Bond App', count: 1, riskCount: 0, intensity: 0.2 },
          { key: 'docs_collection', label: 'Docs', count: 2, riskCount: 1, intensity: 0.7 },
          { key: 'submitted', label: 'Submission', count: 1, riskCount: 0, intensity: 0.2 },
          { key: 'bank_feedback', label: 'Feedback', count: 1, riskCount: 1, intensity: 0.8 },
          { key: 'approved', label: 'Approval', count: 0, riskCount: 0, intensity: 0 },
          { key: 'registered', label: 'Registration', count: 0, riskCount: 0, intensity: 0 },
        ],
      },
    ],
    operationalRisk: [
      { key: 'waiting', metric: 'Waiting >7 Days', value: '2 cases', description: 'Applications without movement.', severity: 'watch' },
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
    teamPerformance: [
      { key: 'consultant-1', name: 'Alex Consultant', initials: 'AC', activeFiles: 3, approvalRate: 67, avgTurnaround: 7 },
    ],
    connectedPartners: [
      { key: 'partner-1', name: 'Aurum Bond Originators', type: 'Bond Originator', activeFiles: 12, conversionRate: 76, avgRegistrationDays: 38 },
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
    assert.doesNotMatch(commandCenterMarkup, /Good morning, Alex/)
    assert.match(commandCenterMarkup, /Bond Originator Command Center/)
    assert.match(commandCenterMarkup, /13 active applications • 4 awaiting documents • 2 ready for review • 3 bank responses today/)
    assert.match(commandCenterMarkup, /Create Application/)
    assert.match(commandCenterMarkup, /Invite Partner/)
    assert.match(commandCenterMarkup, /Export Report/)

    const kpiOrder = [
      'Active Applications',
      'Approval Rate',
      'Avg Approval Time',
      'Bond Value In Progress',
      'Registration Conversion',
      'Commission Pipeline',
    ]
    let previousKpiIndex = -1
    for (const label of kpiOrder) {
      const index = commandCenterMarkup.indexOf(label)
      assert.ok(index > previousKpiIndex, `${label} should render after the previous KPI`)
      previousKpiIndex = index
    }
    assert.match(commandCenterMarkup, /4 awaiting docs • 2 ready for review/)
    assert.match(commandCenterMarkup, /Healthy against target/)

    assert.match(commandCenterMarkup, /Live operational movement across active bond files/)
    assert.match(commandCenterMarkup, /All/)
    assert.match(commandCenterMarkup, /Awaiting Docs/)
    assert.match(commandCenterMarkup, /Ready For Review/)
    assert.match(commandCenterMarkup, /Bank Feedback/)
    assert.match(commandCenterMarkup, /Client One/)
    assert.match(commandCenterMarkup, /Bond App/)
    assert.match(commandCenterMarkup, /Submission/)
    assert.match(commandCenterMarkup, /Collect latest payslip/)
    assert.match(commandCenterMarkup, /Open File/)
    assert.match(commandCenterMarkup, /Request Docs/)
    assert.match(commandCenterMarkup, /Review/)

    assert.match(commandCenterMarkup, /Bank Approval Breakdown/)
    assert.match(commandCenterMarkup, /Bank Lead Times/)
    assert.match(commandCenterMarkup, /xl:grid-cols-2/)
    assert.match(commandCenterMarkup, /Pipeline Overview/)
    assert.match(commandCenterMarkup, /Operational flow through core finance and approval stages/)
    assert.match(commandCenterMarkup, /Finance Mix/)
    assert.match(commandCenterMarkup, /Buyer Type Mix/)
    assert.match(commandCenterMarkup, /Bank Distribution/)
    assert.match(commandCenterMarkup, /Operational Bottleneck Heatmap/)
    assert.match(commandCenterMarkup, /Recent Bank Activity/)
    assert.match(commandCenterMarkup, /Team Performance/)
    assert.match(commandCenterMarkup, /Connected Partners/)
    assert.match(commandCenterMarkup, /Operational Risk/)
    assert.doesNotMatch(commandCenterMarkup, /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i)

    assert.ok(commandCenterMarkup.indexOf('Active Applications') < commandCenterMarkup.indexOf('Bank Approval Breakdown'))
    assert.ok(commandCenterMarkup.indexOf('Bank Lead Times') < commandCenterMarkup.indexOf('Pipeline Overview'))
    assert.ok(commandCenterMarkup.indexOf('Pipeline Overview') < commandCenterMarkup.indexOf('Finance Mix'))
    assert.ok(commandCenterMarkup.indexOf('Operational Bottleneck Heatmap') < commandCenterMarkup.indexOf('Recent Bank Activity'))
    assert.ok(commandCenterMarkup.indexOf('Connected Partners') < commandCenterMarkup.indexOf('Operational Risk'))

    const emptyActiveMarkup = render(BondDashboard, {
      user: { role: 'bond_originator' },
      workspaceId: 'workspace-1',
      initialState: {
        loading: false,
        error: '',
        snapshot: makeSnapshot({
          activeApplications: [],
        }),
        reportingScope: makeSnapshot().reportingScope,
      },
    })
    assert.match(emptyActiveMarkup, /No active bond applications/)
    assert.match(emptyActiveMarkup, /Accepted and assigned bond applications will appear here once they move into processing/)
    assert.match(emptyActiveMarkup, /View New Applications/)

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
    assert.match(emptyMarkup, /All operational queues are clear/)

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
