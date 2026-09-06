import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'

const baseline = JSON.parse(await readFile('config/agent-scale-phase0-baseline.json', 'utf8'))
const matrix = JSON.parse(await readFile('config/agent-phase0-screen-matrix.json', 'utf8'))
const packageJson = JSON.parse(await readFile('package.json', 'utf8'))

assert.equal(baseline.contract, 'arch9-agent-scale-phase0-baseline-v1')
assert.equal(baseline.browserEvidence.environment, 'local-dev-bypass')
assert.equal(baseline.browserEvidence.screenCount, baseline.browserEvidence.routes.length)
assert.equal(new Set(baseline.browserEvidence.routes).size, baseline.browserEvidence.routes.length)
assert.ok(baseline.browserEvidence.maximumCoreReadyMs <= baseline.releaseBudgets.maximumCoreReadyMs)
assert.ok(baseline.browserEvidence.maximumFeedbackMs <= baseline.releaseBudgets.maximumFeedbackMs)
assert.equal(baseline.bundleBaseline.clientsLoadsLegacyApi, false)

const configuredRoutes = new Set(matrix.screens.map((screen) => screen.route))
for (const route of baseline.browserEvidence.routes) {
  assert.ok(configuredRoutes.has(route), `Baseline route is missing from the canonical screen matrix: ${route}`)
}

for (const script of ['test:agent-scale-phase0', 'verify:agent-scale-phase0', 'bundle:agent-budget']) {
  assert.equal(typeof packageJson.scripts[script], 'string', `Missing package script: ${script}`)
}
assert.match(packageJson.scripts['verify:agent-scale-phase0'], /verify:agent-phase7/)
assert.match(packageJson.scripts['verify:agent-scale-phase0'], /bundle:agent-budget/)
assert.match(packageJson.scripts['verify:agent-scale-phase0'], /test:agent-scale-phase0/)

try {
  const evidence = await readFile(baseline.browserEvidence.source)
  const digest = createHash('sha256').update(evidence).digest('hex')
  assert.equal(digest, baseline.browserEvidence.sha256, 'Local browser evidence changed after the baseline was captured.')
  const report = JSON.parse(evidence)
  assert.equal(report.role, baseline.browserEvidence.role)
  assert.equal(report.results.length, baseline.browserEvidence.screenCount)
  for (const result of report.results) {
    assert.equal(result.state, 'ready', `${result.name} was not ready.`)
    assert.equal(result.horizontalOverflowPx, 0, `${result.name} has horizontal overflow.`)
    assert.equal(result.unnamedControls.length, 0, `${result.name} has unnamed controls.`)
    assert.equal(result.focusReachedControl, true, `${result.name} failed keyboard focus acceptance.`)
    assert.equal(result.technicalErrorVisible, false, `${result.name} exposed a technical error.`)
    assert.equal(result.consoleErrors.length, 0, `${result.name} emitted console errors.`)
    assert.equal(result.failedRequests.length, 0, `${result.name} had failed requests.`)
  }
} catch (error) {
  if (error?.code !== 'ENOENT') throw error
  console.warn(`Browser evidence is not present locally; verify its immutable digest from the release artifact: ${baseline.browserEvidence.sha256}`)
}

console.log('Agent scale Phase 0 baseline checks passed.')
