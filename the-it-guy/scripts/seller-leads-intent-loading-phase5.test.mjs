import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { build } from 'esbuild'

const root = resolve(import.meta.dirname, '..')
const loader = readFileSync(resolve(root, 'src/pages/agency/agencyLeadWorkspaceLoader.js'), 'utf8')
const route = readFileSync(resolve(root, 'src/pages/agency/AgencyLeadWorkspaceRoutePage.jsx'), 'utf8')
const listRoute = readFileSync(resolve(root, 'src/pages/agency/AgencyLeadListRoutePage.jsx'), 'utf8')
const listPage = readFileSync(resolve(root, 'src/pages/agency/LeadListPage.jsx'), 'utf8')

assert.match(loader, /let workspaceModulePromise = null/)
assert.match(loader, /workspaceModulePromise = import\('\.\/AgencyPipelinePage'\)/)
assert.match(loader, /workspaceModulePromise = null[\s\S]{0,40}throw error/)
assert.match(loader, /export function preloadAgencyLeadWorkspace/)
assert.match(loader, /loadAgencyLeadWorkspace\(\)\.catch\(\(\) => null\)/)
assert.match(route, /const AgencyPipelinePage = lazy\(loadAgencyLeadWorkspace\)/)
assert.match(route, /<Suspense fallback=\{<AgencyLeadWorkspaceShellPage loadingTab=\{activeTab !== 'overview'\} \/>\}>/)
assert.doesNotMatch(route, /import AgencyPipelinePage from/, 'the route entry must not statically import the heavy controller')
assert.match(listRoute, /onLeadIntent=\{handleLeadIntent\}/)
assert.match(listRoute, /preloadAgencyLeadCoreRecord\(organisationId, leadId\)/)
assert.match(listPage, /onPointerEnter=\{\(\) => onLeadIntent\(row\.id\)\}/)
assert.match(listPage, /onPointerDown=\{\(\) => onLeadIntent\(row\.id\)\}/)

const bundle = await build({
  entryPoints: [
    resolve(root, 'src/pages/agency/AgencyLeadListRoutePage.jsx'),
    resolve(root, 'src/pages/agency/AgencyLeadWorkspaceRoutePage.jsx'),
  ],
  bundle: true,
  splitting: true,
  write: false,
  metafile: true,
  outdir: resolve(root, '.phase5-bundle-check'),
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

const outputs = Object.values(bundle.metafile.outputs)
const listEntry = outputs.find((output) => output.entryPoint?.endsWith('AgencyLeadListRoutePage.jsx'))
const workspaceEntry = outputs.find((output) => output.entryPoint?.endsWith('AgencyLeadWorkspaceRoutePage.jsx'))
const deferredController = outputs.find((output) => Object.keys(output.inputs).some((file) => file.endsWith('AgencyPipelinePage.jsx')))

assert.ok(listEntry, 'the lead list entry chunk should exist')
assert.ok(workspaceEntry, 'the workspace shell entry chunk should exist')
assert.ok(deferredController, 'the agency controller should exist as a deferred chunk')
assert.equal(Object.keys(listEntry.inputs).some((file) => file.endsWith('AgencyPipelinePage.jsx')), false)
assert.equal(Object.keys(workspaceEntry.inputs).some((file) => file.endsWith('AgencyPipelinePage.jsx')), false)
assert.notEqual(deferredController, listEntry)
assert.notEqual(deferredController, workspaceEntry)

console.log('seller leads intent loading phase 5 checks passed (heavy workspace controller deferred)')
