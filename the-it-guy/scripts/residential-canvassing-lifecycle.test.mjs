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
    deleteCanvassingProspect,
    listCanvassingWorkspace,
    readCanvassingFallbackStore,
    updateCanvassingProspect,
  } = await server.ssrLoadModule('/src/lib/canvassingRepository.js')

  const organisationId = 'phase-2-agency'
  const seller = await createCanvassingProspect(organisationId, {
    id: 'seller-prospect-1',
    assignedAgentId: 'agent-1',
    assignedUserId: 'agent-1',
    assignedAgentName: 'Agent One',
    assignedAgentEmail: 'agent.one@example.test',
    firstName: 'Sarah',
    lastName: 'Seller',
    phone: '+27820000001',
    prospectType: 'Seller Prospect',
    area: 'Parkhurst',
    areaSuburb: 'Parkhurst',
    streetAddress: '12 Seller Street',
    formattedAddress: '12 Seller Street, Parkhurst',
    source: 'Cold Call',
    canvassingMethod: 'Cold Call',
    status: 'New',
    sellingIntent: 'Considering selling',
    estimatedPropertyValue: 'R2 500 000',
  })
  assert.equal(seller.id, 'seller-prospect-1', 'seller prospect should be created with its stable id')

  const buyer = await createCanvassingProspect(organisationId, {
    id: 'buyer-prospect-1',
    assignedAgentId: 'agent-1',
    assignedUserId: 'agent-1',
    assignedAgentName: 'Agent One',
    assignedAgentEmail: 'agent.one@example.test',
    firstName: 'Ben',
    lastName: 'Buyer',
    email: 'ben.buyer@example.test',
    prospectType: 'Buyer Prospect',
    area: 'Bryanston',
    areaSuburb: 'Bryanston',
    areaOfInterest: 'Bryanston',
    preferredPropertyType: 'Townhouse',
    budgetRange: 'R1 800 000 - R2 200 000',
    buyerStatus: 'Qualified',
    source: 'Website',
    canvassingMethod: 'Website',
    status: 'Qualified',
  })
  assert.equal(buyer.prospectType, 'Buyer Prospect', 'buyer prospect should be created separately from seller prospects')

  await createCanvassingActivity(organisationId, {
    id: 'seller-call-1',
    prospectId: seller.id,
    agentId: 'agent-1',
    agentName: 'Agent One',
    activityType: 'Call',
    activityNote: 'Initial valuation call completed',
    outcome: 'Connected',
    activityDate: '2026-08-02T09:00:00.000Z',
  })

  const sellerWithFollowUp = await updateCanvassingProspect(organisationId, seller.id, {
    ...seller,
    status: 'Follow Up',
    nextFollowUpDate: '2026-08-05',
    followUpPriority: 'High',
    followUpNote: 'Send valuation pack before next call',
    lastContactOutcome: 'Connected',
  })
  assert.equal(sellerWithFollowUp.nextFollowUpDate, '2026-08-05', 'prospect updates should persist next follow-up date')
  assert.equal(sellerWithFollowUp.followUpPriority, 'High', 'prospect updates should persist follow-up priority')

  const importedBuyer = await createCanvassingProspect(organisationId, {
    id: 'imported-buyer-1',
    assignedAgentId: 'agent-1',
    firstName: 'CSV',
    lastName: 'Buyer',
    phone: '+27820000002',
    prospectType: 'Buyer Prospect',
    areaOfInterest: 'Rosebank',
    source: 'CSV Import',
    canvassingMethod: 'CSV Import',
    status: 'New',
  })
  await createCanvassingActivity(organisationId, {
    id: 'imported-buyer-created-activity',
    prospectId: importedBuyer.id,
    agentId: 'agent-1',
    agentName: 'Agent One',
    activityType: 'Prospect Created',
    activityNote: 'Buyer prospect imported from CSV',
    outcome: 'New',
    metadata: { importRowNumber: 2 },
    activityDate: '2026-08-02T10:00:00.000Z',
  })

  const archivedSeller = await updateCanvassingProspect(organisationId, seller.id, {
    ...sellerWithFollowUp,
    status: 'Lost',
    lostReason: 'Not interested',
    archivedAt: '2026-08-03T08:00:00.000Z',
    notes: 'Archive reason: Not interested',
  })
  await createCanvassingActivity(organisationId, {
    id: 'seller-archive-activity',
    prospectId: seller.id,
    agentId: 'agent-1',
    agentName: 'Agent One',
    activityType: 'Follow-Up',
    activityNote: 'prospect_archived:Not interested',
    outcome: 'Not interested',
    activityDate: '2026-08-03T08:00:00.000Z',
  })
  assert.equal(archivedSeller.status, 'Lost', 'archive workflow should preserve the prospect as Lost instead of deleting it')
  assert.equal(archivedSeller.lostReason, 'Not interested', 'archive workflow should persist the lost reason')
  assert.ok(archivedSeller.archivedAt, 'archive workflow should stamp archivedAt')

  await deleteCanvassingProspect(organisationId, buyer.id)

  const workspace = await listCanvassingWorkspace(organisationId)
  assert.equal(workspace.persistence, 'local', 'lifecycle test should run against local fallback persistence')
  assert.equal(workspace.prospects.length, 2, 'deleted prospects should be removed while archived/imported prospects remain')
  assert.equal(workspace.activities.length, 3, 'delete should cascade local activities for the deleted prospect only')
  assert.equal(workspace.prospects.some((row) => row.id === seller.id && row.status === 'Lost'), true, 'archived seller should remain visible as a durable Lost prospect')
  assert.equal(workspace.prospects.some((row) => row.id === buyer.id), false, 'deleted buyer should not remain in the prospect list')
  assert.equal(workspace.prospects.some((row) => row.id === importedBuyer.id), true, 'imported buyer should remain in the prospect list')
  assert.equal(workspace.activities.some((row) => row.prospectId === seller.id && row.activityType === 'Call'), true, 'logged calls should remain attached to archived prospects')
  assert.equal(workspace.activities.some((row) => row.prospectId === importedBuyer.id && row.metadata?.importRowNumber === 2), true, 'import-created activity should retain import metadata')

  const fallbackStore = readCanvassingFallbackStore(organisationId)
  assert.equal(fallbackStore.persistence, 'local', 'local mutations should mark fallback persistence as local')
  assert.equal(fallbackStore.pendingLocalChanges, true, 'local lifecycle mutations should mark pending local changes')
  assert.equal(
    eventLog.filter((event) => event.type === CANVASSING_UPDATED_EVENT && event.detail?.organisationId === organisationId).length >= 8,
    true,
    'each lifecycle mutation should emit a canvassing-updated event',
  )

  console.log('residential canvassing lifecycle checks passed')
} finally {
  await server.close()
  delete globalThis.window
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
}
