import assert from 'node:assert/strict'
import fs from 'node:fs'
import {
  createProperty24ApiResponse,
  resolveProperty24ListingPublishConfiguration,
} from '../server/property24/index.js'

function read(path) {
  return fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
}

class FakeSupabaseQuery {
  constructor(rows = []) {
    this.rows = Array.isArray(rows) ? rows : []
    this.filters = []
  }

  select() {
    return this
  }

  eq(column, value) {
    this.filters.push({ column, value })
    return this
  }

  or() {
    return this
  }

  limit() {
    return this
  }

  maybeSingle() {
    return Promise.resolve({ data: this.applyFilters()[0] || null, error: null })
  }

  then(resolve, reject) {
    return Promise.resolve({ data: this.applyFilters(), error: null }).then(resolve, reject)
  }

  applyFilters() {
    return this.rows.filter((row) => this.filters.every(({ column, value }) => String(row[column] ?? '') === String(value ?? '')))
  }
}

function createFakeSupabase(tables = {}, user = null) {
  return {
    auth: {
      getUser: async () => ({ data: { user }, error: user ? null : new Error('missing user') }),
    },
    from(table) {
      return new FakeSupabaseQuery(tables[table] || [])
    },
  }
}

const listingId = '00000000-0000-4000-8000-000000000001'
const organisationId = '00000000-0000-4000-8000-000000000002'
const userId = '00000000-0000-4000-8000-000000000003'
const membershipId = '00000000-0000-4000-8000-000000000004'

const baseTables = {
  private_listings: [
    {
      id: listingId,
      organisation_id: organisationId,
      assigned_agent_id: userId,
      created_by: userId,
    },
  ],
  organisation_users: [
    {
      id: membershipId,
      organisation_id: organisationId,
      user_id: userId,
      email: 'alex@arch9.co.za',
      role: 'agent',
      status: 'active',
    },
  ],
  organisation_settings: [
    {
      organisation_id: organisationId,
      settings_json: {
        property24: {
          enabled: true,
          environment: 'exdev',
          agencyId: '31382',
          agentMappings: [
            {
              arch9UserId: userId,
              arch9MembershipId: membershipId,
              arch9Email: 'alex@arch9.co.za',
              property24AgentId: '77959',
              sourceReference: 'ARCH9-AGENT-001',
              matchStatus: 'mapped',
            },
          ],
        },
      },
    },
  ],
  property24_accounts: [],
  property24_agent_mappings: [],
  property24_listing_syncs: [
    {
      private_listing_id: listingId,
      environment: 'exdev',
      agency_id: 31382,
      listing_number: 100314793,
      external_status: 'on_portal',
      is_on_portal: true,
    },
  ],
}

const resolvedFromSettings = await resolveProperty24ListingPublishConfiguration({
  supabase: createFakeSupabase(baseTables),
  listingId,
  config: {
    listingId,
    environment: 'exdev',
    agencyId: '',
    agentId: '',
    agentSourceReference: '',
    syndicationEnabled: false,
  },
})

assert.equal(resolvedFromSettings.agencyId, '31382')
assert.equal(resolvedFromSettings.agentId, '77959')
assert.equal(resolvedFromSettings.agentSourceReference, 'ARCH9-AGENT-001')
assert.equal(resolvedFromSettings.syndicationEnabled, true)
assert.equal(resolvedFromSettings.property24ResolvedMapping.source, 'organisation_settings.property24.agentMappings')
assert.equal(resolvedFromSettings.property24ResolvedMapping.arch9UserId, userId)

const resolvedDisabledSettings = await resolveProperty24ListingPublishConfiguration({
  supabase: createFakeSupabase({
    ...baseTables,
    organisation_settings: [
      {
        organisation_id: organisationId,
        settings_json: {
          property24: {
            ...baseTables.organisation_settings[0].settings_json.property24,
            enabled: false,
          },
        },
      },
    ],
  }),
  listingId,
  config: {
    listingId,
    environment: 'exdev',
    agencyId: '',
    agentId: '',
    agentSourceReference: '',
    syndicationEnabled: true,
  },
})

assert.equal(resolvedDisabledSettings.syndicationEnabled, false)

const resolvedFromTable = await resolveProperty24ListingPublishConfiguration({
  supabase: createFakeSupabase({
    ...baseTables,
    property24_accounts: [
      {
        organisation_id: organisationId,
        environment: 'exdev',
        agency_id: 31382,
        enabled: true,
      },
    ],
    property24_agent_mappings: [
      {
        organisation_id: organisationId,
        environment: 'exdev',
        agency_id: 31382,
        arch9_user_id: userId,
        property24_agent_id: 90001,
        source_reference: 'ARCH9-TABLE-AGENT',
        status: 'active',
      },
    ],
  }),
  listingId,
  config: {
    listingId,
    environment: 'exdev',
    agencyId: '',
    agentId: '',
    agentSourceReference: '',
    syndicationEnabled: false,
  },
})

assert.equal(resolvedFromTable.agencyId, '31382')
assert.equal(resolvedFromTable.agentId, '90001')
assert.equal(resolvedFromTable.agentSourceReference, 'ARCH9-TABLE-AGENT')
assert.equal(resolvedFromTable.property24ResolvedMapping.source, 'property24_agent_mappings')

const resolvedWithExplicitOverride = await resolveProperty24ListingPublishConfiguration({
  supabase: createFakeSupabase(baseTables),
  listingId,
  config: {
    listingId,
    environment: 'exdev',
    explicitAgencyId: '55555',
    explicitAgentId: '77777',
    explicitAgentSourceReference: 'MANUAL-OVERRIDE',
    agencyId: '31382',
    agentId: '',
    agentSourceReference: '',
    syndicationEnabled: false,
  },
})

assert.equal(resolvedWithExplicitOverride.agencyId, '55555')
assert.equal(resolvedWithExplicitOverride.agentId, '77777')
assert.equal(resolvedWithExplicitOverride.agentSourceReference, 'MANUAL-OVERRIDE')

let routeResolverCalled = false
const routeResponse = await createProperty24ApiResponse({
  method: 'POST',
  url: '/api/property24/listings/00000000-0000-4000-8000-000000000001/preview',
  headers: { authorization: 'Bearer test-token' },
  body: JSON.stringify({ suburbId: 5864, propertyTypeId: 4 }),
  env: {
    PROPERTY24_API_INTERNAL_TOKEN: 'test-token',
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role',
  },
  dependencies: {
    createSupabase: () => ({}),
    resolvePublishConfig: async ({ config }) => {
      routeResolverCalled = true
      assert.equal(config.agentId, '')
      return {
        ...config,
        agencyId: '31382',
        agentId: '77959',
        agentSourceReference: 'ARCH9-AGENT-001',
        property24ResolvedMapping: { source: 'organisation_settings.property24.agentMappings' },
      }
    },
    buildSubmitPlan: async ({ agencyId, agentId, agentSourceReference }) => ({
      canSubmit: true,
      dataBlockers: [],
      technicalBlockers: [],
      summary: {
        agencyId,
        contactAgentIds: [Number(agentId)],
        agentSourceReference,
      },
      payload: {
        agencyId: Number(agencyId),
        contactAgentIds: [Number(agentId)],
        photos: [],
      },
    }),
  },
})

assert.equal(routeResolverCalled, true)
assert.equal(routeResponse.status, 200)
assert.equal(routeResponse.body.mapping.source, 'organisation_settings.property24.agentMappings')
assert.equal(routeResponse.body.report.preview.summary.contactAgentIds[0], 77959)

let browserResolverCalled = false
const browserPreviewResponse = await createProperty24ApiResponse({
  method: 'POST',
  url: `/api/property24/listings/${listingId}/preview`,
  headers: { authorization: 'Bearer signed-in-user-token' },
  body: JSON.stringify({ suburbId: 5864, propertyTypeId: 4 }),
  env: {
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role',
  },
  dependencies: {
    createSupabase: () => createFakeSupabase(baseTables, { id: userId, email: 'alex@arch9.co.za' }),
    resolvePublishConfig: async ({ config }) => {
      browserResolverCalled = true
      return {
        ...config,
        agencyId: '31382',
        agentId: '77959',
        agentSourceReference: 'ARCH9-AGENT-001',
        property24ResolvedMapping: { source: 'organisation_settings.property24.agentMappings' },
      }
    },
    buildSubmitPlan: async ({ agentId }) => ({
      canSubmit: true,
      dataBlockers: [],
      technicalBlockers: [],
      summary: { contactAgentIds: [Number(agentId)] },
      payload: { contactAgentIds: [Number(agentId)], photos: [] },
    }),
  },
})

assert.equal(browserResolverCalled, true)
assert.equal(browserPreviewResponse.status, 200)
assert.equal(browserPreviewResponse.body.report.preview.summary.contactAgentIds[0], 77959)

let browserStatusCalled = false
const browserStatusResponse = await createProperty24ApiResponse({
  method: 'GET',
  url: `/api/property24/listings/${listingId}/status?refresh=true`,
  headers: { authorization: 'Bearer signed-in-user-token' },
  env: {
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role',
    PROPERTY24_BASIC_AUTH_USERNAME: 'user@example.test',
    PROPERTY24_BASIC_AUTH_PASSWORD: 'secret',
  },
  dependencies: {
    createSupabase: () => createFakeSupabase(baseTables, { id: userId, email: 'alex@arch9.co.za' }),
    createProperty24: () => ({ checkListingOnPortal: async () => ({ data: true }) }),
    fetchListingStatus: async ({ config }) => {
      browserStatusCalled = true
      return {
        listingNumber: '100314793',
        environment: config.environment,
        portalCheck: { isOnPortal: true },
      }
    },
  },
})

assert.equal(browserStatusCalled, true)
assert.equal(browserStatusResponse.status, 200)
assert.equal(browserStatusResponse.body.status.portalCheck.isOnPortal, true)

let browserStatusUpdateArgs = null
const browserStatusUpdateResponse = await createProperty24ApiResponse({
  method: 'POST',
  url: `/api/property24/listings/${listingId}/status-update`,
  headers: { authorization: 'Bearer signed-in-user-token' },
  body: JSON.stringify({ status: 'Withdrawn' }),
  env: {
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role',
    PROPERTY24_BASIC_AUTH_USERNAME: 'user@example.test',
    PROPERTY24_BASIC_AUTH_PASSWORD: 'secret',
  },
  dependencies: {
    createSupabase: () => createFakeSupabase(baseTables, { id: userId, email: 'alex@arch9.co.za' }),
    createProperty24: () => ({ type: 'property24' }),
    applyStatusUpdate: async (args) => {
      browserStatusUpdateArgs = args
      return {
        status: 'SUBMITTED',
        listingNumber: args.listingNumber,
        listingStatus: args.listingStatus,
        databaseWrite: {
          listingNumber: args.listingNumber,
          property24Status: 'removed',
        },
      }
    },
  },
})

assert.equal(browserStatusUpdateResponse.status, 200)
assert.equal(browserStatusUpdateResponse.body.status, 'SUBMITTED')
assert.equal(browserStatusUpdateArgs.listingNumber, 100314793)
assert.equal(browserStatusUpdateArgs.listingStatus, 'Withdrawn')

const apiSource = read('server/property24/api.js')
assert.match(apiSource, /resolveProperty24ListingPublishConfiguration/)
assert.match(apiSource, /mapping: resolvedConfig\.property24ResolvedMapping/)
assert.match(apiSource, /authenticateBrowserProperty24ListingRequest/)
assert.match(apiSource, /\['previewListing', 'publishListing', 'listingStatus', 'updateListingStatus'\]/)

console.log('Property24 publish mapping resolution contract passed')
