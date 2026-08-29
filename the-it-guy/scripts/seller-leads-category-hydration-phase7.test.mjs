import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const pipeline = readFileSync(resolve(root, 'src/pages/agency/AgencyPipelinePage.jsx'), 'utf8')

function getEffectContaining(needle) {
  const needleIndex = pipeline.indexOf(needle)
  assert.notEqual(needleIndex, -1, `${needle} should remain in the agency controller`)
  const effectStart = pipeline.lastIndexOf('useEffect(() => {', needleIndex)
  const nextEffect = pipeline.indexOf('\n  useEffect(() => {', needleIndex)
  assert.notEqual(effectStart, -1, `${needle} should remain inside an effect`)
  return pipeline.slice(effectStart, nextEffect === -1 ? pipeline.length : nextEffect)
}

const offersEffect = getEffectContaining('listCanonicalOffersForLead({')
assert.match(
  offersEffect,
  /if \(!organisationId \|\| !leadId \|\| selectedLeadIsSeller\) \{[\s\S]*setSelectedLeadOffers\(\[\]\)[\s\S]*return/,
  'seller leads should clear buyer offer state and exit before buyer offer queries',
)
assert.ok(
  offersEffect.indexOf('selectedLeadIsSeller') < offersEffect.indexOf('listCanonicalOffersForLead({'),
  'the seller category gate must run before the canonical offer request',
)
assert.match(offersEffect, /selectedLeadIsSeller,[\s\S]*selectedLeadOffersRefreshTick/)

const lifecycleEffect = getEffectContaining('getBuyerLeadLifecycleDiagnostic({')
assert.match(
  lifecycleEffect,
  /if \(!organisationId \|\| !leadId \|\| selectedLeadIsSeller \|\| \(!offerId && !selectedLeadLinkedTransactionId\)\) \{/,
  'seller leads should exit before buyer lifecycle diagnostics',
)
assert.ok(
  lifecycleEffect.indexOf('selectedLeadIsSeller') < lifecycleEffect.indexOf('getBuyerLeadLifecycleDiagnostic({'),
  'the seller category gate must run before the buyer lifecycle request',
)
assert.match(lifecycleEffect, /selectedLeadLinkedTransactionId,[\s\S]*selectedLeadIsSeller/)

console.log('seller leads category hydration phase 7 checks passed (buyer-only requests skipped for sellers)')
