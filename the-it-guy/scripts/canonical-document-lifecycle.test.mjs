import assert from 'node:assert/strict'
import { createServer } from 'vite'

const server = await createServer({
  root: process.cwd(),
  logLevel: 'silent',
  server: { middlewareMode: true },
})

function createMockClient(initialRequirement = {}) {
  const state = {
    requirement: { ...initialRequirement },
    events: [],
    reviews: [],
    updates: [],
    artifacts: [],
  }

  class Query {
    constructor(table) {
      this.table = table
      this.action = 'select'
      this.payload = null
      this.single = false
    }

    select() {
      return this
    }

    update(payload) {
      this.action = 'update'
      this.payload = payload
      return this
    }

    insert(payload) {
      this.action = 'insert'
      this.payload = payload
      return this
    }

    eq() {
      return this
    }

    not() {
      return this
    }

    limit() {
      return this
    }

    maybeSingle() {
      this.single = true
      return this.execute()
    }

    single() {
      this.single = true
      return this.execute()
    }

    then(resolve, reject) {
      return this.execute().then(resolve, reject)
    }

    async execute() {
      if (this.table === 'document_requirement_instances') {
        if (this.action === 'update') {
          state.requirement = { ...state.requirement, ...this.payload }
          state.updates.push(this.payload)
          return { data: this.single ? state.requirement : [state.requirement], error: null }
        }
        return { data: this.single ? state.requirement : [state.requirement], error: null }
      }
      if (this.table === 'document_requirement_events') {
        const rows = Array.isArray(this.payload) ? this.payload : [this.payload]
        state.events.push(...rows)
        return { data: rows, error: null }
      }
      if (this.table === 'document_requirement_reviews') {
        const row = {
          id: `review-${state.reviews.length + 1}`,
          ...this.payload,
        }
        state.reviews.push(row)
        return { data: this.single ? row : [row], error: null }
      }
      if (['documents', 'private_listing_documents', 'document_packets', 'document_packet_versions'].includes(this.table)) {
        state.artifacts.push({ table: this.table, payload: this.payload })
        return { data: null, error: null }
      }
      return { data: [], error: null }
    }
  }

  return {
    state,
    from(table) {
      return new Query(table)
    },
  }
}

try {
  const lifecycle = await server.ssrLoadModule('/src/services/documents/canonicalDocumentLifecycleService.js')
  const resolver = await server.ssrLoadModule('/src/services/documents/canonicalDocumentResolverService.js')
  const {
    REQUIREMENT_EVENT_TYPES,
    REQUIREMENT_STATUSES,
    getCurrentSatisfier,
    getRequirementSatisfactionState,
    isRequirementBlocking,
  } = resolver

  const baseRequirement = {
    id: '11111111-1111-4111-8111-111111111111',
    document_definition_key: 'electrical_compliance_certificate',
    context_type: 'custom',
    context_id: '22222222-2222-4222-8222-222222222222',
    pack_key: 'property_compliance',
    requirement_level: 'blocker',
    status: REQUIREMENT_STATUSES.pending,
    stage_gates: ['lodgement_ready'],
    uploadable_by_roles: ['seller'],
    visible_to_roles: ['seller', 'agent'],
    reviewer_role: 'agent',
    document_definitions: {
      key: 'electrical_compliance_certificate',
      review_required: true,
      validity_period_days: 30,
    },
  }

  assert.equal(lifecycle.isCanonicalUploadLifecycleEnabled(), false)
  assert.equal(lifecycle.isCanonicalReviewWorkflowEnabled(), false)
  assert.equal(lifecycle.isCanonicalPacketSatisfactionEnabled(), false)
  assert.equal(lifecycle.isCanonicalWaiverFlowEnabled(), false)

  assert.equal(lifecycle.actorHasInternalAccess('agent'), true)
  assert.equal(lifecycle.actorHasInternalAccess('seller'), false)
  assert.equal(lifecycle.actorCanWaive('agency_admin'), true)
  assert.throws(() => lifecycle.assertCanUploadRequirement(baseRequirement, { actorRole: 'buyer' }), /cannot upload/)
  assert.equal(lifecycle.assertCanUploadRequirement(baseRequirement, { actorRole: 'seller' }), true)
  assert.throws(() => lifecycle.assertCanWaiveRequirement({ actorRole: 'seller', waiverReason: 'Not needed' }), /cannot waive/)
  assert.throws(() => lifecycle.assertCanWaiveRequirement({ actorRole: 'agent' }), /waiver reason/)

  assert.equal(lifecycle.getNextUploadStatus(baseRequirement), REQUIREMENT_STATUSES.underReview)
  assert.equal(lifecycle.canTransitionRequirementStatus(REQUIREMENT_STATUSES.approved, REQUIREMENT_STATUSES.pending), false)
  assert.equal(lifecycle.canTransitionRequirementStatus(REQUIREMENT_STATUSES.rejected, REQUIREMENT_STATUSES.uploaded), true)
  assert.equal(lifecycle.canTransitionRequirementStatus(REQUIREMENT_STATUSES.completed, REQUIREMENT_STATUSES.expired), true)

  const expiry = lifecycle.calculateExpiryDate({
    definition: { validity_period_days: 10 },
    baseDate: new Date('2026-05-01T00:00:00.000Z'),
  })
  assert.equal(expiry, '2026-05-11T00:00:00.000Z')
  assert.equal(lifecycle.isRequirementExpired({ expiry_date: '2026-05-10T00:00:00.000Z' }, new Date('2026-05-11T00:00:00.000Z')), true)
  assert.equal(lifecycle.isRequirementExpired({ expiry_date: '2026-05-12T00:00:00.000Z' }, new Date('2026-05-11T00:00:00.000Z')), false)

  assert.equal(getRequirementSatisfactionState(baseRequirement), 'blocking')
  assert.equal(isRequirementBlocking(baseRequirement, 'lodgement_ready'), true)
  assert.equal(getCurrentSatisfier({ satisfied_by_document_id: '33333333-3333-4333-8333-333333333333' }).type, 'document')

  const uploadClient = createMockClient(baseRequirement)
  const uploadResult = await lifecycle.linkUploadedDocumentToRequirement({
    requirementInstanceId: baseRequirement.id,
    documentId: '33333333-3333-4333-8333-333333333333',
    documentTable: 'documents',
    actorRole: 'seller',
    client: uploadClient,
    force: true,
  })
  assert.equal(uploadResult.requirement.status, REQUIREMENT_STATUSES.underReview)
  assert.equal(uploadClient.state.events.at(-1).event_type, REQUIREMENT_EVENT_TYPES.uploaded)
  assert.equal(uploadClient.state.requirement.satisfied_by_document_id, '33333333-3333-4333-8333-333333333333')

  const replacementClient = createMockClient({
    ...baseRequirement,
    status: REQUIREMENT_STATUSES.rejected,
    rejection_reason: 'Blurry file',
    satisfied_by_document_id: '33333333-3333-4333-8333-333333333333',
  })
  await lifecycle.linkUploadedDocumentToRequirement({
    requirementInstanceId: baseRequirement.id,
    documentId: '44444444-4444-4444-8444-444444444444',
    actorRole: 'seller',
    client: replacementClient,
    force: true,
  })
  assert.equal(replacementClient.state.events.at(-1).event_type, REQUIREMENT_EVENT_TYPES.replaced)
  assert.equal(replacementClient.state.requirement.rejection_reason, null)

  const reviewClient = createMockClient({
    ...baseRequirement,
    status: REQUIREMENT_STATUSES.underReview,
    satisfied_by_document_id: '33333333-3333-4333-8333-333333333333',
  })
  const approved = await lifecycle.approveRequirementReview({
    requirementInstanceId: baseRequirement.id,
    reviewerRole: 'agent',
    reviewerUserId: '55555555-5555-4555-8555-555555555555',
    client: reviewClient,
    force: true,
  })
  assert.equal(approved.requirement.status, REQUIREMENT_STATUSES.approved)
  assert.equal(reviewClient.state.reviews.at(-1).review_status, 'approved')
  assert.equal(reviewClient.state.events.at(-1).event_type, REQUIREMENT_EVENT_TYPES.approved)

  const rejectionClient = createMockClient({
    ...baseRequirement,
    status: REQUIREMENT_STATUSES.underReview,
  })
  const rejected = await lifecycle.requestRequirementReupload({
    requirementInstanceId: baseRequirement.id,
    reviewerRole: 'agent',
    rejectionReason: 'Please upload the signed version.',
    client: rejectionClient,
    force: true,
  })
  assert.equal(rejected.requirement.status, REQUIREMENT_STATUSES.rejected)
  assert.equal(rejectionClient.state.reviews.at(-1).review_status, 'needs_reupload')
  assert.equal(rejectionClient.state.events.at(-1).event_type, REQUIREMENT_EVENT_TYPES.needsReupload)

  const waiverClient = createMockClient(baseRequirement)
  const waived = await lifecycle.waiveRequirement({
    requirementInstanceId: baseRequirement.id,
    actorRole: 'agency_admin',
    waiverReason: 'Attorney confirmed this is not needed for this transaction.',
    client: waiverClient,
    force: true,
  })
  assert.equal(waived.requirement.status, REQUIREMENT_STATUSES.waived)
  assert.equal(waiverClient.state.events.at(-1).event_type, REQUIREMENT_EVENT_TYPES.waived)

  const packetKey = lifecycle.inferPacketRequirementDefinitionKey(
    { packet_type: 'mandate', status: 'completed' },
    { final_signed_file_path: 'signed.pdf' },
  )
  assert.equal(packetKey, 'signed_mandate')
  assert.equal(lifecycle.inferPacketRequirementDefinitionKey({ packet_type: 'otp' }, {}), 'generated_otp')

  const packetClient = createMockClient({
    ...baseRequirement,
    document_definition_key: 'signed_mandate',
    status: REQUIREMENT_STATUSES.pending,
  })
  const packetResult = await lifecycle.linkPacketToRequirement({
    requirementInstanceId: baseRequirement.id,
    packetId: '66666666-6666-4666-8666-666666666666',
    packetVersionId: '77777777-7777-4777-8777-777777777777',
    actorRole: 'system',
    client: packetClient,
    force: true,
  })
  assert.equal(packetResult.requirement.status, REQUIREMENT_STATUSES.completed)
  assert.equal(packetClient.state.events.at(-2).event_type, REQUIREMENT_EVENT_TYPES.packetLinked)
  assert.equal(packetClient.state.events.at(-1).event_type, REQUIREMENT_EVENT_TYPES.completed)

  console.log('canonical-document-lifecycle tests passed')
} finally {
  await server.close()
}
