import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs/promises'

const DOMAIN_KEY = 'agent-listing-detail'
const DOMAIN_LABEL = 'Agent Listing Detail'
const MAX_API_GZIP_KB = '1'

const packageJson = JSON.parse(await fs.readFile(new URL('../package.json', import.meta.url), 'utf8'))
const phase6Doc = await fs.readFile(new URL('../docs/domain-api-split-phase6-domain-audit-gate.md', import.meta.url), 'utf8')

assert.equal(
  packageJson.scripts?.['test:domain-api-split-phase6-gate'],
  'node scripts/domain-api-split-phase6-gate.test.mjs',
  'package.json should expose the Phase 6 domain audit gate.',
)

assert.match(phase6Doc, /Domain API Split Phase 6: Domain Audit Gate/, 'Phase 6 documentation should name the gate.')
assert.match(phase6Doc, /agent-listing-detail/, 'Phase 6 documentation should bind the gate to Agent Listing Detail.')

runNodeScript('scripts/domain-api-split-phase5-parity.test.mjs')

const importInventory = runJsonScript('scripts/domain-import-inventory.mjs', [
  '--domain',
  DOMAIN_KEY,
  '--json',
])
const inventoryDomain = onlyDomain(importInventory, DOMAIN_KEY)

assert.equal(inventoryDomain.trackedImportCount, 0, `${DOMAIN_LABEL} should have zero tracked heavy static imports.`)
assert.equal(inventoryDomain.directTrackedImports.length, 0, `${DOMAIN_LABEL} should have no direct tracked heavy imports.`)
assert.equal(inventoryDomain.transitiveTrackedImports.length, 0, `${DOMAIN_LABEL} should have no transitive tracked heavy imports.`)

const dynamicTrackedModules = new Set(
  inventoryDomain.trackedModuleSummary
    .filter((item) => item.dynamicImportCount > 0)
    .map((item) => item.modulePath),
)

for (const expectedLazyModule of [
  'src/lib/api.js',
  'src/services/privateListingService.js',
  'src/lib/agencyPipelineService.js',
]) {
  assert.ok(
    dynamicTrackedModules.has(expectedLazyModule),
    `${DOMAIN_LABEL} should retain ${expectedLazyModule} only as a lazy dependency.`,
  )
}

const chunkAudit = runJsonScript('scripts/domain-api-chunk-audit.mjs', [
  '--domain',
  DOMAIN_KEY,
  '--json',
  '--max-api-gzip-kb',
  MAX_API_GZIP_KB,
])
const chunkDomain = onlyDomain(chunkAudit, DOMAIN_KEY)

assert.equal(chunkDomain.missing, false, `${DOMAIN_LABEL} route chunk should exist in dist/assets. Run npm run build first if this fails.`)
assert.equal(chunkDomain.apiStaticDependencies.length, 0, `${DOMAIN_LABEL} should not statically import api-*.js.`)
assert.equal(chunkDomain.apiRouteDependencies.length, 0, `${DOMAIN_LABEL} static route graph should not include api-*.js.`)

for (const [budgetName, budget] of Object.entries(chunkDomain.budgetStatus || {})) {
  assert.equal(
    budget.pass,
    true,
    `${DOMAIN_LABEL} ${budgetName} budget should pass: ${formatBytes(budget.actualBytes)} / ${formatBytes(budget.limitBytes)}.`,
  )
}

assert.ok(
  Array.isArray(chunkDomain.apiPreloadReferences),
  `${DOMAIN_LABEL} chunk audit should report preload references separately from static dependencies.`,
)

const strictPreloadAudit = runJsonScript('scripts/domain-api-chunk-audit.mjs', [
  '--domain',
  DOMAIN_KEY,
  '--json',
  '--max-api-gzip-kb',
  MAX_API_GZIP_KB,
  '--enforce-preload-references',
])
const strictPreloadDomain = onlyDomain(strictPreloadAudit, DOMAIN_KEY)
const strictPreloadFailures = collectBudgetFailures(strictPreloadDomain)

assert.ok(
  strictPreloadFailures.length === 0 || strictPreloadFailures.some((failure) => failure.startsWith('apiRouteGzip ')),
  `${DOMAIN_LABEL} strict preload audit should only fail on the known lazy-service apiRouteGzip boundary.`,
)
assert.equal(
  strictPreloadDomain.apiStaticDependencies.length,
  0,
  `${DOMAIN_LABEL} strict preload audit should still report no static API dependencies.`,
)

console.log('domain API split Phase 6 domain audit gate passed')
console.log(`  domain: ${DOMAIN_KEY}`)
console.log(`  tracked heavy static imports: ${inventoryDomain.trackedImportCount}`)
console.log(`  static API route dependencies: ${chunkDomain.apiRouteDependencies.length}`)
console.log(`  entry gzip: ${formatBytes(chunkDomain.entryChunk.gzipBytes)}`)
console.log(`  static script gzip: ${formatBytes(chunkDomain.staticScriptGzipBytes)}`)
console.log(`  known preload API references: ${strictPreloadDomain.apiPreloadReferences.length}`)

function runNodeScript(scriptPath) {
  execFileSync(process.execPath, [scriptPath], {
    cwd: new URL('..', import.meta.url),
    stdio: 'pipe',
    encoding: 'utf8',
  })
}

function runJsonScript(scriptPath, args = []) {
  const output = execFileSync(process.execPath, [scriptPath, ...args], {
    cwd: new URL('..', import.meta.url),
    stdio: 'pipe',
    encoding: 'utf8',
    maxBuffer: 4 * 1024 * 1024,
  })
  return JSON.parse(output)
}

function onlyDomain(report, domainKey) {
  const domains = Array.isArray(report?.domains) ? report.domains : []
  const domain = domains.find((item) => item.key === domainKey)
  assert.ok(domain, `Expected ${domainKey} in report.`)
  return domain
}

function collectBudgetFailures(domain) {
  const failures = []
  for (const [key, budget] of Object.entries(domain.budgetStatus || {})) {
    if (!budget.pass) {
      failures.push(`${key} ${formatBytes(budget.actualBytes)} exceeds ${formatBytes(budget.limitBytes)}`)
    }
  }
  return failures
}

function formatBytes(bytes) {
  if (bytes === Number.POSITIVE_INFINITY) return 'missing'
  if (!Number.isFinite(bytes)) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}
