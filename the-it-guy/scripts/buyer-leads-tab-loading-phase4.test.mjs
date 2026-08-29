import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { build } from 'esbuild'

const root = resolve(import.meta.dirname, '..')
const pipeline = readFileSync(resolve(root, 'src/pages/agency/AgencyPipelinePage.jsx'), 'utf8')
const loader = readFileSync(resolve(root, 'src/pages/agency/agencyLeadWorkspaceTabLoader.js'), 'utf8')
const packageJson = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))

assert.match(loader, /let buyerAppointmentsWorkspacePromise = null/)
assert.match(loader, /export function loadBuyerAppointmentsWorkspace/)
assert.match(loader, /import\('\.\.\/\.\.\/components\/appointments\/BuyerLeadAppointmentsWorkspace'\)/)
assert.match(loader, /tabKey === 'appointments' && !seller/)
assert.match(pipeline, /const BuyerLeadAppointmentsWorkspace = lazy\(loadBuyerAppointmentsWorkspace\)/)
assert.match(pipeline, /onPointerEnter=\{\(\) => void preloadAgencyLeadWorkspaceTab\(tab\.key\)\}/)
assert.match(pipeline, /buyerWorkspaceTab === BUYER_ONBOARDING_OTP_WORKSPACE_TAB_KEY/)

const offersRequest = pipeline.indexOf('loadBuyerOfferWorkspaceData({')
const offersGate = pipeline.lastIndexOf('buyerWorkspaceTab === BUYER_ONBOARDING_OTP_WORKSPACE_TAB_KEY', offersRequest)
assert.ok(offersGate !== -1 && offersGate < offersRequest, 'offer requests must wait for the setup tab')

const bundle = await build({
  entryPoints: [resolve(root, 'src/pages/agency/AgencyPipelinePage.jsx')],
  bundle: true,
  splitting: true,
  write: false,
  metafile: true,
  outdir: resolve(root, '.buyer-phase4-bundle-check'),
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
const buyerAppointmentsChunk = outputs.find((output) => Object.keys(output.inputs).some((file) => file.endsWith('BuyerLeadAppointmentsWorkspace.jsx')))
assert.ok(controllerEntry)
assert.ok(buyerAppointmentsChunk, 'buyer appointments should have a deferred chunk')
assert.equal(Object.keys(controllerEntry.inputs).some((file) => file.endsWith('BuyerLeadAppointmentsWorkspace.jsx')), false)
assert.notEqual(buyerAppointmentsChunk, controllerEntry)

assert.match(
  packageJson.scripts['verify:buyer-leads-performance'],
  /^npm run test:buyer-leads-performance-phase1 && npm run test:buyer-leads-category-requests-phase2 && npm run test:buyer-leads-workspace-loader-phase3 && npm run test:buyer-leads-tab-loading-phase4(?: && |$)/,
)

console.log('buyer leads Phase 4 tab loading checks passed (appointments deferred and offers tab-gated)')
