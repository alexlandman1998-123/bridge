import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createServer } from 'vite'

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))

function keys(items = []) {
  return new Set(items.map((item) => item.key || item.requirement_key || item.document_key || item.document_definition_key || item.generated?.document_definition_key).filter(Boolean))
}

function assertHas(actualKeys, key, message) {
  assert.equal(actualKeys.has(key), true, message || `expected ${key}`)
}

function director(index, signing = false) {
  return {
    full_name: `Director ${index}`,
    id_number: `9001015009${String(index).padStart(3, '0')}`,
    email: `director${index}@example.com`,
    residential_address: `${index} Director Road`,
    signing_authority: signing ? 'yes' : 'no',
  }
}

function trustee(index, signing = false) {
  return {
    full_name: `Trustee ${index}`,
    id_number: `9201015009${String(index).padStart(3, '0')}`,
    email: `trustee${index}@example.com`,
    residential_address: `${index} Trustee Lane`,
    signing_authority: signing ? 'yes' : 'no',
  }
}

function buyerDefinition(key, pack = 'buyer_identity_fica') {
  return {
    key,
    display_label: key,
    category: pack,
    pack_key: pack,
    default_requirement_level: key.includes('authority_validity') ? 'blocker' : 'required',
    default_visibility: ['buyer', 'agent', 'attorney'],
    default_upload_roles: ['buyer', 'agent', 'attorney'],
  }
}

function buildMockClient(seed = {}) {
  const state = {
    transactions: seed.transactions || [],
    units: seed.units || [],
    transaction_workflow_instances: [],
    transaction_workflow_steps: [],
    transaction_workflow_evidence: [],
    transaction_rollups: [],
    transaction_rollup_audit: [],
    transaction_workflow_events: [],
  }

  class Query {
    constructor(table) {
      this.table = table
      this.filters = []
      this.orderBy = null
      this.single = false
      this.limitValue = null
      this.rangeValue = null
      this.action = 'select'
      this.payload = null
      this.onConflict = ''
    }

    select() {
      return this
    }

    eq(field, value) {
      this.filters.push((row) => row?.[field] === value)
      return this
    }

    order(field, options = {}) {
      this.orderBy = { field, ascending: options.ascending !== false }
      return this
    }

    limit(value) {
      this.limitValue = value
      return this
    }

    range(from, to) {
      this.rangeValue = { from, to }
      return this
    }

    maybeSingle() {
      this.single = true
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
      this.onConflict = options.onConflict || ''
      return this
    }

    update(payload) {
      this.action = 'update'
      this.payload = payload
      return this
    }

    _rows() {
      return state[this.table] || []
    }

    _nextId(prefix = 'row') {
      return `${prefix}-${this._rows().length + 1}`
    }

    _filterRows(rows) {
      let filtered = [...rows]
      for (const fn of this.filters) {
        filtered = filtered.filter(fn)
      }
      if (this.orderBy) {
        const { field, ascending } = this.orderBy
        filtered.sort((left, right) => {
          const a = left?.[field] || ''
          const b = right?.[field] || ''
          if (a === b) return 0
          return ascending ? (a < b ? -1 : 1) : (a > b ? -1 : 1)
        })
      }
      if (this.rangeValue) {
        filtered = filtered.slice(this.rangeValue.from, this.rangeValue.to + 1)
      }
      if (Number.isFinite(this.limitValue)) {
        filtered = filtered.slice(0, this.limitValue)
      }
      return filtered
    }

    _conflictKeys() {
      return String(this.onConflict || '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
    }

    _upsertRows(rows) {
      const payloadRows = Array.isArray(this.payload) ? this.payload : [this.payload]
      const inserted = []
      const conflictKeys = this._conflictKeys()

      for (const incoming of payloadRows) {
        const next = { ...incoming }
        let existingIndex = -1
        if (conflictKeys.length) {
          existingIndex = rows.findIndex((row) =>
            conflictKeys.every((key) => row?.[key] === next?.[key]),
          )
        } else if (next.id) {
          existingIndex = rows.findIndex((row) => row?.id === next.id)
        }

        if (existingIndex >= 0) {
          rows[existingIndex] = { ...rows[existingIndex], ...next }
          inserted.push(rows[existingIndex])
        } else {
          if (!next.id) next.id = this._nextId(this.table.replace(/[^a-z]/g, '') || 'row')
          rows.push(next)
          inserted.push(next)
        }
      }

      return inserted
    }

    _applyUpdate(rows) {
      const targets = this._filterRows(rows)
      for (const row of targets) {
        Object.assign(row, this.payload)
      }
      return targets
    }

    async execute() {
      const rows = this._rows()
      if (this.action === 'select') {
        const filtered = this._filterRows(rows)
        return { data: this.single ? filtered[0] || null : filtered, error: null }
      }
      if (this.action === 'insert' || this.action === 'upsert') {
        const inserted = this._upsertRows(rows)
        return { data: inserted, error: null }
      }
      if (this.action === 'update') {
        const updated = this._applyUpdate(rows)
        return { data: this.single ? updated[0] || null : updated, error: null }
      }
      return { data: [], error: null }
    }

    then(resolve, reject) {
      return this.execute().then(resolve, reject)
    }
  }

  return {
    state,
    from(table) {
      return new Query(table)
    },
  }
}

assert.equal(
  packageJson.scripts?.['test:legal-authority-validity'],
  'node scripts/legal-authority-validity-phase7.test.mjs',
  'package.json should expose the Phase 7 legal authority-validity contract.',
)

const server = await createServer({
  root: process.cwd(),
  logLevel: 'silent',
  server: { middlewareMode: true },
})

try {
  const authorityGates = await server.ssrLoadModule('/server/workflows/authorityValidityWorkflowGates.js')
  const transactionGates = await server.ssrLoadModule('/server/workflows/transactionWorkflowGates.js')
  const workflowModel = await server.ssrLoadModule('/server/services/transactionWorkflowModelService.js')
  const actionService = await server.ssrLoadModule('/server/services/workflowActionService.js')
  const { deriveOnboardingConfiguration } = await server.ssrLoadModule('/src/lib/purchaserPersonas.js')
  const {
    buildSellerRequirementProfile,
    getRequiredSellerDocuments,
  } = await server.ssrLoadModule('/src/lib/sellerDocumentRequirementEngine.js')
  const {
    buildProjectedTransactionRequirementCandidates,
  } = await server.ssrLoadModule('/src/services/documents/transactionCanonicalDocumentRequirementService.js')

  const {
    AUTHORITY_VALIDITY_GATE_KEYS,
    evaluateAuthorityValidityWorkflowGates,
    areAuthorityValidityWorkflowGatesSatisfied,
  } = authorityGates

  {
    const buyerCompany = deriveOnboardingConfiguration({
      purchaser_type: 'company',
      purchase_finance_type: 'cash',
      company: {
        directors: [director(1, true), director(2)],
      },
    })
    const documentKeys = keys(buyerCompany.requiredDocuments)
    assertHas(documentKeys, 'company_resolution')
    assertHas(documentKeys, 'buyer_authority_validity_review')
  }

  {
    const buyerTrust = deriveOnboardingConfiguration({
      purchaser_type: 'trust',
      purchase_finance_type: 'cash',
      trust: {
        trustees: [trustee(1, true), trustee(2)],
      },
    })
    const documentKeys = keys(buyerTrust.requiredDocuments)
    assertHas(documentKeys, 'trust_resolution')
    assertHas(documentKeys, 'buyer_authority_validity_review')
  }

  {
    const sellerCompany = buildSellerRequirementProfile({
      status: 'onboarding_completed',
      sellerOnboarding: {
        status: 'completed',
        formData: {
          ownershipType: 'company',
          companyDirectors: [director(1, true), director(2)],
        },
      },
    })
    const documentKeys = keys(getRequiredSellerDocuments(sellerCompany))
    assertHas(documentKeys, 'company_resolution_to_sell')
    assertHas(documentKeys, 'seller_authority_validity_review')
  }

  const unresolvedBuyerCompany = {
    id: 'tx-authority-unresolved',
    purchaser_type: 'company',
    company_resolution_status: 'approved',
    documents: [{ document_key: 'company_resolution', status: 'approved' }],
    buyer_authority_validity_json: {
      company_resolution_uploaded: true,
      company_resolution_status: 'approved',
      directors: [director(1, true), director(2)],
    },
  }
  const unresolvedEvaluation = evaluateAuthorityValidityWorkflowGates(unresolvedBuyerCompany)
  assert.equal(unresolvedEvaluation.hasAuthoritySubjects, true)
  assert.equal(
    unresolvedEvaluation.gates[AUTHORITY_VALIDITY_GATE_KEYS.legalAuthorityValidityReady].ready,
    false,
    'uploaded/approved resolution document must not prove authority validity',
  )
  assert.equal(
    unresolvedEvaluation.gates[AUTHORITY_VALIDITY_GATE_KEYS.legalAuthorityValidityReady].blockers.some((blocker) =>
      blocker.code === 'LEGAL_AUTHORITY_VALIDITY_REVIEW_REQUIRED',
    ),
    true,
  )
  assert.equal(
    areAuthorityValidityWorkflowGatesSatisfied(unresolvedBuyerCompany, AUTHORITY_VALIDITY_GATE_KEYS.legalAuthorityValidityReady),
    false,
  )
  assert.equal(
    transactionGates.isWorkflowGateSatisfied(AUTHORITY_VALIDITY_GATE_KEYS.legalAuthorityValidityReady, { transaction: unresolvedBuyerCompany }),
    false,
  )

  const reviewedBuyerCompany = {
    purchaser_type: 'company',
    buyer_authority_validity_json: {
      reviewed_at: '2026-07-11T09:00:00.000Z',
      reviewed_by: 'attorney-1',
      signatory_name: 'Director 1',
      signatory_matches_resolution: true,
      quorum_confirmed: true,
      transaction_scope_confirmed: true,
    },
  }
  assert.equal(
    evaluateAuthorityValidityWorkflowGates(reviewedBuyerCompany).gates[AUTHORITY_VALIDITY_GATE_KEYS.legalAuthorityValidityReady].ready,
    true,
  )

  const reviewedSellerTrust = {
    seller_type: 'trust',
    seller_authority_validity_json: {
      reviewed_at: '2026-07-11T09:00:00.000Z',
      reviewed_by: 'attorney-1',
      authorised_trustee_name: 'Trustee 1',
      signatory_confirmed: true,
      all_trustees_signed: true,
      transaction_scope_confirmed: true,
      letters_of_authority_current: true,
    },
  }
  assert.equal(
    evaluateAuthorityValidityWorkflowGates(reviewedSellerTrust).gates[AUTHORITY_VALIDITY_GATE_KEYS.legalAuthorityValidityReady].ready,
    true,
  )

  const canonicalProjection = buildProjectedTransactionRequirementCandidates({
    transaction: {
      id: 'tx-canonical-authority',
      finance_type: 'cash',
      purchaser_type: 'company',
      buyer_entity_type: 'company',
      seller_entity_type: 'individual',
      current_main_stage: 'OTP',
      stage: 'OTP Signed',
    },
    formData: {
      purchaser_type: 'company',
      purchase_finance_type: 'cash',
      company: { directors: [director(1, true)] },
    },
    definitions: [
      buyerDefinition('buyer_company_registration_documents'),
      buyerDefinition('buyer_company_resolution'),
      buyerDefinition('buyer_authority_validity_review'),
      buyerDefinition('buyer_director_ids'),
    ],
  })
  const projectedKeys = keys(canonicalProjection.candidates.map((candidate) => candidate.generated || candidate))
  assertHas(projectedKeys, 'buyer_company_resolution')
  assertHas(projectedKeys, 'buyer_authority_validity_review')

  const transaction = {
    id: 'tx-authority-action',
    unit_id: 'unit-authority-action',
    finance_type: 'cash',
    purchaser_type: 'company',
    current_main_stage: 'OTP',
    stage: 'OTP In Progress',
    onboarding_status: 'approved',
    seller_onboarding_status: 'approved',
    lifecycle_state: 'active',
    seller_has_existing_bond: false,
    company_resolution_status: 'approved',
    buyer_authority_validity_json: {
      company_resolution_uploaded: true,
      company_resolution_status: 'approved',
      directors: [director(1, true), director(2)],
    },
    updated_at: '2026-07-11T09:00:00.000Z',
    created_at: '2026-07-10T09:00:00.000Z',
  }
  const client = buildMockClient({
    transactions: [transaction],
    units: [{ id: 'unit-authority-action', status: 'OTP In Progress' }],
  })

  await workflowModel.ensureTransactionWorkflowInstances('tx-authority-action', { client, transaction })
  for (const key of [
    'buyer_onboarding_complete',
    'seller_onboarding_complete',
    'signed_otp_received',
    'supporting_docs_complete',
  ]) {
    await workflowModel.updateWorkflowStepStatus('tx-authority-action', 'sales_otp', key, 'complete', { client, transaction })
  }

  const financeMove = await actionService.runWorkflowAction({
    transactionId: 'tx-authority-action',
    actionKey: 'MOVE_TO_FINANCE',
    userId: 'agent-1',
    actorRole: 'agent',
    payload: { source: 'phase7-test' },
    client,
  })
  assert.equal(financeMove.allowed, true)

  for (const key of ['proof_of_funds_received', 'proof_of_funds_reviewed', 'cash_confirmation_approved']) {
    await workflowModel.updateWorkflowStepStatus('tx-authority-action', 'finance_cash', key, 'complete', { client, transaction: client.state.transactions[0] })
  }

  const blockedTransfer = await actionService.runWorkflowAction({
    transactionId: 'tx-authority-action',
    actionKey: 'MOVE_TO_TRANSFER',
    userId: 'agent-1',
    actorRole: 'agent',
    payload: { source: 'phase7-test' },
    client,
  })
  assert.equal(blockedTransfer.allowed, false)
  assert.equal(
    blockedTransfer.blockers.some((blocker) => blocker.code === 'LEGAL_AUTHORITY_VALIDITY_REVIEW_REQUIRED'),
    true,
  )
  assert.equal(client.state.transactions[0].current_main_stage, 'FIN')

  client.state.transactions[0].buyer_authority_validity_json = {
    status: 'approved',
    reviewed_at: '2026-07-11T10:00:00.000Z',
    reviewed_by: 'attorney-1',
  }

  const allowedTransfer = await actionService.runWorkflowAction({
    transactionId: 'tx-authority-action',
    actionKey: 'MOVE_TO_TRANSFER',
    userId: 'agent-1',
    actorRole: 'agent',
    payload: { source: 'phase7-test' },
    client,
  })
  assert.equal(allowedTransfer.allowed, true)
  assert.equal(allowedTransfer.rollup.parentStage, 'TRANSFER')

  console.log('legal authority validity Phase 7 tests passed')
} finally {
  await server.close()
}
