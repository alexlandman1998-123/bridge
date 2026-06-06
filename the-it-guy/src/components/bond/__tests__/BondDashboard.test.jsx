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
        reviewHref: '/bond/pipeline?view=ready-for-submission',
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
    assert.doesNotMatch(commandCenterMarkup, /Bond Originator Command Center/)
    assert.doesNotMatch(commandCenterMarkup, /13 active applications • 4 awaiting documents • 2 ready for review • 3 bank responses today/)
    assert.doesNotMatch(commandCenterMarkup, /Create Application/)
    assert.doesNotMatch(commandCenterMarkup, /Invite Partner/)
    assert.doesNotMatch(commandCenterMarkup, /Export Report/)

    const kpiOrder = [
      'Active Applications',
      'Approval Rate',
      'Avg Approval Time',
      'Pipeline Value',
      'Commission Pipeline',
    ]
    let previousKpiIndex = -1
    for (const label of kpiOrder) {
      const index = commandCenterMarkup.indexOf(label)
      assert.ok(index > previousKpiIndex, `${label} should render after the previous KPI`)
      previousKpiIndex = index
    }
    assert.doesNotMatch(commandCenterMarkup, /Registration Conversion/)
    assert.match(commandCenterMarkup, /4 awaiting docs • 2 ready/)
    assert.match(commandCenterMarkup, /Healthy against target/)

    assert.match(commandCenterMarkup, /Live operational movement across active bond applications/)
    assert.match(commandCenterMarkup, /All/)
    assert.match(commandCenterMarkup, /Awaiting Docs/)
    assert.match(commandCenterMarkup, /Ready For Review/)
    assert.match(commandCenterMarkup, /Bank Feedback/)
    assert.match(commandCenterMarkup, /Client One/)
    assert.match(commandCenterMarkup, /Bond App/)
    assert.match(commandCenterMarkup, /Submission/)
    assert.match(commandCenterMarkup, /Collect latest payslip/)
    assert.match(commandCenterMarkup, /Open Application/)
    assert.match(commandCenterMarkup, /Request Docs/)
    assert.match(commandCenterMarkup, /Review/)

    assert.match(commandCenterMarkup, /Bank Approval Breakdown/)
    assert.match(commandCenterMarkup, /Bank Lead Times/)
    assert.match(commandCenterMarkup, /xl:grid-cols-2/)
    assert.match(commandCenterMarkup, /Pipeline Overview/)
    assert.match(commandCenterMarkup, /Operational flow through core finance and approval stages/)
    assert.doesNotMatch(commandCenterMarkup, /Finance Mix/)
    assert.match(commandCenterMarkup, /Buyer Type Mix/)
    assert.match(commandCenterMarkup, /Bank Distribution/)
    assert.match(commandCenterMarkup, /xl:grid-cols-\[minmax\(0,0\.92fr\)_minmax\(0,1\.08fr\)\]/)
    assert.match(commandCenterMarkup, /Operational Bottleneck Heatmap/)
    assert.match(commandCenterMarkup, /Recent Bank Activity/)
    assert.match(commandCenterMarkup, /Team Performance/)
    assert.match(commandCenterMarkup, /Connected Partners/)
    assert.match(commandCenterMarkup, /Operational Risk/)
    assert.doesNotMatch(commandCenterMarkup, /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i)

    assert.ok(commandCenterMarkup.indexOf('Active Applications') < commandCenterMarkup.indexOf('Bank Approval Breakdown'))
    assert.ok(commandCenterMarkup.indexOf('Bank Lead Times') < commandCenterMarkup.indexOf('Pipeline Overview'))
    assert.ok(commandCenterMarkup.indexOf('Pipeline Overview') < commandCenterMarkup.indexOf('Buyer Type Mix'))
    assert.ok(commandCenterMarkup.indexOf('Buyer Type Mix') < commandCenterMarkup.indexOf('Bank Distribution'))
    assert.ok(commandCenterMarkup.indexOf('Operational Bottleneck Heatmap') < commandCenterMarkup.indexOf('Recent Bank Activity'))
    assert.ok(commandCenterMarkup.indexOf('Connected Partners') < commandCenterMarkup.indexOf('Operational Risk'))

    const hqMarkup = render(BondDashboard, {
      user: { role: 'bond_originator' },
      workspaceId: 'workspace-1',
      initialState: {
        loading: false,
        error: '',
        snapshot: makeSnapshot({
          reportingScope: {
            workspaceKind: 'bond_company',
            workspaceRole: 'owner',
            scopeLevel: 'workspace_hq',
            dashboardMode: 'owner_director',
          },
          hqCommandCentre: {
            nationalSnapshot: [
              { key: 'active_applications', label: 'Active Applications', value: '42', trend: '+8%', helper: 'National active book' },
              { key: 'applications_submitted', label: 'Applications Submitted', value: '18', trend: '+4', helper: 'Submitted in period' },
              { key: 'approval_rate', label: 'Approval Rate', value: '72%', trend: '+2%', helper: 'National approval rate' },
              { key: 'average_approval_time', label: 'Average Approval Time', value: '7d', trend: '-1d', helper: 'Submission to outcome' },
              { key: 'pipeline_value', label: 'Pipeline Value', value: 'R 42 000 000', trend: '+12%', helper: 'Open national pipeline' },
            ],
            alerts: [
              { key: 'unassigned', label: 'Unassigned applications', value: 3, tone: 'warning', href: '/bond/applications?filter=unassigned' },
              { key: 'sla_breaches', label: 'SLA breaches', value: 2, tone: 'high', href: '/bond/reports?view=sla-breaches' },
            ],
            pipelineFunnel: {
              bottleneckStage: 'Application Prep',
              stages: [
                { key: 'intake', label: 'Intake', count: 42, valueLabel: '42 files', conversionRate: 100, dropOff: 0, href: '/bond/pipeline?view=all' },
                { key: 'application_prep', label: 'Application Prep', count: 30, valueLabel: '30 files', conversionRate: 71, dropOff: 29, href: '/bond/pipeline?view=in-progress' },
                { key: 'review_submit', label: 'Review & Submit', count: 18, valueLabel: '18 files', conversionRate: 60, dropOff: 40, href: '/bond/pipeline?view=submitted' },
                { key: 'bank_decision', label: 'Bank Decision', count: 12, valueLabel: '12 files', conversionRate: 67, dropOff: 33, href: '/bond/pipeline?view=submitted' },
                { key: 'registration', label: 'Registration', count: 8, valueLabel: '8 files', conversionRate: 67, dropOff: 33, href: '/bond/applications?view=attorney-stage' },
              ],
            },
            regionalPerformance: [
              { key: 'gauteng', region: 'Gauteng', activeApplications: 21, submitted: 10, approvalRate: 74, avgApprovalTime: 7, pipelineValueLabel: 'R 21 000 000', projectedCommissionLabel: 'R 252 000', riskLevel: 'Low', href: '/bond/organisation?view=branches&region=Gauteng' },
              { key: 'western-cape', region: 'Western Cape', activeApplications: 14, submitted: 5, approvalRate: 61, avgApprovalTime: 10, pipelineValueLabel: 'R 14 000 000', projectedCommissionLabel: 'R 168 000', riskLevel: 'Medium', href: '/bond/organisation?view=branches&region=Western%20Cape' },
            ],
            topConsultants: [
              { key: 'emma', name: 'Emma Roberts', branch: 'Sandton HQ', applicationsSubmitted: 18, approvalRate: 78, growth: '+9%' },
              { key: 'lerato', name: 'Lerato Khumalo', branch: 'Cape Town Central', applicationsSubmitted: 12, approvalRate: 64, growth: '+4%' },
            ],
            branchLeaderboard: {
              topBranches: [
                { key: 'sandton', branch: 'Sandton HQ', region: 'Gauteng', activeApplications: 12, approvalRate: 82, avgApprovalTime: 6, projectedCommissionLabel: 'R 144 000', topScore: 91, riskLevel: 'Low', href: '/bond/organisation?view=branches&branch=Sandton%20HQ' },
              ],
              attentionBranches: [
                { key: 'cape-town', branch: 'Cape Town Central', region: 'Western Cape', activeApplications: 9, approvalRate: 48, avgApprovalTime: 13, projectedCommissionLabel: 'R 108 000', missingDocs: 5, riskLevel: 'High', href: '/bond/organisation?view=branches&branch=Cape%20Town%20Central' },
              ],
            },
            partnerPerformance: [
              { key: 'agency', sourceType: 'Agencies', partner: 'Prime Realty', applicationsReferred: 16, submittedApplications: 9, approvalRate: 70, conversionRate: 56, pipelineValueLabel: 'R 16 000 000', projectedCommissionLabel: 'R 192 000', href: '/bond/partners?source=agency' },
              { key: 'developers', sourceType: 'Developers', partner: 'Bridge Developments', applicationsReferred: 12, submittedApplications: 7, approvalRate: 76, conversionRate: 58, pipelineValueLabel: 'R 12 000 000', projectedCommissionLabel: 'R 144 000', href: '/bond/developments' },
            ],
            revenue: {
              revenueThisMonthLabel: 'R 180 000',
              projectedCommissionLabel: 'R 504 000',
              commissionConfirmedLabel: 'R 96 000',
              forecast90Day: 'R 1 120 000',
              revenueByRegion: [{ label: 'Gauteng', valueLabel: 'R 252 000' }],
              revenueByBranch: [{ label: 'Sandton HQ', valueLabel: 'R 144 000' }],
              revenueByPartnerSource: [{ label: 'Agencies', valueLabel: 'R 192 000' }],
            },
            bankPerformance: {
              bestBank: 'Nedbank',
              bottleneckBank: 'FNB',
              rows: [
                { bank: 'Nedbank', submitted: 8, approvalRate: 75, averageResponseTime: 5, revenueGenerated: 210000 },
                { bank: 'FNB', submitted: 6, approvalRate: 58, averageResponseTime: 9, revenueGenerated: 140000 },
              ],
            },
            performanceTrend: [
              { key: 'applications', label: 'Applications', color: '#24518a', values: [24, 26, 27, 31, 34, 36, 39, 40, 42, 45, 47, 49] },
              { key: 'approval', label: 'Approval Rate', color: '#15803d', values: [62, 63, 64, 65, 66, 68, 70, 69, 71, 72, 73, 74] },
              { key: 'response', label: 'Avg Response Time', color: '#b45309', values: [11, 10, 9, 9, 8, 8, 7, 7, 7, 6, 6, 5] },
              { key: 'revenue', label: 'Revenue', color: '#7c3aed', values: [80, 92, 105, 120, 135, 144, 156, 164, 172, 180, 196, 210] },
            ],
          },
        }),
        reportingScope: {
          workspaceKind: 'bond_company',
          workspaceRole: 'owner',
          scopeLevel: 'workspace_hq',
          dashboardMode: 'owner_director',
        },
      },
    })
    assert.doesNotMatch(hqMarkup, /HQ Command Centre/)
    assert.doesNotMatch(hqMarkup, /National overview of applications, pipeline performance and operational risk/)
    assert.doesNotMatch(hqMarkup, /Live operational command layer/)
    assert.match(hqMarkup, /Date Range/)
    assert.match(hqMarkup, /Filters/)
    assert.match(hqMarkup, /Refresh/)
    assert.match(hqMarkup, /Export/)
    assert.doesNotMatch(hqMarkup, /National Bond Command Centre/)
    assert.doesNotMatch(hqMarkup, /Executive view of national bond performance, pipeline, revenue and risk/)
    assert.doesNotMatch(hqMarkup, /Last 30 Days/)
    assert.doesNotMatch(hqMarkup, /All Regions/)
    assert.doesNotMatch(hqMarkup, /Export report/)
    assert.doesNotMatch(hqMarkup, /National Command Centre/)
    assert.match(hqMarkup, /Applications/)
    assert.match(hqMarkup, /90 active applications/)
    assert.match(hqMarkup, /3 approved • 87 pending/)
    assert.match(hqMarkup, /R199\.8k/)
    assert.match(hqMarkup, /Revenue Forecast/)
    assert.match(hqMarkup, /R22\.96m/)
    assert.match(hqMarkup, /Avg Approval Time/)
    assert.match(hqMarkup, /46 days/)
    assert.match(hqMarkup, /Regional Performance/)
    assert.match(hqMarkup, /Live performance across your national network/)
    assert.match(hqMarkup, /View all regions/)
    assert.match(hqMarkup, /Gauteng/)
    assert.match(hqMarkup, /SLA/)
    assert.doesNotMatch(hqMarkup, /Operational Health/)
    assert.doesNotMatch(hqMarkup, /\/ 100/)
    assert.match(hqMarkup, /pressure signals/)
    assert.doesNotMatch(hqMarkup, /Network Intelligence/)
    assert.doesNotMatch(hqMarkup, /Real-time operational momentum, trend signals and performance intelligence across the bond network/)
    assert.doesNotMatch(hqMarkup, /Operational Alerts/)
    assert.doesNotMatch(hqMarkup, /Applications waiting for OTP/)
    assert.doesNotMatch(hqMarkup, /Missing documents/)
    assert.doesNotMatch(hqMarkup, /Applications exceeded SLA/)
    assert.doesNotMatch(hqMarkup, /Bank response delays/)
    assert.doesNotMatch(hqMarkup, /High Risk Branches/)
    assert.doesNotMatch(hqMarkup, /Pipeline Snapshot/)
    assert.doesNotMatch(hqMarkup, /Bank Review/)
    assert.doesNotMatch(hqMarkup, /Instruction/)
    assert.doesNotMatch(hqMarkup, /Application Prep/)
    assert.doesNotMatch(hqMarkup, /Review &amp; Submit/)
    assert.doesNotMatch(hqMarkup, /Bank Decision/)
    assert.doesNotMatch(hqMarkup, /Registration/)
    assert.doesNotMatch(hqMarkup, /OTP Ready/)
    assert.doesNotMatch(hqMarkup, /Biggest Bottleneck/)
    assert.match(hqMarkup, /Bank Relationship Breakdown/)
    assert.match(hqMarkup, /Four-bank performance view/)
    assert.match(hqMarkup, /Manage banks/)
    assert.match(hqMarkup, /ABSA/)
    assert.match(hqMarkup, /Standard Bank/)
    assert.match(hqMarkup, /South Africa Regional Heatmap/)
    assert.match(hqMarkup, /Heatmap Key/)
    assert.match(hqMarkup, /Buyer Finance Mix/)
    assert.match(hqMarkup, /Buyer Profile Mix/)
    assert.match(hqMarkup, /Buyer Readiness Quality/)
    assert.match(hqMarkup, /Top Regions/)
    assert.match(hqMarkup, /Top Consultants/)
    assert.match(hqMarkup, /Top Banks/)
    assert.match(hqMarkup, /Emma Roberts/)
    assert.match(hqMarkup, /Nedbank/)
    assert.doesNotMatch(hqMarkup, /Branches Requiring Attention/)
    assert.doesNotMatch(hqMarkup, /Partner Intelligence/)
    assert.doesNotMatch(hqMarkup, /Top Partner Performance/)
    assert.doesNotMatch(hqMarkup, /Partner Risk Overview/)
    assert.doesNotMatch(hqMarkup, /Revenue Intelligence/)
    assert.doesNotMatch(hqMarkup, /Revenue Projection/)
    assert.doesNotMatch(hqMarkup, /Commission Breakdown/)
    assert.doesNotMatch(hqMarkup, /Revenue Trend/)
    assert.match(hqMarkup, /Applications/)
    assert.match(hqMarkup, /Approval Rate/)
    assert.match(hqMarkup, /Revenue/)
    assert.match(hqMarkup, /Data freshness/)
    assert.doesNotMatch(hqMarkup, /Bond Originator HQ/)
    assert.doesNotMatch(hqMarkup, /Company-wide view of applications, revenue, approvals, partner performance, and operational risk/)
    assert.doesNotMatch(hqMarkup, /National Pipeline Funnel/)
    assert.doesNotMatch(hqMarkup, /Bank Performance Overview/)
    assert.doesNotMatch(hqMarkup, /Executive Actions/)
    assert.doesNotMatch(hqMarkup, /Live operational movement across active bond applications/)
    assert.doesNotMatch(hqMarkup, /Client One/)
    assert.doesNotMatch(hqMarkup, /Open Application/)
    assert.doesNotMatch(hqMarkup, /Buyer Type Mix/)
    assert.doesNotMatch(hqMarkup, /Readiness Quality Mix/)
    assert.doesNotMatch(hqMarkup, /Recent Bank Activity/)
    assert.doesNotMatch(hqMarkup, /Team Performance/)
    assert.doesNotMatch(hqMarkup, /Operational Bottleneck Heatmap/)
    assert.doesNotMatch(hqMarkup, /Applications Needing Attention/)

    const hqOrder = [
      'Applications',
      'Regional Performance',
      'Bank Relationship Breakdown',
      'South Africa Regional Heatmap',
      'Buyer Finance Mix',
      'Top Regions',
      'Top Consultants',
      'Top Banks',
      'Data freshness',
    ]
    let previousHqIndex = -1
    for (const label of hqOrder) {
      const index = hqMarkup.indexOf(label)
      assert.ok(index > previousHqIndex, `${label} should render after the previous HQ section`)
      previousHqIndex = index
    }

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
