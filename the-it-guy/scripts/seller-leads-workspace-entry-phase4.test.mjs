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
assert.match(route, /fallback=\{<LeadWorkspaceRouteLoadingShell loadStage="workspace_chunk_loading" \/>\}/)
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

// Inspect what opening a workspace actually downloads, following static imports
// while leaving user-opened dialogs and tools behind their dynamic boundaries.
const controller = Object.entries(bundle.metafile.outputs).find(([, output]) => output.entryPoint?.endsWith('AgencyPipelinePage.jsx'))
assert.ok(controller, 'workspace controller should retain its own chunk')
const initialInputs = new Set()
const visited = new Set()
function visit(file) {
  const key = bundle.metafile.outputs[file] ? file : Object.keys(bundle.metafile.outputs).find(key => resolve(root, key) === resolve(root, file))
  if (!key || visited.has(key)) return
  visited.add(key)
  const output = bundle.metafile.outputs[key]
  Object.keys(output.inputs).forEach(input => initialInputs.add(input))
  output.imports.filter(item => item.kind === 'import-statement' && !item.external).forEach(item => visit(item.path))
}
visit(controller[0])
for (const component of ['WorkspaceCalendar', 'DocumentRequirementManager', 'SellerMandateDetailsEditor', 'BuyerQualificationDialog']) {
  assert.equal([...initialInputs].some(file => file.endsWith(`/${component}.jsx`)), false, `${component} must load only when opened`)
}
assert.equal([...initialInputs].some(file => file.endsWith('/privateListingService.js')), false,
  'listing actions and matching must not pull the full listing service into the opening workspace')

console.log(`seller leads workspace entry phase 4 checks passed (${bundleInputs.length} bundle inputs, no legacy Pipeline module)`)
