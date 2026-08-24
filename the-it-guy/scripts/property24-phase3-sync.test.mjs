import assert from 'node:assert/strict'
import fs from 'node:fs'
import {
  createProperty24AgentMappingPlan,
  createProperty24CatalogMappingPlan,
  createProperty24Client,
  createProperty24SynchronisationPreview,
  createRedactedProperty24SynchronisationPreview,
  fetchProperty24CatalogSnapshot,
  normalizeArch9AgentCandidate,
  normalizeProperty24Agent,
} from '../server/property24/index.js'

function read(path) {
  return fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
}

for (const path of [
  'server/property24/synchronisationService.js',
  'scripts/property24-sync-preview.mjs',
  'sql/20260820_property24_agent_catalog_mappings.sql',
]) {
  assert.ok(fs.existsSync(new URL(`../${path}`, import.meta.url)), `${path} should exist`)
}

assert.ok(fs.existsSync(new URL('../../supabase/migrations/202608200002_property24_agent_catalog_mappings.sql', import.meta.url)))

const arch9Agent = normalizeArch9AgentCandidate({
  user_id: '00000000-0000-4000-8000-000000000001',
  first_name: ' Alex ',
  last_name: ' Landman ',
  email: 'Alex@Arch9.co.za',
  phone_number: '067 612 5009',
  role: 'agent',
})
assert.equal(arch9Agent.email, 'alex@arch9.co.za')
assert.equal(arch9Agent.fullName, 'Alex Landman')

const property24Agent = normalizeProperty24Agent({
  agentId: 77959,
  firstname: 'Alex',
  lastname: 'Landman',
  emailAddress: 'alex@arch9.co.za',
  sourceReference: 'ARCH9-AGENT-001',
  agencyId: 31382,
})
assert.equal(property24Agent.property24AgentId, '77959')

const emailPlan = createProperty24AgentMappingPlan({
  arch9Agents: [arch9Agent],
  property24Agents: [property24Agent],
})
assert.equal(emailPlan.summary.ready, true)
assert.equal(emailPlan.summary.mappedCount, 1)
assert.equal(emailPlan.mappings[0].matchType, 'email')
assert.equal(emailPlan.mappings[0].property24Agent.property24AgentId, '77959')

const explicitPlan = createProperty24AgentMappingPlan({
  arch9Agents: [arch9Agent],
  property24Agents: [
    {
      agentId: 77959,
      firstname: 'Alex',
      lastname: 'Landman',
      emailAddress: 'alex@arch9.co.za',
      sourceReference: 'ARCH9-AGENT-001',
      agencyId: 31382,
    },
    {
      agentId: 90001,
      firstname: 'Other',
      lastname: 'Agent',
      emailAddress: 'other@example.test',
      sourceReference: 'ARCH9-AGENT-002',
      agencyId: 31382,
    },
  ],
  existingMappings: [
    {
      user_id: arch9Agent.userId,
      property24_agent_id: 90001,
      source_reference: 'ARCH9-AGENT-001',
      status: 'active',
    },
  ],
})
assert.equal(explicitPlan.summary.mappedCount, 1)
assert.equal(explicitPlan.mappings[0].matchType, 'explicit')
assert.equal(explicitPlan.mappings[0].property24Agent.property24AgentId, '90001')

const ambiguousPlan = createProperty24AgentMappingPlan({
  arch9Agents: [arch9Agent],
  property24Agents: [
    {
      agentId: 77959,
      firstname: 'Alex',
      lastname: 'Landman',
      emailAddress: 'alex@arch9.co.za',
      sourceReference: 'ARCH9-AGENT-001',
      agencyId: 31382,
    },
    {
      agentId: 90002,
      firstname: 'Alex',
      lastname: 'Landman',
      emailAddress: 'alex@arch9.co.za',
      sourceReference: 'ARCH9-AGENT-002',
      agencyId: 31382,
    },
  ],
})
assert.equal(ambiguousPlan.summary.ready, false)
assert.equal(ambiguousPlan.needsReview[0].reason, 'ambiguous_property24_agent_match')

const unmappedPlan = createProperty24AgentMappingPlan({
  arch9Agents: [{ ...arch9Agent, email: 'missing@example.test' }],
  property24Agents: [property24Agent],
})
assert.equal(unmappedPlan.summary.ready, false)
assert.equal(unmappedPlan.needsReview[0].reason, 'no_property24_agent_with_matching_email')
assert.match(unmappedPlan.needsReview[0].suggestedSourceReference, /^ARCH9-/)

const missingIdPlan = createProperty24AgentMappingPlan({
  arch9Agents: [arch9Agent],
  property24Agents: [
    {
      firstname: 'Alex',
      lastname: 'Landman',
      emailAddress: 'alex@arch9.co.za',
      sourceReference: 'ARCH9-AGENT-001',
      agencyId: 31382,
    },
  ],
})
assert.equal(missingIdPlan.summary.ready, false)
assert.equal(missingIdPlan.summary.mappedCount, 0)
assert.equal(missingIdPlan.summary.property24AgentMissingIdCount, 1)
assert.equal(missingIdPlan.needsReview[0].reason, 'property24_agent_missing_id')

const catalogPlan = createProperty24CatalogMappingPlan({
  localLocations: [
    {
      id: 'local-sandton',
      suburb: 'Sandton',
      city: 'Johannesburg',
      province: 'Gauteng',
    },
  ],
  localPropertyTypes: [
    {
      key: 'house',
      name: 'House',
    },
  ],
  property24Catalog: {
    suburbs: [
      {
        id: 5864,
        name: 'Sandton',
        cityName: 'Johannesburg',
        provinceName: 'Gauteng',
      },
    ],
    propertyTypes: [
      {
        id: 4,
        description: 'House',
      },
    ],
  },
})
assert.equal(catalogPlan.summary.ready, true)
assert.equal(catalogPlan.locationMappings[0].property24Suburb.id, '5864')
assert.equal(catalogPlan.propertyTypeMappings[0].property24PropertyType.id, '4')

const catalogReviewPlan = createProperty24CatalogMappingPlan({
  localLocations: [{ suburb: 'Unknown', city: 'Johannesburg', province: 'Gauteng' }],
  property24Catalog: { suburbs: [{ id: 1, name: 'Sandton' }] },
})
assert.equal(catalogReviewPlan.summary.ready, false)
assert.equal(catalogReviewPlan.needsReview[0].reason, 'no_property24_suburb_match')

const calls = []
const fakeProperty24 = {
  fetchAgencyAgents: async (agencyId) => {
    calls.push(['agents', agencyId])
    return { status: 200, durationMs: 7, data: [property24Agent] }
  },
  fetchCountries: async () => ({ status: 200, durationMs: 1, data: [{ id: 1, name: 'South Africa' }] }),
  fetchPropertyTypes: async (countryId) => {
    calls.push(['propertyTypes', countryId])
    return { status: 200, durationMs: 1, data: [{ id: 4, description: 'House' }] }
  },
  fetchListingTypes: async (countryId) => {
    calls.push(['listingTypes', countryId])
    return { status: 200, durationMs: 1, data: [{ id: 1, description: 'Sale' }] }
  },
  fetchProvinces: async (countryId) => {
    calls.push(['provinces', countryId])
    return { status: 200, durationMs: 1, data: [{ id: 2, name: 'Gauteng' }] }
  },
  fetchCities: async (provinceId) => {
    calls.push(['cities', provinceId])
    return { status: 200, durationMs: 1, data: [{ id: 3, name: 'Johannesburg' }] }
  },
  fetchSuburbs: async (cityId) => {
    calls.push(['suburbs', cityId])
    return { status: 200, durationMs: 1, data: [{ id: 5864, name: 'Sandton', cityName: 'Johannesburg', provinceName: 'Gauteng' }] }
  },
}

const catalogSnapshot = await fetchProperty24CatalogSnapshot({
  property24: fakeProperty24,
  countryId: 1,
  provinceId: 2,
  cityId: 3,
})
assert.equal(catalogSnapshot.summary.suburbs, 1)
for (const expectedCall of [
  ['propertyTypes', 1],
  ['listingTypes', 1],
  ['provinces', 1],
  ['cities', 2],
  ['suburbs', 3],
]) {
  assert.ok(
    calls.some((call) => call[0] === expectedCall[0] && call[1] === expectedCall[1]),
    `expected ${expectedCall.join(':')} to be called`,
  )
}

const fullPreview = await createProperty24SynchronisationPreview({
  property24: fakeProperty24,
  agencyId: 31382,
  countryId: 1,
  provinceId: 2,
  cityId: 3,
  arch9Agents: [arch9Agent],
  localLocations: [{ suburb: 'Sandton', city: 'Johannesburg', province: 'Gauteng' }],
  localPropertyTypes: [{ key: 'house', name: 'House' }],
})
assert.equal(fullPreview.summary.ready, true)
assert.equal(fullPreview.agentPlan.summary.mappedCount, 1)

const redacted = createRedactedProperty24SynchronisationPreview(fullPreview)
assert.doesNotMatch(JSON.stringify(redacted), /"raw"/)

const clientSource = read('server/services/property24Client.js')
assert.match(clientSource, /updateAgent/)
assert.match(clientSource, /updateAgentProfilePicture/)

const packageJson = JSON.parse(read('package.json'))
assert.equal(packageJson.scripts['property24:sync-preview'], 'node scripts/property24-sync-preview.mjs')
assert.equal(packageJson.scripts['test:property24-phase3-sync'], 'node scripts/property24-phase3-sync.test.mjs')

const rootPackageJson = JSON.parse(fs.readFileSync(new URL('../../package.json', import.meta.url), 'utf8'))
assert.equal(rootPackageJson.scripts['property24:sync-preview'], 'npm --prefix the-it-guy run property24:sync-preview --')

const migration = read('sql/20260820_property24_agent_catalog_mappings.sql')
assert.match(migration, /property24_agent_mappings/)
assert.match(migration, /property24_catalog_mappings/)

const fetchCalls = []
const client = createProperty24Client({
  baseUrl: 'https://api.exdev.property24-test.com',
  username: 'user@example.test',
  password: 'secret',
  fetchImpl: async (url, options) => {
    fetchCalls.push({ url: String(url), options })
    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: { get: () => 'application/json' },
      json: async () => ({ ok: true }),
      text: async () => '',
    }
  },
})
await client.updateAgent({ agentId: 77959 })
await client.updateAgentProfilePicture(77959, { bytes: 'base64' })
assert.equal(fetchCalls[0].options.method, 'PUT')
assert.equal(fetchCalls[0].url, 'https://api.exdev.property24-test.com/listing/v53/agents')
assert.equal(fetchCalls[1].options.method, 'PUT')
assert.equal(fetchCalls[1].url, 'https://api.exdev.property24-test.com/listing/v53/agents/77959/profile-picture')

console.log('Property24 phase 3 synchronisation contract passed')
