import assert from 'node:assert/strict'

import {
  buildTransferTaskWorkActions,
  buildTransferWorkspaceViewModel,
  TRANSFER_WORKSPACE_PERSISTED_STEP_STATUSES,
} from '../attorneyWorkflow/transferWorkspaceViewModel.js'

const workflow = {
  title: 'Transfer Progress',
  statusLabel: 'In Progress',
  facts: { isCashDeal: false },
  lane: {
    laneKey: 'transfer',
    currentStage: 'entity_authority_checked',
    permissions: {
      canUpdateStage: true,
      canUploadDocuments: true,
      readOnlyReason: '',
    },
    steps: [
      { id: 'step-1', stepKey: 'instruction_received', status: 'completed', sortOrder: 1 },
      { id: 'step-2', stepKey: 'matter_opened', status: 'completed', sortOrder: 2 },
      { id: 'step-3', stepKey: 'buyer_fica_requested', status: 'completed', sortOrder: 3 },
      { id: 'step-4', stepKey: 'buyer_fica_received', status: 'completed', sortOrder: 4 },
      { id: 'step-5', stepKey: 'buyer_fica_approved', status: 'completed', sortOrder: 5 },
      { id: 'step-6', stepKey: 'entity_authority_checked', status: 'in_progress', comment: 'Checking directors', sortOrder: 6 },
      { id: 'step-7', stepKey: 'transfer_documents_prepared', status: 'not_started', sortOrder: 7 },
    ],
    documentRequirements: [
      {
        id: 'buyer_company_resolution',
        label: 'Buyer Company Resolution',
        status: 'approved',
        complete: true,
      },
      {
        id: 'seller_company_resolution',
        label: 'Seller Company Resolution',
        status: 'missing',
        missing: true,
      },
      {
        id: 'buyer_trustee_resolution',
        label: 'Buyer Trustee Resolution',
        status: 'requested',
      },
    ],
  },
}

const viewModel = buildTransferWorkspaceViewModel({
  workflow,
  selectedTaskKey: 'entity_authority_checked',
  keyDates: [['Instruction Date', '04 May 2026'], ['Lodgement Date', 'TBD']],
  parties: [{ role: 'Buyer', name: 'John Smith' }],
  activityFeed: [
    { id: 'activity-1', laneKey: 'transfer', stepKey: 'entity_authority_checked', title: 'Authority checked' },
    { id: 'activity-2', laneKey: 'bond', stepKey: 'bond_instruction_received', title: 'Bond instruction' },
    { id: 'activity-3', kind: 'comment', visibility: 'internal', filterKeys: ['transfer'], title: 'Internal note added', body: 'Authority note' },
  ],
})

assert.equal(viewModel.workflowKey, 'transfer')
assert.equal(viewModel.selectedTask.key, 'entity_authority_checked')
assert.equal(viewModel.selectedTask.phaseKey, 'fica_authority')
assert.equal(viewModel.currentPhase.label, 'FICA & Authority')

assert.ok(viewModel.tasks.length > workflow.lane.steps.length, 'adapter must preserve configured workflow tasks, not only persisted rows')
assert.equal(viewModel.progress.completed, 9)
assert.equal(viewModel.progress.total, viewModel.tasks.length)
assert.equal(viewModel.attention.blocked, 0)

const phaseKeys = viewModel.phases.map((phase) => phase.key)
assert.ok(phaseKeys.includes('instruction'))
assert.ok(phaseKeys.includes('fica_authority'))
assert.ok(phaseKeys.includes('documents_guarantees'))
assert.equal(viewModel.currentPhase.sequence, 2)
assert.equal(viewModel.currentPhase.hasCurrentTask, true)
assert.equal(viewModel.currentPhase.completed, 6)
assert.equal(viewModel.currentPhase.total, 7)
assert.equal(viewModel.selectedTask.completionReadiness.canComplete, false)
assert.ok(viewModel.selectedTask.completionReadiness.missingRequiredDocuments.length > 0)
assert.equal(viewModel.selectedTask.dependencySummary.status, 'completed')
assert.equal(viewModel.selectedTask.dependencySummary.advisory, false)
assert.equal(viewModel.selectedTask.dependencySummary.blocksWork, false)
assert.ok(viewModel.nextActionableTask)

const relatedKeys = viewModel.selectedTaskContext.relatedDocuments.map((document) => document.sourceRequirementKey)
assert.ok(relatedKeys.includes('buyer_company_resolution'))
assert.ok(relatedKeys.includes('seller_company_resolution'))
assert.equal(
  viewModel.selectedTaskContext.relatedDocuments.find((document) => document.sourceRequirementKey === 'seller_company_resolution')?.ready,
  false,
)

assert.deepEqual(
  viewModel.availableActions.primary.map((action) => action.status).filter((status) => !TRANSFER_WORKSPACE_PERSISTED_STEP_STATUSES.includes(status)),
  [],
  'primary actions must only expose statuses the workflow service can persist',
)
assert.equal(viewModel.availableActions.primary.find((action) => action.id === 'mark_complete')?.disabled, true)
assert.ok(viewModel.availableActions.unsupported.some((action) => action.status === 'delayed'))
assert.ok(viewModel.availableActions.unsupported.some((action) => action.status === 'not_applicable'))

const outOfSequenceModel = buildTransferWorkspaceViewModel({
  workflow,
  selectedTaskKey: 'transfer_documents_prepared',
})
const outOfSequenceActions = new Map(outOfSequenceModel.availableActions.primary.map((action) => [action.id, action]))
assert.equal(outOfSequenceModel.selectedTask.key, 'transfer_documents_prepared')
assert.equal(outOfSequenceModel.selectedTask.dependencySummary.advisory, true)
assert.equal(outOfSequenceModel.selectedTask.dependencySummary.blocksWork, false)
assert.ok(outOfSequenceModel.selectedTask.dependencySummary.blockers.length > 0)
assert.equal(outOfSequenceActions.get('mark_in_progress')?.disabled, false)
assert.equal(outOfSequenceActions.get('mark_waiting')?.disabled, false)
assert.equal(outOfSequenceActions.get('mark_blocked')?.disabled, false)
assert.equal(outOfSequenceActions.get('mark_complete')?.disabled, true)

assert.equal(viewModel.unsupportedCapabilities.editableTaskAssignee, true)
assert.equal(viewModel.unsupportedCapabilities.persistedChecklistItems, true)
assert.equal(viewModel.selectedTaskContext.keyDates.length, 2)
assert.equal(viewModel.selectedTaskContext.keyDates.find((item) => item.label === 'Lodgement Date')?.value, 'Not set')
assert.ok(viewModel.selectedTaskContext.parties.length >= 4)
assert.ok(viewModel.selectedTaskContext.parties.some((item) => item.label === 'Assigned Attorney'))
assert.equal(viewModel.selectedTaskContext.documentSummary.required, viewModel.selectedTaskContext.relatedDocuments.length)
assert.equal(viewModel.selectedTaskContext.documentSummary.received, 1)
assert.equal(
  viewModel.selectedTaskContext.documentSummary.missing,
  viewModel.selectedTaskContext.documentSummary.required - viewModel.selectedTaskContext.documentSummary.received,
)
assert.equal(viewModel.selectedTaskContext.activityFeed.length, 2)
assert.ok(viewModel.selectedTaskContext.tabs.some((tab) => tab.key === 'overview'))
assert.ok(viewModel.selectedTaskContext.tabs.some((tab) => tab.key === 'checklist'))
assert.ok(viewModel.selectedTaskContext.tabs.some((tab) => tab.key === 'documents'))
assert.ok(viewModel.selectedTaskContext.tabs.some((tab) => tab.key === 'notes'))
assert.ok(viewModel.selectedTaskContext.tabs.some((tab) => tab.key === 'activity'))
assert.ok(viewModel.selectedTaskContext.checklistItems.some((item) => item.type === 'document'))
assert.equal(viewModel.selectedTaskContext.notes.length, 1)
assert.equal(viewModel.selectedTaskContext.notes[0].visibilityLabel, 'Internal')
assert.ok(viewModel.selectedTaskContext.workActions.some((action) => action.id === 'request_document'))
assert.ok(viewModel.selectedTaskContext.workActions.some((action) => action.id === 'upload_document'))
assert.ok(viewModel.selectedTaskContext.workActions.some((action) => action.id === 'open_parties'))
assert.ok(viewModel.workActionsByTaskKey.entity_authority_checked.length > 0)
assert.equal(viewModel.selectedTaskContext.outcomeSummary.canWorkAhead, true)
assert.equal(viewModel.selectedTaskContext.outcomeSummary.completionBlocked, true)
assert.ok(viewModel.selectedTaskContext.outcomeSummary.items.some((item) => item.key === 'completion'))

const requestDocumentAction = viewModel.selectedTaskContext.workActions.find((action) => action.id === 'request_document')
assert.equal(requestDocumentAction.command.commandType, 'request_document')
assert.equal(requestDocumentAction.command.stageKey, 'entity_authority_checked')
assert.equal(requestDocumentAction.command.workPacket.commandType, 'request_document')
assert.equal(requestDocumentAction.command.workPacket.laneKey, 'transfer')

const noteAction = viewModel.selectedTaskContext.workActions.find((action) => action.id === 'add_note')
assert.equal(noteAction.command.commandType, 'add_note')
assert.equal(noteAction.command.workPacket.stageKey, 'entity_authority_checked')

const completeAction = viewModel.availableActions.primary.find((action) => action.id === 'mark_complete')
assert.equal(completeAction.command.commandType, 'complete_step')
assert.equal(completeAction.command.workPacket.stageKey, 'entity_authority_checked')
assert.ok(viewModel.commandQueue.items.length > 0)
assert.equal(viewModel.commandQueue.laneKey, 'transfer')
assert.ok(viewModel.commandQueue.counts.documents > 0)
assert.ok(viewModel.commandQueue.items.some((item) => item.kind === 'document' && item.command?.commandType === 'request_document'))
assert.ok(viewModel.commandQueue.items.some((item) => item.kind === 'signing' && item.command?.commandType === 'schedule_signing'))
assert.ok(viewModel.commandQueue.items.some((item) => item.kind === 'evidence' && item.command?.commandType === 'complete_step'))
assert.equal(viewModel.commandQueue.primaryItem.status, 'missing_documents')
assert.equal(viewModel.rolloutReadiness.status, 'attention')
assert.deepEqual(viewModel.rolloutReadiness.blockers, [])
assert.equal(viewModel.rolloutReadiness.workflowProof.concurrentWorkAllowed, true)
assert.ok(viewModel.rolloutReadiness.workflowProof.completionBlockedTaskCount > 0)
assert.ok(viewModel.rolloutReadiness.actionAudit.requiredWorkActions.every((actionId) => viewModel.rolloutReadiness.actionAudit.presentWorkActions.includes(actionId)))
assert.ok(viewModel.rolloutReadiness.actionAudit.requiredStatusActions.every((actionId) => viewModel.rolloutReadiness.actionAudit.presentStatusActions.includes(actionId)))
assert.ok(viewModel.rolloutReadiness.actionAudit.commandBackedWorkActions.includes('request_document'))
assert.ok(viewModel.rolloutReadiness.actionAudit.commandBackedWorkActions.includes('schedule_signing'))
assert.ok(viewModel.rolloutReadiness.actionAudit.commandBackedWorkActions.includes('add_note'))
assert.ok(viewModel.rolloutReadiness.actionAudit.callbackBackedWorkActions.includes('upload_document'))
assert.ok(viewModel.rolloutReadiness.actionAudit.callbackBackedWorkActions.includes('open_documents'))
assert.ok(viewModel.rolloutReadiness.actionAudit.callbackBackedWorkActions.includes('open_parties'))
assert.ok(
  viewModel.rolloutReadiness.actionAudit.callbackBackedWorkActions.includes('open_finance') ||
  viewModel.rolloutReadiness.actionAudit.commandBackedWorkActions.includes('open_finance'),
)
assert.ok(viewModel.rolloutReadiness.actionAudit.statusUpdateActions.includes('mark_complete'))
assert.ok(viewModel.rolloutReadiness.uatChecklist.length >= 6)
assert.equal(viewModel.rolloutStatusSummary.key, 'transfer_rollout')
assert.equal(viewModel.rolloutStatusSummary.releaseGateStatus, 'review')
assert.ok(viewModel.rolloutStatusSummary.checks.some((check) => check.key === 'action_buttons' && check.status === 'ready'))
assert.ok(viewModel.rolloutStatusSummary.checks.some((check) => check.key === 'concurrent_work' && check.status === 'ready'))
assert.equal(viewModel.uatReport.title, 'Transfer Attorney UAT Pack')
assert.equal(viewModel.uatReport.laneKey, 'transfer')
assert.equal(viewModel.uatReport.releaseGateStatus, viewModel.rolloutStatusSummary.releaseGateStatus)
assert.ok(viewModel.uatReport.checklist.length >= 7)
assert.ok(viewModel.uatReport.checklist.every((item) => item.expectedOutcome && item.proofKey && item.required))

viewModel.tasks.forEach((task) => {
  const taskActions = buildTransferTaskWorkActions(task, workflow.lane.permissions)
  assert.ok(taskActions.length > 0, `${task.key} exposes at least one work action`)
  assert.ok(taskActions.some((action) => action.id === 'add_note'), `${task.key} can capture a task note/update`)
})

assert.ok(
  viewModel.workActionsByTaskKey.transfer_duty_assessment_prepared.some((action) => action.id === 'open_finance'),
  'financial preparation tasks expose the finance action',
)
assert.ok(
  viewModel.workActionsByTaskKey.rates_clearance_received.some((action) => action.id === 'open_finance'),
  'clearance tasks expose the finance action',
)
assert.ok(
  viewModel.workActionsByTaskKey.buyer_signed_transfer_documents.some((action) => action.id === 'open_documents'),
  'signing tasks expose document actions',
)
assert.ok(
  viewModel.workActionsByTaskKey.buyer_signed_transfer_documents.some((action) => action.id === 'schedule_signing' && action.command?.commandType === 'schedule_signing'),
  'signing tasks expose a command-backed signing follow-up',
)
assert.ok(
  viewModel.workActionsByTaskKey.buyer_fica_requested.some((action) => action.id === 'open_parties'),
  'FICA tasks expose roleplayer actions',
)

const blockedModel = buildTransferWorkspaceViewModel({
  workflow: {
    ...workflow,
    lane: {
      ...workflow.lane,
      steps: [
        ...workflow.lane.steps,
        { id: 'step-8', stepKey: 'transfer_documents_prepared', status: 'blocked', comment: 'Awaiting seller', sortOrder: 8 },
      ],
    },
  },
  filters: { attention: 'blocked' },
})

assert.equal(blockedModel.selectedTask.key, 'transfer_documents_prepared')
assert.equal(blockedModel.visibleTasks.length, 1)
assert.equal(blockedModel.visibleTasks[0].displayStatus, 'blocked')
const blockedDocumentsPhase = blockedModel.phases.find((phase) => phase.key === 'documents_guarantees')
assert.equal(blockedDocumentsPhase?.blocked, 1)
assert.ok(blockedDocumentsPhase?.warningCount >= 1)

const phaseFilteredModel = buildTransferWorkspaceViewModel({
  workflow,
  filters: { phaseKey: 'documents_guarantees' },
})

assert.ok(phaseFilteredModel.visibleTasks.length > 0)
assert.ok(phaseFilteredModel.visibleTasks.every((task) => task.phaseKey === 'documents_guarantees'))

const statusFilteredModel = buildTransferWorkspaceViewModel({
  workflow,
  filters: { status: 'completed' },
})

assert.ok(statusFilteredModel.visibleTasks.length > 0)
assert.ok(statusFilteredModel.visibleTasks.every((task) => task.displayStatus === 'completed'))

const openFilteredModel = buildTransferWorkspaceViewModel({
  workflow,
  filters: { status: 'open' },
})

assert.ok(openFilteredModel.visibleTasks.length > 0)
assert.ok(openFilteredModel.visibleTasks.every((task) => task.displayStatus !== 'completed'))

const sectionSearchModel = buildTransferWorkspaceViewModel({
  workflow,
  search: 'FICA & Authority',
})

assert.ok(sectionSearchModel.visibleTasks.length > 0)
assert.ok(sectionSearchModel.visibleTasks.every((task) => task.phaseKey === 'fica_authority'))

const assignedToMeModel = buildTransferWorkspaceViewModel({
  workflow: {
    ...workflow,
    currentUserRole: 'transfer_attorney',
  },
  filters: { status: 'assigned_to_me' },
})

assert.ok(assignedToMeModel.visibleTasks.length > 0)
assert.ok(assignedToMeModel.visibleTasks.every((task) => task.assignedToMe))

const missingDocumentsModel = buildTransferWorkspaceViewModel({
  workflow,
  filters: { status: 'missing_documents' },
})

assert.ok(missingDocumentsModel.visibleTasks.length > 0)
assert.ok(missingDocumentsModel.visibleTasks.every((task) => task.missingDocumentCount > 0))

const sellerFicaDerivedModel = buildTransferWorkspaceViewModel({
  workflow: {
    ...workflow,
    lane: {
      ...workflow.lane,
      currentStage: 'seller_fica_received',
      steps: [
        { id: 'step-1', stepKey: 'instruction_received', status: 'completed', sortOrder: 1 },
        { id: 'step-2', stepKey: 'seller_fica_requested', status: 'completed', sortOrder: 2 },
        { id: 'step-3', stepKey: 'seller_fica_received', status: 'in_progress', sortOrder: 3 },
        { id: 'step-4', stepKey: 'seller_fica_approved', status: 'not_started', sortOrder: 4 },
      ],
    },
  },
  documents: [
    {
      id: 'seller-id',
      canonicalCategory: 'seller',
      categoryGroup: 'identity_fica',
      displayName: 'Seller ID document',
      requiredDocumentKey: 'seller_id_document',
      status: 'pending_review',
      source: 'transaction_required_documents',
    },
    {
      id: 'seller-address',
      canonicalCategory: 'seller',
      categoryGroup: 'identity_fica',
      displayName: 'Seller proof of address',
      requiredDocumentKey: 'seller_proof_of_address',
      status: 'pending_review',
      source: 'transaction_required_documents',
    },
  ],
  selectedTaskKey: 'seller_fica_received',
})

assert.equal(sellerFicaDerivedModel.selectedTask.displayStatus, 'completed')
assert.equal(sellerFicaDerivedModel.selectedTask.derivedCompletion.complete, true)
assert.equal(sellerFicaDerivedModel.selectedTaskContext.documentSummary.received, 2)
assert.equal(
  sellerFicaDerivedModel.tasks.find((task) => task.key === 'seller_fica_approved')?.displayStatus,
  'not_started',
  'seller FICA approval should not complete until the received documents are verified',
)

const delayedModel = buildTransferWorkspaceViewModel({
  workflow: {
    ...workflow,
    lane: {
      ...workflow.lane,
      currentStage: 'transfer_documents_prepared',
      steps: [
        ...workflow.lane.steps,
        { id: 'step-8', stepKey: 'transfer_documents_prepared', status: 'at_risk', sortOrder: 8 },
      ],
    },
  },
  filters: { status: 'delayed' },
})

assert.ok(delayedModel.visibleTasks.length > 0)
assert.ok(delayedModel.visibleTasks.every((task) => task.displayStatus === 'delayed'))

const readOnlyModel = buildTransferWorkspaceViewModel({
  workflow: {
    ...workflow,
    lane: {
      ...workflow.lane,
      permissions: { canUpdateStage: false, readOnlyReason: 'view_only' },
    },
  },
})

assert.equal(readOnlyModel.availableActions.primary.length, 0)
assert.equal(readOnlyModel.availableActions.readOnlyReason, 'view_only')

const persistedFollowUpModel = buildTransferWorkspaceViewModel({
  workflow: {
    ...workflow,
    lane: {
      ...workflow.lane,
      followUpSummary: {
        items: [
          {
            id: 'follow-up-1',
            title: 'Existing seller FICA request',
            description: 'Already requested from seller.',
            commandType: 'request_document',
            status: 'due_soon',
            priority: 'required',
            dueDate: '2026-07-09',
            audience: 'seller',
            audienceLabel: 'Seller',
            stageKey: 'seller_fica_received',
            stageLabel: 'Seller FICA Received',
          },
          {
            id: 'follow-up-2',
            title: 'Correct Buyer FICA Pack',
            description: 'Proof of address is expired.',
            commandType: 'request_document',
            source: 'document_request',
            status: 'needs_correction',
            priority: 'urgent',
            dueDate: '2026-07-07',
            audience: 'buyer',
            audienceLabel: 'Buyer',
            stageKey: 'buyer_fica_received',
            stageLabel: 'Buyer FICA Received',
            relatedId: 'buyer-fica',
          },
          {
            id: 'follow-up-3',
            title: 'Review Bank Guarantee',
            description: 'Uploaded guarantee needs review.',
            commandType: 'request_document',
            status: 'review_pending',
            priority: 'required',
            dueDate: '2026-07-06',
            audience: 'bank',
            audienceLabel: 'Bank',
            stageKey: 'guarantees_received',
            stageLabel: 'Guarantees Received',
          },
        ],
      },
    },
  },
})

assert.ok(persistedFollowUpModel.commandQueue.items.some((item) => item.source === 'lane_follow_up'))
assert.equal(persistedFollowUpModel.commandQueue.counts.persistedFollowUps, 3)
assert.equal(persistedFollowUpModel.commandQueue.counts.needsCorrection, 1)
assert.equal(persistedFollowUpModel.commandQueue.counts.dueSoon, 1)
assert.equal(persistedFollowUpModel.commandQueue.counts.reviewPending, 1)
assert.ok(persistedFollowUpModel.commandQueue.counts.clientFacing >= 2)
assert.ok(persistedFollowUpModel.commandQueue.counts.professionalFacing >= 1)
assert.equal(persistedFollowUpModel.commandQueue.primaryItem.status, 'needs_correction')
const persistedFollowUpQueueItem = persistedFollowUpModel.commandQueue.items.find((item) => item.id === 'lane_follow_up:follow-up-1')
assert.equal(persistedFollowUpQueueItem.command.commandType, 'request_document')
assert.equal(persistedFollowUpQueueItem.workPacket.sourceFollowUpId, 'follow-up-1')
assert.equal(persistedFollowUpQueueItem.workPacket.sourceFollowUpStatus, 'due_soon')
assert.equal(persistedFollowUpQueueItem.command.draft.workPacket, persistedFollowUpQueueItem.workPacket)
const correctionQueueItem = persistedFollowUpModel.commandQueue.items.find((item) => item.id === 'lane_follow_up:follow-up-2')
assert.equal(correctionQueueItem.command.label, 'Request Correction')
assert.equal(correctionQueueItem.workPacket.sourceFollowUpRelatedId, 'buyer-fica')

const cashIndividualScenarioModel = buildTransferWorkspaceViewModel({
  workflow: {
    ...workflow,
    facts: {
      financeType: 'cash',
      isCashDeal: true,
      buyerEntityType: 'individual',
      buyerMaritalStatus: 'married_in_community',
      sellerEntityType: 'individual',
      sellerMaritalStatus: 'single',
      sellerHasExistingBond: false,
    },
  },
  selectedTaskKey: 'entity_authority_checked',
})

assert.equal(cashIndividualScenarioModel.scenario.finance.type, 'cash')
assert.equal(cashIndividualScenarioModel.scenario.finance.requiresGuarantees, false)
assert.equal(cashIndividualScenarioModel.scenario.buyer.spouseConsentRequired, true)
assert.equal(cashIndividualScenarioModel.scenario.seller.maritalRegime, 'single')
assert.ok(cashIndividualScenarioModel.scenario.coverageItems.some((item) => item.key === 'buyer_capacity' && item.status === 'covered'))
assert.ok(!cashIndividualScenarioModel.tasks.some((task) => task.key === 'guarantees_requested'))
assert.ok(!cashIndividualScenarioModel.tasks.some((task) => task.key === 'guarantees_received'))
assert.ok(!cashIndividualScenarioModel.tasks.some((task) => task.key === 'transfer_guarantees_accepted'))
const cashAuthorityTask = cashIndividualScenarioModel.tasks.find((task) => task.key === 'entity_authority_checked')
assert.ok(cashAuthorityTask.requiredDocumentKeys.includes('buyer_marital_status_documents'))
assert.ok(cashAuthorityTask.requiredDocumentKeys.includes('buyer_spouse_consent'))
assert.ok(!cashAuthorityTask.requiredDocumentKeys.includes('buyer_company_resolution'))
assert.ok(!cashAuthorityTask.requiredDocumentKeys.includes('seller_company_resolution'))
assert.ok(!cashAuthorityTask.requiredDocumentKeys.includes('seller_spouse_consent'))
const cashBuyerFicaTask = cashIndividualScenarioModel.tasks.find((task) => task.key === 'buyer_fica_received')
assert.ok(cashBuyerFicaTask.requiredDocumentKeys.includes('buyer_id_document'))
assert.ok(cashBuyerFicaTask.requiredDocumentKeys.includes('buyer_proof_of_address'))
assert.ok(!cashBuyerFicaTask.requiredDocumentKeys.includes('buyer_company_registration_documents'))
assert.ok(!cashBuyerFicaTask.requiredDocumentKeys.includes('buyer_trust_deed'))

const companyTrustScenarioModel = buildTransferWorkspaceViewModel({
  workflow: {
    ...workflow,
    facts: {
      financeType: 'bond',
      buyerEntityType: 'company',
      sellerEntityType: 'trust',
      sellerHasExistingBond: true,
      cancellationRequired: true,
    },
  },
  selectedTaskKey: 'entity_authority_checked',
})

assert.equal(companyTrustScenarioModel.scenario.finance.requiresGuarantees, true)
assert.equal(companyTrustScenarioModel.scenario.cancellation.required, true)
assert.equal(companyTrustScenarioModel.scenario.buyer.isCompany, true)
assert.equal(companyTrustScenarioModel.scenario.seller.isTrust, true)
assert.ok(companyTrustScenarioModel.tasks.some((task) => task.key === 'guarantees_requested'))
assert.ok(companyTrustScenarioModel.tasks.some((task) => task.key === 'guarantees_received'))
assert.ok(companyTrustScenarioModel.tasks.some((task) => task.key === 'transfer_guarantees_accepted'))
const companyTrustAuthorityTask = companyTrustScenarioModel.tasks.find((task) => task.key === 'entity_authority_checked')
assert.ok(companyTrustAuthorityTask.requiredDocumentKeys.includes('buyer_company_registration_documents'))
assert.ok(companyTrustAuthorityTask.requiredDocumentKeys.includes('buyer_company_resolution'))
assert.ok(companyTrustAuthorityTask.requiredDocumentKeys.includes('buyer_director_ids'))
assert.ok(companyTrustAuthorityTask.requiredDocumentKeys.includes('seller_trust_deed'))
assert.ok(companyTrustAuthorityTask.requiredDocumentKeys.includes('seller_letters_of_authority'))
assert.ok(companyTrustAuthorityTask.requiredDocumentKeys.includes('seller_trustee_ids'))
assert.ok(companyTrustAuthorityTask.requiredDocumentKeys.includes('seller_trustee_resolution'))
assert.ok(!companyTrustAuthorityTask.requiredDocumentKeys.includes('buyer_marital_status_documents'))
assert.ok(!companyTrustAuthorityTask.requiredDocumentKeys.includes('seller_company_resolution'))
assert.ok(companyTrustScenarioModel.scenario.coverageItems.some((item) => item.key === 'cancellation_route' && item.value === 'Cancellation lane required'))

console.log('transferWorkspaceViewModel tests passed')
