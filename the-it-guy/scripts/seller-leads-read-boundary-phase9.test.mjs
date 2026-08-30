import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const root = resolve(import.meta.dirname, '..')
const packageJson = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))
const routeSource = readFileSync(resolve(root, 'src/pages/agency/AgencyLeadListRoutePage.jsx'), 'utf8')
const readRepository = readFileSync(resolve(root, 'src/pages/agency/agencyLeadListReadRepository.js'), 'utf8')

assert.match(routeSource, /listAgencyLeadListRecords,[\s\S]*?from '\.\/agencyLeadListReadRepository'/)
assert.doesNotMatch(
  routeSource,
  /from '\.\.\/\.\.\/lib\/agencyCrmRepository'/,
  'the broad CRM repository must not be part of the lead-list static graph',
)
assert.match(routeSource, /leadMutationActionsPromise = import\('\.\.\/\.\.\/lib\/agencyCrmRepository'\)/)
assert.match(routeSource, /leadMutationActionsPromise = null[\s\S]{0,40}throw error/)
assert.match(routeSource, /await loadLeadMutationActions\(\)/)
assert.match(routeSource, /includeRelatedRecords: false,[\s\S]*?pageSize: LEAD_LIST_PAGE_SIZE/)
assert.doesNotMatch(routeSource, /includePrimaryRecords: false, includeRelatedRecords: true/)

assert.match(readRepository, /export async function listAgencyLeadListRecords/)
assert.match(readRepository, /selectCompatibleLeads/)
assert.match(readRepository, /LEAD_FIELDS_ASSIGNMENT/)
assert.match(readRepository, /LEGACY_LEAD_FIELDS/)
assert.match(readRepository, /Promise\.all\(requests\)/)
assert.match(readRepository, /query = query\.range\(from, from \+ pageSize - 1\)/)
assert.match(readRepository, /\.in\('contact_id', contactIds\)/)
assert.doesNotMatch(readRepository, /agencyPipelineService/)
assert.doesNotMatch(readRepository, /buyerProcessMigrationService/)
assert.doesNotMatch(readRepository, /workspaceResolutionService/)

const verification = spawnSync(process.execPath, ['scripts/seller-leads-performance-budget.mjs'], {
  cwd: root,
  encoding: 'utf8',
})
assert.equal(verification.status, 0, verification.stderr || verification.stdout)
const report = JSON.parse(verification.stdout)
const leadList = report.routes.find((route) => route.entry === 'AgencyLeadListRoutePage.jsx')
assert.ok(leadList)
assert.ok(leadList.rawBytes <= 500_000, `lead list raw closure regressed to ${leadList.rawBytes} bytes`)
assert.ok(leadList.gzipBytes <= 130_000, `lead list gzip closure regressed to ${leadList.gzipBytes} bytes`)

assert.match(
  packageJson.scripts['verify:seller-leads-performance'],
  /test:seller-leads-release-gate-phase8[\s\S]*test:seller-leads-read-boundary-phase9/,
)

console.log('seller leads Phase 9 read boundary passed (lean list reads and deferred mutations remain enforced)')
