import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { build } from 'esbuild'

const root = resolve(import.meta.dirname, '..')
const app = readFileSync(resolve(root, 'src/App.jsx'), 'utf8')
const route = readFileSync(resolve(root, 'src/pages/agency/AgencyLeadWorkspaceRoutePage.jsx'), 'utf8')
const loader = readFileSync(resolve(root, 'src/pages/agency/agencyLeadWorkspaceLoader.js'), 'utf8')
const performanceBaseline = readFileSync(resolve(root, 'src/services/observability/sellerLeadsPerformanceBaseline.js'), 'utf8')

assert.match(app, /const AgencyLeadWorkspaceRoutePage = lazy\(loadAgencyLeadWorkspaceRouteModule\)/)
const detailRouteStart = app.indexOf('path="/pipeline/leads/:leadId"')
const enquiriesRouteStart = app.indexOf('path="/pipeline/enquiries"', detailRouteStart)
const detailRoute = app.slice(detailRouteStart, enquiriesRouteStart)
assert.match(detailRoute, /<AgencyLeadWorkspaceRoutePage \/>/)
assert.doesNotMatch(detailRoute, /<Pipeline/, 'lead details should bypass the legacy Pipeline compatibility module')

assert.match(route, /const AgencyPipelinePage = lazy\(loadAgencyLeadWorkspace\)/)
assert.doesNotMatch(route, /if \(activeTab === 'overview'\) return <AgencyLeadWorkspaceShellPage \/>/)
assert.match(route, /fallback=\{<LeadWorkspaceHydrationShell search=\{location\.search\} \/>\}/)
assert.doesNotMatch(route, /AgencyLeadWorkspaceShellPage/, 'lead route loading must not flash the dark cached preview')
assert.match(loader, /import\('\.\/AgencyPipelinePage'\)/)
assert.match(route, /key=\{`lead-workspace:\$\{location\.pathname\}`\}/)
assert.match(route, /initialViewMode="leads"/)
assert.match(
  performanceBaseline,
  /AgencyLeadWorkspaceRoutePage/,
  'performance telemetry should recognise the dedicated workspace chunk',
)

const bundle = await build({
  entryPoints: [resolve(root, 'src/pages/agency/AgencyLeadWorkspaceRoutePage.jsx')],
  bundle: true,
  splitting: true,
  write: false,
  metafile: true,
  outdir: resolve(root, '.phase4-bundle-check'),
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
assert.ok(bundleInputs.some((file) => file.endsWith('AgencyPipelinePage.jsx')), 'workspace bundle should retain the mature agency controller')
assert.equal(bundleInputs.some((file) => file.endsWith('/Pipeline.jsx')), false, 'workspace bundle must exclude the legacy Pipeline module')

console.log(`seller leads workspace entry phase 4 checks passed (${bundleInputs.length} bundle inputs, no legacy Pipeline module)`)
