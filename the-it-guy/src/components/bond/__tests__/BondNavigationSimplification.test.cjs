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
    const permissionResolver = await server.ssrLoadModule('/src/auth/permissions/permissionResolver.js')
    const viewsModule = await server.ssrLoadModule('/src/config/bondViews.js')
    const tabsModule = await server.ssrLoadModule('/src/components/bond/BondViewTabs.jsx')
    const serviceModule = await server.ssrLoadModule('/src/services/bondCommandCenterService.js')

    const bondNav = rolesModule.getRoleNavItems('bond_originator')
    const consultantNav = permissionResolver.filterNavigationItems(bondNav, {
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
      bondNav.map((item) => item.label),
      ['Dashboard', 'Pipeline', 'Applications', 'Developments', 'Clients', 'Partners', 'Reports', 'Organisation', 'Settings'],
    )
    assert.equal(consultantNav.some((item) => item.key === 'settings'), true)
    assert.deepEqual(
      bondNav.filter((item) => item.navSection !== 'secondary').map((item) => item.label),
      ['Dashboard', 'Pipeline', 'Applications', 'Developments', 'Clients', 'Partners', 'Reports', 'Organisation'],
    )
    assert.deepEqual(
      bondNav.filter((item) => item.navSection === 'secondary').map((item) => item.label),
      ['Settings'],
    )
    assert.equal(bondNav.find((item) => item.key === 'bond_pipeline')?.to, '/bond/pipeline')
    assert.equal(bondNav.find((item) => item.key === 'applications')?.to, '/bond/applications')
    assert.equal(bondNav.find((item) => item.key === 'bond_organisation')?.to, '/bond/organisation')
    assert.equal(bondNav.some((item) => item.key === 'documents' || item.key === 'tasks' || item.key === 'bond_calendar'), false)
    assert.equal(Boolean(bondNav.find((item) => item.key === 'clients')?.children?.length), false)
    assert.ok(bondNav.every((item) => !Array.isArray(item.children) || item.children.length === 0))
    assert.equal(bondNav.some((item) => item.key === 'banks' || item.key === 'teams' || item.key === 'performance'), false)

    const appSource = require('node:fs').readFileSync(path.join(PROJECT_ROOT, 'src/App.jsx'), 'utf8')
    assert.match(appSource, /path="\/bond\/tasks"/)
    assert.match(appSource, /path="\/bond\/calendar"/)
    assert.match(appSource, /path="\/documents"/)

    assert.deepEqual(
      viewsModule.bondViews.pipeline.tabs.map((tab) => tab.key),
      ['all', 'new', 'awaiting-docs', 'ready-for-submission', 'submitted', 'stalled', 'declined'],
    )
    assert.deepEqual(
      viewsModule.bondViews.transactions.tabs.map((tab) => tab.key),
      ['all', 'active', 'bond-approved', 'grant-signed', 'instruction-sent', 'attorney-stage', 'registered', 'at-risk', 'declined'],
    )
    assert.equal(viewsModule.getBondPipelineView('awaiting-documents').filters.queue, 'missing_documents')
    assert.equal(viewsModule.getBondPipelineView('awaiting-docs').filters.queue, 'missing_documents')
    assert.equal(viewsModule.getBondTransactionView('bond-approved').status, 'bond_approved')

    const tabMarkup = renderToStaticMarkup(
      React.createElement(tabsModule.default, {
        tabs: viewsModule.bondViews.pipeline.tabs,
        value: 'awaiting-docs',
        counts: { 'awaiting-docs': 4 },
      }),
    )
    assert.match(tabMarkup, /Awaiting Docs/)
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
