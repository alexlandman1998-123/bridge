import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const controller = readFileSync(resolve(root, 'src/pages/agency/AgencyPipelinePage.jsx'), 'utf8')
const baseline = readFileSync(resolve(root, 'src/services/observability/buyerLeadsPerformanceBaseline.js'), 'utf8')
const performanceMetrics = readFileSync(resolve(root, 'src/services/observability/performanceMetrics.js'), 'utf8')
const packageJson = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))

assert.match(controller, /createBuyerLeadsPerformanceBaseline/)
assert.match(controller, /buyerLeadsPerformanceBaselineRef/)
assert.match(controller, /const recordBuyerLeadsPerformance = useCallback/)
assert.match(
  controller,
  /const category = resolveLeadCategoryView\(selectedLead\)[\s\S]{0,320}if \(category === 'seller'\) \{[\s\S]{0,160}recordSellerLeadsPerformance\('workspace_ready'/,
)
assert.match(controller, /recordBuyerLeadsPerformance\('workspace_ready'/)

assert.match(baseline, /buyer_leads\.workspace\.ready/)
assert.match(baseline, /duplicateSupabaseRequestCount/)
assert.match(baseline, /inactiveSpecialistRequestCount/)
assert.match(baseline, /specialistRequestCounts/)
assert.match(baseline, /arch9-buyer-leads-performance-baseline-v2/)
assert.match(performanceMetrics, /'buyer_leads\.workspace\.ready': 2500/)

assert.match(
  packageJson.scripts['verify:buyer-leads-performance'],
  /^npm run test:buyer-leads-performance-phase1(?: && |$)/,
)

console.log('buyer leads Phase 1 performance wiring checks passed')
