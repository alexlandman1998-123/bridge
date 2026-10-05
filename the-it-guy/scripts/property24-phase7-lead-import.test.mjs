import assert from 'node:assert/strict'
import fs from 'node:fs'
import {
  createProperty24ApiResponse,
  importProperty24PreparedLeads,
  pullAndImportProperty24Leads,
} from '../server/property24/index.js'

function read(path) {
  return fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
}

function createTableQuery(table, rowsByTable, operations) {
  const state = {
    action: 'select',
    payload: null,
    filters: [],
    inFilters: [],
    limitValue: null,
    onConflict: '',
  }
  const query = {
    select(columns) {
      state.columns = columns
      operations.push({ table, op: 'select', columns })
      return this
    },
    insert(payload) {
      state.action = 'insert'
      state.payload = payload
      operations.push({ table, op: 'insert', payload })
      return this
    },
    upsert(payload, options = {}) {
      state.action = 'upsert'
      state.payload = payload
      state.onConflict = options.onConflict || ''
      operations.push({ table, op: 'upsert', payload, options })
      return this
    },
    eq(column, value) {
      state.filters.push({ column, value })
      operations.push({ table, op: 'eq', column, value })
      return this
    },
    in(column, values) {
      state.inFilters.push({ column, values })
      operations.push({ table, op: 'in', column, values })
      return this
    },
    order(column, options = {}) {
      operations.push({ table, op: 'order', column, options })
      return this
    },
    limit(value) {
      state.limitValue = value
      operations.push({ table, op: 'limit', value })
      return this
    },
    maybeSingle() {
      return execute(true)
    },
    single() {
      return execute(true)
    },
    then(resolve, reject) {
      return execute(false).then(resolve, reject)
    },
  }

  async function execute(single) {
    rowsByTable[table] ||= []
    if (state.action === 'insert') {
      const payloads = Array.isArray(state.payload) ? state.payload : [state.payload]
      rowsByTable[table].push(...payloads)
      return { data: single ? payloads[0] : payloads, error: null }
    }
    if (state.action === 'upsert') {
      const payloads = Array.isArray(state.payload) ? state.payload : [state.payload]
      const conflictColumns = state.onConflict.split(',').map((item) => item.trim()).filter(Boolean)
      const saved = payloads.map((payload) => {
        const existingIndex = conflictColumns.length
          ? rowsByTable[table].findIndex((row) => conflictColumns.every((column) => String(row[column]) === String(payload[column])))
          : -1
        if (existingIndex >= 0) {
          rowsByTable[table][existingIndex] = { ...rowsByTable[table][existingIndex], ...payload }
          return rowsByTable[table][existingIndex]
        }
        rowsByTable[table].push(payload)
        return payload
      })
      return { data: single ? saved[0] : saved, error: null }
    }

    let data = rowsByTable[table] || []
    for (const filter of state.filters) {
      data = data.filter((row) => String(row[filter.column]) === String(filter.value))
    }
    for (const filter of state.inFilters) {
      const allowed = new Set(filter.values.map(String))
      data = data.filter((row) => allowed.has(String(row[filter.column])))
    }
    if (state.limitValue) data = data.slice(0, state.limitValue)
    return { data: single ? data[0] || null : data, error: null }
  }

  return query
}

function createFakeSupabase(initialRows = {}) {
  const rowsByTable = Object.fromEntries(Object.entries(initialRows).map(([table, rows]) => [table, [...rows]]))
  const operations = []
  return {
    rowsByTable,
    operations,
    from(table) {
      return createTableQuery(table, rowsByTable, operations)
    },
  }
}

const readyLead = {
  source: 'Property24',
  externalReference: 'P24-LEAD-001',
  dedupeKey: 'dedupe-001',
  listingNumber: 100314793,
  listingId: '11111111-1111-4111-8111-111111111111',
  organisationId: '22222222-2222-4222-8222-222222222222',
  receivedAt: '2026-08-20T09:30:00.000Z',
  contactName: 'Alex Buyer',
  email: 'alex.buyer@example.test',
  phone: '067 000 0000',
  message: 'Please call me about this listing.',
  readyForCrmIngestion: true,
  raw: { LeadId: 'P24-LEAD-001' },
}

const listing = {
  id: readyLead.listingId,
  organisation_id: readyLead.organisationId,
  development_id: '44444444-4444-4444-8444-444444444444',
  assigned_agent_id: '33333333-3333-4333-8333-333333333333',
  assigned_agent_email: 'agent@example.test',
  title: '7A Stegman Street',
}

const supabase = createFakeSupabase({
  contacts: [],
  leads: [],
  lead_listing_interests: [],
  lead_activities: [],
  tasks: [],
  lead_ingestion_logs: [],
  developments: [{
    id: listing.development_id,
    organisation_id: readyLead.organisationId,
    name: 'Junoah Estate',
    status: 'active',
  }],
  developer_leads: [],
  developer_lead_private_details: [],
  developer_lead_development_interests: [],
})

const imported = await importProperty24PreparedLeads({
  supabase,
  leads: [
    readyLead,
    { ...readyLead, externalReference: 'P24-LEAD-002', duplicateInResponse: true },
    { ...readyLead, externalReference: 'P24-LEAD-003', readyForCrmIngestion: false, listingId: '' },
  ],
  listingDetailsById: new Map([[listing.id, listing]]),
})

assert.equal(imported.summary.receivedCount, 3)
assert.equal(imported.summary.importedCount, 1)
assert.equal(imported.summary.needsReviewCount, 2)
assert.equal(supabase.rowsByTable.contacts.length, 1)
assert.equal(supabase.rowsByTable.contacts[0].email, 'alex.buyer@example.test')
assert.equal(supabase.rowsByTable.leads.length, 1)
assert.equal(supabase.rowsByTable.leads[0].lead_source, 'Property24')
assert.equal(supabase.rowsByTable.leads[0].lead_category, 'buyer')
assert.equal(supabase.rowsByTable.leads[0].listing_id, readyLead.listingId)
assert.equal(supabase.rowsByTable.lead_listing_interests.length, 1)
assert.equal(supabase.rowsByTable.lead_activities.length, 1)
assert.equal(supabase.rowsByTable.tasks.length, 1)
assert.equal(supabase.rowsByTable.lead_ingestion_logs.length, 1)
assert.equal(supabase.rowsByTable.lead_ingestion_logs[0].external_reference, 'P24-LEAD-001')
assert.equal(supabase.rowsByTable.developer_leads.length, 1)
assert.equal(supabase.rowsByTable.developer_leads[0].source_lead_id, supabase.rowsByTable.leads[0].lead_id)
assert.equal(supabase.rowsByTable.developer_leads[0].primary_development_id, listing.development_id)
assert.equal(supabase.rowsByTable.developer_leads[0].lead_owner, 'developer')
assert.equal(supabase.rowsByTable.developer_leads[0].ownership_model, 'developer_direct')
assert.equal(supabase.rowsByTable.developer_leads[0].visibility_state, 'full')
assert.equal(supabase.rowsByTable.developer_lead_private_details.length, 1)
assert.equal(supabase.rowsByTable.developer_lead_private_details[0].handover_source, 'developer')
assert.equal(supabase.rowsByTable.developer_lead_development_interests.length, 1)

const duplicate = await importProperty24PreparedLeads({
  supabase,
  leads: [readyLead],
  listingDetailsById: new Map([[listing.id, listing]]),
})
assert.equal(duplicate.summary.alreadyImportedCount, 1)
assert.equal(supabase.rowsByTable.leads.length, 1)

const outsideAgencySupabase = createFakeSupabase({
  developments: [{
    id: listing.development_id,
    organisation_id: '55555555-5555-4555-8555-555555555555',
    name: 'Agency marketed estate',
    status: 'active',
  }],
})
const outsideAgencyImport = await importProperty24PreparedLeads({
  supabase: outsideAgencySupabase,
  leads: [{ ...readyLead, externalReference: 'P24-OTHER-AGENCY', dedupeKey: 'other-agency' }],
  listingDetailsById: new Map([[listing.id, listing]]),
})
assert.equal(outsideAgencyImport.summary.importedCount, 1)
assert.equal(outsideAgencySupabase.rowsByTable.developer_leads[0].lead_owner, 'agency')
assert.equal(outsideAgencySupabase.rowsByTable.developer_leads[0].visibility_state, 'limited')
assert.equal(outsideAgencySupabase.rowsByTable.developer_lead_private_details[0].handover_source, 'agency')

const planOnly = await pullAndImportProperty24Leads({
  supabase: createFakeSupabase({
    property24_listing_syncs: [
      {
        private_listing_id: listing.id,
        environment: 'exdev',
        agency_id: 31382,
        listing_number: readyLead.listingNumber,
      },
    ],
    private_listings: [listing],
  }),
  property24: {
    fetchListingLeads: async () => ({
      status: 200,
      durationMs: 5,
      data: { leads: [{ ListingNumber: readyLead.listingNumber, LeadId: 'DRY-1', EmailAddress: 'dry@example.test' }] },
    }),
  },
  config: { environment: 'exdev', agencyId: 31382, applyLeads: false },
  now: new Date('2026-08-20T10:00:00.000Z'),
})
assert.equal(planOnly.mode, 'DRY_RUN')
assert.equal(planOnly.safety.databaseWritten, false)

let listingCheck = null
const listingOnlyPlan = await pullAndImportProperty24Leads({
  supabase: createFakeSupabase({
    property24_listing_syncs: [{
      private_listing_id: listing.id,
      environment: 'production',
      agency_id: 40067,
      listing_number: 116565928,
    }],
    private_listings: [{ ...listing, listing_status: 'active', property24_status: 'published' }],
  }),
  property24: {
    fetchListingLeads: async () => ({ status: 200, durationMs: 5, data: { leads: [] } }),
    fetchListingLeadsForListing: async (listingNumber, dates) => {
      listingCheck = { listingNumber, dates }
      return {
        status: 200,
        durationMs: 5,
        data: { Leads: [{ ContactName: 'New Buyer', EmailAddress: 'buyer@example.test', ReceivedAt: '2026-09-27T09:00:00.000Z' }] },
      }
    },
  },
  config: { environment: 'production', agencyId: 40067, applyLeads: false },
  now: new Date('2026-09-27T12:00:00.000Z'),
})
assert.equal(listingCheck.listingNumber, 116565928)
assert.equal(listingCheck.dates.startDate, '2026-08-28T12:00:00.000Z')
assert.equal(listingCheck.dates.endDate, '2026-09-27T14:00:00.000Z')
assert.equal(listingOnlyPlan.summary.receivedCount, 1)
assert.equal(listingOnlyPlan.summary.readyForCrmIngestionCount, 1)
assert.equal(listingOnlyPlan.leads[0].contactName, 'New Buyer')
assert.equal(listingOnlyPlan.leads[0].listingNumber, 116565928)
assert.equal(listingOnlyPlan.property24.listingChecks[0].receivedCount, 1)
assert.equal(listingOnlyPlan.property24.listingChecks[0].lookaheadFallback, false)

const sharedLead = { ListingNumber: 116565928, ContactName: 'New Buyer', EmailAddress: 'buyer@example.test', ReceivedAt: '2026-09-27T09:00:00.000Z' }
const overlappingPlan = await pullAndImportProperty24Leads({
  supabase: createFakeSupabase({
    property24_listing_syncs: [{ private_listing_id: listing.id, environment: 'production', agency_id: 40067, listing_number: 116565928 }],
    private_listings: [{ ...listing, listing_status: 'active', property24_status: 'published' }],
  }),
  property24: {
    fetchListingLeads: async () => ({ status: 200, data: { leads: [sharedLead] } }),
    fetchListingLeadsForListing: async () => ({ status: 200, data: { leads: [sharedLead] } }),
  },
  config: { environment: 'production', agencyId: 40067, applyLeads: false },
  now: new Date('2026-09-27T12:00:00.000Z'),
})
assert.equal(overlappingPlan.summary.receivedCount, 2)
assert.equal(overlappingPlan.summary.readyForCrmIngestionCount, 1)
assert.equal(overlappingPlan.leads[1].duplicateInResponse, true)

// Actual v55 agency response uses messages/contactNumber. Published seller
// leads still need the per-listing fallback, and pages must all be read.
const officialLead = { listingNumber: 116565928, name: 'Portal Buyer', contactNumber: '0821234567', date: '2026-09-27T09:00:00Z', message: 'Please call' }
const pageRequests = []
let fallbackChecks = 0
const officialPlan = await pullAndImportProperty24Leads({
  supabase: createFakeSupabase({
    property24_listing_syncs: [{ private_listing_id: listing.id, environment: 'production', agency_id: 40067, listing_number: 116565928, is_on_portal: true }],
    private_listings: [{ ...listing, listing_status: 'seller_lead', property24_status: 'published' }],
  }),
  property24: {
    fetchListingLeads: async ({ after }) => { pageRequests.push(after); return { status: 200, data: pageRequests.length === 1
      ? { messages: Array.from({ length: 1000 }, (_, i) => ({ ...officialLead, message: 'Enquiry '+i })), nextAfter: '2026-09-27T09:01:00Z' }
      : { messages: [officialLead, { ...officialLead, agencyId: 99999 }, { ...officialLead, listingNumber: 99999999, agencyId: 40067, message: 'Unlinked' }], nextAfter: '2026-09-27T10:00:00Z' } } },
    fetchListingLeadsForListing: async () => { fallbackChecks++; return { status: 200, data: [officialLead] } },
  },
  config: { environment: 'production', agencyId: 40067, organisationId: listing.organisation_id, applyLeads: false },
  now: new Date('2026-09-27T12:00:00Z'),
})
assert.equal(pageRequests.length, 2)
assert.equal(pageRequests[1], '2026-09-27T09:01:00.000Z')
assert.equal(fallbackChecks, 1)
assert.equal(officialPlan.summary.receivedCount, 1003)
assert.equal(officialPlan.leads[0].phone, '0821234567')
assert.equal(officialPlan.leads[1001].listingId, null)
assert.equal(officialPlan.leads[1001].organisationId, listing.organisation_id)
assert.equal(officialPlan.leads[1001].readyForCrmIngestion, true)
assert.equal(officialPlan.leads[1002].duplicateInResponse, true)

const historicalChecks = []
const historicalSupabase = createFakeSupabase()
const historicalPlan = await pullAndImportProperty24Leads({
  supabase: historicalSupabase,
  property24: {
    fetchListingLeads: async () => ({ status: 200, data: { messages: [70001, 70002, 70003, 70004]
      .map((listingNumber) => ({ ...officialLead, listingNumber })) } }),
    fetchAgencyListingStatistics: async (params) => {
      historicalChecks.push(params)
      return { status: 200, data: params.listingType === 'Sale'
        ? [{ listingNumber: 70001, agencyId: 40067 }, { listingNumber: 70002, agencyId: 99999 }, { listingNumber: 70004, agencyId: 40067 }]
        : [{ listingNumber: 70003, agencyId: 40067 }, { listingNumber: 70004, agencyId: 99999 }] }
    },
  },
  config: { environment: 'production', agencyId: 40067, organisationId: listing.organisation_id, applyLeads: true, sendNotifications: false },
  now: new Date('2026-09-27T12:00:00Z'),
})
assert.equal(historicalChecks.length, 2)
assert.ok(historicalChecks.every((check) => check.agencyIds[0] === 40067 && check.startDate === '2026-08-27' && check.endDate === '2026-09-28'))
assert.equal(historicalPlan.import.summary.importedCount, 2)
assert.equal(historicalPlan.import.summary.needsReviewCount, 2)
assert.equal(historicalPlan.leads[0].listingId, null)
assert.equal(historicalPlan.leads[0].organisationId, listing.organisation_id)
assert.equal(historicalPlan.leads[1].readyForCrmIngestion, false)
assert.equal(historicalPlan.leads[2].listingType, 'Rental')
assert.equal(historicalPlan.leads[3].readyForCrmIngestion, false)
assert.equal(historicalPlan.leads[2].agencyVerification.source, 'property24_listing_statistics')
assert.equal(historicalSupabase.rowsByTable.leads[1].raw_enquiry_payload.listingType, 'Rental')
assert.equal(historicalSupabase.rowsByTable.leads[1].raw_enquiry_payload.agencyVerification.agencyId, 40067)
assert.match(historicalSupabase.rowsByTable.leads[1].notes, /Property24 enquiry type: Rental/)
const unavailableHistory = await pullAndImportProperty24Leads({
  supabase: createFakeSupabase(),
  property24: {
    fetchListingLeads: async () => ({ status: 200, data: { messages: [{ ...officialLead, listingNumber: 70001 }] } }),
    fetchAgencyListingStatistics: async () => { throw new Error('Provider unavailable') },
  },
  config: { environment: 'production', agencyId: 40067, organisationId: listing.organisation_id, applyLeads: false },
  now: new Date('2026-09-27T12:00:00Z'),
})
assert.equal(unavailableHistory.leads[0].readyForCrmIngestion, false)
assert.equal(unavailableHistory.property24.ownershipChecks.length, 2)

const apiApply = await createProperty24ApiResponse({
  method: 'POST',
  url: '/api/property24/leads/pull',
  headers: { 'x-property24-api-token': 'token' },
  body: JSON.stringify({ applyLeads: true }),
  env: {
    PROPERTY24_API_INTERNAL_TOKEN: 'token',
    PROPERTY24_SYNDICATION_ENABLED: 'true',
    SUPABASE_URL: 'https://supabase.example.test',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role',
    PROPERTY24_BASIC_AUTH_USERNAME: 'user@example.test',
    PROPERTY24_BASIC_AUTH_PASSWORD: 'secret',
    PROPERTY24_DEFAULT_AGENCY_ID: '31382',
  },
  dependencies: {
    createSupabase: () => ({ type: 'supabase' }),
    createProperty24: () => ({ type: 'property24' }),
    pullAndImportLeads: async ({ config }) => ({
      mode: config.applyLeads ? 'APPLIED' : 'DRY_RUN',
      import: { summary: { importedCount: config.applyLeads ? 1 : 0 } },
      summary: { receivedCount: 1 },
    }),
  },
})
assert.equal(apiApply.status, 200)
assert.equal(apiApply.body.leads.mode, 'APPLIED')
assert.equal(apiApply.body.leads.import.summary.importedCount, 1)

for (const path of [
  'server/property24/leadImportService.js',
  'scripts/property24-pull-leads.mjs',
]) {
  assert.ok(fs.existsSync(new URL(`../${path}`, import.meta.url)), `${path} should exist`)
}
assert.match(read('server/property24/api.js'), /applyLeads/)
assert.match(read('scripts/property24-pull-leads.mjs'), /--apply/)
const packageJson = JSON.parse(read('package.json'))
assert.equal(packageJson.scripts['property24:pull-leads'], 'node scripts/property24-pull-leads.mjs')
assert.equal(packageJson.scripts['test:property24-phase7-lead-import'], 'node scripts/property24-phase7-lead-import.test.mjs')
const rootPackageJson = JSON.parse(fs.readFileSync(new URL('../../package.json', import.meta.url), 'utf8'))
assert.equal(rootPackageJson.scripts['property24:pull-leads'], 'npm --prefix the-it-guy run property24:pull-leads --')
