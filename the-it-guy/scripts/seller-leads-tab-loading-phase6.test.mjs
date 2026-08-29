import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { build } from 'esbuild'

const root = resolve(import.meta.dirname, '..')
const pipeline = readFileSync(resolve(root, 'src/pages/agency/AgencyPipelinePage.jsx'), 'utf8')
const loader = readFileSync(resolve(root, 'src/pages/agency/agencyLeadWorkspaceTabLoader.js'), 'utf8')

assert.match(loader, /let activityWorkspacePromise = null/)
assert.match(loader, /let sellerAppointmentsWorkspacePromise = null/)
assert.match(loader, /import\('\.\.\/\.\.\/components\/lead-activity\/LeadActivityWorkspace'\)/)
assert.match(loader, /import\('\.\.\/\.\.\/components\/appointments\/KingstonsSellerAppointmentsWorkspace'\)/)
assert.match(loader, /if \(tabKey === 'activity'\)/)
assert.match(loader, /if \(tabKey === 'appointments' && seller\)/)
assert.match(pipeline, /const LeadActivityWorkspace = lazy\(loadLeadActivityWorkspace\)/)
assert.match(pipeline, /const KingstonsSellerAppointmentsWorkspace = lazy\(loadSellerAppointmentsWorkspace\)/)
assert.doesNotMatch(pipeline, /lazy\(\(\) => import\('\.\.\/\.\.\/components\/lead-activity\/LeadActivityWorkspace'\)\)/)
assert.match(pipeline, /onPointerEnter=\{\(\) => void preloadAgencyLeadWorkspaceTab\(tab\.key, \{ seller: true \}\)\}/)
assert.match(pipeline, /onFocus=\{\(\) => void preloadAgencyLeadWorkspaceTab\(tab\.key\)\}/)

const bundle = await build({
  entryPoints: [resolve(root, 'src/pages/agency/AgencyPipelinePage.jsx')],
  bundle: true,
  splitting: true,
  write: false,
  metafile: true,
  outdir: resolve(root, '.phase6-bundle-check'),
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
const controllerEntry = outputs.find((output) => output.entryPoint?.endsWith('AgencyPipelinePage.jsx'))
const activityChunk = outputs.find((output) => Object.keys(output.inputs).some((file) => file.endsWith('LeadActivityWorkspace.jsx')))
const appointmentsChunk = outputs.find((output) => Object.keys(output.inputs).some((file) => file.endsWith('KingstonsSellerAppointmentsWorkspace.jsx')))

assert.ok(controllerEntry, 'the agency controller entry should exist')
assert.ok(activityChunk, 'the deferred activity chunk should exist')
assert.ok(appointmentsChunk, 'the deferred seller appointments chunk should exist')
assert.equal(Object.keys(controllerEntry.inputs).some((file) => file.endsWith('LeadActivityWorkspace.jsx')), false)
assert.equal(Object.keys(controllerEntry.inputs).some((file) => file.endsWith('KingstonsSellerAppointmentsWorkspace.jsx')), false)
assert.notEqual(activityChunk, controllerEntry)
assert.notEqual(appointmentsChunk, controllerEntry)

console.log('seller leads tab loading phase 6 checks passed (specialist tabs deferred and intent-prefetched)')
