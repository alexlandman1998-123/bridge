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

assert.match(pipeline, /useState, useTransition } from 'react'/)
assert.match(pipeline, /const \[pendingBuyerWorkspaceTab, setPendingBuyerWorkspaceTab] = useState\(''\)/)
assert.match(pipeline, /const \[isBuyerWorkspaceTabTransitionPending, startBuyerWorkspaceTabTransition] = useTransition\(\)/)
assert.match(
  pipeline,
  /captureRouteLeadWorkspaceScroll\(\)[\s\S]*setPendingBuyerWorkspaceTab\(nextTab\)[\s\S]*preloadAgencyLeadWorkspaceTab\(nextTab\)[\s\S]*startBuyerWorkspaceTabTransition\(\(\) => \{\s*setLeadWorkspaceTab\(nextTab\)/,
)
assert.match(pipeline, /restoreRouteLeadWorkspaceScroll\(\)[\s\S]*setPendingBuyerWorkspaceTab\(''\)/)
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
