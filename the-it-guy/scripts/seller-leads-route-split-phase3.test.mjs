import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { build } from 'esbuild'

const root = resolve(import.meta.dirname, '..')
const app = readFileSync(resolve(root, 'src/App.jsx'), 'utf8')
const route = readFileSync(resolve(root, 'src/pages/agency/AgencyLeadListRoutePage.jsx'), 'utf8')
const model = readFileSync(resolve(root, 'src/pages/agency/agencyLeadListModel.js'), 'utf8')

assert.match(app, /const AgencyLeadListRoutePage = lazy\(loadAgencyLeadListRouteModule\)/)
const listRouteStart = app.indexOf('path="/pipeline/leads"')
const legalRouteStart = app.indexOf('path="/pipeline/leads/:leadId/legal/:packetType"', listRouteStart)
const listRoute = app.slice(listRouteStart, legalRouteStart)
assert.match(listRoute, /<AgencyLeadListRoutePage \/>/, 'the exact list route should use the lean route entry')
assert.doesNotMatch(listRoute, /<Pipeline/, 'the exact list route must not load the legacy pipeline controller')
const detailRouteStart = app.indexOf('path="/pipeline/leads/:leadId"', legalRouteStart)
const enquiriesRouteStart = app.indexOf('path="/pipeline/enquiries"', detailRouteStart)
const detailRoute = app.slice(detailRouteStart, enquiriesRouteStart)
assert.match(detailRoute, /<AgencyLeadWorkspaceRoutePage \/>/, 'lead details should retain the mature workspace through its dedicated entry')

assert.match(route, /listAgencyLeadListRecords\(workspaceId, \{ includeRelatedRecords: false, forceRefresh \}\)/)
assert.match(route, /listAgencyLeadListRecords\(workspaceId, \{ includePrimaryRecords: false, includeRelatedRecords: true \}\)/)
assert.ok(
  route.indexOf('includeRelatedRecords: false') < route.indexOf('includePrimaryRecords: false, includeRelatedRecords: true'),
  'primary lead rows must be requested before background enrichment',
)
assert.match(route, /<LeadListPage/)
assert.match(route, /createAgencyCrmLeadRecord/)
assert.match(route, /updateAgencyCrmLeadRecord/)
assert.match(route, /deleteAgencyCrmLeadRecord/)
assert.match(route, /checkpoint: 'first_data'/)
assert.match(route, /checkpoint: 'background_settled'/)

assert.match(model, /export function buildAgencyLeadListModel/)
assert.match(model, /export function buildAgencyLeadListSummary/)
assert.match(model, /export const LEAD_LIST_PAGE_SIZE = 12/)

const bundle = await build({
  entryPoints: [resolve(root, 'src/pages/agency/AgencyLeadListRoutePage.jsx')],
  bundle: true,
  splitting: true,
  write: false,
  metafile: true,
  outdir: resolve(root, '.phase3-bundle-check'),
  format: 'esm',
  platform: 'browser',
  jsx: 'automatic',
  define: {
    'import.meta.env.PROD': 'true',
    'import.meta.env.DEV': 'false',
    'import.meta.env.MODE': '"production"',
    'import.meta.env.VITE_SUPABASE_URL': '""',
    'import.meta.env.VITE_SUPABASE_ANON_KEY': '""',
  },
  external: ['react', 'react/jsx-runtime', 'react-router-dom'],
})
const bundleInputs = Object.keys(bundle.metafile.inputs)
const entryOutput = Object.values(bundle.metafile.outputs).find((output) => output.entryPoint?.endsWith('AgencyLeadListRoutePage.jsx'))
assert.ok(entryOutput, 'the lead list entry output should be present')
assert.equal(
  Object.keys(entryOutput.inputs).some((file) => file.endsWith('AgencyPipelinePage.jsx') || file.endsWith('/Pipeline.jsx')),
  false,
  'the initial list chunk must exclude the legacy pipeline controller',
)

console.log(`seller leads route split phase 3 checks passed (${bundleInputs.length} graph inputs, no legacy controller in the initial chunk)`)
