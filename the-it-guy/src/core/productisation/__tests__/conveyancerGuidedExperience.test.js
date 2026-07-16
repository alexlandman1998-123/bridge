import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { buildConveyancerGuidedExperience } from '../conveyancerGuidedExperience.js'
import { buildConveyancerCockpit } from '../conveyancerCockpit.js'

const cockpitSource = readFileSync(new URL('../../../components/attorney/cockpit/ConveyancerCockpit.jsx', import.meta.url), 'utf8')
const actionSource = readFileSync(new URL('../../../components/attorney/cockpit/ConveyancerActionCard.jsx', import.meta.url), 'utf8')
const systemsSource = readFileSync(new URL('../../../components/attorney/cockpit/ConveyancerSystemStatus.jsx', import.meta.url), 'utf8')
function test(name, fn) { try { fn(); console.log(`ok - ${name}`) } catch (error) { console.error(`not ok - ${name}`); throw error } }
function baseCockpit(overrides = {}) { return { ready: true, status: 'ready', health: { label: 'Action ready', summary: 'Two actions can be progressed.', tone: 'primary' }, primaryAction: { actionKey: 'open_matter', label: 'Open the matter', description: 'Create the working file.', intent: { type: 'start', label: 'Start work' } }, queue: { metrics: { actionable: 2, blocked: 1, countsByBucket: { review: 1, waiting: 2, upcoming: 3 } } }, groups: [{ key: 'review', items: [{}] }, { key: 'do_now', items: [{}] }, { key: 'waiting', items: [{}, {}] }, { key: 'upcoming', items: [{}, {}, {}] }], provenance: { planId: 'plan:1', planRevision: 4 }, ...overrides } }

test('reduces a complex matter to one headline, one primary action and plain-language counts', () => {
  const experience = buildConveyancerGuidedExperience({ cockpit: baseCockpit(), context: {} })
  assert.equal(experience.headline, 'Open the matter'); assert.equal(experience.primaryAction.actionKey, 'open_matter')
  assert.deepEqual(experience.counts, { ready: 2, decisions: 1, waiting: 5, blocked: 1 })
  assert.deepEqual(experience.attentionGroups.map((group) => group.key), ['review', 'do_now']); assert.deepEqual(experience.laterGroups.map((group) => group.key), ['waiting', 'upcoming'])
})

test('keeps external systems optional and explains the manual path', () => {
  const experience = buildConveyancerGuidedExperience({ cockpit: baseCockpit(), context: {} })
  assert.equal(experience.systems.every((system) => system.state === 'manual'), true)
  assert.match(experience.fallback, /always continue manually/i); assert.match(experience.systems.find((system) => system.id === 'providers').detail, /no external connection is required/i)
})

test('turns failures and kill switches into understandable status without hiding work', () => {
  const experience = buildConveyancerGuidedExperience({ cockpit: baseCockpit(), context: { notificationSummary: { available: true, counts: { failed: 1 }, control: {} }, documentPipelineSummary: { available: true, counts: {}, control: { killSwitchEnabled: true } }, providerRuntimeSummary: { available: true, health: [], control: {} }, providerTransportSummary: { outbound: { dead_letter: 1 }, inbound: {} }, operationalSummary: { killSwitchActive: false } } })
  assert.equal(experience.systems.find((system) => system.id === 'reminders').state, 'attention')
  assert.equal(experience.systems.find((system) => system.id === 'documents').state, 'stopped')
  assert.equal(experience.systems.find((system) => system.id === 'providers').state, 'attention')
})

test('review work opens deliberate review instead of completing legal work', () => {
  const cockpit = buildConveyancerCockpit({ context: { control: { mode: 'pilot', killSwitchEnabled: false }, state: { currentPlan: { planId: 'plan:review', actions: [] }, orchestrationReceipts: [] } }, actor: {}, asOf: '2026-07-16T12:00:00.000Z' })
  assert.doesNotMatch(JSON.stringify(cockpit), /Approve and complete/)
  const source = readFileSync(new URL('../conveyancerCockpit.js', import.meta.url), 'utf8'); assert.match(source, /type: 'open_review'/)
})

test('UI uses semantic disclosures, labelled reasons, keyboard-safe buttons and progressive work', () => {
  assert.match(cockpitSource, /Do this next/); assert.match(cockpitSource, /showLater/); assert.match(cockpitSource, /<details/); assert.match(cockpitSource, /htmlFor="conveyancer-action-reason"/); assert.match(cockpitSource, /aria-live="polite"/)
  assert.match(actionSource, /type="button"/); assert.match(actionSource, /aria-expanded/); assert.match(actionSource, /aria-controls/)
  assert.match(systemsSource, /<summary/); assert.match(systemsSource, /<ul/); assert.match(systemsSource, /<li/)
  assert.doesNotMatch(`${cockpitSource}${actionSource}${systemsSource}`, /<div[^>]+onClick=/)
  assert.doesNotMatch(cockpitSource, /\.from\([^)]*\)\.(insert|update|delete|upsert)/)
})

console.log('P9 conveyancer guided-experience tests passed.')
