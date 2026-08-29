import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const [app, sidebar, routeLoader, listRoute, listPage, repository, workspaceRoute, workspaceShell, pipeline, tabLoader] = await Promise.all([
  readFile('src/App.jsx', 'utf8'),
  readFile('src/components/Sidebar.jsx', 'utf8'),
  readFile('src/routes/leadsRouteLoader.js', 'utf8'),
  readFile('src/pages/agency/AgencyLeadListRoutePage.jsx', 'utf8'),
  readFile('src/pages/agency/LeadListPage.jsx', 'utf8'),
  readFile('src/pages/agency/agencyLeadListReadRepository.js', 'utf8'),
  readFile('src/pages/agency/AgencyLeadWorkspaceRoutePage.jsx', 'utf8'),
  readFile('src/pages/agency/AgencyLeadWorkspaceShellPage.jsx', 'utf8'),
  readFile('src/pages/agency/AgencyPipelinePage.jsx', 'utf8'),
  readFile('src/pages/agency/agencyLeadWorkspaceTabLoader.js', 'utf8'),
])

assert.match(app, /<BrowserRouter unstable_useTransitions=\{false\}>/)
assert.match(app, /const AgencyLeadListRoutePage = lazy\(loadAgencyLeadListRouteModule\)/)
assert.match(app, /const AgencyLeadWorkspaceRoutePage = lazy\(loadAgencyLeadWorkspaceRouteModule\)/)
assert.match(app, /<Suspense fallback=\{<LeadsRouteShell \/>\}>/)
assert.match(app, /<Suspense fallback=\{<LeadsRouteShell detail \/>\}>/)

assert.match(sidebar, /preloadAgencyLeadsRoute/)
assert.match(sidebar, /shouldPreloadLeads/)
assert.match(sidebar, /onMouseEnter=\{preloadNavigationTarget\}/)
assert.match(sidebar, /onPointerDown=\{preloadNavigationTarget\}/)
assert.match(sidebar, /onTouchStart=\{preloadNavigationTarget\}/)
assert.match(sidebar, /onFocus=\{preloadNavigationTarget\}/)

assert.match(routeLoader, /Promise\.all\(\[routePromise, repositoryPromise, dataPromise\]\)/)
assert.match(routeLoader, /preloadAgencyLeadListRecords\(organisationId\)/)
assert.match(routeLoader, /preloadAgencyLeadCoreRecord\(organisationId, leadId\)/)

assert.match(repository, /const PRIMARY_RECORDS_CACHE_TTL_MS = 60_000/)
assert.match(repository, /let compatibleLeadFields = null/)
assert.match(repository, /const candidates = compatibleLeadFields/)
assert.match(repository, /compatibleLeadFields = fields/)
assert.match(repository, /export async function preloadAgencyLeadCoreRecord/)
assert.match(repository, /export function invalidateAgencyLeadListCache/)

assert.match(listRoute, /preloadAgencyLeadCoreRecord\(organisationId, leadId\)/)
assert.doesNotMatch(listRoute, /fetchOrganisationSettings/)
assert.match(listPage, /onPointerEnter=\{\(\) => onLeadIntent\(row\.id\)\}/)
assert.match(listPage, /onPointerDown=\{\(\) => onLeadIntent\(row\.id\)\}/)
assert.match(listPage, /onFocus=\{\(\) => onLeadIntent\(row\.id\)\}/)

assert.match(workspaceRoute, /const AgencyPipelinePage = lazy\(loadAgencyLeadWorkspace\)/)
assert.doesNotMatch(workspaceRoute, /if \(activeTab === 'overview'\) return <AgencyLeadWorkspaceShellPage \/>/)
assert.match(workspaceRoute, /fallback=\{<AgencyLeadWorkspaceShellPage loadingTab=\{activeTab !== 'overview'\} \/>\}/)
assert.match(workspaceShell, /LEAD_ROUTE_PATTERN\.test\(location\.pathname\)/)
assert.match(workspaceShell, /navigate\(`\$\{location\.pathname\}\?\$\{params\.toString\(\)\}/)

assert.match(tabLoader, /export function loadLeadDocumentWorkspace/)
assert.match(tabLoader, /if \(tabKey === 'documents'\)/)
assert.match(pipeline, /const LeadDocumentWorkspace = lazy\(loadLeadDocumentWorkspace\)/)
assert.doesNotMatch(pipeline, /import LeadDocumentWorkspace from/)
assert.match(pipeline, /workspaceContextSeed \|\| withPipelineTimeout\(fetchOrganisationSettings\(\)/)
assert.doesNotMatch(pipeline, /window\.history\.replaceState/)

console.log('Leads navigation performance correction checks passed.')
