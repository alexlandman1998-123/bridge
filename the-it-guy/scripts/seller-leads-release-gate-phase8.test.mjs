import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const root = resolve(import.meta.dirname, '..')
const packageJson = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))
const budgetSource = readFileSync(resolve(root, 'scripts/seller-leads-performance-budget.mjs'), 'utf8')
const workspaceLoader = readFileSync(resolve(root, 'src/pages/agency/agencyLeadWorkspaceLoader.js'), 'utf8')

assert.match(budgetSource, /AgencyLeadListRoutePage\.jsx/)
assert.match(budgetSource, /AgencyLeadWorkspaceRoutePage\.jsx/)
assert.match(budgetSource, /getStaticClosure/)
assert.match(budgetSource, /item\.kind === 'import-statement'/)
assert.match(budgetSource, /AgencyPipelinePage\.jsx/)
assert.match(budgetSource, /Pipeline\.jsx/)
assert.match(budgetSource, /arch9-seller-leads-route-budget-v2/)
assert.match(workspaceLoader, /workspaceModulePromise = import\('\.\/AgencyPipelinePage'\)/)

assert.equal(
  packageJson.scripts['verify:seller-leads-bundle-budget'],
  'node scripts/seller-leads-performance-budget.mjs',
)
assert.match(
  packageJson.scripts['verify:seller-leads-performance'],
  /test:seller-leads-performance-phase1[\s\S]*test:seller-leads-release-gate-phase8/,
)

const verification = spawnSync(process.execPath, ['scripts/seller-leads-performance-budget.mjs'], {
  cwd: root,
  encoding: 'utf8',
})
assert.equal(verification.status, 0, verification.stderr || verification.stdout)
const report = JSON.parse(verification.stdout)
assert.equal(report.status, 'within_budget')
assert.equal(report.contract, 'arch9-seller-leads-route-budget-v2')
assert.deepEqual(
  report.routes.map((route) => route.entry),
  ['AgencyLeadListRoutePage.jsx', 'AgencyLeadWorkspaceRoutePage.jsx'],
)
report.routes.forEach((route) => {
  assert.ok(route.rawBytes <= route.rawBudgetBytes)
  assert.ok(route.gzipBytes <= route.gzipBudgetBytes)
})

console.log('seller leads Phase 8 release gate passed (dedicated route closures remain within budget)')
