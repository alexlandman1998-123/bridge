import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const [packageJsonSource, browserSmoke, gateSource, loadingShell] = await Promise.all([
  readFile(new URL('../package.json', import.meta.url), 'utf8'),
  readFile(new URL('./agency-lead-workspace-hydration-smoke.mjs', import.meta.url), 'utf8'),
  readFile(new URL('../src/services/observability/leadWorkspaceReleaseGate.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/pages/agency/LeadWorkspaceLoadingShell.jsx', import.meta.url), 'utf8'),
])
const packageJson = JSON.parse(packageJsonSource)

assert.match(gateSource, /arch9-lead-workspace-release-gate-v1/)
assert.match(gateSource, /ONE_VISUAL_LOADING_SHELL/)
assert.match(gateSource, /NO_TERMINAL_EMPTY_STATE_FLASH/)
assert.match(gateSource, /NO_SELLER_AS_BUYER_FLASH/)
assert.match(gateSource, /ROUTE_BUNDLES_WITHIN_BUDGET/)
assert.match(browserSmoke, /visualShellVariants/)
assert.match(browserSmoke, /sellerMisclassificationViolations/)
assert.match(browserSmoke, /maxShellHeightDeltaPx/)
assert.match(browserSmoke, /evaluateLeadWorkspaceReleaseGate/)
assert.match(loadingShell, /min-h-\[620px\] w-full min-w-0/)
assert.equal(
  packageJson.scripts['verify:lead-workspace-release-gate-phase5:browser'],
  'LEAD_WORKSPACE_PHASE5_RELEASE_GATE=1 node scripts/agency-lead-workspace-hydration-smoke.mjs',
)
assert.match(packageJson.scripts['verify:lead-workspace-loading'], /test:lead-workspace-loading-observability-phase1/)
assert.match(packageJson.scripts['verify:lead-workspace-loading'], /verify:seller-leads-bundle-budget/)
assert.match(
  packageJson.scripts['verify:lead-workspace-loading'],
  /verify:lead-workspace-(?:release-gate-phase5|operational-monitoring-phase6):browser/,
)

console.log('lead workspace release gate phase 5 checks passed')
