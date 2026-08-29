import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const controller = readFileSync(resolve(root, 'src/pages/agency/AgencyPipelinePage.jsx'), 'utf8')
const loader = readFileSync(resolve(root, 'src/pages/agency/buyerLeadWorkspaceDataLoader.js'), 'utf8')
const packageJson = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))

assert.match(loader, /const pendingLoads = new Map\(\)/)
assert.match(loader, /const completedLoads = new Map\(\)/)
assert.match(loader, /inferLeadCategoryFromRecord\(lead\) === 'buyer'/)
assert.match(loader, /if \(pending\) return pending/)
assert.match(loader, /completedLoads\.set/)
assert.match(loader, /finally\(\(\) =>/)

assert.match(controller, /loadBuyerLeadWorkspaceData/)
assert.match(
  controller,
  /const fetchFullRouteLeadWorkspace = \(snapshot = null\) => \{[\s\S]*routeLeadCategory === 'buyer'[\s\S]*loadBuyerLeadWorkspaceData/,
)
assert.match(controller, /hydrateFullLeadWorkspaceInBackground\('route_record_followup', routeRecordSnapshot\)/)
assert.match(controller, /hydrateFullLeadWorkspaceInBackground\('route_seed_followup', seedSnapshot\)/)

assert.match(
  packageJson.scripts['verify:buyer-leads-performance'],
  /^npm run test:buyer-leads-performance-phase1 && npm run test:buyer-leads-category-requests-phase2 && npm run test:buyer-leads-workspace-loader-phase3(?: && |$)/,
)

console.log('buyer leads Phase 3 workspace loader checks passed')
