import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import {
  getMobileApplicationWorkspace,
  getMobileCommercialLeadWorkspace,
  getMobileDealWorkspace,
  getMobileLeadWorkspace,
  getMobileListingWorkspace,
  getMobileMatterWorkspace,
  getMobileTransactionWorkspace,
} from '../src/services/mobileWorkspaceService.js'
import {
  getMobileCommandBrief,
  getMobileFieldModeSnapshot,
  getMobileHandoffReview,
  getMobileLiveRoomBrief,
  getSearchIndex,
  searchMobile,
} from '../src/services/mobileProductivityService.js'
import { mapDesktopRouteToMobile } from '../src/config/mobileRouteMappings.js'

function createLocalStorageMock() {
  const entries = new Map()
  return {
    getItem: (key) => entries.has(key) ? entries.get(key) : null,
    setItem: (key, value) => entries.set(key, String(value)),
    removeItem: (key) => entries.delete(key),
    clear: () => entries.clear(),
  }
}

global.window = {
  localStorage: createLocalStorageMock(),
  sessionStorage: createLocalStorageMock(),
}

const appSource = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8')
const productivitySource = readFileSync(new URL('../src/components/mobile-shell/MobileProductivity.jsx', import.meta.url), 'utf8')
const workspacePageSource = readFileSync(new URL('../src/pages/mobile/MobileWorkspacePage.jsx', import.meta.url), 'utf8')
const bottomNavSource = readFileSync(new URL('../src/components/mobile-shell/MobileBottomNav.jsx', import.meta.url), 'utf8')
const demoLayoutSource = readFileSync(new URL('../src/components/mobile-shell/MobileDemoLayout.jsx', import.meta.url), 'utf8')
const demoHomeSource = readFileSync(new URL('../src/pages/mobile/MobileDemoHomePage.jsx', import.meta.url), 'utf8')
const mobileSearchSource = readFileSync(new URL('../src/pages/mobile/MobileSearchPage.jsx', import.meta.url), 'utf8')

const routePatterns = [
  /^\/mobile\/home$/,
  /^\/mobile\/transactions$/,
  /^\/mobile\/leads$/,
  /^\/mobile\/documents$/,
  /^\/mobile\/notifications$/,
  /^\/mobile\/inbox$/,
  /^\/mobile\/search$/,
  /^\/mobile\/reports$/,
  /^\/mobile\/matters$/,
  /^\/mobile\/applications$/,
  /^\/mobile\/pipeline$/,
  /^\/mobile\/listings$/,
  /^\/mobile\/deals$/,
  /^\/mobile\/tasks$/,
  /^\/mobile\/activity$/,
  /^\/mobile\/transaction\/[^/]+$/,
  /^\/mobile\/lead\/[^/]+$/,
  /^\/mobile\/matter\/[^/]+$/,
  /^\/mobile\/application\/[^/]+$/,
  /^\/mobile\/deal\/[^/]+$/,
  /^\/mobile\/commercial-lead\/[^/]+$/,
  /^\/mobile\/listing\/[^/]+$/,
  /^\/mobile\/more$/,
]

function assertRoutable(path, label) {
  assert.ok(routePatterns.some((pattern) => pattern.test(path)), `${label} should resolve to a declared mobile route: ${path}`)
}

const workspaceLoaders = {
  transaction: getMobileTransactionWorkspace,
  lead: getMobileLeadWorkspace,
  matter: getMobileMatterWorkspace,
  application: getMobileApplicationWorkspace,
  deal: getMobileDealWorkspace,
  commercialLead: getMobileCommercialLeadWorkspace,
  listing: getMobileListingWorkspace,
}

for (const [workspaceType, loader] of Object.entries(workspaceLoaders)) {
  const workspace = loader(`phase9-${workspaceType}`)
  assert.equal(typeof workspace.title, 'string', `${workspaceType} workspace should expose a title`)
  assert.equal(typeof workspace.module, 'string', `${workspaceType} workspace should expose a module`)
  assert.ok(Array.isArray(workspace.stages), `${workspaceType} workspace should expose stages`)
  assert.ok(Array.isArray(workspace.priorityActions), `${workspaceType} workspace should expose priority actions`)
  assert.ok(Array.isArray(workspace.participants), `${workspaceType} workspace should expose participants`)
  assert.ok(Array.isArray(workspace.documents), `${workspaceType} workspace should expose documents`)
  assert.ok(Array.isArray(workspace.tasks), `${workspaceType} workspace should expose tasks`)
  assert.ok(Array.isArray(workspace.activity), `${workspaceType} workspace should expose activity`)
  assert.ok(Array.isArray(workspace.actions), `${workspaceType} workspace should expose actions`)
  assert.ok(workspace.visualContext?.transaction?.reference, `${workspaceType} workspace should expose transaction visual context`)
  assert.ok(workspace.visualContext?.property?.address, `${workspaceType} workspace should expose property visual context`)
  assert.ok(Array.isArray(workspace.visualContext?.media?.items), `${workspaceType} workspace should expose media visual context`)

  const fieldMode = getMobileFieldModeSnapshot({
    workspace,
    tasks: workspace.tasks,
    documents: workspace.documents,
    priorityActions: workspace.priorityActions,
  })
  assert.ok(Number.isFinite(fieldMode.score), `${workspaceType} field mode should produce a numeric score`)
  assert.equal(fieldMode.checks.length, 4, `${workspaceType} field mode should expose four health checks`)

  const commandBrief = getMobileCommandBrief({
    workspace,
    tasks: workspace.tasks,
    documents: workspace.documents,
    priorityActions: workspace.priorityActions,
    activity: workspace.activity,
  })
  assert.ok(Number.isFinite(commandBrief.score), `${workspaceType} command brief should produce a numeric score`)
  assert.ok(commandBrief.recommendations.length >= 1, `${workspaceType} command brief should expose recommendations`)
  assert.equal(commandBrief.automations.length, 3, `${workspaceType} command brief should expose automation rules`)

  const liveRoom = getMobileLiveRoomBrief({
    workspace,
    tasks: workspace.tasks,
    documents: workspace.documents,
    activity: workspace.activity,
    communicationThread: { messages: [] },
  })
  assert.ok(Number.isFinite(liveRoom.readiness), `${workspaceType} live room should produce readiness`)
  assert.equal(liveRoom.lanes.length, 3, `${workspaceType} live room should expose three lanes`)
  assert.ok(liveRoom.suggestedUpdates.length >= 3, `${workspaceType} live room should expose update templates`)

  const handoff = getMobileHandoffReview({
    workspace,
    tasks: workspace.tasks,
    documents: workspace.documents,
    activity: workspace.activity,
    priorityActions: workspace.priorityActions,
    communicationThread: { messages: [] },
  })
  assert.ok(Number.isFinite(handoff.score), `${workspaceType} handoff review should produce a numeric score`)
  assert.equal(handoff.gates.length, 3, `${workspaceType} handoff review should expose three gates`)
  assert.equal(handoff.packet.length, 4, `${workspaceType} handoff review should expose a four-item packet`)
  assert.equal(handoff.audit.length, 3, `${workspaceType} handoff review should expose audit markers`)
}

assert.equal(mapDesktopRouteToMobile('/transactions/tx-123'), '/mobile/transaction/tx-123')
assert.equal(mapDesktopRouteToMobile('/leads/lead-123'), '/mobile/lead/lead-123')
assert.equal(mapDesktopRouteToMobile('/attorney/matters/matter-123'), '/mobile/matter/matter-123')
assert.equal(mapDesktopRouteToMobile('/bond/applications/app-123'), '/mobile/application/app-123')
assert.equal(mapDesktopRouteToMobile('/commercial/deals/deal-123'), '/mobile/deal/deal-123')
assert.equal(mapDesktopRouteToMobile('/commercial/leads/lead-123'), '/mobile/commercial-lead/lead-123')
assert.equal(mapDesktopRouteToMobile('/commercial/listings/listing-123'), '/mobile/listing/listing-123')

for (const item of getSearchIndex()) {
  assertRoutable(item.to, `Search result ${item.id}`)
}

assert.ok(searchMobile('command brief').some((item) => item.id === 'search-command-brief'), 'Search should find Command Brief by tokenized query')
assert.ok(searchMobile('live room').some((item) => item.id === 'search-live-room'), 'Search should find Live Transaction Room by tokenized query')
assert.ok(searchMobile('handoff review').some((item) => item.id === 'search-handoff-review'), 'Search should find Handoff Review by tokenized query')

for (const route of [
  '/mobile/transaction/:workspaceId',
  '/mobile/lead/:workspaceId',
  '/mobile/matter/:workspaceId',
  '/mobile/application/:workspaceId',
  '/mobile/deal/:workspaceId',
  '/mobile/commercial-lead/:workspaceId',
  '/mobile/listing/:workspaceId',
]) {
  assert.ok(appSource.includes(`path="${route}"`), `App route table should declare ${route}`)
}

for (const route of [
  '/mobile-demo/home',
  '/mobile-demo/search',
  '/mobile-demo/transaction/:workspaceId',
  '/mobile-demo/lead/:workspaceId',
  '/mobile-demo/matter/:workspaceId',
  '/mobile-demo/application/:workspaceId',
  '/mobile-demo/deal/:workspaceId',
  '/mobile-demo/commercial-lead/:workspaceId',
  '/mobile-demo/listing/:workspaceId',
]) {
  assert.ok(appSource.includes(`path="${route}"`), `App route table should declare public demo route ${route}`)
}

assert.ok(appSource.includes('MobileDemoLayout'), 'App route table should mount the public mobile demo layout before AuthGate')
assert.ok(demoLayoutSource.includes('data-mobile-demo-shell'), 'Mobile demo shell should expose a stable verification marker')
assert.ok(demoLayoutSource.includes('/mobile-demo/transaction/demo-transaction'), 'Mobile demo shell should keep bottom navigation inside public demo routes')
assert.ok(demoHomeSource.includes('data-mobile-demo-home'), 'Mobile demo home should expose a stable verification marker')
assert.ok(demoHomeSource.includes('Buyer') && demoHomeSource.includes('Seller'), 'Mobile demo home should make buyer and seller modes distinct')
assert.ok(demoHomeSource.includes('PropertyVisual'), 'Mobile demo home should include a visual transaction/property hero')
assert.ok(demoHomeSource.includes('buyer-docs') && demoHomeSource.includes('seller-offer'), 'Mobile demo home should expose role-specific quick actions')
assert.ok(demoHomeSource.includes('Buyer support room') && demoHomeSource.includes('Seller command room'), 'Mobile demo home should expose role-specific support room language')
assert.ok(mobileSearchSource.includes('routePrefix = \'/mobile\''), 'Mobile search should preserve protected mobile routing by default')
assert.ok(mobileSearchSource.includes("replace(/^\\/mobile(?=\\/|$)/, '/mobile-demo')"), 'Mobile search should rewrite results for public demo routing')

const markerComponentPairs = [
  ['data-phase5-field-mode', 'MobileFieldModePanel'],
]

for (const [marker, componentName] of markerComponentPairs) {
  assert.ok(productivitySource.includes(marker), `MobileProductivity should expose ${marker}`)
  assert.ok(workspacePageSource.includes(componentName), `Mobile workspace should wire ${componentName}`)
}

for (const marker of ['data-phase6-command-brief', 'data-phase7-live-room', 'data-phase8-handoff-review']) {
  assert.ok(productivitySource.includes(marker), `MobileProductivity should preserve ${marker} on compact insight cards`)
}

assert.ok(productivitySource.includes('data-mobile-compact-insights'), 'MobileProductivity should expose compact workspace insight cards')
assert.ok(productivitySource.includes('MobileWorkspaceInsightCards'), 'MobileProductivity should export compact workspace insight cards')
assert.ok(workspacePageSource.includes('MobileWorkspaceInsightCards'), 'Mobile workspace should use compact insight cards instead of full panels')
assert.ok(workspacePageSource.includes('data-mobile-visual-context'), 'Mobile workspace should expose visual context cards')
assert.ok(workspacePageSource.includes('data-mobile-transaction-card'), 'Mobile workspace should expose a visual transaction card')
assert.ok(workspacePageSource.includes('data-mobile-property-card'), 'Mobile workspace should expose a visual property card')
assert.ok(workspacePageSource.includes('data-mobile-media-card'), 'Mobile workspace should expose a visual media card')
assert.ok(!workspacePageSource.includes('MobileCommandBriefPanel'), 'Mobile workspace should not render the full Command Brief panel')
assert.ok(!workspacePageSource.includes('MobileLiveRoomPanel'), 'Mobile workspace should not render the full Live Room panel')
assert.ok(!workspacePageSource.includes('MobileHandoffReviewPanel'), 'Mobile workspace should not render the full Handoff panel')

assert.ok(bottomNavSource.includes("item.key === 'create'"), 'Create nav item should be intercepted by the bottom nav')
assert.ok(bottomNavSource.includes('setCreateOpen(true)'), 'Create nav item should open the quick action sheet')

console.log('mobile productivity Phase 9 wiring tests passed')
