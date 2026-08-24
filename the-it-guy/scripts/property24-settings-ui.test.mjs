import assert from 'node:assert/strict'
import fs from 'node:fs'
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

const missingIdMappings = createSuggestedProperty24AgentMappings({
  arch9Agents,
  property24Agents: [
    {
      fullName: 'Alex Landman',
      email: 'alex@arch9.co.za',
      sourceReference: 'ARCH9-AGENT-001',
    },
  ],
  sourceReferencePrefix: 'ARCH9',
})
assert.equal(missingIdMappings[0].property24AgentId, '')
assert.equal(missingIdMappings[0].property24Name, '')
assert.equal(missingIdMappings[0].matchStatus, 'unmapped')

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

const settingsPageSource = fs.readFileSync(new URL('../src/pages/settings/SettingsProperty24Page.jsx', import.meta.url), 'utf8')
assert.match(settingsPageSource, /updateWorkflowSettings\(\{\s*property24:\s*nextProperty24\s*\}\)/s)
assert.doesNotMatch(settingsPageSource, /updateOrganisationSettings/)
assert.match(settingsPageSource, /sample\.errorMessage/)
assert.match(settingsPageSource, /invalidFields/)
assert.match(settingsPageSource, /async function persistProperty24Settings/)
assert.match(settingsPageSource, /Save connection/)
assert.match(settingsPageSource, /Property24 is connected/)
assert.match(settingsPageSource, /Connect Agents/)
assert.match(settingsPageSource, /Sync Status/)
assert.match(settingsPageSource, /Advanced settings/)
assert.match(settingsPageSource, /Property24 Agent Records/)
assert.match(settingsPageSource, /Agent Mapping References/)
assert.doesNotMatch(settingsPageSource, /title="Agent Mapping"/)
assert.doesNotMatch(settingsPageSource, /title="Operational Health"/)
assert.match(settingsPageSource, /function SourceReferenceInput/)
assert.match(settingsPageSource, /onBlur=\{commitDraft\}/)
assert.match(settingsPageSource, /Synced and saved/)
assert.match(settingsPageSource, /Created and saved/)
assert.match(settingsPageSource, /selectableProperty24Agents/)
assert.match(settingsPageSource, /Property24 returned/)
assert.match(settingsPageSource, /No Property24 profiles with IDs synced/)
assert.match(settingsPageSource, /Can't find this agent\? Create on Property24/)

const property24ClientSource = fs.readFileSync(new URL('../server/services/property24Client.js', import.meta.url), 'utf8')
assert.match(property24ClientSource, /'errorMessage'/)
assert.match(property24ClientSource, /'errors'/)

const createAgentSource = fs.readFileSync(new URL('../api/property24/settings/agents-create.js', import.meta.url), 'utf8')
assert.match(createAgentSource, /invalid_agent_fields/)
assert.match(createAgentSource, /!email\.endsWith\('\.test'\)/)
assert.match(createAgentSource, /normalizeAgentMobile/)

console.log('Property24 settings UI contract passed')
