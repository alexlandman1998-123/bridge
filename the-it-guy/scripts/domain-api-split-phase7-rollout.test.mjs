import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs/promises'

const appRoot = new URL('..', import.meta.url)
const packageJson = JSON.parse(await fs.readFile(new URL('../package.json', import.meta.url), 'utf8'))
const rollout = JSON.parse(
  await fs.readFile(new URL('../config/domain-api-split-phase7-agent-listing-detail-rollout.json', import.meta.url), 'utf8'),
)
const doc = await fs.readFile(new URL('../docs/domain-api-split-phase7-staged-rollout.md', import.meta.url), 'utf8')
const chunkAuditSource = await fs.readFile(new URL('../scripts/domain-api-chunk-audit.mjs', import.meta.url), 'utf8')

assert.equal(
  packageJson.scripts?.['test:domain-api-split-phase7-rollout'],
  'node scripts/domain-api-split-phase7-rollout.test.mjs',
  'package.json should expose the Phase 7 staged rollout gate.',
)

assert.equal(rollout.contract, 'domain-api-split-phase7-staged-rollout-v1')
assert.equal(rollout.domain, 'agent-listing-detail')
assert.equal(rollout.status, 'ready_for_staged_rollout')
assert.equal(rollout.scope?.staticSplitCertified, true)
assert.equal(rollout.scope?.globalEnforceClean, false)
assert.match(rollout.scope?.knownBoundary || '', /preload map.*api-\*\.js/i)

assert.deepEqual(
  rollout.stages.map((stage) => stage.key),
  ['local_preflight', 'staging_internal', 'production_canary', 'production_full'],
  'Phase 7 should use local, staging, canary, then full production rollout stages.',
)

for (const stage of rollout.stages) {
  assert.ok(stage.environment, `${stage.key} should declare an environment.`)
  assert.ok(stage.audience, `${stage.key} should declare an audience.`)
  assert.ok(Array.isArray(stage.promotionCriteria) && stage.promotionCriteria.length >= 3, `${stage.key} should have promotion criteria.`)
  assert.match(stage.rollback || '', /revert|redeploy|Do not deploy/i, `${stage.key} should have an actionable rollback posture.`)
}

for (const requiredCommand of [
  'npm run build',
  'npm run test:domain-api-split-phase6-gate',
  'npm run test:domain-api-split-phase7-rollout',
  'npm run test:domain-import-inventory',
  'npm run test:domain-api-chunks',
  'npm run test:performance-budget',
]) {
  assert.ok(
    rollout.requiredPreflightCommands.includes(requiredCommand),
    `Phase 7 rollout preflight should require ${requiredCommand}.`,
  )
}

assert.equal(rollout.budgets?.expectedTrackedHeavyStaticImports, 0)
assert.equal(rollout.budgets?.expectedStaticApiRouteDependencies, 0)
assert.equal(rollout.budgets?.maxStaticApiRouteGzipKb, 1)
assert.ok(Number(rollout.budgets?.maxEntryGzipKb) <= 140)
assert.ok(Number(rollout.budgets?.maxStaticScriptGzipKb) <= 750)

for (const stopCondition of [
  'Phase 6 gate fails.',
  'Tracked heavy static imports are reintroduced.',
  'The built Agent Listing Detail route statically depends on api-*.js.',
]) {
  assert.ok(rollout.stopConditions.includes(stopCondition), `Phase 7 stop conditions should include: ${stopCondition}`)
}

for (const signal of [
  'Agent Listing Detail route-load JavaScript errors',
  'dynamic import failures for privateListingService, agencyPipelineService, buyerLifecycleService, listingOffersService, lead services, or seller services',
  'route initial JS payload and static script dependency gzip',
]) {
  assert.ok(rollout.monitoringSignals.includes(signal), `Phase 7 monitoring signals should include: ${signal}`)
}

assert.match(doc, /Domain API Split Phase 7: Staged Rollout/)
assert.match(doc, /agent-listing-detail/)
assert.match(doc, /production_canary/)
assert.match(doc, /Redeploy the previous application version/)
assert.match(doc, /Do not set `enforceClean: true`/)

assert.match(
  chunkAuditSource,
  /key: 'agent-listing-detail'[\s\S]*?enforceClean: false/,
  'Agent Listing Detail should remain report-only in the global domain chunk audit until preload-reference enforcement is clean.',
)

runNodeScript('scripts/domain-api-split-phase6-gate.test.mjs')

console.log('domain API split Phase 7 staged rollout gate passed')

function runNodeScript(scriptPath) {
  execFileSync(process.execPath, [scriptPath], {
    cwd: appRoot,
    stdio: 'pipe',
    encoding: 'utf8',
    maxBuffer: 4 * 1024 * 1024,
  })
}
