/* global process */
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

  const rows = [
    { id: 'derived-region-visible-scope', region: 'Visible Scope' },
    { id: 'branch-1', branch: 'Pretoria North' },
  ]
  assert.equal(page.resolveSelectedHierarchyRow('derived-region-visible-scope', rows, ['region'])?.id, 'derived-region-visible-scope')
  assert.equal(page.resolveSelectedHierarchyRow('random-visible-scope', rows, ['region'])?.id, 'derived-region-visible-scope')
  assert.equal(page.resolveSelectedHierarchyRow('stale-region-id', rows, ['region']), null)
  assert.equal(page.hasStaleHierarchySelection('stale-region-id', null), true)
  assert.equal(page.hasStaleHierarchySelection('', null), false)

  console.log('BondOrganisationPage tests passed')
} finally {
  await server.close()
}
