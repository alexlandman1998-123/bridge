import assert from 'node:assert/strict'
import { createServer } from 'vite'

const server = await createServer({
  root: process.cwd(),
  logLevel: 'silent',
  server: { middlewareMode: true },
})

const uuid = (index) => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`

function definition({
  key,
  label,
  pack,
  level = 'required',
  visibility = ['agent'],
  uploadRoles = ['agent'],
  reviewRequired = true,
  validityPeriodDays = null,
}) {
  return {
    key,
    display_label: label || key.replaceAll('_', ' '),
    description: `${label || key} required for canonical staging verification.`,
    category: pack,
    pack_key: pack,
    default_requirement_level: level,
    default_visibility: visibility,
    default_upload_roles: uploadRoles,
    review_required: reviewRequired,
    validity_period_days: validityPeriodDays,
    is_active: true,
  }
}

function rule({
  id,
  key,
  pack,
  contextType,
  condition = {},
  level = null,
  gates = [],
  requestedFrom = null,
  visibleTo = null,
  uploadableBy = null,
  reviewer = 'agent',
  priority = 100,
}) {
  return {
    id,
    document_definition_key: key,
    pack_key: pack,
    context_type: contextType,
    condition_json: condition,
    requirement_level: level,
    stage_gates: gates,
    requested_from_role: requestedFrom,
    visible_to_roles: visibleTo,
    uploadable_by_roles: uploadableBy,
    reviewer_role: reviewer,
    priority,
    is_active: true,
  }
}

function createLifecycleClient(initialRequirement = {}) {
  const state = {
    requirement: { ...initialRequirement },
    requirements: [{ ...initialRequirement }],
    events: [],
    reviews: [],
    legacyWrites: [],
    artifactWrites: [],
  }

  class Query {
    constructor(table) {
      this.table = table
      this.action = 'select'
      this.payload = null
      this.single = false
    }

    select() { return this }
    eq() { return this }
    neq() { return this }
    not() { return this }
    or() { return this }
    in() { return this }
    order() { return this }
    limit() { return this }

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

    upsert(payload) {
      this.action = 'upsert'
      this.payload = payload
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
        if (this.action === 'update' || this.action === 'upsert') {
          const patch = Array.isArray(this.payload) ? this.payload[0] : this.payload
          state.requirement = { ...state.requirement, ...patch }
          state.requirements = [state.requirement]
          return { data: this.single ? state.requirement : [state.requirement], error: null }
        }
        return { data: this.single ? state.requirement : state.requirements, error: null }
      }
      if (this.table === 'document_requirement_events') {
        const rows = Array.isArray(this.payload) ? this.payload : [this.payload]
        state.events.push(...rows)
        return { data: rows, error: null }
      }
      if (this.table === 'document_requirement_reviews') {
        const row = {
          id: uuid(900 + state.reviews.length),
          ...this.payload,
        }
        state.reviews.push(row)
        return { data: this.single ? row : [row], error: null }
      }
      if (['documents', 'private_listing_documents', 'document_packets', 'document_packet_versions'].includes(this.table)) {
        state.artifactWrites.push({ table: this.table, action: this.action, payload: this.payload })
        return { data: this.single ? null : [], error: null }
      }
      if (['private_listing_document_requirements', 'transaction_required_documents', 'document_requests'].includes(this.table)) {
        if (this.action === 'upsert' || this.action === 'insert' || this.action === 'update') {
          const rows = Array.isArray(this.payload) ? this.payload : [this.payload]
          state.legacyWrites.push({ table: this.table, rows })
          return { data: rows, error: null }
        }
        return { data: [], error: null }
      }
      return { data: this.single ? null : [], error: null }
    }
  }

  return {
    state,
    from(table) {
      return new Query(table)
    },
  }
}

function attachIds(requirements, offset = 1) {
  return requirements.map((requirement, index) => ({
    id: uuid(offset + index),
    ...requirement,
  }))
}

function rowsUniqueBy(rows, keyFn) {
  const seen = new Set()
  const duplicates = []
  for (const row of rows) {
    const key = keyFn(row)
    if (seen.has(key)) duplicates.push(key)
    seen.add(key)
  }
  return { unique: duplicates.length === 0, duplicates }
}

function scenarioResult({ id, label, requirements, workspace, gates, parity, adapterRows }) {
  return {
    id,
    label,
    requirementCount: requirements.length,
    requirements: requirements.map((item) => item.document_definition_key).sort(),
    packs: workspace.packs.map((pack) => ({
      key: pack.key,
      total: pack.readiness.total,
      percent: pack.readiness.percentComplete,
      missingBlockers: pack.readiness.missingBlockerCount,
    })),
    keyGates: gates
      .filter((gate) => ['mandate_ready', 'listing_ready', 'attorney_instruction_ready', 'finance_ready', 'lodgement_ready'].includes(gate.gate_key))
      .map((gate) => ({
        gate: gate.gate_key,
        status: gate.status,
        readiness: gate.readiness_percentage,
        blockers: gate.blocker_count,
        canAdvance: gate.can_advance,
      })),
    parity: {
      unmappedLegacyKeyCount: parity.summary.unmappedLegacyKeyCount,
      statusConflictCount: parity.summary.statusConflictCount,
      duplicateActiveCanonicalRequirementCount: parity.summary.duplicateActiveCanonicalRequirementCount,
    },
    adapterProjection: {
      rowCount: adapterRows.length,
      duplicateKeys: rowsUniqueBy(adapterRows, (row) => `${row.private_listing_id || row.transaction_id}:${row.requirement_key || row.document_key}`).duplicates,
    },
  }
}

try {
  const resolver = await server.ssrLoadModule('/src/services/documents/canonicalDocumentResolverService.js')
  const adapter = await server.ssrLoadModule('/src/services/documents/canonicalDocumentAdapterService.js')
  const workspaceService = await server.ssrLoadModule('/src/services/documents/canonicalDocumentWorkspaceService.js')
  const lifecycle = await server.ssrLoadModule('/src/services/documents/canonicalDocumentLifecycleService.js')
  const gates = await server.ssrLoadModule('/src/services/documents/canonicalWorkflowGateService.js')
  const reminders = await server.ssrLoadModule('/src/services/documents/canonicalDocumentReminderService.js')
  const consolidation = await server.ssrLoadModule('/src/services/documents/canonicalDocumentConsolidationService.js')
  const factsModule = await server.ssrLoadModule('/src/services/documents/sellerOnboardingFactTransformer.js')

  const { REQUIREMENT_LEVELS, REQUIREMENT_STATUSES } = resolver

  const definitions = [
    definition({ key: 'seller_id_document', pack: 'seller_identity_fica', visibility: ['seller', 'agent'], uploadRoles: ['seller'] }),
    definition({ key: 'seller_proof_of_address', pack: 'seller_identity_fica', visibility: ['seller', 'agent'], uploadRoles: ['seller'], validityPeriodDays: 90 }),
    definition({ key: 'seller_company_registration', pack: 'seller_identity_fica', visibility: ['seller', 'agent'], uploadRoles: ['seller'] }),
    definition({ key: 'seller_trust_deed', pack: 'seller_identity_fica', visibility: ['seller', 'agent'], uploadRoles: ['seller'] }),
    definition({ key: 'seller_letters_of_authority', pack: 'seller_identity_fica', visibility: ['seller', 'agent'], uploadRoles: ['seller'] }),
    definition({ key: 'seller_executor_authority', pack: 'seller_identity_fica', visibility: ['seller', 'agent'], uploadRoles: ['seller'] }),
    definition({ key: 'seller_marriage_certificate', pack: 'seller_identity_fica', visibility: ['seller', 'agent'], uploadRoles: ['seller'] }),
    definition({ key: 'signed_mandate', pack: 'seller_authority', level: 'blocker', visibility: ['seller', 'agent'], uploadRoles: ['seller', 'agent'], reviewRequired: false }),
    definition({ key: 'generated_mandate', pack: 'attorney_generated_documents', level: 'required', visibility: ['seller', 'agent'], uploadRoles: ['agent'], reviewRequired: false }),
    definition({ key: 'company_resolution_to_sell', pack: 'seller_authority', level: 'blocker', visibility: ['seller', 'agent'], uploadRoles: ['seller'] }),
    definition({ key: 'trust_resolution_to_sell', pack: 'seller_authority', level: 'blocker', visibility: ['seller', 'agent'], uploadRoles: ['seller'] }),
    definition({ key: 'power_of_attorney', pack: 'seller_authority', level: 'required', visibility: ['seller', 'agent'], uploadRoles: ['seller'] }),
    definition({ key: 'title_deed_copy', pack: 'property_ownership', visibility: ['seller', 'agent'], uploadRoles: ['seller'] }),
    definition({ key: 'rates_account', pack: 'property_ownership', visibility: ['seller', 'agent'], uploadRoles: ['seller'] }),
    definition({ key: 'sg_diagram', pack: 'property_ownership', level: 'recommended', visibility: ['seller', 'agent'], uploadRoles: ['seller'] }),
    definition({ key: 'zoning_certificate', pack: 'property_ownership', visibility: ['seller', 'agent'], uploadRoles: ['seller'] }),
    definition({ key: 'occupation_certificate', pack: 'property_ownership', visibility: ['seller', 'agent'], uploadRoles: ['seller'] }),
    definition({ key: 'bond_statement', pack: 'property_finance_existing_bond', level: 'blocker', visibility: ['seller', 'agent'], uploadRoles: ['seller'] }),
    definition({ key: 'bond_bank_details', pack: 'property_finance_existing_bond', visibility: ['seller', 'agent'], uploadRoles: ['seller'] }),
    definition({ key: 'bond_cancellation_notice', pack: 'property_finance_existing_bond', visibility: ['seller', 'agent'], uploadRoles: ['seller'] }),
    definition({ key: 'electrical_compliance_certificate', pack: 'property_compliance', level: 'blocker', visibility: ['seller', 'agent', 'transferring_attorney'], uploadRoles: ['seller'], validityPeriodDays: 730 }),
    definition({ key: 'gas_compliance_certificate', pack: 'property_compliance', level: 'blocker', visibility: ['seller', 'agent', 'transferring_attorney'], uploadRoles: ['seller'] }),
    definition({ key: 'electric_fence_certificate', pack: 'property_compliance', level: 'blocker', visibility: ['seller', 'agent', 'transferring_attorney'], uploadRoles: ['seller'] }),
    definition({ key: 'solar_compliance_documents', pack: 'property_compliance', visibility: ['seller', 'agent', 'transferring_attorney'], uploadRoles: ['seller'] }),
    definition({ key: 'property_condition_disclosure', pack: 'property_compliance', level: 'blocker', visibility: ['seller', 'agent'], uploadRoles: ['seller'] }),
    definition({ key: 'approved_building_plans', pack: 'property_compliance', level: 'recommended', visibility: ['seller', 'agent'], uploadRoles: ['seller'] }),
    definition({ key: 'levy_statement', pack: 'sectional_title_body_corporate', level: 'blocker', visibility: ['seller', 'agent'], uploadRoles: ['seller'] }),
    definition({ key: 'body_corporate_details', pack: 'sectional_title_body_corporate', visibility: ['seller', 'agent'], uploadRoles: ['seller'] }),
    definition({ key: 'hoa_levy_statement', pack: 'estate_hoa', level: 'blocker', visibility: ['seller', 'agent'], uploadRoles: ['seller'] }),
    definition({ key: 'hoa_details', pack: 'estate_hoa', visibility: ['seller', 'agent'], uploadRoles: ['seller'] }),
    definition({ key: 'lease_agreement', pack: 'tenant_occupancy', level: 'blocker', visibility: ['seller', 'agent'], uploadRoles: ['seller'] }),
    definition({ key: 'tenant_details', pack: 'tenant_occupancy', visibility: ['seller', 'agent'], uploadRoles: ['seller'] }),
    definition({ key: 'rental_schedule', pack: 'tenant_occupancy', visibility: ['seller', 'agent'], uploadRoles: ['seller'] }),
    definition({ key: 'floor_plan', pack: 'marketing_assets', level: 'recommended', visibility: ['seller', 'agent'], uploadRoles: ['seller', 'agent'] }),
    definition({ key: 'property_photos', pack: 'marketing_assets', level: 'recommended', visibility: ['seller', 'agent'], uploadRoles: ['seller', 'agent'] }),
    definition({ key: 'buyer_id_document', pack: 'buyer_identity_fica', visibility: ['buyer', 'agent'], uploadRoles: ['buyer'] }),
    definition({ key: 'buyer_proof_of_address', pack: 'buyer_identity_fica', visibility: ['buyer', 'agent'], uploadRoles: ['buyer'], validityPeriodDays: 90 }),
    definition({ key: 'proof_of_funds', pack: 'buyer_finance', level: 'blocker', visibility: ['buyer', 'agent'], uploadRoles: ['buyer'] }),
    definition({ key: 'bond_preapproval', pack: 'buyer_finance', visibility: ['buyer', 'agent', 'bond_originator'], uploadRoles: ['buyer', 'bond_originator'] }),
    definition({ key: 'bond_approval', pack: 'buyer_finance', level: 'blocker', visibility: ['buyer', 'agent', 'bond_originator'], uploadRoles: ['buyer', 'bond_originator'] }),
    definition({ key: 'bond_application_form', pack: 'bond_originator', visibility: ['buyer', 'agent', 'bond_originator'], uploadRoles: ['buyer', 'bond_originator'] }),
    definition({ key: 'generated_otp', pack: 'attorney_generated_documents', visibility: ['buyer', 'seller', 'agent'], uploadRoles: ['agent'], reviewRequired: false }),
    definition({ key: 'signed_otp', pack: 'attorney_transfer_readiness', level: 'blocker', visibility: ['buyer', 'seller', 'agent', 'transferring_attorney'], uploadRoles: ['buyer', 'seller', 'agent'], reviewRequired: false }),
  ]

  const rules = [
    rule({ id: 'r-seller-id', key: 'seller_id_document', pack: 'seller_identity_fica', contextType: 'private_listing', condition: { fact: 'seller.legal_type', operator: 'exists' }, gates: ['mandate_ready', 'listing_ready', 'attorney_instruction_ready'], requestedFrom: 'seller', visibleTo: ['seller', 'agent'], uploadableBy: ['seller'], priority: 1 }),
    rule({ id: 'r-seller-address', key: 'seller_proof_of_address', pack: 'seller_identity_fica', contextType: 'private_listing', condition: { fact: 'seller.legal_type', operator: 'exists' }, gates: ['mandate_ready', 'listing_ready', 'attorney_instruction_ready'], requestedFrom: 'seller', visibleTo: ['seller', 'agent'], uploadableBy: ['seller'], priority: 2 }),
    rule({ id: 'r-company-reg', key: 'seller_company_registration', pack: 'seller_identity_fica', contextType: 'private_listing', condition: { fact: 'seller.legal_type', operator: 'eq', value: 'company' }, gates: ['mandate_ready', 'attorney_instruction_ready'], requestedFrom: 'seller', visibleTo: ['seller', 'agent'], uploadableBy: ['seller'], priority: 3 }),
    rule({ id: 'r-company-resolution', key: 'company_resolution_to_sell', pack: 'seller_authority', contextType: 'private_listing', condition: { fact: 'seller.legal_type', operator: 'eq', value: 'company' }, level: 'blocker', gates: ['mandate_ready', 'attorney_instruction_ready'], requestedFrom: 'seller', visibleTo: ['seller', 'agent'], uploadableBy: ['seller'], priority: 4 }),
    rule({ id: 'r-trust-deed', key: 'seller_trust_deed', pack: 'seller_identity_fica', contextType: 'private_listing', condition: { fact: 'seller.legal_type', operator: 'eq', value: 'trust' }, gates: ['mandate_ready', 'attorney_instruction_ready'], requestedFrom: 'seller', visibleTo: ['seller', 'agent'], uploadableBy: ['seller'], priority: 5 }),
    rule({ id: 'r-trust-loa', key: 'seller_letters_of_authority', pack: 'seller_identity_fica', contextType: 'private_listing', condition: { fact: 'seller.legal_type', operator: 'eq', value: 'trust' }, gates: ['mandate_ready', 'attorney_instruction_ready'], requestedFrom: 'seller', visibleTo: ['seller', 'agent'], uploadableBy: ['seller'], priority: 6 }),
    rule({ id: 'r-trust-resolution', key: 'trust_resolution_to_sell', pack: 'seller_authority', contextType: 'private_listing', condition: { fact: 'seller.legal_type', operator: 'eq', value: 'trust' }, level: 'blocker', gates: ['mandate_ready', 'attorney_instruction_ready'], requestedFrom: 'seller', visibleTo: ['seller', 'agent'], uploadableBy: ['seller'], priority: 7 }),
    rule({ id: 'r-executor', key: 'seller_executor_authority', pack: 'seller_identity_fica', contextType: 'private_listing', condition: { fact: 'seller.legal_type', operator: 'eq', value: 'deceased_estate' }, level: 'blocker', gates: ['mandate_ready', 'attorney_instruction_ready'], requestedFrom: 'seller', visibleTo: ['seller', 'agent'], uploadableBy: ['seller'], priority: 8 }),
    rule({ id: 'r-signed-mandate', key: 'signed_mandate', pack: 'seller_authority', contextType: 'private_listing', condition: { fact: 'seller.legal_type', operator: 'exists' }, level: 'blocker', gates: ['mandate_ready', 'listing_ready', 'attorney_instruction_ready'], requestedFrom: 'seller', visibleTo: ['seller', 'agent'], uploadableBy: ['seller', 'agent'], reviewer: null, priority: 9 }),
    rule({ id: 'r-generated-mandate', key: 'generated_mandate', pack: 'attorney_generated_documents', contextType: 'private_listing', condition: { fact: 'seller.legal_type', operator: 'exists' }, gates: ['mandate_ready'], requestedFrom: 'agent', visibleTo: ['seller', 'agent'], uploadableBy: ['agent'], reviewer: null, priority: 10 }),
    rule({ id: 'r-title', key: 'title_deed_copy', pack: 'property_ownership', contextType: 'private_listing', condition: { fact: 'property.property_type', operator: 'exists' }, gates: ['listing_ready', 'attorney_instruction_ready'], requestedFrom: 'seller', visibleTo: ['seller', 'agent'], uploadableBy: ['seller'], priority: 11 }),
    rule({ id: 'r-rates', key: 'rates_account', pack: 'property_ownership', contextType: 'private_listing', condition: { fact: 'property.property_type', operator: 'exists' }, gates: ['listing_ready', 'attorney_instruction_ready', 'lodgement_ready'], requestedFrom: 'seller', visibleTo: ['seller', 'agent'], uploadableBy: ['seller'], priority: 12 }),
    rule({ id: 'r-disclosure', key: 'property_condition_disclosure', pack: 'property_compliance', contextType: 'private_listing', condition: { fact: 'property.property_type', operator: 'exists' }, level: 'blocker', gates: ['listing_ready', 'otp_ready'], requestedFrom: 'seller', visibleTo: ['seller', 'agent'], uploadableBy: ['seller'], priority: 13 }),
    rule({ id: 'r-electrical', key: 'electrical_compliance_certificate', pack: 'property_compliance', contextType: 'private_listing', condition: { fact: 'property.property_type', operator: 'exists' }, level: 'blocker', gates: ['lodgement_ready', 'registration_ready'], requestedFrom: 'seller', visibleTo: ['seller', 'agent', 'transferring_attorney'], uploadableBy: ['seller'], priority: 14 }),
    rule({ id: 'r-bond-statement', key: 'bond_statement', pack: 'property_finance_existing_bond', contextType: 'private_listing', condition: { fact: 'finance.existing_bond', operator: 'eq', value: true }, level: 'blocker', gates: ['attorney_instruction_ready', 'lodgement_ready'], requestedFrom: 'seller', visibleTo: ['seller', 'agent'], uploadableBy: ['seller'], priority: 15 }),
    rule({ id: 'r-bond-bank', key: 'bond_bank_details', pack: 'property_finance_existing_bond', contextType: 'private_listing', condition: { fact: 'finance.existing_bond', operator: 'eq', value: true }, gates: ['attorney_instruction_ready'], requestedFrom: 'seller', visibleTo: ['seller', 'agent'], uploadableBy: ['seller'], priority: 16 }),
    rule({ id: 'r-bond-cancel', key: 'bond_cancellation_notice', pack: 'property_finance_existing_bond', contextType: 'private_listing', condition: { fact: 'finance.cancellation_required', operator: 'eq', value: true }, gates: ['attorney_instruction_ready', 'lodgement_ready'], requestedFrom: 'seller', visibleTo: ['seller', 'agent'], uploadableBy: ['seller'], priority: 17 }),
    rule({ id: 'r-sectional-levy', key: 'levy_statement', pack: 'sectional_title_body_corporate', contextType: 'private_listing', condition: { fact: 'property.sectional_title', operator: 'eq', value: true }, level: 'blocker', gates: ['attorney_instruction_ready', 'lodgement_ready'], requestedFrom: 'seller', visibleTo: ['seller', 'agent'], uploadableBy: ['seller'], priority: 18 }),
    rule({ id: 'r-body-corp', key: 'body_corporate_details', pack: 'sectional_title_body_corporate', contextType: 'private_listing', condition: { fact: 'property.body_corporate', operator: 'eq', value: true }, gates: ['attorney_instruction_ready'], requestedFrom: 'seller', visibleTo: ['seller', 'agent'], uploadableBy: ['seller'], priority: 19 }),
    rule({ id: 'r-hoa-levy', key: 'hoa_levy_statement', pack: 'estate_hoa', contextType: 'private_listing', condition: { fact: 'property.estate_or_hoa', operator: 'eq', value: true }, level: 'blocker', gates: ['attorney_instruction_ready', 'lodgement_ready'], requestedFrom: 'seller', visibleTo: ['seller', 'agent'], uploadableBy: ['seller'], priority: 20 }),
    rule({ id: 'r-hoa-details', key: 'hoa_details', pack: 'estate_hoa', contextType: 'private_listing', condition: { fact: 'property.estate_or_hoa', operator: 'eq', value: true }, gates: ['attorney_instruction_ready'], requestedFrom: 'seller', visibleTo: ['seller', 'agent'], uploadableBy: ['seller'], priority: 21 }),
    rule({ id: 'r-lease', key: 'lease_agreement', pack: 'tenant_occupancy', contextType: 'private_listing', condition: { fact: 'occupancy.status', operator: 'eq', value: 'tenant_occupied' }, level: 'blocker', gates: ['listing_ready', 'attorney_instruction_ready', 'handover_ready'], requestedFrom: 'seller', visibleTo: ['seller', 'agent'], uploadableBy: ['seller'], priority: 22 }),
    rule({ id: 'r-tenant', key: 'tenant_details', pack: 'tenant_occupancy', contextType: 'private_listing', condition: { fact: 'occupancy.status', operator: 'eq', value: 'tenant_occupied' }, gates: ['listing_ready', 'attorney_instruction_ready', 'handover_ready'], requestedFrom: 'seller', visibleTo: ['seller', 'agent'], uploadableBy: ['seller'], priority: 23 }),
    rule({ id: 'r-rental', key: 'rental_schedule', pack: 'tenant_occupancy', contextType: 'private_listing', condition: { fact: 'occupancy.rental_schedule_available', operator: 'eq', value: true }, gates: ['attorney_instruction_ready'], requestedFrom: 'seller', visibleTo: ['seller', 'agent'], uploadableBy: ['seller'], priority: 24 }),
    rule({ id: 'r-commercial-zoning', key: 'zoning_certificate', pack: 'property_ownership', contextType: 'private_listing', condition: { fact: 'property.commercial_property', operator: 'eq', value: true }, gates: ['listing_ready', 'attorney_instruction_ready'], requestedFrom: 'seller', visibleTo: ['seller', 'agent'], uploadableBy: ['seller'], priority: 25 }),
    rule({ id: 'r-commercial-occupation', key: 'occupation_certificate', pack: 'property_ownership', contextType: 'private_listing', condition: { fact: 'property.commercial_property', operator: 'eq', value: true }, gates: ['attorney_instruction_ready', 'lodgement_ready'], requestedFrom: 'seller', visibleTo: ['seller', 'agent'], uploadableBy: ['seller'], priority: 26 }),
    rule({ id: 'r-gas', key: 'gas_compliance_certificate', pack: 'property_compliance', contextType: 'private_listing', condition: { fact: 'compliance.gas_installation', operator: 'eq', value: true }, level: 'blocker', gates: ['lodgement_ready'], requestedFrom: 'seller', visibleTo: ['seller', 'agent', 'transferring_attorney'], uploadableBy: ['seller'], priority: 27 }),
    rule({ id: 'r-electric-fence', key: 'electric_fence_certificate', pack: 'property_compliance', contextType: 'private_listing', condition: { fact: 'compliance.electric_fence', operator: 'eq', value: true }, level: 'blocker', gates: ['lodgement_ready'], requestedFrom: 'seller', visibleTo: ['seller', 'agent', 'transferring_attorney'], uploadableBy: ['seller'], priority: 28 }),
    rule({ id: 'r-solar', key: 'solar_compliance_documents', pack: 'property_compliance', contextType: 'private_listing', condition: { fact: 'compliance.solar_installation', operator: 'eq', value: true }, gates: ['lodgement_ready'], requestedFrom: 'seller', visibleTo: ['seller', 'agent', 'transferring_attorney'], uploadableBy: ['seller'], priority: 29 }),
    rule({ id: 'r-floor', key: 'floor_plan', pack: 'marketing_assets', contextType: 'private_listing', condition: { fact: 'property.floor_plan_available', operator: 'eq', value: true }, level: 'recommended', gates: ['listing_ready'], requestedFrom: 'seller', visibleTo: ['seller', 'agent'], uploadableBy: ['seller', 'agent'], priority: 30 }),
    rule({ id: 'r-buyer-id', key: 'buyer_id_document', pack: 'buyer_identity_fica', contextType: 'transaction', condition: { fact: 'buyer.legal_type', operator: 'exists' }, gates: ['otp_ready', 'attorney_instruction_ready', 'finance_ready'], requestedFrom: 'buyer', visibleTo: ['buyer', 'agent'], uploadableBy: ['buyer'], priority: 101 }),
    rule({ id: 'r-buyer-address', key: 'buyer_proof_of_address', pack: 'buyer_identity_fica', contextType: 'transaction', condition: { fact: 'buyer.legal_type', operator: 'exists' }, gates: ['otp_ready', 'attorney_instruction_ready', 'finance_ready'], requestedFrom: 'buyer', visibleTo: ['buyer', 'agent'], uploadableBy: ['buyer'], priority: 102 }),
    rule({ id: 'r-proof-funds', key: 'proof_of_funds', pack: 'buyer_finance', contextType: 'transaction', condition: { fact: 'purchase.finance_type', operator: 'in', value: ['cash', 'hybrid'] }, level: 'blocker', gates: ['finance_ready', 'otp_ready'], requestedFrom: 'buyer', visibleTo: ['buyer', 'agent'], uploadableBy: ['buyer'], priority: 103 }),
    rule({ id: 'r-bond-preapproval', key: 'bond_preapproval', pack: 'buyer_finance', contextType: 'transaction', condition: { fact: 'purchase.finance_type', operator: 'in', value: ['bond', 'hybrid'] }, gates: ['finance_ready'], requestedFrom: 'buyer', visibleTo: ['buyer', 'agent', 'bond_originator'], uploadableBy: ['buyer', 'bond_originator'], priority: 104 }),
    rule({ id: 'r-bond-approval', key: 'bond_approval', pack: 'buyer_finance', contextType: 'transaction', condition: { fact: 'purchase.finance_type', operator: 'in', value: ['bond', 'hybrid'] }, level: 'blocker', gates: ['finance_ready', 'attorney_instruction_ready'], requestedFrom: 'buyer', visibleTo: ['buyer', 'agent', 'bond_originator'], uploadableBy: ['buyer', 'bond_originator'], priority: 105 }),
    rule({ id: 'r-bond-app', key: 'bond_application_form', pack: 'bond_originator', contextType: 'transaction', condition: { fact: 'purchase.finance_type', operator: 'in', value: ['bond', 'hybrid'] }, gates: ['finance_ready'], requestedFrom: 'bond_originator', visibleTo: ['buyer', 'agent', 'bond_originator'], uploadableBy: ['buyer', 'bond_originator'], priority: 106 }),
    rule({ id: 'r-generated-otp', key: 'generated_otp', pack: 'attorney_generated_documents', contextType: 'transaction', condition: { fact: 'buyer.legal_type', operator: 'exists' }, gates: ['otp_ready'], requestedFrom: 'agent', visibleTo: ['buyer', 'seller', 'agent'], uploadableBy: ['agent'], reviewer: null, priority: 107 }),
    rule({ id: 'r-signed-otp', key: 'signed_otp', pack: 'attorney_transfer_readiness', contextType: 'transaction', condition: { fact: 'buyer.legal_type', operator: 'exists' }, level: 'blocker', gates: ['otp_ready', 'attorney_instruction_ready'], requestedFrom: 'buyer', visibleTo: ['buyer', 'seller', 'agent', 'transferring_attorney'], uploadableBy: ['buyer', 'seller', 'agent'], reviewer: null, priority: 108 }),
  ]

  function sellerFacts(formData, index) {
    return factsModule.transformSellerOnboardingToFacts(formData, {
      id: uuid(index),
      propertyAddress: formData.propertyAddress,
      propertyStructureType: formData.canonicalPropertyType || formData.propertyType,
    }, {
      contextType: 'private_listing',
      contextId: uuid(index),
      listingId: uuid(index),
    })
  }

  async function resolveScenario({ id, label, contextType, contextId, listingId = null, transactionId = null, facts, expectedKeys = [] }, offset) {
    const input = {
      contextType,
      contextId,
      listingId,
      transactionId,
      facts,
      options: {
        dryRun: true,
        existingInstances: [],
        sourceSystem: 'staging_verification',
        resolverVersion: 'staging_v1',
      },
    }
    const resolved = await resolver.resolveRequirements(input, { client: null, rules, definitions })
    const requirements = attachIds(resolved.generatedInstances, offset).map((item) => ({
      ...item,
      document_definitions: definitions.find((definitionRow) => definitionRow.key === item.document_definition_key),
    }))
    for (const expectedKey of expectedKeys) {
      assert.equal(requirements.some((item) => item.document_definition_key === expectedKey), true, `${id} missing ${expectedKey}`)
    }
    const adapterRows = contextType === 'private_listing'
      ? requirements.map((item) => adapter.canonicalInstanceToPrivateListingRequirement(item))
      : requirements.map((item) => adapter.canonicalInstanceToTransactionRequiredDocument(item))
    const uniqueness = rowsUniqueBy(adapterRows, (row) => `${row.private_listing_id || row.transaction_id}:${row.requirement_key || row.document_key}`)
    assert.equal(uniqueness.unique, true, `${id} produced duplicate legacy adapter keys`)
    const workspace = workspaceService.buildCanonicalDocumentWorkspaceModel({ requirements, role: contextType === 'transaction' ? 'buyer' : 'seller' })
    assert.equal(workspace.packs.length > 0, true, `${id} workspace has no packs`)
    const gateReadiness = gates.evaluateAllGateReadinessFromRequirements(requirements, { enforcementMode: 'off' })
    const parity = consolidation.buildLegacyParityAudit({
      canonicalDefinitions: definitions,
      canonicalInstances: requirements,
      legacyRequirements: adapterRows,
    })
    assert.equal(parity.summary.statusConflictCount, 0, `${id} has status conflicts`)
    return { id, label, facts, requirements, adapterRows, workspace, gateReadiness, parity }
  }

  const scenarioInputs = [
    {
      id: 'A',
      label: 'Individual seller, freehold, no bond, vacant',
      contextType: 'private_listing',
      contextId: uuid(101),
      listingId: uuid(101),
      facts: sellerFacts({
        sellerFirstName: 'Ava',
        sellerSurname: 'Seller',
        email: 'ava@example.com',
        phone: '0820000001',
        ownershipType: 'individual',
        canonicalPropertyType: 'freehold',
        propertyAddress: '1 Freehold Road',
        province: 'Gauteng',
        municipality: 'City of Johannesburg',
        occupancyStatus: 'vacant',
        existingBond: false,
      }, 101),
      expectedKeys: ['seller_id_document', 'seller_proof_of_address', 'signed_mandate', 'title_deed_copy', 'rates_account', 'property_condition_disclosure'],
    },
    {
      id: 'B',
      label: 'Individual seller, sectional title, existing bond, tenant occupied',
      contextType: 'private_listing',
      contextId: uuid(102),
      listingId: uuid(102),
      facts: sellerFacts({
        sellerFirstName: 'Ben',
        sellerSurname: 'Sectional',
        email: 'ben@example.com',
        phone: '0820000002',
        ownershipType: 'individual',
        canonicalPropertyType: 'sectional_title',
        bodyCorporate: true,
        propertyAddress: '2 Sectional Street',
        province: 'Western Cape',
        municipality: 'City of Cape Town',
        occupancyStatus: 'tenant_occupied',
        leaseExists: true,
        tenantName: 'Tenant One',
        rentalScheduleAvailable: true,
        existingBond: true,
        bondBank: 'FNB',
        bondAccountReference: 'BOND-102',
        cancellationRequired: true,
      }, 102),
      expectedKeys: ['bond_statement', 'levy_statement', 'body_corporate_details', 'lease_agreement', 'tenant_details'],
    },
    {
      id: 'C',
      label: 'Company seller, commercial property, existing bond',
      contextType: 'private_listing',
      contextId: uuid(103),
      listingId: uuid(103),
      facts: sellerFacts({
        ownershipType: 'company',
        companyName: 'Company Seller Pty Ltd',
        companyRegistrationNumber: '2024/123456/07',
        companyDirectorName: 'Director One',
        email: 'company@example.com',
        phone: '0820000003',
        canonicalPropertyType: 'commercial',
        propertyAddress: '3 Commercial Avenue',
        province: 'KwaZulu-Natal',
        municipality: 'eThekwini',
        occupancyStatus: 'owner_occupied',
        existingBond: true,
        bondBank: 'ABSA',
        bondAccountReference: 'BOND-103',
        cancellationRequired: true,
      }, 103),
      expectedKeys: ['seller_company_registration', 'company_resolution_to_sell', 'zoning_certificate', 'occupation_certificate', 'bond_statement'],
    },
    {
      id: 'D',
      label: 'Trust seller, estate/HOA property',
      contextType: 'private_listing',
      contextId: uuid(104),
      listingId: uuid(104),
      facts: sellerFacts({
        ownershipType: 'trust',
        trustRegistrationNumber: 'IT1234/2024',
        trusteeName: 'Trustee One',
        email: 'trust@example.com',
        phone: '0820000004',
        canonicalPropertyType: 'estate',
        estateOrHoa: true,
        estateName: 'Estate One',
        propertyAddress: '4 Estate Drive',
        province: 'Gauteng',
        municipality: 'City of Tshwane',
        occupancyStatus: 'vacant',
        existingBond: false,
      }, 104),
      expectedKeys: ['seller_trust_deed', 'seller_letters_of_authority', 'trust_resolution_to_sell', 'hoa_levy_statement', 'hoa_details'],
    },
    {
      id: 'E',
      label: 'Deceased estate seller',
      contextType: 'private_listing',
      contextId: uuid(105),
      listingId: uuid(105),
      facts: sellerFacts({
        ownershipType: 'deceased_estate',
        executorName: 'Executor One',
        email: 'executor@example.com',
        phone: '0820000005',
        canonicalPropertyType: 'freehold',
        propertyAddress: '5 Estate Road',
        province: 'Eastern Cape',
        municipality: 'Nelson Mandela Bay',
        occupancyStatus: 'vacant',
        existingBond: false,
      }, 105),
      expectedKeys: ['seller_executor_authority', 'signed_mandate', 'title_deed_copy'],
    },
    {
      id: 'F',
      label: 'Buyer cash purchase',
      contextType: 'transaction',
      contextId: uuid(201),
      transactionId: uuid(201),
      facts: { buyer: { legal_type: 'individual' }, purchase: { finance_type: 'cash' }, context: { type: 'transaction' } },
      expectedKeys: ['buyer_id_document', 'buyer_proof_of_address', 'proof_of_funds', 'signed_otp'],
    },
    {
      id: 'G',
      label: 'Buyer bond purchase',
      contextType: 'transaction',
      contextId: uuid(202),
      transactionId: uuid(202),
      facts: { buyer: { legal_type: 'individual' }, purchase: { finance_type: 'bond' }, context: { type: 'transaction' } },
      expectedKeys: ['buyer_id_document', 'bond_preapproval', 'bond_approval', 'bond_application_form'],
    },
    {
      id: 'H',
      label: 'Hybrid finance purchase',
      contextType: 'transaction',
      contextId: uuid(203),
      transactionId: uuid(203),
      facts: { buyer: { legal_type: 'individual' }, purchase: { finance_type: 'hybrid' }, context: { type: 'transaction' } },
      expectedKeys: ['proof_of_funds', 'bond_approval', 'bond_preapproval', 'signed_otp'],
    },
  ]

  const resolvedScenarios = []
  for (const [index, scenario] of scenarioInputs.entries()) {
    resolvedScenarios.push(await resolveScenario(scenario, 1000 + index * 100))
  }

  const scenarioB = resolvedScenarios.find((scenario) => scenario.id === 'B')
  const electricalRequirement = scenarioB.requirements.find((item) => item.document_definition_key === 'electrical_compliance_certificate')
  const uploadClient = createLifecycleClient(electricalRequirement)
  const upload = await lifecycle.linkUploadedDocumentToRequirement({
    requirementInstanceId: electricalRequirement.id,
    documentId: uuid(4001),
    actorRole: 'seller',
    client: uploadClient,
    force: true,
  })
  const rejected = await lifecycle.requestRequirementReupload({
    requirementInstanceId: electricalRequirement.id,
    reviewerRole: 'agent',
    rejectionReason: 'Certificate is unreadable.',
    client: uploadClient,
    force: true,
  })
  const replacement = await lifecycle.linkUploadedDocumentToRequirement({
    requirementInstanceId: electricalRequirement.id,
    documentId: uuid(4002),
    actorRole: 'seller',
    replacement: true,
    client: uploadClient,
    force: true,
  })
  const approved = await lifecycle.approveRequirementReview({
    requirementInstanceId: electricalRequirement.id,
    reviewerRole: 'agent',
    client: uploadClient,
    force: true,
  })
  assert.equal(upload.requirement.status, REQUIREMENT_STATUSES.underReview)
  assert.equal(rejected.requirement.status, REQUIREMENT_STATUSES.rejected)
  assert.equal(replacement.requirement.status, REQUIREMENT_STATUSES.underReview)
  assert.equal(approved.requirement.status, REQUIREMENT_STATUSES.approved)

  const scenarioA = resolvedScenarios.find((scenario) => scenario.id === 'A')
  const mandateRequirement = scenarioA.requirements.find((item) => item.document_definition_key === 'signed_mandate')
  const mandateClient = createLifecycleClient(mandateRequirement)
  const mandatePacket = await lifecycle.linkPacketToRequirement({
    requirementInstanceId: mandateRequirement.id,
    packetId: uuid(4101),
    packetVersionId: uuid(4102),
    packet: { packet_type: 'mandate', status: 'completed' },
    version: { final_signed_file_path: 'signed-mandate.pdf' },
    actorRole: 'system',
    client: mandateClient,
    force: true,
  })
  assert.equal(mandatePacket.requirement.status, REQUIREMENT_STATUSES.completed)

  const scenarioH = resolvedScenarios.find((scenario) => scenario.id === 'H')
  const otpRequirement = scenarioH.requirements.find((item) => item.document_definition_key === 'signed_otp')
  const otpClient = createLifecycleClient(otpRequirement)
  const otpPacket = await lifecycle.linkPacketToRequirement({
    requirementInstanceId: otpRequirement.id,
    packetId: uuid(4201),
    packetVersionId: uuid(4202),
    packet: { packet_type: 'otp', status: 'completed' },
    version: { final_signed_file_path: 'signed-otp.pdf' },
    actorRole: 'system',
    client: otpClient,
    force: true,
  })
  assert.equal(otpPacket.requirement.status, REQUIREMENT_STATUSES.completed)

  const expiredCompliance = {
    ...electricalRequirement,
    status: REQUIREMENT_STATUSES.approved,
    expiry_date: '2026-05-01T00:00:00.000Z',
  }
  const expiredGate = gates.evaluateGateReadinessFromRequirements([expiredCompliance], 'lodgement_ready', {
    now: new Date('2026-05-25T00:00:00.000Z'),
    enforcementMode: 'off',
  })
  assert.equal(expiredGate.status, 'blocked')
  assert.equal(expiredGate.expired_count, 1)

  const waiverClient = createLifecycleClient({
    ...scenarioB.requirements.find((item) => item.document_definition_key === 'bond_statement'),
    status: REQUIREMENT_STATUSES.pending,
  })
  const waived = await lifecycle.waiveRequirement({
    requirementInstanceId: waiverClient.state.requirement.id,
    actorRole: 'agency_admin',
    waiverReason: 'Approved exception for staging verification.',
    client: waiverClient,
    force: true,
  })
  const waivedGate = gates.evaluateGateReadinessFromRequirements([waived.requirement], 'attorney_instruction_ready', { enforcementMode: 'off' })
  assert.equal(waived.requirement.status, REQUIREMENT_STATUSES.waived)
  assert.equal(waivedGate.status, 'ready')
  assert.equal(waiverClient.state.events.some((event) => event.event_type === 'waived'), true)

  const reminderRequirements = scenarioB.requirements.map((item) => ({
    ...item,
    requested_from_contact_id: item.requested_from_role === 'seller' ? uuid(5001) : item.requested_from_contact_id,
  }))
  const firstPlan = reminders.buildReminderPlan({
    requirements: reminderRequirements,
    contactsByRole: {
      seller: { id: uuid(5001), email: 'seller@example.com' },
      agent: { id: uuid(5002), email: 'agent@example.com' },
    },
    context: { property_address: '2 Sectional Street' },
    now: new Date('2026-05-25T08:00:00.000Z'),
  })
  assert.equal(firstPlan.scheduled.length > 0, true)
  const duplicatePlan = reminders.buildReminderPlan({
    requirements: reminderRequirements,
    existingReminders: firstPlan.scheduled.map((group, index) => ({
      id: uuid(6000 + index),
      status: 'scheduled',
      reminder_count: 1,
      last_reminded_at: '2026-05-25T07:30:00.000Z',
      metadata_json: { group_key: group.groupKey },
    })),
    contactsByRole: {
      seller: { id: uuid(5001), email: 'seller@example.com' },
      agent: { id: uuid(5002), email: 'agent@example.com' },
    },
    context: { property_address: '2 Sectional Street' },
    now: new Date('2026-05-25T08:00:00.000Z'),
  })
  assert.equal(duplicatePlan.scheduled.length, 0)
  assert.equal(duplicatePlan.suppressedGroups.every((group) => group.suppressedReason === 'recently_reminded'), true)
  assert.equal(reminders.areCanonicalEmailRemindersEnabled(), false)
  assert.equal(reminders.areCanonicalWhatsappRemindersEnabled(), false)

  const fallback = {
    legacyPrimaryMode: consolidation.getCanonicalDocumentRolloutMode() === 'legacy_primary',
    parityMode: consolidation.getCanonicalDocumentRolloutMode({ parityMode: true }) === 'parity',
    canonicalPrimaryMode: consolidation.getCanonicalDocumentRolloutMode({ sourceOfTruth: true }) === 'canonical_primary',
    canonicalOnlyMode: consolidation.getCanonicalDocumentRolloutMode({
      sourceOfTruth: true,
      legacyGenerationDisabled: true,
      legacyReadsDisabled: true,
    }) === 'canonical_only',
    legacyFallbackAvailableInCanonicalPrimary: consolidation.shouldUseLegacyReadFallback({ sourceOfTruth: true }),
    legacyFallbackDisabledInCanonicalOnly: !consolidation.shouldUseLegacyReadFallback({
      sourceOfTruth: true,
      legacyGenerationDisabled: true,
      legacyReadsDisabled: true,
    }),
    sellerLegacyGenerationRunsInParity: consolidation.shouldRunLegacyGeneration('seller_document_requirement_engine', { parityMode: true }),
    sellerLegacyGenerationStopsWhenDisabled: !consolidation.shouldRunLegacyGeneration('seller_document_requirement_engine', { legacyGenerationDisabled: true }),
  }
  assert.equal(Object.values(fallback).every(Boolean), true)

  const allRequirements = resolvedScenarios.flatMap((scenario) => scenario.requirements)
  const allLegacyRows = resolvedScenarios.flatMap((scenario) => scenario.adapterRows)
  const parityAudit = consolidation.buildLegacyParityAudit({
    canonicalDefinitions: definitions,
    canonicalInstances: allRequirements,
    legacyRequirements: allLegacyRows,
  })
  const duplicateReport = consolidation.buildCanonicalDataIntegrityReport({
    canonicalDefinitions: definitions,
    canonicalInstances: allRequirements,
    legacyRequirements: allLegacyRows,
  })

  assert.equal(parityAudit.summary.statusConflictCount, 0)
  assert.equal(duplicateReport.duplicateActiveRequirementInstances.length, 0)

  const report = {
    verificationScope: 'dry_run_staging_harness_no_remote_mutation',
    externalRemindersEnabled: {
      email: reminders.areCanonicalEmailRemindersEnabled(),
      whatsapp: reminders.areCanonicalWhatsappRemindersEnabled(),
    },
    hardBlocksEnabled: gates.areCanonicalWorkflowGateHardBlocksEnabled(),
    scenarios: resolvedScenarios.map((scenario) => scenarioResult({
      id: scenario.id,
      label: scenario.label,
      requirements: scenario.requirements,
      workspace: scenario.workspace,
      gates: scenario.gateReadiness,
      parity: scenario.parity,
      adapterRows: scenario.adapterRows,
    })),
    legacyParity: {
      ...parityAudit.summary,
      missingCanonicalMappings: parityAudit.missingCanonicalMappings,
      legacyOnlyKeys: parityAudit.legacyOnlyKeys,
    },
    duplicateRequirementReport: {
      duplicateActiveRequirementInstances: duplicateReport.duplicateActiveRequirementInstances,
      requirementsWithNoResponsibleUploader: duplicateReport.requirementsWithNoResponsibleUploader,
      requirementsWithInvalidVisibilityRoles: duplicateReport.requirementsWithInvalidVisibilityRoles,
    },
    uploadReviewLifecycle: {
      uploadStatus: upload.requirement.status,
      rejectionStatus: rejected.requirement.status,
      replacementStatus: replacement.requirement.status,
      approvalStatus: approved.requirement.status,
      events: uploadClient.state.events.map((event) => event.event_type),
      reviews: uploadClient.state.reviews.map((review) => review.review_status),
    },
    generatedPacketSatisfaction: {
      signedMandateStatus: mandatePacket.requirement.status,
      signedOtpStatus: otpPacket.requirement.status,
      mandateEvents: mandateClient.state.events.map((event) => event.event_type),
      otpEvents: otpClient.state.events.map((event) => event.event_type),
    },
    workflowGateChecks: {
      expiredComplianceBlocksLodgement: expiredGate.status === 'blocked' && expiredGate.expired_count === 1,
      waivedBlockerAllowsReadiness: waivedGate.status === 'ready' && waived.requirement.status === REQUIREMENT_STATUSES.waived,
      hardBlocksEnabled: gates.areCanonicalWorkflowGateHardBlocksEnabled(),
    },
    reminderSafety: {
      firstScheduledGroups: firstPlan.scheduled.length,
      duplicateScheduledGroups: duplicatePlan.scheduled.length,
      duplicateSuppressedGroups: duplicatePlan.suppressedGroups.length,
      externalEmailEnabled: reminders.areCanonicalEmailRemindersEnabled(),
      externalWhatsappEnabled: reminders.areCanonicalWhatsappRemindersEnabled(),
    },
    rollbackVerification: {
      ...fallback,
      rollbackSteps: consolidation.buildRollbackPlan().steps,
    },
    blockersBeforeCanonicalPrimary: [
      'This harness did not mutate or inspect a live staging Supabase database.',
      'This harness did not run browser-level DOM verification against the deployed staging portal.',
      'Production-like legacy historical rows still need report-only backfill/parity audit before source-of-truth flags are enabled.',
    ],
    recommendation: 'remain_in_parity_until_live_staging_database_and_browser_verification_pass',
  }

  console.log(JSON.stringify(report, null, 2))
} finally {
  await server.close()
}
