import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createServer } from 'vite'

const server = await createServer({
  root: process.cwd(),
  logLevel: 'silent',
  server: { middlewareMode: true },
})

try {
  const {
    canAccessAttorneyMatterView,
    filterAttorneyModuleItems,
    getAttorneyMatterViewModuleKey,
  } = await server.ssrLoadModule('/src/services/attorneyModuleNavigation.js')

  const transferOnly = (moduleKey) => moduleKey === 'transfer'
  assert.equal(getAttorneyMatterViewModuleKey('bond'), 'bond')
  assert.equal(getAttorneyMatterViewModuleKey('registered'), '')
  assert.equal(canAccessAttorneyMatterView('all', transferOnly), true)
  assert.equal(canAccessAttorneyMatterView('transfer', transferOnly), true)
  assert.equal(canAccessAttorneyMatterView('bond', transferOnly), false)
  assert.equal(canAccessAttorneyMatterView('full-service', transferOnly), false)
  assert.equal(canAccessAttorneyMatterView('unknown-view', transferOnly), false)

  const matterOptions = filterAttorneyModuleItems([
    { key: 'all', label: 'All' },
    { key: 'transfer', label: 'Transfer' },
    { key: 'bond', label: 'Bond' },
    { key: 'cancellation', label: 'Cancellation' },
    { key: 'development', label: 'Development' },
    { key: 'full-service', label: 'Full Service', moduleKeys: ['transfer', 'bond'] },
  ], transferOnly)
  assert.deepEqual(matterOptions.map((item) => item.key), ['all', 'transfer', 'development'])

  const navigation = filterAttorneyModuleItems([{
    key: 'matters',
    children: [
      { key: 'all' },
      { key: 'transfer_lane', moduleKey: 'transfer' },
      { key: 'bond_lane', moduleKey: 'bond' },
    ],
  }], transferOnly)
  assert.deepEqual(navigation[0].children.map((item) => item.key), ['all', 'transfer_lane'])

  const appSource = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8')
  const sidebarSource = readFileSync(new URL('../src/components/Sidebar.jsx', import.meta.url), 'utf8')
  const headerSource = readFileSync(new URL('../src/components/HeaderBar.jsx', import.meta.url), 'utf8')
  const mattersSource = readFileSync(new URL('../src/pages/AttorneyMattersPage.jsx', import.meta.url), 'utf8')
  const rolesSource = readFileSync(new URL('../src/lib/roles.js', import.meta.url), 'utf8')
  const flagsSource = readFileSync(new URL('../src/lib/envValidation.js', import.meta.url), 'utf8')

  assert.match(appSource, /function AttorneyMatterTypeRoute/)
  assert.match(appSource, /canAccessAttorneyMatterView\(matterType, attorneyModules\.canViewModule\)/)
  assert.match(sidebarSource, /filterAttorneyModuleItems\(permittedItems, attorneyModules\?\.canViewModule\)/)
  assert.match(headerSource, /filterAttorneyModuleItems\(ATTORNEY_DASHBOARD_ROLE_VIEWS, attorneyModules\?\.canViewModule\)/)
  assert.match(mattersSource, /filterAttorneyModuleItems\(options, canViewAttorneyModule\)/)
  assert.match(rolesSource, /attorney_matters_bond[^\n]+moduleKey: 'bond'/)
  assert.match(flagsSource, /VITE_FEATURE_ATTORNEY_MODULE_NAVIGATION, false/)

  console.log('attorney firm modules Phase 4 navigation tests passed')
} finally {
  await server.close()
}
