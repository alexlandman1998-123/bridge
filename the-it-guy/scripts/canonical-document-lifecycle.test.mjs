import assert from 'node:assert/strict'
import { createServer } from 'vite'

const server = await createServer({
  root: process.cwd(),
  logLevel: 'silent',
  server: { middlewareMode: true },
})

function createMockClient(initialRequirement = {}) {
  const initialRequirements = Array.isArray(initialRequirement) ? initialRequirement : [initialRequirement]
  const state = {
    requirements: initialRequirements.map((requirement, index) => ({
      id: requirement.id || `requirement-${index + 1}`,
      ...requirement,
    })),
    events: [],
    reviews: [],
    updates: [],
    artifacts: [],
    transactionRequiredDocuments: [],
    privateListingRequirements: [],
    documentRequests: [],
    legacyWrites: [],
  }
  state.requirement = state.requirements[0] || {}

  const sameValue = (left, right) => String(left ?? '') === String(right ?? '')
  const splitConflictKeys = (value = '') => String(value).split(',').map((item) => item.trim()).filter(Boolean)
  const parseOrFilters = (expression = '') => String(expression)
    .split(',')
    .map((part) => part.match(/^([A-Za-z0-9_]+)\.eq\.(.*)$/))
    .filter(Boolean)
    .map((match) => ({ column: match[1], value: match[2] }))

  function upsertRows(collection, rows, conflictKeys = [], idPrefix = 'row') {
    const written = rows.map((row) => {
      const keys = conflictKeys.length ? conflictKeys : ['id']
      const existingIndex = collection.findIndex((existing) => keys.every((key) => row[key] && sameValue(existing[key], row[key])))
      const existing = existingIndex >= 0 ? collection[existingIndex] : null
      const next = {
        ...(existing || {}),
        ...row,
        id: row.id || existing?.id || `${idPrefix}-${collection.length + 1}`,
      }
      if (existingIndex >= 0) collection[existingIndex] = next
      else collection.push(next)
      return next
    })
    return written
  }

  class Query {
    constructor(table) {
      this.table = table
      this.action = 'select'
      this.payload = null
      this.returnSingle = false
      this.filters = []
      this.neqFilters = []
      this.orFilters = []
      this.limitCount = null
      this.onConflict = []
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

    upsert(payload, options = {}) {
      this.action = 'upsert'
      this.payload = payload
      this.onConflict = splitConflictKeys(options.onConflict)
      return this
    }

    eq(column, value) {
      this.filters.push({ column, value })
      return this
    }

    neq(column, value) {
      this.neqFilters.push({ column, value })
      return this
    }

    not() {
      return this
    }

    or(expression) {
      this.orFilters.push(...parseOrFilters(expression))
      return this
    }

    limit(count) {
      this.limitCount = count
      return this
    }

    maybeSingle() {
      this.returnSingle = true
      return this.execute()
    }

    single() {
      this.returnSingle = true
      return this.execute()
    }

    then(resolve, reject) {
      return this.execute().then(resolve, reject)
    }

    filtered(rows) {
      let result = [...rows]
      for (const filter of this.filters) {
        result = result.filter((row) => sameValue(row?.[filter.column], filter.value))
      }
      for (const filter of this.neqFilters) {
        result = result.filter((row) => !sameValue(row?.[filter.column], filter.value))
      }
      if (this.orFilters.length) {
        result = result.filter((row) => this.orFilters.some((filter) => sameValue(row?.[filter.column], filter.value)))
      }
      if (Number.isFinite(this.limitCount)) result = result.slice(0, Number(this.limitCount))
      return result
    }

    selectResult(rows) {
      const data = this.returnSingle ? (rows[0] || null) : rows
      return { data, error: null }
    }

    async execute() {
      if (this.table === 'document_requirement_instances') {
        if (this.action === 'update') {
          const matches = this.filtered(state.requirements)
          const targets = matches.length ? matches : [state.requirement]
          const updated = targets.map((target) => ({ ...target, ...this.payload }))
          for (const row of updated) {
            const index = state.requirements.findIndex((requirement) => requirement.id === row.id)
            if (index >= 0) state.requirements[index] = row
          }
          state.requirement = updated[0]
          state.updates.push(this.payload)
          return this.selectResult(updated)
        }
        return this.selectResult(this.filtered(state.requirements))
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
        return { data: this.returnSingle ? row : [row], error: null }
      }
      if (this.table === 'transaction_required_documents') {
        if (this.action === 'upsert') {
          const rows = upsertRows(state.transactionRequiredDocuments, Array.isArray(this.payload) ? this.payload : [this.payload], this.onConflict, 'transaction-required-document')
          state.legacyWrites.push({ table: this.table, rows })
          return this.selectResult(rows)
        }
        return this.selectResult(this.filtered(state.transactionRequiredDocuments))
      }
      if (this.table === 'private_listing_document_requirements') {
        if (this.action === 'upsert') {
          const rows = upsertRows(state.privateListingRequirements, Array.isArray(this.payload) ? this.payload : [this.payload], this.onConflict, 'private-listing-requirement')
          state.legacyWrites.push({ table: this.table, rows })
          return this.selectResult(rows)
        }
        return this.selectResult(this.filtered(state.privateListingRequirements))
      }
      if (this.table === 'document_requests') {
        if (this.action === 'upsert') {
          const rows = upsertRows(state.documentRequests, Array.isArray(this.payload) ? this.payload : [this.payload], this.onConflict, 'document-request')
          state.legacyWrites.push({ table: this.table, rows })
          return this.selectResult(rows)
        }
        return this.selectResult(this.filtered(state.documentRequests))
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

  const transactionId = '88888888-8888-4888-8888-888888888888'
  const listingId = '99999999-9999-4999-8999-999999999999'
  const packetRequirementCases = [
    ['generated_mandate', 'generated_mandate', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'],
    ['signed_mandate', 'mandate_signature', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2'],
    ['generated_otp', 'generated_otp', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3'],
    ['signed_otp', 'otp', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4'],
  ]
  const buildPacketRequirements = (targetKey) => packetRequirementCases.map(([definitionKey, legacyKey, id]) => {
    const listingContext = definitionKey === 'generated_mandate'
    return {
      ...baseRequirement,
      id,
      document_definition_key: definitionKey,
      context_type: listingContext ? 'private_listing' : 'transaction',
      context_id: listingContext ? listingId : transactionId,
      listing_id: listingContext ? listingId : null,
      transaction_id: definitionKey === 'generated_otp' ? null : transactionId,
      pack_key: definitionKey.includes('otp') ? 'attorney_transfer_readiness' : 'seller_authority',
      requirement_level: 'blocker',
      status: definitionKey === targetKey ? REQUIREMENT_STATUSES.pending : REQUIREMENT_STATUSES.completed,
      document_definitions: {
        key: definitionKey,
        display_label: legacyKey,
        review_required: false,
      },
    }
  })

  for (const [definitionKey, legacyKey, requirementId] of packetRequirementCases) {
    const packetSyncClient = createMockClient(buildPacketRequirements(definitionKey))
    const packetSyncResult = await lifecycle.linkPacketToRequirement({
      requirementInstanceId: requirementId,
      packetId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
      packetVersionId: 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1',
      packet: {
        packet_type: definitionKey.includes('otp') ? 'otp' : 'mandate',
        status: definitionKey.startsWith('signed') ? 'completed' : 'draft',
      },
      version: definitionKey.startsWith('signed') ? { final_signed_file_path: `${definitionKey}.pdf` } : {},
      actorRole: 'system',
      client: packetSyncClient,
      force: true,
    })
    const projected = packetSyncClient.state.transactionRequiredDocuments.find((row) => row.canonical_requirement_instance_id === requirementId)
    assert.equal(packetSyncResult.requirement.status, REQUIREMENT_STATUSES.completed)
    assert.ok(projected, `${definitionKey} should sync to transaction_required_documents`)
    assert.equal(projected.document_key, legacyKey)
    assert.equal(projected.transaction_id, transactionId)
    assert.equal(projected.status, 'accepted')
    assert.equal(projected.is_uploaded, true)
    assert.ok(packetSyncResult.legacySync.some((entry) => entry.rows?.some((row) => row.canonical_requirement_instance_id === requirementId && row.document_key === legacyKey)))
    assert.ok(packetSyncClient.state.events.some((event) => (
      event.event_type === 'legacy_synced'
      && event.requirement_instance_id === requirementId
      && event.metadata_json?.legacy_table === 'transaction_required_documents'
    )))
  }

  console.log('canonical-document-lifecycle tests passed')
} finally {
  await server.close()
}
