import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs/promises'

const appRoot = new URL('..', import.meta.url)
const plan = JSON.parse(await fs.readFile(new URL('../config/domain-api-split-phase8-repeat-plan.json', import.meta.url), 'utf8'))
const packageJson = JSON.parse(await fs.readFile(new URL('../package.json', import.meta.url), 'utf8'))
const chunkAuditSource = await fs.readFile(new URL('../scripts/domain-api-chunk-audit.mjs', import.meta.url), 'utf8')
const importInventorySource = await fs.readFile(new URL('../scripts/domain-import-inventory.mjs', import.meta.url), 'utf8')
const runbook = await fs.readFile(new URL('../docs/domain-api-split-phase8-repeat.md', import.meta.url), 'utf8')

const expectedDomainOrder = [
  'agent-listing-detail',
  'client-portal',
  'unit-detail',
  'attorney-transaction-detail',
  'pipeline',
]
const requiredPhases = [
  'domain_baseline',
  'import_inventory',
  'read_only_facade',
  'lazy_user_actions',
  'parity_tests',
  'domain_audit_gate',
  'staged_rollout',
]

assert.equal(plan.contract, 'domain-api-split-phase8-repeat-plan-v1')
assert.equal(plan.completedPilotDomain, 'agent-listing-detail')
assert.deepEqual(plan.requiredPhaseSequence, requiredPhases)
assert.equal(plan.globalRules?.repeatOneDomainAtATime, true)
assert.equal(plan.globalRules?.dashboardMustRemainEnforced, true)
assert.equal(plan.globalRules?.queuedDomainsRemainReportOnly, true)
assert.equal(plan.globalRules?.strictPreloadReferenceRequiredBeforeGlobalEnforceClean, true)

assert.equal(
  packageJson.scripts?.['test:domain-api-split-phase8-repeat'],
  'node scripts/domain-api-split-phase8-repeat.test.mjs',
  'package.json should expose the Phase 8 repeat gate.',
)

const domains = [...plan.domains].sort((left, right) => Number(left.order) - Number(right.order))
assert.deepEqual(domains.map((domain) => domain.key), expectedDomainOrder)

for (const domain of domains) {
  assert.ok(domain.label, `${domain.key} should have a label.`)
  assert.ok(domain.entry, `${domain.key} should have an entry path.`)
  assert.ok(Array.isArray(domain.roles) && domain.roles.length > 0, `${domain.key} should have roles.`)
  assert.ok(await fileExists(new URL(`../${domain.entry}`, import.meta.url)), `${domain.key} entry should exist.`)
  assert.match(chunkAuditSource, new RegExp(`key: '${escapeRegex(domain.key)}'`), `${domain.key} should be covered by domain-api-chunk-audit.`)
  assert.match(importInventorySource, new RegExp(`key: '${escapeRegex(domain.key)}'`), `${domain.key} should be covered by domain-import-inventory.`)
}

for (const domain of domains.filter((item) => item.status === 'queued')) {
  assert.ok(domain.risk, `${domain.key} should document risk before repeat work starts.`)
  assert.ok(Array.isArray(domain.firstFacadeBoundary) && domain.firstFacadeBoundary.length >= 3, `${domain.key} should define a read-only facade boundary.`)
  assert.ok(Array.isArray(domain.deferUntilLazyActionPhase) && domain.deferUntilLazyActionPhase.length >= 4, `${domain.key} should define deferred lazy-action work.`)
  assert.match(
    chunkAuditSource,
    new RegExp(`key: '${escapeRegex(domain.key)}'[\\s\\S]*?enforceClean: false`),
    `${domain.key} should remain report-only until its strict gate passes.`,
  )
}

const pilot = domains.find((domain) => domain.key === plan.completedPilotDomain)
assert.equal(pilot.status, 'staged_rollout_ready')
assert.deepEqual(
  requiredPhases.map((phase) => pilot.phaseState?.[phase]),
  ['complete', 'complete', 'complete', 'complete', 'complete', 'complete', 'ready'],
  'Agent Listing Detail should remain the completed pilot pattern for repeat domains.',
)

for (const command of [
  'npm run build',
  'node scripts/domain-import-inventory.mjs --domain <domain>',
  'node scripts/domain-api-chunk-audit.mjs --domain <domain> --enforce --max-api-gzip-kb 1',
  'node scripts/domain-api-chunk-audit.mjs --domain <domain> --enforce --max-api-gzip-kb 1 --enforce-preload-references',
]) {
  assert.ok(plan.requiredCommandsPerDomain.includes(command), `Repeat plan should include command: ${command}`)
}

assert.match(runbook, /Domain API Split Phase 8: Repeat/)
assert.match(runbook, /one domain at a time/i)
assert.match(runbook, /Client Portal/)
assert.match(runbook, /Unit Detail/)
assert.match(runbook, /Attorney Transaction Detail/)
assert.match(runbook, /Pipeline/)
assert.match(runbook, /strict preload-reference audit/)

const importInventoryReport = runJsonScript('scripts/domain-import-inventory.mjs', ['--json'])
const inventoryDomains = new Set(importInventoryReport.domains.map((domain) => domain.key))
for (const domainKey of expectedDomainOrder) {
  assert.ok(inventoryDomains.has(domainKey), `${domainKey} should be present in live import inventory output.`)
}

const chunkAuditReport = runJsonScript('scripts/domain-api-chunk-audit.mjs', ['--json'])
const chunkDomains = new Set(chunkAuditReport.domains.map((domain) => domain.key))
for (const domainKey of ['dashboard', ...expectedDomainOrder]) {
  assert.ok(chunkDomains.has(domainKey), `${domainKey} should be present in live chunk audit output.`)
}

assert.equal(
  chunkAuditReport.domains.find((domain) => domain.key === 'dashboard')?.enforceClean,
  true,
  'Dashboard must stay globally enforced while repeat domains are split.',
)
for (const domainKey of expectedDomainOrder) {
  assert.equal(
    chunkAuditReport.domains.find((domain) => domain.key === domainKey)?.enforceClean,
    false,
    `${domainKey} should remain report-only in the global chunk audit until strict promotion criteria pass.`,
  )
}

console.log('domain API split Phase 8 repeat gate passed')

function runJsonScript(scriptPath, args = []) {
  const output = execFileSync(process.execPath, [scriptPath, ...args], {
    cwd: appRoot,
    stdio: 'pipe',
    encoding: 'utf8',
    maxBuffer: 4 * 1024 * 1024,
  })
  return JSON.parse(output)
}

async function fileExists(fileUrl) {
  try {
    await fs.access(fileUrl)
    return true
  } catch {
    return false
  }
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
