import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..')

const server = await createServer({
  root: PROJECT_ROOT,
  logLevel: 'silent',
  server: { middlewareMode: true },
})

try {
  const page = await server.ssrLoadModule('/src/pages/bond/BondOrganisationPage.jsx')

  assert.equal(page.resolveRouteView({ pathname: '/bond/organisation', search: '?view=regions' }), 'regions')
  assert.equal(page.resolveRouteView({ pathname: '/bond/organisation', search: '?view=branches' }), 'branches')
  assert.equal(page.resolveRouteView({ pathname: '/bond/organisation', search: '?view=consultants' }), 'consultants')
  assert.equal(page.resolveRouteView({ pathname: '/bond/organisation', search: '?view=applications' }), 'applications')
  assert.equal(page.resolveRouteView({ pathname: '/bond/organisation', search: '?view=overview' }), 'overview')
  assert.equal(page.resolveRouteView({ pathname: '/bond/organisation', search: '?view=random' }), 'overview')
  assert.equal(page.resolveRouteView({ pathname: '/bond/organisation', search: '' }), 'overview')

  const snapshot = {
    capabilities: {
      canViewRegions: false,
      canViewBranches: true,
      canViewConsultants: false,
    },
  }
  assert.equal(page.canAccessOrganisationView('overview', snapshot), true)
  assert.equal(page.canAccessOrganisationView('applications', snapshot), true)
  assert.equal(page.canAccessOrganisationView('regions', snapshot), false)
  assert.equal(page.canAccessOrganisationView('branches', snapshot), true)
  assert.equal(page.canAccessOrganisationView('consultants', snapshot), false)
  assert.equal(page.canAccessOrganisationView('overview', { organisationScope: { scopeLevel: 'consultant' }, capabilities: {} }), false)
  assert.equal(page.canAccessOrganisationView('overview', { organisationScope: { scopeLevel: 'hq' }, capabilities: {} }), true)

  const rows = [
    { id: 'derived-region-visible-scope', region: 'Visible Scope' },
    { id: 'branch-1', branch: 'Pretoria North' },
  ]
  assert.equal(page.resolveSelectedHierarchyRow('derived-region-visible-scope', rows, ['region'])?.id, 'derived-region-visible-scope')
  assert.equal(page.resolveSelectedHierarchyRow('random-visible-scope', rows, ['region'])?.id, 'derived-region-visible-scope')
  assert.equal(page.resolveSelectedHierarchyRow('stale-region-id', rows, ['region']), null)
  assert.equal(page.hasStaleHierarchySelection('stale-region-id', null), true)
  assert.equal(page.hasStaleHierarchySelection('', null), false)

  assert.deepEqual(page.getBranchManagerOptions({
    eligibleBranchManagers: [
      { user_id: 'manager-1', name: 'Branch Manager', workspace_role: 'branch_manager' },
      { user_id: 'lead-1', name: 'Team Lead', workspace_role: 'team_lead' },
      { user_id: 'hq-1', name: 'HQ Manager', workspace_role: 'hq_manager' },
      { user_id: 'consultant-1', name: 'Consultant', workspace_role: 'consultant' },
    ],
    consultants: [
      { user_id: 'legacy-manager', name: 'Legacy Manager', workspace_role: 'branch_manager' },
    ],
  }).map((option) => option.id), ['manager-1', 'lead-1', 'hq-1'])

  assert.deepEqual(page.getBranchManagerOptions({
    consultants: [
      { user_id: 'legacy-manager', name: 'Legacy Manager', workspace_role: 'branch_manager' },
      { user_id: 'legacy-consultant', name: 'Legacy Consultant', workspace_role: 'consultant' },
    ],
  }).map((option) => option.id), ['legacy-manager'])

  assert.deepEqual(page.getBranchManagerOptions({ eligibleBranchManagers: [] }), [])

  assert.deepEqual(page.getRegionManagerOptions({
    eligibleRegionManagers: [
      { user_id: 'regional-1', name: 'Regional Manager', workspace_role: 'bond_regional_manager' },
      { user_id: 'branch-1', name: 'Branch Manager', workspace_role: 'branch_manager' },
    ],
  }).map((option) => option.id), ['regional-1'])

  console.log('BondOrganisationPage tests passed')
} finally {
  await server.close()
}
