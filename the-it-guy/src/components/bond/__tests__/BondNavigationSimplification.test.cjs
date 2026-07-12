/* global require, __dirname, process */
const assert = require('node:assert/strict')
const path = require('node:path')
const { createServer } = require('vite')
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')

const PROJECT_ROOT = path.resolve(__dirname, '../../../..')

async function main() {
  const server = await createServer({
    root: PROJECT_ROOT,
    logLevel: 'error',
    server: { middlewareMode: true, hmr: false },
    appType: 'custom',
  })

  try {
    const rolesModule = await server.ssrLoadModule('/src/lib/roles.js')
    const navigationPermissions = await server.ssrLoadModule('/src/auth/permissions/navigationPermissions.js')
    const viewsModule = await server.ssrLoadModule('/src/config/bondViews.js')
    const tabsModule = await server.ssrLoadModule('/src/components/bond/BondViewTabs.jsx')
    const serviceModule = await server.ssrLoadModule('/src/services/bondCommandCenterService.js')

    const defaultBondNav = rolesModule.getRoleNavItems('bond_originator')
    const hqBondNav = rolesModule.getRoleNavItems('bond_originator', { membershipRole: 'bond_hq_manager' })
    const consultantNav = navigationPermissions.filterNavigationItems(defaultBondNav, {
      role: 'bond_originator',
      currentWorkspace: { id: 'workspace-1', type: 'bond_originator' },
      currentMembership: {
        id: 'membership-1',
        organisation_id: 'workspace-1',
        role: 'consultant',
        workspace_role: 'consultant',
        workspace_type: 'bond_originator',
        status: 'active',
      },
      activeMemberships: [
        {
          id: 'membership-1',
          organisation_id: 'workspace-1',
          role: 'consultant',
          workspace_role: 'consultant',
          workspace_type: 'bond_originator',
          status: 'active',
        },
      ],
    })
    assert.deepEqual(
      defaultBondNav.map((item) => item.label),
      ['Dashboard', 'My Applications', 'Developments', 'Consultant Performance', 'My Commissions', 'Clients', 'Tasks'],
    )
    assert.deepEqual(
      hqBondNav.map((item) => item.label),
      ['Dashboard', 'Applications', 'Developments', 'Organisation', 'Partners', 'Bank Relationships', 'Revenue & Commissions', 'Reports', 'Settings'],
    )
    assert.equal(consultantNav.some((item) => item.key === 'settings'), false)
    assert.deepEqual(
      hqBondNav.filter((item) => item.navSection !== 'secondary').map((item) => item.label),
      ['Dashboard', 'Applications', 'Developments', 'Organisation', 'Partners', 'Bank Relationships', 'Revenue & Commissions', 'Reports'],
    )
    assert.deepEqual(
      hqBondNav.filter((item) => item.navSection === 'secondary').map((item) => item.label),
      ['Settings'],
    )
    const applicationsNav = hqBondNav.find((item) => item.key === 'bond_applications')
    assert.equal(applicationsNav?.to, '/bond/pipeline')
    assert.deepEqual(applicationsNav?.children.map((item) => item.label), ['Pipeline', 'Applications'])
    assert.equal(applicationsNav?.children.find((item) => item.key === 'bond_pipeline')?.to, '/bond/pipeline')
    assert.equal(applicationsNav?.children.find((item) => item.key === 'applications')?.to, '/bond/applications')
    const developmentsNav = hqBondNav.find((item) => item.key === 'bond_developments')
    assert.equal(developmentsNav?.to, '/bond/developments?view=current')
    assert.deepEqual(developmentsNav?.children.map((item) => item.label), ['Current Developments', 'Developers'])
    assert.equal(developmentsNav?.children.find((item) => item.key === 'bond_developments_current')?.to, '/bond/developments?view=current')
    assert.equal(developmentsNav?.children.find((item) => item.key === 'bond_developments_developers')?.to, '/bond/developments?view=developers')
    const organisationNav = hqBondNav.find((item) => item.key === 'bond_organisation')
    assert.equal(organisationNav?.to, '/bond/organisation?view=overview')
    assert.deepEqual(organisationNav?.children.map((item) => item.label), ['Overview', 'Branches / Regions', 'Consultants'])
    assert.equal(organisationNav?.children.find((item) => item.key === 'bond_org_overview')?.to, '/bond/organisation?view=overview')
    assert.equal(organisationNav?.children.find((item) => item.key === 'bond_branches_regions')?.to, '/bond/organisation?view=branches')
    assert.equal(organisationNav?.children.find((item) => item.key === 'bond_consultants')?.to, '/bond/organisation?view=consultants')
    const reportsNav = hqBondNav.find((item) => item.key === 'bond_reports')
    assert.deepEqual(reportsNav?.children.map((item) => item.label), ['Analytics', 'Predictive Intelligence'])
    assert.equal(reportsNav?.children.find((item) => item.key === 'bond_reports_analytics')?.to, '/bond/reports')
    assert.equal(reportsNav?.children.find((item) => item.key === 'predictive_intelligence')?.to, '/bond/predictive-intelligence')
    const settingsNav = hqBondNav.find((item) => item.key === 'settings')
    assert.equal(settingsNav?.to, '/settings')
    assert.equal(Array.isArray(settingsNav?.children), false)
    assert.equal(hqBondNav.some((item) => item.key === 'documents' || item.key === 'tasks' || item.key === 'bond_calendar'), false)
    assert.equal(hqBondNav.some((item) => item.key === 'banks' || item.key === 'teams' || item.key === 'performance'), false)
    assert.equal(hqBondNav.some((item) => item.key === 'automation_rules' || item.key === 'predictive_intelligence' || item.key === 'branch_operations' || item.key === 'regional_operations'), false)

    const appSource = require('node:fs').readFileSync(path.join(PROJECT_ROOT, 'src/App.jsx'), 'utf8')
    assert.match(appSource, /path="\/bond\/tasks"/)
    assert.match(appSource, /path="\/bond\/calendar"/)
    assert.match(appSource, /path="\/documents"/)

    const sidebarSource = require('node:fs').readFileSync(path.join(PROJECT_ROOT, 'src/components/Sidebar.jsx'), 'utf8')
    assert.match(sidebarSource, /bond_applications/)
    assert.match(sidebarSource, /bond_developments/)
    assert.match(sidebarSource, /bond_developments_developers/)
    assert.match(sidebarSource, /bond_branches_regions/)
    assert.match(sidebarSource, /bond_consultants/)
    assert.match(sidebarSource, /'tasks'/)

    assert.deepEqual(
      viewsModule.bondViews.pipeline.tabs.map((tab) => tab.key),
      ['all', 'awaiting-otp', 'ready-to-start', 'in-progress', 'submitted', 'stalled', 'declined'],
    )
    assert.deepEqual(
      viewsModule.bondViews.transactions.tabs.map((tab) => tab.key),
      ['all', 'active', 'bond-approved', 'grant-signed', 'instruction-sent', 'attorney-stage', 'registered', 'at-risk', 'declined'],
    )
    assert.equal(viewsModule.getBondPipelineView('new').filters.queue, 'awaiting_otp')
    assert.equal(viewsModule.getBondPipelineView('awaiting-documents').filters.queue, 'application_in_progress')
    assert.equal(viewsModule.getBondPipelineView('ready-for-submission').filters.queue, 'application_submitted')
    assert.equal(viewsModule.getBondTransactionView('bond-approved').status, 'bond_approved')

    const tabMarkup = renderToStaticMarkup(
      React.createElement(tabsModule.default, {
        tabs: viewsModule.bondViews.pipeline.tabs,
        value: 'awaiting-otp',
        counts: { 'awaiting-otp': 4 },
      }),
    )
    assert.match(tabMarkup, /Awaiting OTP/)
    assert.match(tabMarkup, />4</)

    const snapshot = await serviceModule.getBondTransactionTrackerSnapshot(
      { role: 'bond_originator' },
      'workspace-1',
      {
        filterVisible: false,
        reportingScope: { workspaceKind: 'bond_company', dashboardMode: 'consultant' },
        rows: [
          {
            transaction: {
              id: 'tx-approved',
              finance_type: 'bond',
              current_sub_stage_summary: 'Bond approved by bank',
              bank: 'Nedbank',
              buyer_name: 'Approved Buyer',
              property_name: 'Unit 1',
              updated_at: new Date().toISOString(),
              created_at: new Date().toISOString(),
            },
            buyer: { name: 'Approved Buyer' },
            unit: { unit_number: '1', price: 1000000 },
            documentSummary: { missingCount: 0 },
          },
          {
            transaction: {
              id: 'tx-attorney',
              finance_type: 'bond',
              current_sub_stage_summary: 'Awaiting attorney instruction',
              bank: 'FNB',
              buyer_name: 'Attorney Buyer',
              property_name: 'Unit 2',
              updated_at: new Date().toISOString(),
              created_at: new Date().toISOString(),
            },
            buyer: { name: 'Attorney Buyer' },
            unit: { unit_number: '2', price: 1000000 },
            documentSummary: { missingCount: 0 },
          },
        ],
        status: 'attorney_stage',
      },
    )
    assert.equal(snapshot.selectedStatus, 'attorney_stage')
    assert.equal(snapshot.statusCards.some((card) => card.key === 'attorney_stage'), true)
    assert.equal(snapshot.rows.length, 1)
    assert.equal(snapshot.rows[0].client, 'Attorney Buyer')

    console.log('Bond navigation simplification tests passed')
  } finally {
    await server.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
