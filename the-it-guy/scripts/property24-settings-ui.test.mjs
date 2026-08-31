import assert from 'node:assert/strict'
import fs from 'node:fs'
import {
  createSuggestedProperty24AgentMappings,
  getCanonicalArch9AgentProfile,
  getProperty24ListingStatusOptions,
  normalizeProperty24Settings,
  serializeProperty24SettingsForPersistence,
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

const canonicalProfile = getCanonicalArch9AgentProfile({
  id: 'membership-1',
  userId: 'user-1',
  fullName: 'Alex Landman',
  email: 'ALEX@ARCH9.CO.ZA',
  phone: '082 555 1123',
  avatarUrl: 'https://cdn.example.com/alex.jpg',
})
assert.equal(canonicalProfile.email, 'alex@arch9.co.za')
assert.equal(canonicalProfile.phone, '0825551123')
assert.equal(canonicalProfile.avatarUrl, 'https://cdn.example.com/alex.jpg')
assert.deepEqual(getProperty24ListingStatusOptions('rental'), ['Active', 'Pending', 'Rented', 'Withdrawn'])
assert.deepEqual(getProperty24ListingStatusOptions('sale'), ['Active', 'Pending', 'Sold', 'Withdrawn'])

const persistedSettings = serializeProperty24SettingsForPersistence({
  ...readySettings,
  enabled: true,
  environment: 'production',
  agencyId: '31382',
  lastAgentSyncAt: '2026-08-31T12:00:00.000Z',
  property24Agents: [{
    property24AgentId: '77959',
    sourceReference: 'ARCH9-AGENT-001',
    fullName: 'Duplicated Name',
    email: 'duplicate@example.com',
    mobile: '0825551123',
    status: 'Active',
  }],
  agentMappings: [{
    arch9UserId: 'user-1',
    arch9MembershipId: 'membership-1',
    arch9Name: 'Duplicated Name',
    arch9Email: 'duplicate@example.com',
    property24AgentId: '77959',
    property24Name: 'Duplicated Property24 Name',
    property24Email: 'property24@example.com',
    sourceReference: 'ARCH9-AGENT-001',
    matchStatus: 'mapped',
  }],
})
assert.equal(persistedSettings.dataOwnershipVersion, 'arch9_property24_canonical_v1')
assert.equal('agencyId' in persistedSettings, false, 'Agency connection data belongs in property24_accounts.')
assert.equal('enabled' in persistedSettings, false, 'Connection status belongs in property24_accounts.')
assert.equal('environment' in persistedSettings, false, 'Connection environment belongs in property24_accounts.')
assert.deepEqual(Object.keys(persistedSettings.property24Agents[0]).sort(), [
  'lastSyncError',
  'lastSyncedAt',
  'property24AgentId',
  'rowId',
  'sourceReference',
  'status',
].sort())
assert.equal('arch9Email' in persistedSettings.agentMappings[0], false)
assert.equal('property24Email' in persistedSettings.agentMappings[0], false)
assert.equal('arch9Name' in persistedSettings.agentMappings[0], false)
assert.equal('property24Name' in persistedSettings.agentMappings[0], false)

const settingsPageSource = fs.readFileSync(new URL('../src/pages/settings/SettingsProperty24Page.jsx', import.meta.url), 'utf8')
assert.match(settingsPageSource, /updateWorkflowSettings\(\{\s*property24:\s*persistedProperty24\s*\}\)/s)
assert.doesNotMatch(settingsPageSource, /updateOrganisationSettings/)
assert.match(settingsPageSource, /sample\.errorMessage/)
assert.match(settingsPageSource, /invalidFields/)
assert.match(settingsPageSource, /async function persistProperty24Settings/)
assert.match(settingsPageSource, /Save connection/)
assert.match(settingsPageSource, /Property24 is connected/)
assert.match(settingsPageSource, /Agency connected/)
assert.match(settingsPageSource, /ExDev sandbox/)
assert.match(settingsPageSource, /Agent IDs pending/)
assert.match(settingsPageSource, /Do not enter fake IDs/)
assert.match(settingsPageSource, /sandbox limitation/)
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
assert.match(settingsPageSource, /Created and verified the Property24 profile, phone and photo/)
assert.match(settingsPageSource, /Sync agent profiles/)
assert.match(settingsPageSource, /Phone.*ready/s)
assert.match(settingsPageSource, /Photo.*missing/s)
assert.match(settingsPageSource, /applyProfileUpdates: true/)
assert.match(settingsPageSource, /selectableProperty24Agents/)
assert.match(settingsPageSource, /Property24 returned/)
assert.match(settingsPageSource, /No Property24 profiles with IDs synced/)
assert.match(settingsPageSource, /Can't find this agent\? Create on Property24/)
assert.match(settingsPageSource, /Agent names, email addresses, phone numbers and photos are owned by the Arch9 Agent Profile/)
assert.match(settingsPageSource, /serializeProperty24SettingsForPersistence/)
assert.match(settingsPageSource, /arch9UserId: agent\.userId/)
assert.match(settingsPageSource, /arch9MembershipId: agent\.id/)
assert.doesNotMatch(settingsPageSource, /function updateProperty24Agent/)
assert.doesNotMatch(settingsPageSource, /function addProperty24Agent/)
assert.doesNotMatch(settingsPageSource, /function removeProperty24Agent/)

const property24ClientSource = fs.readFileSync(new URL('../server/services/property24Client.js', import.meta.url), 'utf8')
assert.match(property24ClientSource, /'errorMessage'/)
assert.match(property24ClientSource, /'errors'/)

const createAgentSource = fs.readFileSync(new URL('../api/property24/settings/agents-create.js', import.meta.url), 'utf8')
assert.match(createAgentSource, /invalid_agent_fields/)
assert.match(createAgentSource, /!email\.endsWith\('\.test'\)/)
assert.match(createAgentSource, /normalizeAgentMobile/)
assert.match(createAgentSource, /fetchCanonicalProperty24AgentProfile/)
assert.match(createAgentSource, /resolveOrganisationProperty24Connection/)
assert.match(createAgentSource, /arch9UserId: body\.arch9UserId/)
assert.match(createAgentSource, /prepareProperty24AgentPhotoUrl/)
assert.match(createAgentSource, /persistCanonicalProperty24AgentMapping/)
assert.doesNotMatch(createAgentSource, /body\.agent/)

const syncAgentSource = fs.readFileSync(new URL('../api/property24/settings/agents-sync.js', import.meta.url), 'utf8')
assert.match(syncAgentSource, /resolveOrganisationProperty24Connection/)
assert.match(syncAgentSource, /connection\.agencyId/)
assert.match(syncAgentSource, /persistCanonicalProperty24AgentMappings/)
assert.match(syncAgentSource, /syndicateCanonicalProperty24AgentProfile/)

const connectionApiSource = fs.readFileSync(new URL('../api/property24/settings/connection.js', import.meta.url), 'utf8')
assert.match(connectionApiSource, /fetchOrganisationProperty24Connection/)
assert.match(connectionApiSource, /upsertOrganisationProperty24Connection/)

console.log('Property24 settings UI contract passed')
