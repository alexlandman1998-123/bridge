import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const pipeline = readFileSync(resolve(root, 'src/pages/agency/AgencyPipelinePage.jsx'), 'utf8')
const packageJson = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))

function functionBody(name) {
  const start = pipeline.indexOf(`function ${name}`)
  assert.notEqual(start, -1, `${name} should exist`)
  const nextFunction = pipeline.indexOf('\n  function ', start + 1)
  return pipeline.slice(start, nextFunction === -1 ? pipeline.length : nextFunction)
}

assert.doesNotMatch(pipeline, /\buseTransition\b/)
assert.match(pipeline, /const \[pendingBuyerWorkspaceTab, setPendingBuyerWorkspaceTab] = useState\(''\)/)
assert.match(
  pipeline,
  /setPendingBuyerWorkspaceTab\(nextTab\)[\s\S]*setLeadWorkspaceTab\(nextTab\)[\s\S]*preloadAgencyLeadWorkspaceTab\(nextTab\)/,
)
assert.doesNotMatch(pipeline, /startBuyerWorkspaceTabTransition/)
assert.match(pipeline, /resolveBuyerWorkspaceTabKey\(leadWorkspaceTab\) !== pendingBuyerWorkspaceTab[\s\S]*setPendingBuyerWorkspaceTab\(''\)/)
assert.doesNotMatch(pipeline, /captureRouteLeadWorkspaceScroll|restoreRouteLeadWorkspaceScroll/)
assert.match(pipeline, /aria-busy=\{isSettling\}/)
assert.match(pipeline, /data-pending=\{isSettling \? 'true' : undefined\}/)

for (const handler of [
  'handleSendBuyerOnboardingFromAppointment',
  'handleLeadCanonicalOfferStatus',
  'handleSendBuyerOnboardingFromLead',
  'handleCreateBuyerOfferDraft',
  'handleBuyerCommandConvertToTransaction',
]) {
  const body = functionBody(handler)
  assert.match(body, /scheduleRecordsReload\(organisationId\)/, `${handler} should reconcile in the background`)
  assert.doesNotMatch(body, /await reloadRecords\(organisationId\)/, `${handler} must not block on a full workspace reload`)
}

assert.match(packageJson.scripts['verify:buyer-leads-performance'], /test:buyer-leads-interaction-responsiveness-phase8(?: && |$)/)

console.log('buyer leads Phase 8 interaction responsiveness checks passed')
