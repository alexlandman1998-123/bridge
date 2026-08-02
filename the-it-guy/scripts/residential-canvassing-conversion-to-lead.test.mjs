import assert from 'node:assert/strict'
import { createServer } from 'vite'

const originalEnv = {
  VITE_APP_ENV: process.env.VITE_APP_ENV,
  VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL,
  VITE_SUPABASE_ANON_KEY: process.env.VITE_SUPABASE_ANON_KEY,
  VITE_SUPABASE_KEY: process.env.VITE_SUPABASE_KEY,
  VITE_ALLOW_UNSAFE_LOCAL_FALLBACKS: process.env.VITE_ALLOW_UNSAFE_LOCAL_FALLBACKS,
  VITE_ENABLE_LOCAL_FALLBACKS: process.env.VITE_ENABLE_LOCAL_FALLBACKS,
}

process.env.VITE_APP_ENV = 'development'
process.env.VITE_SUPABASE_URL = ''
process.env.VITE_SUPABASE_ANON_KEY = ''
process.env.VITE_SUPABASE_KEY = ''
process.env.VITE_ALLOW_UNSAFE_LOCAL_FALLBACKS = 'true'
process.env.VITE_ENABLE_LOCAL_FALLBACKS = 'true'

function normalizeText(value) {
  return String(value || '').trim()
}

function createLocalStorage() {
  const values = new Map()
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null
    },
    setItem(key, value) {
      values.set(key, String(value))
    },
    removeItem(key) {
      values.delete(key)
    },
    clear() {
      values.clear()
    },
  }
}

const eventLog = []
const localStorage = createLocalStorage()
globalThis.window = {
  localStorage,
  dispatchEvent(event) {
    eventLog.push({ type: event.type, detail: event.detail })
  },
}

if (typeof globalThis.CustomEvent !== 'function') {
  globalThis.CustomEvent = class CustomEvent extends Event {
    constructor(type, options = {}) {
      super(type, options)
      this.detail = options.detail
    }
  }
}

const server = await createServer({
  root: process.cwd(),
  logLevel: 'silent',
  envFile: false,
  server: { middlewareMode: true },
})

try {
  const {
    CANVASSING_UPDATED_EVENT,
    createCanvassingActivity,
    createCanvassingProspect,
    listCanvassingWorkspace,
    readCanvassingFallbackStore,
    updateCanvassingProspect,
  } = await server.ssrLoadModule('/src/lib/canvassingRepository.js')
  const {
    addLeadActivity,
    createAgencyLead,
    getAgencyCrmUpdatedEventName,
    getAgencyPipelineSnapshot,
  } = await server.ssrLoadModule('/src/lib/agencyPipelineService.js')
  const { buildLeadRequirementPayload } = (await server.ssrLoadModule('/src/services/leadRequirementService.js')).__leadRequirementServiceTestUtils
  const { buildAgentPerformanceModel } = await server.ssrLoadModule('/src/modules/agency/agents/agentPerformanceUtils.js')

  const organisationId = '11111111-1111-4111-8111-111111111111'
  const branchId = '22222222-2222-4222-8222-222222222222'
  const agentId = '33333333-3333-4333-8333-333333333333'
  const prospectId = 'buyer-conversion-prospect-1'
  const convertedAt = '2026-08-02T12:30:00.000Z'

  const prospect = await createCanvassingProspect(organisationId, {
    id: prospectId,
    branchId,
    assignedAgentId: agentId,
    assignedUserId: agentId,
    assignedAgentName: 'Agent One',
    assignedAgentEmail: 'agent.one@example.test',
    firstName: 'Busi',
    lastName: 'Buyer',
    phone: '+27820000003',
    email: 'busi.buyer@example.test',
    prospectType: 'Buyer Prospect',
    area: 'Bryanston',
    areaSuburb: 'Bryanston',
    areaOfInterest: 'Bryanston, Sandton',
    preferredPropertyType: 'Townhouse',
    budgetRange: 'R1 800 000 - R2 200 000',
    bedrooms: '3',
    financeStatus: 'Pre-approved',
    timeframe: '0-3 months',
    subjectToSale: 'No',
    followUpPriority: 'High',
    source: 'Cold Call',
    canvassingMethod: 'Cold Call',
    status: 'Qualified',
    notes: 'Bathrooms: 2',
  })

  const conversionPayload = {
    contact: {
      firstName: prospect.firstName,
      lastName: prospect.lastName,
      phone: prospect.phone,
      email: prospect.email,
      contactType: 'buyer',
      notes: prospect.notes,
    },
    assignedAgent: {
      id: agentId,
      userId: agentId,
      branchId,
      name: prospect.assignedAgentName,
      fullName: prospect.assignedAgentName,
      email: prospect.assignedAgentEmail,
    },
    branchId,
    assignedUserId: agentId,
    createdBy: agentId,
    leadCategory: 'buyer',
    leadDirection: 'Outbound',
    leadSource: 'Canvassing',
    stage: 'Lead',
    status: 'Lead',
    priority: prospect.followUpPriority,
    areaInterest: prospect.areaOfInterest,
    propertyInterest: prospect.preferredPropertyType,
    canvassingProspectId: prospect.id,
    notes: [
      prospect.notes,
      `Canvassing Method: ${prospect.canvassingMethod}`,
      `Source: ${prospect.source}`,
      `Area Of Interest: ${prospect.areaOfInterest}`,
      `Budget: ${prospect.budgetRange}`,
      `Canvassing Prospect ID: ${prospect.id}`,
    ].filter(Boolean).join(' | '),
  }

  const createdLead = createAgencyLead(organisationId, conversionPayload, {
    actor: { id: agentId, name: 'Agent One', email: 'agent.one@example.test' },
  })
  const repeatedLead = createAgencyLead(organisationId, conversionPayload, {
    actor: { id: agentId, name: 'Agent One', email: 'agent.one@example.test' },
  })
  assert.equal(repeatedLead.leadId, createdLead.leadId, 'repeat conversion should reuse the existing lead for the canvassing prospect')

  const requirementPayload = buildLeadRequirementPayload({
    organisationId,
    leadId: createdLead.leadId,
    contactId: createdLead.contactId,
    title: 'Qualification snapshot',
    intentType: 'buy',
    propertyTypes: [prospect.preferredPropertyType],
    areas: prospect.areaOfInterest,
    suburbs: prospect.areaSuburb,
    budgetMin: 1800000,
    budgetMax: 2200000,
    bedroomsMin: 3,
    bathroomsMin: 2,
    financeStatus: 'pre_approved',
    preApproved: true,
    urgency: 'high',
    notes: [
      prospect.notes,
      `Canvassing method: ${prospect.canvassingMethod}`,
      `Source: ${prospect.source}`,
      `Canvassing prospect ID: ${prospect.id}`,
    ].join('\n'),
    status: 'active',
    isPrimary: true,
    createdBy: agentId,
  })
  assert.deepEqual(requirementPayload.areas, ['Bryanston', 'Sandton'], 'buyer conversion should carry multiple areas into the requirement payload')
  assert.equal(requirementPayload.budget_min, 1800000)
  assert.equal(requirementPayload.budget_max, 2200000)
  assert.equal(requirementPayload.bathrooms_min, 2)
  assert.equal(requirementPayload.pre_approved, true)

  const crmConversionActivity = addLeadActivity(organisationId, createdLead.leadId, {
    agent: { id: agentId, name: 'Agent One', email: 'agent.one@example.test' },
    activityType: 'Lead Created',
    activityNote: 'canvassing_prospect_converted',
    outcome: 'Converted from canvassing prospect',
    activityDate: convertedAt,
  })

  const savedProspect = await updateCanvassingProspect(organisationId, prospect.id, {
    ...prospect,
    status: 'Converted to Lead',
    convertedLeadId: createdLead.leadId,
    convertedAt,
  })
  const canvassingConversionActivity = await createCanvassingActivity(organisationId, {
    id: 'buyer-conversion-canvassing-activity',
    prospectId: prospect.id,
    agentId,
    agentName: 'Agent One',
    activityType: 'Note',
    activityNote: 'Prospect converted to Buyer lead',
    outcome: createdLead.leadId,
    activityDate: convertedAt,
  })

  const pipelineSnapshot = getAgencyPipelineSnapshot(organisationId)
  const linkedLeads = pipelineSnapshot.leads.filter((row) => normalizeText(row?.canvassingProspectId) === prospect.id)
  assert.equal(linkedLeads.length, 1, 'converted prospect should create exactly one CRM lead')
  assert.equal(linkedLeads[0].leadId, createdLead.leadId)
  assert.equal(linkedLeads[0].leadSource, 'Canvassing')
  assert.equal(linkedLeads[0].leadCategory, 'buyer')
  assert.equal(linkedLeads[0].leadDirection, 'Outbound')
  assert.equal(linkedLeads[0].assignedAgentId, agentId)
  assert.equal(linkedLeads[0].assignedUserId, agentId)
  assert.equal(linkedLeads[0].branchId, branchId)
  assert.match(linkedLeads[0].notes, /Canvassing Prospect ID: buyer-conversion-prospect-1/)

  const leadCreatedActivities = pipelineSnapshot.leadActivities.filter(
    (row) => row.leadId === createdLead.leadId && row.activityType === 'Lead Created',
  )
  assert.equal(leadCreatedActivities.length, 2, 'conversion should have the automatic lead-created audit and the explicit conversion audit')
  assert.equal(
    leadCreatedActivities.some((row) => row.activityNote === 'canvassing_prospect_converted' && row.outcome === 'Converted from canvassing prospect'),
    true,
    'lead activity should describe the canvassing conversion source',
  )

  const canvassingWorkspace = await listCanvassingWorkspace(organisationId)
  const convertedProspect = canvassingWorkspace.prospects.find((row) => row.id === prospect.id)
  assert.equal(convertedProspect.status, 'Converted to Lead')
  assert.equal(convertedProspect.convertedLeadId, createdLead.leadId)
  assert.equal(convertedProspect.convertedAt, convertedAt)
  assert.equal(savedProspect.convertedLeadId, createdLead.leadId)
  assert.equal(
    canvassingWorkspace.activities.some((row) => row.id === canvassingConversionActivity.id && row.outcome === createdLead.leadId),
    true,
    'canvassing activity should retain the created lead id for back-navigation',
  )

  const performance = buildAgentPerformanceModel({
    agents: [{ id: agentId, name: 'Agent One', email: 'agent.one@example.test' }],
    leads: pipelineSnapshot.leads,
    activities: pipelineSnapshot.leadActivities,
    canvassingProspects: canvassingWorkspace.prospects,
    canvassingActivities: canvassingWorkspace.activities,
    now: new Date('2026-08-02T13:00:00.000Z'),
  })
  assert.equal(performance.agents[0].performance.totalLeads, 1, 'converted canvassing lead should count as a lead in performance')
  assert.ok(performance.agents[0].performance.activityVolume >= 2, 'conversion activity should contribute to agent performance activity volume')
  assert.equal(
    performance.intelligence.recentActivity.some((event) => event.action === 'Lead Created' && event.timestamp === convertedAt),
    true,
    'conversion lead activity should appear in recent performance activity',
  )

  const fallbackStore = readCanvassingFallbackStore(organisationId)
  assert.equal(fallbackStore.pendingLocalChanges, true, 'conversion should leave canvassing fallback changes pending sync')
  assert.equal(eventLog.some((event) => event.type === CANVASSING_UPDATED_EVENT && event.detail?.organisationId === organisationId), true)
  assert.equal(eventLog.some((event) => event.type === getAgencyCrmUpdatedEventName()), true)

  console.log('residential canvassing conversion-to-lead checks passed')
} finally {
  await server.close()
  delete globalThis.window
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
}
