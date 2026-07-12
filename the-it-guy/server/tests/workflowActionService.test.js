/* global process */
import assert from 'node:assert/strict'
import { createServer } from 'vite'

const server = await createServer({
  root: process.cwd(),
  logLevel: 'silent',
  server: { middlewareMode: true },
})

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

    _applyUpdate(rows) {
      const targets = this._filterRows(rows)
      for (const row of targets) {
        Object.assign(row, this.payload)
      }
      return targets
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
          if (!next.id) {
            next.id = this._nextId(this.table.replace(/[^a-z]/g, '') || 'row')
          }
          rows.push(next)
          inserted.push(next)
        }
      }

      return inserted
    }

    async execute() {
      const rows = this._rows()

      if (this.action === 'select') {
        const filtered = this._filterRows(rows)
        return { data: this.single ? filtered[0] || null : filtered, error: null }
      }

      if (this.action === 'insert') {
        const inserted = this._upsertRows(rows)
        return { data: inserted, error: null }
      }

      if (this.action === 'upsert') {
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

try {
  const workflowModel = await server.ssrLoadModule('/server/services/transactionWorkflowModelService.js')
  const actionService = await server.ssrLoadModule('/server/services/workflowActionService.js')
  const overrideService = await server.ssrLoadModule('/server/services/workflowOverrideService.js')

  const transaction = {
    id: 'tx-1',
    unit_id: 'unit-1',
    finance_type: 'bond',
    current_main_stage: 'OTP',
    stage: 'OTP In Progress',
    onboarding_status: 'approved',
    seller_onboarding_status: 'approved',
    lifecycle_state: 'active',
    seller_has_existing_bond: false,
    updated_at: '2026-06-02T10:00:00.000Z',
    created_at: '2026-05-29T09:00:00.000Z',
  }

  const client = buildMockClient({
    transactions: [transaction],
    units: [{ id: 'unit-1', status: 'OTP In Progress' }],
  })

  await workflowModel.ensureTransactionWorkflowInstances('tx-1', {
    client,
    transaction,
  })

  const assistedClient = buildMockClient({
    transactions: [{
      id: 'tx-assisted',
      unit_id: 'unit-assisted',
      finance_type: 'bond',
      current_main_stage: 'OTP',
      stage: 'OTP In Progress',
      onboarding_status: 'awaiting_client_onboarding',
      seller_onboarding_status: 'not_started',
      lifecycle_state: 'active',
      seller_has_existing_bond: false,
      updated_at: '2026-06-02T10:00:00.000Z',
      created_at: '2026-05-29T09:00:00.000Z',
    }],
    units: [{ id: 'unit-assisted', status: 'OTP In Progress' }],
  })

  await workflowModel.ensureTransactionWorkflowInstances('tx-assisted', {
    client: assistedClient,
    transaction: assistedClient.state.transactions[0],
  })

  const buyerAssistedOnboarding = await actionService.runWorkflowAction({
    transactionId: 'tx-assisted',
    actionKey: 'RECORD_AGENT_ASSISTED_BUYER_ONBOARDING',
    userId: 'agent-assisted-1',
    actorRole: 'agent',
    payload: {
      source: 'agent_assisted_onboarding',
      completionMode: 'agent_assisted_completed',
      captureMethod: 'phone_call',
      clientConsentMethod: 'agent_attested_client_instruction',
      reason: 'Buyer completed onboarding by phone with the agent.',
      notes: 'Buyer details were captured by the agent during a call.',
      completedAt: '2026-06-03T08:30:00.000Z',
    },
    client: assistedClient,
  })
  assert.equal(buyerAssistedOnboarding.allowed, true)
  assert.equal(assistedClient.state.transactions[0].onboarding_status, 'awaiting_signed_otp')
  assert.equal(assistedClient.state.transactions[0].onboarding_completed_at, '2026-06-03T08:30:00.000Z')
  assert.equal(assistedClient.state.transactions[0].external_onboarding_submitted_at, '2026-06-03T08:30:00.000Z')

  const sellerAssistedOnboarding = await actionService.runWorkflowAction({
    transactionId: 'tx-assisted',
    actionKey: 'RECORD_AGENT_ASSISTED_SELLER_ONBOARDING',
    userId: 'agent-assisted-1',
    actorRole: 'agent',
    payload: {
      source: 'agent_assisted_onboarding',
      completionMode: 'agent_assisted_completed',
      captureMethod: 'in_person',
      clientConsentMethod: 'agent_attested_client_instruction',
      reason: 'Seller completed onboarding in person with the agent.',
      notes: 'Seller details were captured by the agent during an in-person meeting.',
    },
    client: assistedClient,
  })
  assert.equal(sellerAssistedOnboarding.allowed, true)
  assert.equal(assistedClient.state.transactions[0].seller_onboarding_status, 'approved')
  const buyerAssistedEvidence = assistedClient.state.transaction_workflow_evidence.find((row) => row.evidence_id === 'RECORD_AGENT_ASSISTED_BUYER_ONBOARDING')
  assert.equal(buyerAssistedEvidence?.evidence_type, 'event')
  assert.equal(buyerAssistedEvidence?.step_key, 'buyer_onboarding_complete')
  const sellerAssistedEvidence = assistedClient.state.transaction_workflow_evidence.find((row) => row.evidence_id === 'RECORD_AGENT_ASSISTED_SELLER_ONBOARDING')
  assert.equal(sellerAssistedEvidence?.evidence_type, 'event')
  assert.equal(sellerAssistedEvidence?.step_key, 'seller_onboarding_complete')
  const buyerAssistedEvent = assistedClient.state.transaction_workflow_events.find((row) => row.action_key === 'RECORD_AGENT_ASSISTED_BUYER_ONBOARDING')
  assert.equal(buyerAssistedEvent?.payload_json?.action_context, 'agent_assisted_onboarding')
  assert.equal(buyerAssistedEvent?.payload_json?.payload?.completionMode, 'agent_assisted_completed')
  assert.equal(buyerAssistedEvent?.payload_json?.payload?.clientConsentMethod, 'agent_attested_client_instruction')

  const missingSupportingDocsPolicy = await actionService.runWorkflowAction({
    transactionId: 'tx-assisted',
    actionKey: 'RECORD_AGENT_ASSISTED_SUPPORTING_DOCS',
    userId: 'agent-assisted-1',
    actorRole: 'agent',
    payload: {
      source: 'agent_assisted_supporting_docs',
      completionMode: 'agent_assisted_completed',
      captureMethod: 'offline_verified',
    },
    client: assistedClient,
  })
  assert.equal(missingSupportingDocsPolicy.allowed, false)
  assert.equal(missingSupportingDocsPolicy.blockers?.[0]?.code, 'WORKFLOW_ACTION_AUDIT_REASON_REQUIRED')

  const supportingDocsAssisted = await actionService.runWorkflowAction({
    transactionId: 'tx-assisted',
    actionKey: 'RECORD_AGENT_ASSISTED_SUPPORTING_DOCS',
    userId: 'agent-assisted-1',
    actorRole: 'agent',
    payload: {
      source: 'agent_assisted_supporting_docs',
      completionMode: 'agent_assisted_completed',
      captureMethod: 'offline_verified',
      clientConsentMethod: 'agent_attested_document_review',
      reason: 'Supporting documents were verified outside the client portal.',
      notes: 'Offline FICA/supporting document pack reviewed by the agent.',
      supportingDocsDocumentId: 'doc-supporting-offline-1',
    },
    client: assistedClient,
  })
  assert.equal(supportingDocsAssisted.allowed, true)
  const supportingDocsEvidence = assistedClient.state.transaction_workflow_evidence.find((row) => row.evidence_id === 'RECORD_AGENT_ASSISTED_SUPPORTING_DOCS')
  assert.equal(supportingDocsEvidence?.evidence_type, 'event')
  assert.equal(supportingDocsEvidence?.step_key, 'supporting_docs_complete')
  const supportingDocsDocumentEvidence = assistedClient.state.transaction_workflow_evidence.find((row) => row.evidence_id === 'doc-supporting-offline-1')
  assert.equal(supportingDocsDocumentEvidence?.evidence_type, 'document')
  assert.equal(supportingDocsDocumentEvidence?.step_key, 'supporting_docs_complete')
  const supportingDocsEvent = assistedClient.state.transaction_workflow_events.find((row) => row.event_type === 'workflow_action_completed' && row.action_key === 'RECORD_AGENT_ASSISTED_SUPPORTING_DOCS')
  assert.equal(supportingDocsEvent?.payload_json?.action_context, 'agent_assisted_supporting_docs')
  assert.equal(supportingDocsEvent?.payload_json?.payload?.completionMode, 'agent_assisted_completed')
  assert.equal(assistedClient.state.transaction_workflow_evidence.some((row) => row.evidence_type === 'manual_override'), false)

  const missingPaperSignedOtp = await actionService.runWorkflowAction({
    transactionId: 'tx-1',
    actionKey: 'RECORD_PAPER_SIGNED_OTP',
    userId: 'agent-early',
    actorRole: 'agent',
    payload: {
      source: 'test',
    },
    client,
  })
  assert.equal(missingPaperSignedOtp.allowed, false)
  assert.equal(missingPaperSignedOtp.blockers?.[0]?.code, 'SIGNED_OTP_DOCUMENT_REQUIRED')

  const waivedViaWorkflowAction = await actionService.runWorkflowAction({
    transactionId: 'tx-1',
    actionKey: 'RECORD_PAPER_SIGNED_OTP',
    userId: 'agent-early',
    actorRole: 'agent',
    payload: {
      source: 'paper_signed_otp_upload',
      signingMethod: 'paper',
      completionMode: 'waived',
      captureMethod: 'paper_signature_upload',
      clientConsentMethod: 'signed_document_uploaded',
      reason: 'Attempted waiver through a completion action.',
      signedOtpDocumentId: 'doc-paper-otp-waiver-attempt',
    },
    client,
  })
  assert.equal(waivedViaWorkflowAction.allowed, false)
  assert.equal(waivedViaWorkflowAction.blockers?.[0]?.code, 'WORKFLOW_ACTION_WAIVER_REQUIRES_OVERRIDE')

  const earlySignedOtp = await actionService.runWorkflowAction({
    transactionId: 'tx-1',
    actionKey: 'RECORD_PAPER_SIGNED_OTP',
    userId: 'agent-early',
    actorRole: 'agent',
    payload: {
      source: 'paper_signed_otp_upload',
      signingMethod: 'paper',
      completionMode: 'manual_uploaded',
      captureMethod: 'paper_signature_upload',
      clientConsentMethod: 'signed_document_uploaded',
      reason: 'Signed paper OTP was uploaded after client signature.',
      notes: 'Signed OTP arrived before onboarding review was complete.',
      signedOtpDocumentId: 'doc-paper-otp-1',
      outOfSequenceReason: 'Signed paper OTP arrived before onboarding review was complete.',
    },
    client,
  })

  assert.equal(earlySignedOtp.allowed, true)
  assert.equal(earlySignedOtp.outOfSequence, true)
  assert.equal(earlySignedOtp.rollup.parentStage, 'SALES_OTP')
  assert.equal(client.state.transactions[0].current_main_stage, 'OTP')
  const signedOtpEvent = client.state.transaction_workflow_events.find((row) => row.event_type === 'workflow_action_completed' && row.action_key === 'RECORD_PAPER_SIGNED_OTP')
  assert.equal(signedOtpEvent?.payload_json?.out_of_sequence, true)
  assert.equal(signedOtpEvent?.payload_json?.incomplete_predecessors?.length > 0, true)
  const signedOtpEvidence = client.state.transaction_workflow_evidence.find((row) => row.evidence_id === 'RECORD_PAPER_SIGNED_OTP')
  assert.equal(signedOtpEvidence?.evidence_type, 'event')
  const signedOtpDocumentEvidence = client.state.transaction_workflow_evidence.find((row) => row.evidence_id === 'doc-paper-otp-1')
  assert.equal(signedOtpDocumentEvidence?.evidence_type, 'document')
  assert.equal(signedOtpDocumentEvidence?.step_key, 'signed_otp_received')

  const earlyAttorneyInstruction = await actionService.runWorkflowAction({
    transactionId: 'tx-1',
    actionKey: 'RECORD_ATTORNEY_INSTRUCTION',
    userId: 'attorney-early',
    actorRole: 'attorney',
    payload: {
      source: 'test',
      outOfSequenceReason: 'Attorney was instructed outside Arch9 before finance was marked ready.',
    },
    client,
  })

  assert.equal(earlyAttorneyInstruction.allowed, true)
  assert.equal(earlyAttorneyInstruction.outOfSequence, true)
  assert.equal(earlyAttorneyInstruction.rollup.parentStage, 'SALES_OTP')
  const attorneyInstructionEvent = client.state.transaction_workflow_events.find((row) => row.action_key === 'RECORD_ATTORNEY_INSTRUCTION')
  assert.equal(attorneyInstructionEvent?.payload_json?.out_of_sequence, true)
  assert.equal(attorneyInstructionEvent?.payload_json?.incomplete_predecessors?.some((item) => item.gateKey === 'finance_ready'), true)

  const blockedFinanceMove = await actionService.runWorkflowAction({
    transactionId: 'tx-1',
    actionKey: 'MOVE_TO_FINANCE',
    userId: 'user-1',
    payload: { source: 'test' },
    client,
  })

  assert.equal(blockedFinanceMove.allowed, false)
  assert.equal((blockedFinanceMove.blockers || []).length > 0, true)

  for (const key of [
    'buyer_onboarding_complete',
    'seller_onboarding_complete',
    'signed_otp_received',
    'supporting_docs_complete',
  ]) {
    await workflowModel.updateWorkflowStepStatus('tx-1', 'sales_otp', key, 'complete', { client, transaction })
  }

  const financeMove = await actionService.runWorkflowAction({
    transactionId: 'tx-1',
    actionKey: 'MOVE_TO_FINANCE',
    userId: 'user-1',
    payload: { source: 'test' },
    client,
  })

  assert.equal(financeMove.allowed, true)
  assert.equal(financeMove.rollup.parentStage, 'FINANCE')
  assert.equal(financeMove.compatibility.current_main_stage, 'FIN')
  assert.equal(client.state.transactions[0].current_main_stage, 'FIN')
  assert.equal(client.state.transaction_workflow_events.length >= 2, true)
  const financeMoveEvidence = client.state.transaction_workflow_evidence.find((row) => row.evidence_id === 'MOVE_TO_FINANCE')
  assert.equal(financeMoveEvidence?.evidence_type, 'event')
  assert.equal(client.state.transaction_workflow_evidence.some((row) => row.evidence_type === 'manual_override'), false)

  for (const key of ['documents_received', 'documents_reviewed', 'applications_submitted', 'feedback_received', 'quote_approved', 'instruction_sent']) {
    await workflowModel.updateWorkflowStepStatus('tx-1', 'finance_bond', key, 'complete', { client, transaction })
  }

  const transferMove = await actionService.runWorkflowAction({
    transactionId: 'tx-1',
    actionKey: 'MOVE_TO_TRANSFER',
    userId: 'user-1',
    payload: { source: 'test' },
    client,
  })

  assert.equal(transferMove.allowed, true)
  assert.equal(transferMove.rollup.parentStage, 'TRANSFER')
  assert.equal(transferMove.compatibility.current_main_stage, 'XFER')
  assert.equal(client.state.units[0].status, 'Transfer in Progress')

  const cashClient = buildMockClient({
    transactions: [{
      id: 'tx-2',
      unit_id: 'unit-2',
      finance_type: 'cash',
      current_main_stage: 'OTP',
      stage: 'OTP In Progress',
      onboarding_status: 'approved',
      seller_onboarding_status: 'approved',
      lifecycle_state: 'active',
      seller_has_existing_bond: false,
      title_deed_number: '',
      registration_confirmation_document_id: '',
      updated_at: '2026-06-02T10:00:00.000Z',
      created_at: '2026-05-29T09:00:00.000Z',
    }],
    units: [{ id: 'unit-2', status: 'OTP In Progress' }],
  })

  await workflowModel.ensureTransactionWorkflowInstances('tx-2', {
    client: cashClient,
    transaction: cashClient.state.transactions[0],
  })

  for (const key of [
    'buyer_onboarding_complete',
    'seller_onboarding_complete',
    'signed_otp_received',
    'supporting_docs_complete',
  ]) {
    await workflowModel.updateWorkflowStepStatus('tx-2', 'sales_otp', key, 'complete', { client: cashClient, transaction: cashClient.state.transactions[0] })
  }
  const cashFinanceMove = await actionService.runWorkflowAction({
    transactionId: 'tx-2',
    actionKey: 'MOVE_TO_FINANCE',
    userId: 'user-2',
    payload: { source: 'test' },
    client: cashClient,
  })
  assert.equal(cashFinanceMove.allowed, true)
  const cashFinanceMoveEvidence = cashClient.state.transaction_workflow_evidence.find((row) => row.evidence_id === 'MOVE_TO_FINANCE')
  assert.equal(cashFinanceMoveEvidence?.evidence_type, 'event')
  assert.equal(cashClient.state.transaction_workflow_evidence.some((row) => row.evidence_type === 'manual_override'), false)
  const waivedProofOfFunds = await overrideService.applyWorkflowOverride({
    transactionId: 'tx-2',
    workflowKey: 'finance_cash',
    stepKey: 'proof_of_funds_received',
    overrideType: 'force_waive',
    reason: 'Cash buyer proof of funds verified offline by developer admin.',
    userId: 'developer-admin-1',
    actorRole: 'developer_admin',
    payload: {
      attachmentId: 'doc-proof-waiver',
      attachmentType: 'offline_confirmation',
    },
    client: cashClient,
  })
  assert.equal(waivedProofOfFunds.success, true)
  assert.equal(waivedProofOfFunds.nextStatus, 'not_applicable')
  assert.equal(cashClient.state.transaction_workflow_evidence.some((row) => row.evidence_type === 'manual_override'), true)
  const waiverEvent = cashClient.state.transaction_workflow_events.find((row) => row.payload_json?.overrideType === 'force_waive')
  assert.equal(Boolean(waiverEvent), true)
  assert.equal(waiverEvent?.payload_json?.overrideIntent, 'waiver_override')
  assert.equal(waiverEvent?.payload_json?.completionMode, 'waived')
  assert.equal(waiverEvent?.payload_json?.waiver, true)

  await assert.rejects(
    overrideService.applyWorkflowOverride({
      transactionId: 'tx-2',
      workflowKey: 'finance_cash',
      stepKey: 'proof_of_funds_reviewed',
      overrideType: 'force_complete',
      reason: 'Buyer should not be able to override a finance gate.',
      userId: 'buyer-1',
      actorRole: 'buyer',
      client: cashClient,
    }),
    /do not have permission/i,
  )

  await workflowModel.updateWorkflowStepStatus('tx-2', 'finance_cash', 'proof_of_funds_reviewed', 'complete', { client: cashClient, transaction: cashClient.state.transactions[0] })
  await workflowModel.updateWorkflowStepStatus('tx-2', 'finance_cash', 'cash_confirmation_approved', 'complete', { client: cashClient, transaction: cashClient.state.transactions[0] })
  const cashTransferMove = await actionService.runWorkflowAction({
    transactionId: 'tx-2',
    actionKey: 'MOVE_TO_TRANSFER',
    userId: 'user-2',
    payload: { source: 'test' },
    client: cashClient,
  })
  assert.equal(cashTransferMove.allowed, true)

  const missingSignedTransferDocs = await actionService.runWorkflowAction({
    transactionId: 'tx-2',
    actionKey: 'RECORD_MANUAL_SIGNED_TRANSFER_DOCUMENTS',
    userId: 'attorney-1',
    actorRole: 'attorney',
    payload: { source: 'manual_signed_contract_upload' },
    client: cashClient,
  })
  assert.equal(missingSignedTransferDocs.allowed, false)
  assert.equal(missingSignedTransferDocs.blockers?.[0]?.code, 'SIGNED_TRANSFER_DOCUMENTS_REQUIRED')

  const signedTransferDocs = await actionService.runWorkflowAction({
    transactionId: 'tx-2',
    actionKey: 'RECORD_MANUAL_SIGNED_TRANSFER_DOCUMENTS',
    userId: 'attorney-1',
    actorRole: 'attorney',
    payload: {
      source: 'manual_signed_contract_upload',
      signingMethod: 'paper',
      completionMode: 'manual_uploaded',
      captureMethod: 'paper_signature_upload',
      clientConsentMethod: 'signed_document_uploaded',
      reason: 'Signed transfer pack was uploaded after paper signature.',
      notes: 'Manually signed transfer pack uploaded by attorney.',
      signedContractDocumentId: 'doc-signed-transfer-pack-1',
    },
    client: cashClient,
  })
  assert.equal(signedTransferDocs.allowed, true)
  assert.equal(signedTransferDocs.outOfSequence, true)
  const signedTransferActionEvidence = cashClient.state.transaction_workflow_evidence.find((row) => row.evidence_id === 'RECORD_MANUAL_SIGNED_TRANSFER_DOCUMENTS')
  assert.equal(signedTransferActionEvidence?.evidence_type, 'event')
  const signedTransferDocumentEvidence = cashClient.state.transaction_workflow_evidence.find((row) => row.evidence_id === 'doc-signed-transfer-pack-1')
  assert.equal(signedTransferDocumentEvidence?.evidence_type, 'document')
  assert.equal(signedTransferDocumentEvidence?.step_key, 'transfer_documents_signed')

  for (const key of [
    'instruction_received',
    'transfer_documents_requested',
    'transfer_documents_received',
    'transfer_documents_prepared',
    'transfer_documents_signed',
    'clearance_figures_requested',
    'clearance_figures_received',
    'transfer_duty_requested',
    'transfer_duty_received',
    'guarantees_confirmed',
    'ready_for_lodgement',
    'lodged',
  ]) {
    await workflowModel.updateWorkflowStepStatus('tx-2', 'attorney_transfer', key, 'complete', { client: cashClient, transaction: cashClient.state.transactions[0] })
  }

  const registrationReady = await actionService.runWorkflowAction({
    transactionId: 'tx-2',
    actionKey: 'MARK_READY_FOR_REGISTRATION',
    userId: 'user-2',
    payload: { source: 'test' },
    client: cashClient,
  })
  assert.equal(registrationReady.allowed, true)
  assert.equal(registrationReady.rollup.parentStage, 'REGISTRATION')
  assert.equal(registrationReady.compatibility.current_main_stage, 'REG')

  const blockedRegistration = await actionService.runWorkflowAction({
    transactionId: 'tx-2',
    actionKey: 'MARK_REGISTERED',
    userId: 'user-2',
    payload: {
      source: 'test',
      registrationDate: '2026-06-02',
    },
    client: cashClient,
  })
  assert.equal(blockedRegistration.allowed, false)
  assert.equal(blockedRegistration.blockers.some((blocker) => blocker.code === 'TITLE_DEED_NUMBER_REQUIRED'), true)
  assert.equal(blockedRegistration.blockers.some((blocker) => blocker.code === 'REGISTRATION_CONFIRMATION_REQUIRED'), true)
  assert.notEqual(cashClient.state.transactions[0].lifecycle_state, 'registered')
  assert.equal(cashClient.state.transaction_workflow_events.some((row) => row.event_type === 'workflow_action_blocked' && row.action_key === 'MARK_REGISTERED'), true)

  const registered = await actionService.runWorkflowAction({
    transactionId: 'tx-2',
    actionKey: 'MARK_REGISTERED',
    userId: 'user-2',
    payload: {
      source: 'test',
      registrationDate: '2026-06-02',
      titleDeedNumber: 'T123',
      registrationConfirmationDocumentId: 'doc-reg-1',
    },
    client: cashClient,
  })
  assert.equal(registered.allowed, true)
  assert.equal(registered.rollup.parentStage, 'COMPLETE')
  assert.equal(registered.compatibility.current_main_stage, 'REG')
  assert.equal(cashClient.state.transactions[0].registration_confirmation_document_id, 'doc-reg-1')
  assert.equal(cashClient.state.transaction_workflow_evidence.some((item) => item.evidence_id === 'doc-reg-1'), true)
  const registrationEvent = cashClient.state.transaction_workflow_events.find((row) => row.event_type === 'workflow_action_completed' && row.action_key === 'MARK_REGISTERED')
  assert.equal(Boolean(registrationEvent), true)
  assert.equal(registrationEvent.payload_json?.payload?.registrationConfirmationDocumentId, 'doc-reg-1')

  console.log('workflowActionService tests passed')
} finally {
  await server.close()
}
