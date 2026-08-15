import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  buildAttorneyWorkflowFollowUpCommand,
  buildAttorneyWorkflowFollowUpSummary,
} from '../src/constants/attorneyWorkflowUsability.js'
import {
  buildTransferWorkspaceViewModel,
} from '../src/services/attorneyWorkflow/transferWorkspaceViewModel.js'

const fixedNow = '2026-07-06T00:00:00.000Z'

function buildRejectedBuyerFicaSummary(extra = {}) {
  return buildAttorneyWorkflowFollowUpSummary({
    laneKey: 'transfer',
    now: fixedNow,
    documentRequests: [
      {
        id: 'buyer-fica',
        title: 'Buyer FICA Pack',
        lane_key: 'transfer',
        requested_from: 'buyer',
        priority: 'required',
        review_status: 'rejected',
        rejected_reason: 'Proof of address is older than three months.',
        due_date: '2026-07-07',
        visibility_scope: 'client_visible',
      },
      {
        id: 'seller-id',
        title: 'Seller ID Document',
        lane_key: 'transfer',
        requested_from: 'seller',
        priority: 'required',
        status: 'requested',
        due_date: '2026-07-08',
        visibility_scope: 'client_visible',
      },
    ],
    ...extra,
  })
}

function verifySourceFollowUpMetadata() {
  const summary = buildRejectedBuyerFicaSummary()
  const correction = summary.items.find((item) => item.id === 'document_buyer-fica')
  const command = buildAttorneyWorkflowFollowUpCommand(correction, { now: fixedNow })

  assert.equal(command.followUpId, 'document_buyer-fica')
  assert.equal(command.workPacket.sourceFollowUpId, 'document_buyer-fica')
  assert.equal(command.workPacket.sourceFollowUpSource, 'document_request')
  assert.equal(command.workPacket.sourceFollowUpRelatedId, 'buyer-fica')
  assert.equal(command.workPacket.sourceFollowUpStatus, 'needs_correction')
  assert.equal(command.draft.workPacket.sourceFollowUpId, 'document_buyer-fica')
}

function verifyActionedFollowUpsLeaveQueue() {
  const initial = buildRejectedBuyerFicaSummary()
  const correction = initial.items.find((item) => item.id === 'document_buyer-fica')
  const command = buildAttorneyWorkflowFollowUpCommand(correction, { now: fixedNow })
  const summary = buildRejectedBuyerFicaSummary({
    timeline: [
      {
        id: 'update-correction-request',
        message: 'Buyer FICA Pack requested from Buyer.',
        metadata: { workPacket: command.workPacket },
      },
    ],
  })

  assert.equal(summary.counts.actioned, 1)
  assert.deepEqual(summary.actionedFollowUpIds, ['document_buyer-fica'])
  assert.equal(summary.items.some((item) => item.id === 'document_buyer-fica'), false)
  assert.equal(summary.items.some((item) => item.id === 'seller-id'), false)
  assert.equal(summary.items.some((item) => item.id === 'document_seller-id'), true)
  assert.equal(summary.items.some((item) => item.source === 'work_packet'), false)
}

function verifyNextActionCloseLoop() {
  const nextAction = {
    id: 'capture_purchase_price',
    type: 'update_matter_data',
    label: 'Capture Purchase Price',
    description: 'Required for transfer duty calculation.',
    target: 'attorney',
    priority: 'high',
    laneKey: 'transfer',
  }
  const initial = buildAttorneyWorkflowFollowUpSummary({
    laneKey: 'transfer',
    now: fixedNow,
    nextActions: [nextAction],
  })
  const followUp = initial.items.find((item) => item.id === 'next_capture_purchase_price')
  const command = buildAttorneyWorkflowFollowUpCommand(followUp, { now: fixedNow })
  const closed = buildAttorneyWorkflowFollowUpSummary({
    laneKey: 'transfer',
    now: fixedNow,
    nextActions: [nextAction],
    timeline: [
      {
        id: 'update-purchase-price-note',
        message: 'Matter data needed: Purchase Price.',
        metadata: { workPacket: command.workPacket },
      },
    ],
  })

  assert.equal(closed.counts.actioned, 1)
  assert.equal(closed.items.some((item) => item.id === 'next_capture_purchase_price'), false)
}

function verifyPhase8Wiring() {
  const usabilitySource = readFileSync(new URL('../src/constants/attorneyWorkflowUsability.js', import.meta.url), 'utf8')
  const serviceSource = readFileSync(new URL('../src/services/attorneyWorkflow/attorneyWorkflowLaneService.js', import.meta.url), 'utf8')
  const pageSource = readFileSync(new URL('../src/pages/AttorneyTransactionDetail.jsx', import.meta.url), 'utf8')

  assert.match(usabilitySource, /sourceFollowUpId/)
  assert.match(usabilitySource, /function buildFollowUpResolutionIndex/)
  assert.match(usabilitySource, /if \(packet\.sourceFollowUpId\) continue/)
  assert.match(serviceSource, /async function insertFollowUpActionMarker/)
  assert.match(serviceSource, /workPacketMetadata\.workPacket\?\.sourceFollowUpId/)
  assert.match(serviceSource, /await insertFollowUpActionMarker/)
  assert.match(pageSource, /counts\.actioned/)
}

function buildTransferWorkflowFixture({ facts = {}, lane = {}, transaction = {}, onboardingFormData = null } = {}) {
  return {
    title: 'Transfer Progress',
    statusLabel: 'In Progress',
    facts,
    transaction,
    onboardingFormData,
    lane: {
      laneKey: 'transfer',
      currentStage: 'entity_authority_checked',
      permissions: {
        canUpdateStage: true,
        canUploadDocuments: true,
        canRequestDocuments: true,
        canAddNotes: true,
      },
      steps: [
        { id: 'step-1', stepKey: 'instruction_received', status: 'completed', sortOrder: 1 },
        { id: 'step-2', stepKey: 'matter_opened', status: 'completed', sortOrder: 2 },
        { id: 'step-3', stepKey: 'buyer_fica_requested', status: 'completed', sortOrder: 3 },
        { id: 'step-4', stepKey: 'seller_fica_requested', status: 'completed', sortOrder: 4 },
        { id: 'step-5', stepKey: 'entity_authority_checked', status: 'in_progress', sortOrder: 5 },
        { id: 'step-6', stepKey: 'buyer_signing_scheduled', status: 'not_started', sortOrder: 6 },
        { id: 'step-7', stepKey: 'transfer_duty_assessment_prepared', status: 'not_started', sortOrder: 7 },
      ],
      documentRequirements: [],
      ...lane,
    },
  }
}

function buildTransferModel(fixture = {}, selectedTaskKey = 'entity_authority_checked') {
  return buildTransferWorkspaceViewModel({
    workflow: buildTransferWorkflowFixture(fixture),
    selectedTaskKey,
    now: fixedNow,
  })
}

function task(model, key) {
  return model.tasks.find((item) => item.key === key)
}

function verifyTransferActionAudit() {
  const model = buildTransferModel({
    facts: {
      financeType: 'bond',
      buyerEntityType: 'company',
      sellerEntityType: 'trust',
      sellerHasExistingBond: true,
      cancellationRequired: true,
    },
  })

  const audit = model.rolloutReadiness.actionAudit
  assert.deepEqual(model.rolloutReadiness.blockers, [])
  assert.equal(model.rolloutReadiness.workflowProof.concurrentWorkAllowed, true)
  assert.ok(model.rolloutReadiness.workflowProof.completionBlockedTaskCount > 0)
  assert.ok(model.rolloutReadiness.workflowProof.commandQueueItemCount > 0)
  assert.ok(audit.requiredWorkActions.every((actionId) => audit.presentWorkActions.includes(actionId)))
  assert.ok(audit.requiredStatusActions.every((actionId) => audit.presentStatusActions.includes(actionId)))
  assert.ok(audit.commandBackedWorkActions.includes('request_document'))
  assert.ok(audit.commandBackedWorkActions.includes('schedule_signing'))
  assert.ok(audit.commandBackedWorkActions.includes('add_note'))
  assert.ok(audit.callbackBackedWorkActions.includes('upload_document'))
  assert.ok(audit.callbackBackedWorkActions.includes('open_documents'))
  assert.ok(audit.callbackBackedWorkActions.includes('open_parties'))
  assert.ok(
    audit.callbackBackedWorkActions.includes('open_finance') ||
    audit.commandBackedWorkActions.includes('open_finance'),
  )
  assert.ok(audit.statusUpdateActions.includes('mark_complete'))
  assert.ok(audit.statusUpdateActions.includes('mark_in_progress'))
  assert.ok(audit.statusUpdateActions.includes('mark_blocked'))
  assert.ok(audit.statusUpdateActions.includes('mark_waiting'))
  assert.ok(model.rolloutReadiness.uatChecklist.length >= 7)
}

function verifyTransferScenarioSmokeMatrix() {
  const matrix = [
    {
      name: 'cash individual unmarried',
      facts: {
        financeType: 'cash',
        buyerEntityType: 'individual',
        buyerMaritalStatus: 'single',
        sellerEntityType: 'individual',
        sellerMaritalStatus: 'single',
        sellerHasExistingBond: false,
      },
      assertModel(model) {
        assert.equal(model.scenario.finance.requiresGuarantees, false)
        assert.equal(model.scenario.cancellation.required, false)
        assert.equal(task(model, 'guarantees_requested'), undefined)
        assert.ok(!task(model, 'entity_authority_checked').requiredDocumentKeys.includes('buyer_spouse_consent'))
      },
    },
    {
      name: 'cash individual married in community',
      facts: {
        financeType: 'cash',
        buyerEntityType: 'individual',
        buyerMaritalStatus: 'married_in_community',
        sellerEntityType: 'individual',
        sellerMaritalStatus: 'single',
        sellerHasExistingBond: false,
      },
      assertModel(model) {
        assert.equal(model.scenario.buyer.spouseConsentRequired, true)
        assert.ok(task(model, 'entity_authority_checked').requiredDocumentKeys.includes('buyer_spouse_consent'))
        assert.ok(task(model, 'entity_authority_checked').requiredDocumentKeys.includes('buyer_marital_status_documents'))
      },
    },
    {
      name: 'bond individual married out of community',
      facts: {
        financeType: 'bond',
        buyerEntityType: 'individual',
        buyerMaritalStatus: 'married_out_of_community',
        sellerEntityType: 'individual',
        sellerMaritalStatus: 'single',
        sellerHasExistingBond: false,
      },
      assertModel(model) {
        assert.equal(model.scenario.finance.requiresGuarantees, true)
        assert.ok(task(model, 'guarantees_requested'))
        assert.ok(task(model, 'entity_authority_checked').requiredDocumentKeys.includes('buyer_antenuptial_contract'))
        assert.ok(!task(model, 'entity_authority_checked').requiredDocumentKeys.includes('buyer_spouse_consent'))
      },
    },
    {
      name: 'company buyer trust seller with cancellation',
      facts: {
        financeType: 'bond',
        buyerEntityType: 'company',
        sellerEntityType: 'trust',
        sellerHasExistingBond: true,
        cancellationRequired: true,
      },
      assertModel(model) {
        assert.equal(model.scenario.buyer.isCompany, true)
        assert.equal(model.scenario.seller.isTrust, true)
        assert.equal(model.scenario.cancellation.required, true)
        assert.ok(task(model, 'entity_authority_checked').requiredDocumentKeys.includes('buyer_company_resolution'))
        assert.ok(task(model, 'entity_authority_checked').requiredDocumentKeys.includes('seller_trust_deed'))
        assert.ok(task(model, 'entity_authority_checked').requiredDocumentKeys.includes('seller_letters_of_authority'))
      },
    },
    {
      name: 'hybrid trust buyer company seller',
      facts: {
        financeType: 'hybrid',
        buyerEntityType: 'trust',
        sellerEntityType: 'company',
        sellerHasExistingBond: true,
      },
      assertModel(model) {
        assert.equal(model.scenario.finance.type, 'combination')
        assert.equal(model.scenario.finance.requiresGuarantees, true)
        assert.equal(model.scenario.cancellation.required, true)
        assert.ok(task(model, 'entity_authority_checked').requiredDocumentKeys.includes('buyer_trust_deed'))
        assert.ok(task(model, 'entity_authority_checked').requiredDocumentKeys.includes('seller_company_resolution'))
      },
    },
    {
      name: 'unknown facts stay broad',
      facts: {},
      assertModel(model) {
        assert.equal(model.scenario.buyer.status, 'attention')
        assert.equal(model.scenario.seller.status, 'attention')
        assert.equal(model.scenario.finance.status, 'attention')
        assert.equal(model.scenario.finance.requiresGuarantees, true)
        assert.ok(task(model, 'guarantees_requested'))
      },
    },
  ]

  matrix.forEach((scenario) => {
    const model = buildTransferModel({ facts: scenario.facts })
    scenario.assertModel(model)
    assert.equal(model.rolloutReadiness.workflowProof.concurrentWorkAllowed, true, `${scenario.name} should allow concurrent work`)
    assert.equal(model.rolloutReadiness.scenarioProof.coverageItemCount, 4, `${scenario.name} should expose coverage cards`)
  })
}

function verifyCompletionReadinessGuardrails() {
  const missingEvidenceModel = buildTransferModel({
    facts: {
      financeType: 'cash',
      buyerEntityType: 'individual',
      buyerMaritalStatus: 'married_in_community',
      sellerEntityType: 'individual',
      sellerMaritalStatus: 'single',
      sellerHasExistingBond: false,
    },
  })
  assert.equal(task(missingEvidenceModel, 'entity_authority_checked').completionReadiness.canComplete, false)
  assert.equal(task(missingEvidenceModel, 'entity_authority_checked').dependencySummary.blocksWork, false)
  assert.equal(missingEvidenceModel.rolloutReadiness.workflowProof.concurrentWorkAllowed, true)

  const readyEvidenceModel = buildTransferModel({
    facts: {
      financeType: 'cash',
      buyerEntityType: 'individual',
      buyerMaritalStatus: 'married_in_community',
      sellerEntityType: 'individual',
      sellerMaritalStatus: 'single',
      sellerHasExistingBond: false,
    },
    lane: {
      documentRequirements: [
        { id: 'buyer_id_document', label: 'Buyer ID Document', status: 'approved', complete: true },
        { id: 'buyer_proof_of_address', label: 'Buyer Proof of Address', status: 'approved', complete: true },
        { id: 'buyer_marital_status_documents', label: 'Buyer Marital Status Documents', status: 'approved', complete: true },
        { id: 'buyer_spouse_consent', label: 'Buyer Spouse Consent', status: 'approved', complete: true },
        { id: 'seller_id_document', label: 'Seller ID Document', status: 'approved', complete: true },
        { id: 'seller_proof_of_address', label: 'Seller Proof of Address', status: 'approved', complete: true },
      ],
    },
  })
  assert.equal(task(readyEvidenceModel, 'entity_authority_checked').completionReadiness.canComplete, true)
  assert.ok(readyEvidenceModel.rolloutReadiness.workflowProof.completeReadyTaskCount > 0)
}

function verifyTransferFactSourceMapping() {
  const model = buildTransferModel({
    transaction: {
      routing_profile_json: JSON.stringify({
        financeType: 'bond',
        buyerEntityType: 'company',
        sellerEntityType: 'trust',
        sellerHasExistingBond: true,
      }),
      onboarding_form_data: JSON.stringify({
        buyer: {
          company: {
            authorised_signatory: { capacity: 'Director' },
          },
        },
        seller: {
          trust: {
            trustees: ['Trustee One'],
          },
        },
      }),
    },
  })

  assert.equal(model.scenario.finance.type, 'bond')
  assert.equal(model.scenario.buyer.entityType, 'company')
  assert.equal(model.scenario.seller.entityType, 'trust')
  assert.equal(model.scenario.cancellation.required, true)
  assert.ok(task(model, 'entity_authority_checked').requiredData.some((item) => item.id === 'buyer_representative_capacity'))
  assert.ok(task(model, 'entity_authority_checked').requiredData.some((item) => item.id === 'seller_trustee_authority'))
}

verifySourceFollowUpMetadata()
verifyActionedFollowUpsLeaveQueue()
verifyNextActionCloseLoop()
verifyPhase8Wiring()
verifyTransferActionAudit()
verifyTransferScenarioSmokeMatrix()
verifyCompletionReadinessGuardrails()
verifyTransferFactSourceMapping()

console.log('Attorney workflow Phase 8 close-loop and transfer rollout verification passed.')
