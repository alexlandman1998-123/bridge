import assert from 'node:assert/strict'
import {
  createSuggestedProperty24AgentMappings,
  normalizeProperty24Settings,
  summarizeProperty24SettingsReadiness,
} from '../src/pages/settings/property24SettingsModel.js'

const arch9Agents = [
  {
    id: 'membership-1',
    userId: 'user-1',
    fullName: 'Alex Landman',
    email: 'alex@arch9.co.za',
    role: 'principal',
    status: 'active',
  },
  {
    id: 'membership-2',
    userId: 'user-2',
    fullName: 'Tshepo Mofokeng',
    email: 'tshepo@example.co.za',
    role: 'agent',
    status: 'active',
  },
]

const property24Agents = [
  {
    property24AgentId: '77959',
    fullName: 'Alex Landman',
    email: 'ALEX@ARCH9.CO.ZA',
    sourceReference: 'ARCH9-AGENT-001',
  },
]

const mappings = createSuggestedProperty24AgentMappings({
  arch9Agents,
  property24Agents,
  sourceReferencePrefix: 'ARCH9',
})

assert.equal(mappings.length, 2)
assert.equal(mappings[0].property24AgentId, '77959')
assert.equal(mappings[0].matchMethod, 'email')
assert.equal(mappings[0].matchStatus, 'mapped')
assert.equal(mappings[1].property24AgentId, '')
assert.equal(mappings[1].matchStatus, 'unmapped')
assert.match(mappings[1].sourceReference, /^ARCH9-/)

const partialSettings = normalizeProperty24Settings({
  enabled: true,
  environment: 'exdev',
  agencyId: '31382',
  agentMappings: mappings,
  property24Agents,
})
const partialReadiness = summarizeProperty24SettingsReadiness({ settings: partialSettings, arch9Agents })

assert.equal(partialReadiness.accountReady, true)
assert.equal(partialReadiness.mappingsReady, false)
assert.equal(partialReadiness.ready, false)
assert.equal(partialReadiness.mappedCount, 1)
assert.equal(partialReadiness.unmappedCount, 1)

const readySettings = normalizeProperty24Settings({
  ...partialSettings,
  agentMappings: mappings.map((mapping) => ({
    ...mapping,
    property24AgentId: mapping.property24AgentId || '88001',
  })),
})
const ready = summarizeProperty24SettingsReadiness({ settings: readySettings, arch9Agents })

assert.equal(ready.accountReady, true)
assert.equal(ready.mappingsReady, true)
assert.equal(ready.ready, true)

console.log('Property24 settings UI contract passed')
