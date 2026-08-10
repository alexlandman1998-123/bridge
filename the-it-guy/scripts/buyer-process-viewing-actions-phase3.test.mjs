import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const appRoot = resolve(import.meta.dirname, '..')
const packageJson = JSON.parse(readFileSync(resolve(appRoot, 'package.json'), 'utf8'))
const source = readFileSync(resolve(appRoot, 'src/pages/agency/AgencyPipelinePage.jsx'), 'utf8')

assert.equal(
  packageJson.scripts?.['test:buyer-process-viewing-actions-phase3'],
  'node scripts/buyer-process-viewing-actions-phase3.test.mjs',
  'package.json should expose the buyer process viewing actions Phase 3 contract.',
)

const nextStepOptionsBlock = source.match(/const VIEWING_NEXT_STEP_OPTIONS = \[[\s\S]*?\n\]/)?.[0] || ''
assert.match(nextStepOptionsBlock, /send_buyer_onboarding_link/)
assert.match(nextStepOptionsBlock, /Send buyer onboarding link/)
assert.match(nextStepOptionsBlock, /follow_up/)
assert.match(nextStepOptionsBlock, /Follow up/)
assert.match(nextStepOptionsBlock, /continue_viewing/)
assert.match(nextStepOptionsBlock, /Continue viewing/)
assert.match(nextStepOptionsBlock, /mark_lost/)
assert.match(nextStepOptionsBlock, /Mark as lost/)
assert.doesNotMatch(nextStepOptionsBlock, /send_offer_link/)
assert.doesNotMatch(nextStepOptionsBlock, /Schedule another viewing/)
assert.doesNotMatch(nextStepOptionsBlock, /Move to nurture/)

assert.match(source, /function normalizeViewingNextStep/)
assert.match(source, /send_offer_link/)
assert.match(source, /schedule_another_viewing/)
assert.match(source, /move_to_nurture/)
assert.match(source, /isViewingOnboardingNextStep/)

assert.match(source, /lostReason: LEAD_LOST_REASON_OPTIONS\[0\]/)
assert.match(source, /lostNotes: ''/)
assert.match(source, /Choose a lost reason before marking the buyer as lost\./)
assert.match(source, /viewing_mark_lost:\$\{lostReason\}/)
assert.match(source, /stage: 'Lost'/)
assert.match(source, /status: 'Lost'/)

assert.match(source, /\['follow_up', 'continue_viewing'\]\.includes\(normalizedNextStep\)/)
assert.match(source, /createAgencyCrmLeadTask/)
assert.match(source, /Complete & Send Onboarding/)
assert.match(source, /Complete & Mark Lost/)
assert.match(source, /buyer onboarding link/)

console.log('Buyer process Phase 3 viewing actions contract passed.')
