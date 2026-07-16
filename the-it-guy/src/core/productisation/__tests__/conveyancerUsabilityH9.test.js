import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  buildConveyancerActionAffordanceH9,
  buildConveyancerActionConfirmationH9,
  buildConveyancerUsabilityH9,
} from '../conveyancerUsabilityH9.js'

const cockpitSource = readFileSync(new URL('../../../components/attorney/cockpit/ConveyancerCockpit.jsx', import.meta.url), 'utf8')
const actionSource = readFileSync(new URL('../../../components/attorney/cockpit/ConveyancerActionCard.jsx', import.meta.url), 'utf8')
const test = (name, run) => { try { run(); console.log(`ok - ${name}`) } catch (error) { console.error(`not ok - ${name}`); throw error } }
const action = (type = 'complete') => ({ actionKey: 'transfer:instruction', label: 'Check signed instruction', intent: { type, label: 'Mark complete' } })

test('requires a deliberate confirmation for state-changing start and completion actions', () => {
  assert.equal(buildConveyancerActionAffordanceH9({ item: action('complete') }).confirmationRequired, true)
  assert.equal(buildConveyancerActionAffordanceH9({ item: action('start') }).confirmationRequired, true)
  assert.equal(buildConveyancerActionAffordanceH9({ item: action('open_review') }).confirmationRequired, false)
})

test('binds confirmation to the exact action and explains the limited consequence', () => {
  const confirmation = buildConveyancerActionConfirmationH9(action())
  assert.equal(confirmation.actionKey, 'transfer:instruction')
  assert.equal(confirmation.confirmLabel, 'Yes, mark complete')
  assert.match(confirmation.question, /Check signed instruction/)
  assert.match(confirmation.consequence, /does not approve legal evidence/i)
  assert.match(confirmation.consequence, /send money/i)
})

test('blocks application commands under the H8 orchestration stop without blocking review navigation', () => {
  const operationalSummary = { componentStops: { orchestration: { allowed: false } } }
  const command = buildConveyancerActionAffordanceH9({ item: action('complete'), operationalSummary })
  const navigation = buildConveyancerActionAffordanceH9({ item: action('open_review'), operationalSummary })
  assert.equal(command.disabled, true)
  assert.match(command.disabledReason, /normal matter workspace/i)
  assert.equal(navigation.disabled, false)
  assert.equal(navigation.navigationOnly, true)
})

test('turns the stop plane into plain-language recovery while preserving manual work', () => {
  const result = buildConveyancerUsabilityH9({ cockpit: { status: 'ready', control: {} }, experience: { ready: true }, context: { operationalSummary: { componentStops: { orchestration: true, providers: true } } } })
  assert.equal(result.orchestrationStopped, true)
  assert.deepEqual(result.stoppedComponents, ['orchestration', 'providers'])
  assert.equal(result.controls.manualWorkspaceAlwaysAvailable, true)
  assert.equal(result.controls.legalApprovalInferred, false)
  assert.match(result.status.detail, /normal workspace/i)
})

test('UI is responsive, keyboard-safe, explicit about confirmation and resistant to text overlap', () => {
  assert.match(cockpitSource, /role="alertdialog"/)
  assert.match(cockpitSource, /buildConveyancerActionConfirmationH9/)
  assert.match(cockpitSource, /pendingConfirmation/)
  assert.match(cockpitSource, /Open normal workspace/)
  assert.match(cockpitSource, /break-words/)
  assert.match(cockpitSource, /w-full[^"]*sm:w-auto/)
  assert.match(actionSource, /whitespace-normal/)
  assert.match(actionSource, /min-h-10/)
  assert.doesNotMatch(`${cockpitSource}${actionSource}`, /window\.confirm|window\.alert/)
})

console.log('H9 conveyancer usability tests passed.')
