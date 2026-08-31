import assert from 'node:assert/strict'
import fs from 'node:fs'
import sharp from 'sharp'
import {
  normalizeProperty24AgentPhotoBuffer,
  prepareProperty24AgentPhotoUrl,
} from '../server/property24/agentPhotoService.js'
import {
  buildCanonicalProperty24AgentUpdatePayload,
  syndicateCanonicalProperty24AgentProfile,
  validateCanonicalProperty24AgentProfile,
} from '../server/property24/agentProfileSyndicationService.js'
import { buildCanonicalProperty24AgentMappingRow } from '../server/property24/agentMappingService.js'

const sourceBuffer = await sharp({
  create: { width: 900, height: 700, channels: 3, background: '#345678' },
}).png().toBuffer()
const preparedPhoto = await normalizeProperty24AgentPhotoBuffer(sourceBuffer)
const profile = {
  userId: '00000000-0000-4000-8000-000000000001',
  membershipId: '00000000-0000-4000-8000-000000000002',
  firstName: 'Canonical',
  lastName: 'Agent',
  fullName: 'Canonical Agent',
  email: 'canonical@example.com',
  phone: '+27 82 555 1123',
  avatarUrl: 'https://storage.example.com/avatars/agent.png',
  jobTitle: 'Property Practitioner',
}

assert.deepEqual(validateCanonicalProperty24AgentProfile(profile), { missing: [], invalid: [] })
assert.deepEqual(validateCanonicalProperty24AgentProfile({ ...profile, phone: '', avatarUrl: '' }).missing, [
  'profile.phone',
  'profile.avatarUrl',
])

const preparedFromUrl = await prepareProperty24AgentPhotoUrl(profile.avatarUrl, {
  allowedOrigins: ['https://storage.example.com'],
  fetchImpl: async () => new Response(sourceBuffer, {
    status: 200,
    headers: { 'Content-Type': 'image/png', 'Content-Length': String(sourceBuffer.length) },
  }),
})
assert.equal(preparedFromUrl.summary.outputMimeType, 'image/jpeg')
assert.equal(preparedFromUrl.summary.outputWidth, 800)
assert.equal(preparedFromUrl.summary.outputHeight, 800)
await assert.rejects(
  prepareProperty24AgentPhotoUrl('https://untrusted.example.com/agent.png', {
    allowedOrigins: ['https://storage.example.com'],
    fetchImpl: async () => new Response(sourceBuffer),
  }),
  /not an approved storage origin/,
)

function createFakeProperty24(initialAgents = []) {
  const agents = structuredClone(initialAgents)
  const calls = []
  return {
    calls,
    async fetchAgencyAgents(agencyId) {
      calls.push({ type: 'fetch_agents', agencyId })
      return { status: 200, data: structuredClone(agents) }
    },
    async createAgent(payload) {
      calls.push({ type: 'create_agent', payload })
      agents.push({ id: 88001, ...payload })
      return { status: 201, data: 88001 }
    },
    async updateAgent(payload) {
      calls.push({ type: 'update_agent', payload })
      const index = agents.findIndex((agent) => Number(agent.id) === Number(payload.id))
      agents[index] = { ...agents[index], ...payload }
      delete agents[index].profilePicture
      return { status: 200, data: { ok: true } }
    },
    async updateAgentProfilePicture(agentId, payload) {
      calls.push({ type: 'update_photo', agentId, payloadKeys: Object.keys(payload) })
      const agent = agents.find((candidate) => Number(candidate.id) === Number(agentId))
      agent.profilePicture = { bytes: payload.bytes }
      return { status: 200, data: { ok: true } }
    },
  }
}

const createdProperty24 = createFakeProperty24()
const created = await syndicateCanonicalProperty24AgentProfile({
  property24: createdProperty24,
  profile,
  preparedPhoto,
  agencyId: 31382,
  sourceReference: 'ARCH9-CANONICAL-AGENT',
  countryId: 1,
})
assert.equal(created.status, 'CREATED')
assert.equal(created.property24AgentId, 88001)
assert.equal(created.photo.verified, true)
assert.deepEqual(createdProperty24.calls.map((call) => call.type), ['create_agent', 'update_photo', 'fetch_agents'])
assert.deepEqual(createdProperty24.calls[1].payloadKeys, ['bytes'])

const existingAgent = {
  id: 77969,
  firstname: 'Old',
  lastname: 'Name',
  receiveStatsMail: false,
  published: true,
  agencyId: 31382,
  sourceReference: 'ARCH9-CANONICAL-AGENT',
  mobileNumber: '0600000000',
  emailAddress: 'old@example.com',
  countryId: 1,
  status: 'Active',
  jobTitle: 'Agent',
}
const updatedProperty24 = createFakeProperty24([existingAgent])
const updated = await syndicateCanonicalProperty24AgentProfile({
  property24: updatedProperty24,
  profile,
  preparedPhoto,
  agencyId: 31382,
  sourceReference: 'ARCH9-CANONICAL-AGENT',
  remoteAgent: existingAgent,
})
assert.equal(updated.status, 'UPDATED')
assert.equal(updated.photo.verified, true)
assert.deepEqual(updatedProperty24.calls.map((call) => call.type), ['update_agent', 'update_photo', 'fetch_agents'])
assert.equal(updatedProperty24.calls[0].payload.mobileNumber, '+27825551123')
assert.equal(updatedProperty24.calls[0].payload.emailAddress, 'canonical@example.com')

const updatePayload = buildCanonicalProperty24AgentUpdatePayload({
  profile,
  remoteAgent: existingAgent,
  agencyId: 31382,
  sourceReference: 'ARCH9-CANONICAL-AGENT',
})
assert.equal(updatePayload.id, 77969)
assert.equal(updatePayload.firstname, 'Canonical')
assert.equal(updatePayload.mobileNumber, '+27825551123')

const mappingRow = buildCanonicalProperty24AgentMappingRow({
  organisationId: '00000000-0000-4000-8000-000000000003',
  environment: 'production',
  agencyId: 31382,
  arch9UserId: profile.userId,
  property24AgentId: 77969,
  sourceReference: 'ARCH9-CANONICAL-AGENT',
  matchType: 'created',
})
assert.equal(mappingRow.match_type, 'manual')
for (const duplicateField of ['email_snapshot', 'first_name_snapshot', 'last_name_snapshot', 'mobile_snapshot']) {
  assert.equal(Object.hasOwn(mappingRow, duplicateField), false)
}

const createSource = fs.readFileSync(new URL('../api/property24/settings/agents-create.js', import.meta.url), 'utf8')
assert.match(createSource, /prepareProperty24AgentPhotoUrl\(canonicalProfile\.avatarUrl/)
assert.match(createSource, /syndicateCanonicalProperty24AgentProfile/)
assert.match(createSource, /persistCanonicalProperty24AgentMapping/)
assert.doesNotMatch(createSource, /body\.agent/)

const syncSource = fs.readFileSync(new URL('../api/property24/settings/agents-sync.js', import.meta.url), 'utf8')
assert.match(syncSource, /applyProfileUpdates === true/)
assert.match(syncSource, /persistCanonicalProperty24AgentMappings/)
assert.match(syncSource, /profileSyncResults/)
assert.match(syncSource, /property24Agents: agentSnapshot\.agents\.map\(\(\{ raw, \.\.\.agent \}\) => agent\)/)

const mappingApiSource = fs.readFileSync(new URL('../api/property24/settings/agent-mapping.js', import.meta.url), 'utf8')
assert.match(mappingApiSource, /fetchCanonicalProperty24AgentProfile/)
assert.match(mappingApiSource, /persistCanonicalProperty24AgentMapping/)
assert.match(mappingApiSource, /deactivateCanonicalProperty24AgentMapping/)
assert.match(mappingApiSource, /unwrapProperty24AgentCollection/)

console.log('Property24 canonical agent profile syndication contract passed')
