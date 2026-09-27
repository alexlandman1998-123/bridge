import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import { JSDOM } from 'jsdom'
import { buildLegalTaskWorkbenchModel, relevantLegalTaskDocuments } from '../src/core/transactions/legalTaskWorkbenchModel.js'
import { buildTransferWorkspaceViewModel } from '../src/services/attorneyWorkflow/transferWorkspaceViewModel.js'
import { applyPartyCapacityDecisions, partyCapacityReviewStale, resolveMatterScenarioProfile } from '../src/services/matterScenarioProfile.js'
import { buildAllDocumentLibraryRows } from '../src/services/documents/matterDocumentWorkspaceModel.js'
import { buildStageThreeFinancialReview } from '../src/services/attorneyWorkflow/stageThreeFinancialReview.js'
import { buildStageFourSecurityReview } from '../src/services/attorneyWorkflow/stageFourSecurityReview.js'
import { buildStageFiveLodgementReview } from '../src/services/attorneyWorkflow/stageFiveLodgementReview.js'
import { buildStageSixClosureReview } from '../src/services/attorneyWorkflow/stageSixClosureReview.js'
import { buildMatterWorkflowPlan } from '../src/services/attorneyWorkflow/matterWorkflowPlanService.js'
import { buildBondApplicationDocumentChecklist, createEmptyBondApplicationState, resolveBondApplicationDocumentRequirements } from '../src/modules/bond/application/index.js'
import { phase4DecisionIssues, isClearanceValidUntil } from '../src/services/attorneyWorkflow/transferPhase4Policy.js'
import { evaluateTransferTaxLodgementReadiness } from '../src/services/attorneyWorkflow/transferTaxLodgementGate.js'

const server = await createServer({ configFile: false, envFile: false, logLevel: 'silent', esbuild: { jsx: 'automatic' }, server: { middlewareMode: true } })
try {
  const { default: Workbench } = await server.ssrLoadModule('/src/components/attorney/workflow/LegalTaskWorkbench.jsx')
  const { default: TaskConfirmations } = await server.ssrLoadModule('/src/components/attorney/workflow/TaskConfirmations.jsx')
  const model = {
    taskKey: 'instruction_received', taskLabel: 'Instruction Received', taskType: 'collect_documents',
    taskDescription: 'The instruction and source documents have been received.',
    status: 'not_started', statusLabel: 'Not Started', phaseLabel: 'Instruction', workflowLabel: 'Transfer',
    outstandingRequirements: [{ id: 'otp', label: 'Sales agreement / OTP', description: 'sales_agreement_or_otp' }],
    requirementActions: { otp: { id: 'review_document', label: 'Review documents' } },
    confirmationRows: [{ id: 'otp', label: 'Sales agreement / OTP', answers: ['yes', 'no'],
      requirement: { id: 'otp', label: 'Sales agreement / OTP', description: 'sales_agreement_or_otp', complete: false },
      action: { id: 'review_document', label: 'Review documents', requirementId: 'otp' }, documentStatus: { attached: 0 } }],
    confirmationRequirements: [], completedRequirements: [], documents: [], notes: [], activity: [],
    requirementsSatisfied: false, completionMessage: 'Evidence is advisory.',
    canMarkInProgress: true, markInProgressLabel: 'Start task', canComplete: true,
    uploadAction: { id: 'upload_document', disabled: false },
    completeAction: { id: 'mark_complete', label: 'Complete task' },
  }
  const render = (overrides = {}) => renderToStaticMarkup(createElement(Workbench, {
    model: { ...model, ...overrides }, selectedPhaseKey: 'instruction',
    phases: [{ key: 'instruction', label: 'Instruction', completed: 0, total: 5, tasks: [] }], onSaveConfirmations: async () => true,
  }))
  const html = render()
  assert.match(html, /0 of 5 complete/)
  assert.match(html, /Stage progress/)
  assert.match(html, /xl:max-h-\[calc\(100dvh-7rem\)\]/, 'the stage menu should scroll within a viewport-height rail')
  assert.doesNotMatch(html, /Current task/)
  assert.match(html, /Confirmations/)
  assert.equal((html.match(/Upload document<\/button>/g) || []).length, 1)
  assert.doesNotMatch(html, /sales_agreement_or_otp|applicable tasks complete|Outstanding items are advisory:/)
  assert.doesNotMatch(html, /Required action/)
  assert.match(html, /Supporting documents/)
  assert.doesNotMatch(html, /Task guidance|Current legal task|Attention required/)
  assert.match(html, /Review documents/)
  assert.match(html, /Mark in progress/)
  assert.doesNotMatch(html, /Save progress/)
  assert.match(html, /Complete task/)
  const documentHtml = render({ documents: [
    { id: 'attached', displayName: 'Attached OTP', ready: true },
    { id: 'missing', displayName: 'Duplicate missing OTP', ready: false },
  ] })
  assert.match(documentHtml, /Attached OTP/)
  assert.doesNotMatch(documentHtml, /Duplicate missing OTP/)
  assert.doesNotMatch(documentHtml, /More status options/)
  assert.match(render({ confirmationRows: [{ id: 'otp', label: 'OTP', requirement: { id: 'otp', description: 'Check all signatures.', complete: false } }] }), /<summary[^>]*>Details<\/summary><p[^>]*>Check all signatures\./)
  assert.doesNotMatch(render({ completeAction: null }), /Complete task<\/button>/)
  const readyToComplete = render({ primaryAction: { id: 'mark_complete', label: 'Complete task', source: 'status' } })
  assert.equal((readyToComplete.match(/Complete task/g) || []).length, 1)
  const uploadFirst = render({ primaryAction: { id: 'upload_document', label: 'Upload document', source: 'work' } })
  assert.equal((uploadFirst.match(/Upload document/g) || []).length, 1)
  const outcomesHtml = render({ outcomeActions: [
    { id: 'mark_not_applicable', label: 'Not applicable' },
    { id: 'complete_externally', label: 'Completed externally' },
    { id: 'reopen_task', label: 'Reopen task' },
  ] })
  for (const label of ['Not applicable', 'Completed externally', 'Reopen task']) assert.ok(outcomesHtml.includes(label))
  assert.match(render({ canComplete: false }), /disabled=""[^>]*>[\s\S]*Complete task/)
  const confirmationHtml = renderToStaticMarkup(createElement(TaskConfirmations, {
    taskKey: 'instruction_received', items: [{ id: 'received', label: 'Instruction received' }, { id: 'otp', label: 'OTP reviewed' }],
    saved: { received: { answer: 'no' } }, onSave: async () => true,
  }))
  assert.match(confirmationHtml, /1 of 2 answered/)
  assert.match(confirmationHtml, /Save answers/)
  const financialProfile = {
    propertyTenure: 'sectional_title', hoaApplicable: 'yes',
    transferTaxDecision: { route: 'zero_rated_going_concern', status: 'confirmed', basisNote: 'Enterprise sold as a going concern',
      sellerVatRegistered: 'yes', sellerVatNumberReference: 'SELLER-VAT', supplyInCourseOfEnterprise: 'yes',
      buyerVatRegistered: 'yes', buyerVatNumberReference: 'BUYER-VAT', goingConcernAgreementReference: 'OTP-7',
      sarsStatus: 'receipted', sarsProofReference: 'SARS-7' },
    mvpProfile: { propertyConditions: { titleRestrictions: 'no', complianceCertificates: 'no',
      clearances: { municipal: { issuer: 'City', reference: 'RCC-1', validUntil: '2030-01-01' },
        bodyCorporate: { issuer: 'Body corporate', reference: 'BC-1', validUntil: '2030-01-01' },
        hoa: { issuer: 'HOA', reference: 'HOA-1', validUntil: '2020-01-01' } } } },
  }
  const now = new Date('2026-09-26T10:00:00Z')
  const zeroRate = buildStageThreeFinancialReview({ taskKey: 'going_concern_zero_rate_verified', routingProfile: financialProfile, now })
  assert.equal(zeroRate.applicable, true)
  assert.equal(zeroRate.missing, 0)
  assert.ok(zeroRate.checks.some(item => item.label === 'Written going-concern agreement' && item.value === 'OTP-7'))
  assert.ok(zeroRate.notApplicable.includes('Transfer duty'))
  const dutyUnderZeroRate = buildStageThreeFinancialReview({ taskKey: 'transfer_duty_tdc01_submission', routingProfile: financialProfile, now })
  assert.equal(dutyUnderZeroRate.applicable, false, 'wrong-route historical tax task must be called out')
  const sectional = buildStageThreeFinancialReview({ taskKey: 'body_corporate_levy_clearance_review', routingProfile: financialProfile, now })
  assert.equal(sectional.applicable, true)
  assert.equal(sectional.missing, 0)
  const hoa = buildStageThreeFinancialReview({ taskKey: 'hoa_clearance_review', routingProfile: financialProfile, now })
  assert.equal(hoa.checks.find(item => item.label === 'HOA valid until').state, 'expired')
  assert.match(render({ financialPreparation: hoa }), /Selected tax and property route/)
  assert.match(render({ financialPreparation: hoa }), /expired/)
  assert.equal(isClearanceValidUntil('2026-09-26', new Date('2026-09-26T19:00:00Z')), false,
    'the Work tab must match the database rule that rejects a clearance on its stated date')
  assert.equal(isClearanceValidUntil('2026-09-26', new Date('2026-09-26T23:00:00Z')), false)
  const dutyProfile = { propertyTenure: 'freehold', hoaApplicable: 'no', transferTaxDecision: {
    route: 'transfer_duty', status: 'confirmed', tdc01Reference: 'TDC-1', dutyPaymentRequired: 'yes',
    assessmentReference: 'ASS-1', paymentReference: 'PAY-1', basisNote: 'Dutiable',
    sarsStatus: 'receipted', sarsProofReference: 'SARS-1',
  }, mvpProfile: { propertyConditions: { titleRestrictions: 'no', complianceCertificates: 'no',
    clearances: { municipal: { issuer: 'City', reference: 'RCC-2', validUntil: '2030-01-01' } } } } }
  assert.equal(buildStageThreeFinancialReview({ taskKey: 'transfer_duty_assessment_payment', routingProfile: dutyProfile, now }).missing, 0)
  assert.ok(buildStageThreeFinancialReview({ taskKey: 'municipal_rates_clearance_review', routingProfile: dutyProfile, now }).notApplicable.includes('HOA clearance'))
  assert.equal(buildStageThreeFinancialReview({ taskKey: 'hoa_clearance_review', routingProfile: dutyProfile, now }).applicable, false)
  const unknownRoute = buildStageThreeFinancialReview({ taskKey: 'transfer_tax_route_confirmed', routingProfile: {
    propertyTenure: 'unknown', transferTaxDecision: { route: 'needs_tax_advice' },
  }, now })
  assert.equal(unknownRoute.unknownRoute, true)
  assert.equal(unknownRoute.notApplicable.includes('Transfer duty'), false,
    'an undecided tax route must not declare alternatives inapplicable')
  assert.equal(buildStageThreeFinancialReview({ taskKey: 'ordinary_vat_basis_verified', routingProfile: {
    ...financialProfile, transferTaxDecision: { ...financialProfile.transferTaxDecision, route: 'vat' },
  }, now }).applicable, true)
  const exempt = buildStageThreeFinancialReview({ taskKey: 'transfer_duty_exemption_basis_verified', routingProfile: {
    ...dutyProfile, transferTaxDecision: { route: 'exempt', exemptionClaims: [{ applicable: 'yes', statutoryBasis: 'Act 1', appliesTo: 'Buyer', evidenceReference: 'EX-1' }] },
  }, now })
  assert.equal(exempt.missing, 0)
  const nonResident = buildStageThreeFinancialReview({ taskKey: 'non_resident_seller_withholding_payment_review', routingProfile: {
    ...dutyProfile, scenarioProfile: { parties: [{ id: 'seller-1', role: 'seller', name: 'Seller One', taxResidence: 'outside_south_africa' }] },
    transferTaxDecision: { ...dutyProfile.transferTaxDecision, nonResidentSellers: {
      'seller-1': { applicable: 'yes', basisNote: 'Non-resident', proofReference: 'REVIEW-1', withholdingRequired: 'yes' },
    } },
  }, now })
  assert.equal(nonResident.applicable, true)
  assert.ok(nonResident.checks.some(item => item.label === 'Seller One: payment proof' && item.state === 'missing'))
  assert.ok(phase4DecisionIssues(dutyProfile.transferTaxDecision, {}, {
    ...dutyProfile.mvpProfile.propertyConditions, clearances: { municipal: { issuer: 'City', validUntil: '2030-01-01' } },
  }, { propertyTenure: 'freehold', hoaApplicable: 'no' }).includes('municipal clearance reference'))
  const lodgementReview = evaluateTransferTaxLodgementReadiness({
    transferTaxDecision: dutyProfile.transferTaxDecision,
    propertyConditions: { ...dutyProfile.mvpProfile.propertyConditions,
      clearances: { municipal: { issuer: 'City', validUntil: '2030-01-01' } } },
    profile: { propertyTenure: 'freehold', hoaApplicable: 'no' },
    steps: ['transfer_duty_tdc01_submission', 'transfer_duty_assessment_payment', 'sars_transfer_tax_receipt_verified']
      .map(key => ({ key, status: 'completed' })),
  })
  assert.equal(lodgementReview.ready, false)
  assert.ok(lodgementReview.warnings.some(warning => warning.includes('municipal clearance reference')))
  const financialWorkspace = buildTransferWorkspaceViewModel({ workflow: {
    facts: { routingProfile: dutyProfile }, routingProfile: dutyProfile,
    lane: { laneKey: 'transfer', currentStage: 'municipal_rates_clearance_review', steps: [] },
  }, selectedTaskKey: 'municipal_rates_clearance_review', now })
  assert.equal(financialWorkspace.selectedTaskContext.financialPreparation.route, 'Transfer duty')
  const financialTaskModel = buildLegalTaskWorkbenchModel({
    task: financialWorkspace.selectedTask, taskContext: financialWorkspace.selectedTaskContext,
  })
  assert.equal(financialTaskModel.financialPreparation.checks.find(item => item.label === 'Municipal rates certificate reference').value, 'RCC-2')
  const bondState = createEmptyBondApplicationState()
  bondState.application.finance.purchasePrice = '2000000'
  bondState.application.finance.depositAmount = '150000'
  bondState.application.finance.requestedBondAmount = '1850000'
  const bondChecklistFor = (occupation) => {
    bondState.participants.primaryApplicant.employment.occupation_status = occupation
    const requirements = resolveBondApplicationDocumentRequirements({ applicationState: bondState }).activeRequirements
    return buildBondApplicationDocumentChecklist({ activeRequirements: requirements })
  }
  const employedChecklist = bondChecklistFor('permanent_employee')
  const selfEmployedChecklist = bondChecklistFor('self_employed')
  const evidence = [{ id: 'cash-file', sourceRequirementKey: 'proof_of_funds', status: 'uploaded', fileUrl: 'https://example.test/cash.pdf' },
    { id: 'guarantee-file', requiredDocumentKey: 'bank_guarantee', status: 'approved', fileUrl: 'https://example.test/guarantee.pdf' },
    { id: 'cash-placeholder', requiredDocumentKey: 'proof_of_funds', status: 'missing' },
    { id: 'approved-placeholder', requiredDocumentKey: 'proof_of_funds', status: 'approved', ready: true }]
  const applicants = [{ role: 'primary_applicant', fullName: 'Sample Buyer' }]
  const cashReview = buildStageFourSecurityReview({ taskKey: 'payment_security_review',
    routingProfile: { financeType: 'cash', mvpProfile: { paymentSecurity: 'cleared_trust_funds' } },
    documents: evidence, securityDocuments: evidence, bondApplicationChecklist: employedChecklist, bondApplicants: applicants })
  assert.equal(cashReview.cashEvidenceCount, 1, 'the same cash file is counted once across document sources')
  assert.equal(cashReview.guaranteeEvidenceCount, 0)
  assert.equal(cashReview.bondRows.length, 0)
  assert.ok(cashReview.notApplicable.includes('Bond-application evidence'))
  const bondReview = buildStageFourSecurityReview({ taskKey: 'payment_security_review',
    routingProfile: { financeType: 'bond', mvpProfile: { paymentSecurity: 'guarantee' } },
    securityDocuments: evidence, bondApplicationChecklist: employedChecklist, bondApplicants: applicants })
  assert.equal(bondReview.cashEvidenceCount, 0)
  assert.equal(bondReview.guaranteeEvidenceCount, 1)
  assert.ok(bondReview.bondRows.some(row => row.id.includes('bond_application_primary_applicant_bank_statements')))
  assert.equal(bondReview.bondRows.some(row => row.id.includes('self_employed_personal_bank_statements')), false)
  assert.ok(bondReview.bondRows.every(row => row.person === 'Sample Buyer' || row.person === 'Application'))
  const mixedReview = buildStageFourSecurityReview({ taskKey: 'cash_funding_source_review',
    routingProfile: { financeType: 'combination', mvpProfile: { paymentSecurity: 'guarantee' } },
    documents: evidence, securityDocuments: evidence, bondApplicationChecklist: selfEmployedChecklist, bondApplicants: applicants })
  assert.equal(mixedReview.financeLabel, 'Mixed cash and bond')
  assert.equal(mixedReview.cashEvidenceCount, 1)
  assert.equal(mixedReview.guaranteeEvidenceCount, 1)
  assert.ok(mixedReview.bondRows.some(row => row.id.includes('self_employed_personal_bank_statements')))
  assert.ok(mixedReview.bondRows.some(row => row.id.includes('self_employed_business_bank_statements')))
  assert.equal(mixedReview.bondRows.some(row => row.id.includes('bond_application_primary_applicant_bank_statements')), false)
  bondState.participants.primaryApplicant.employment.occupation_status = 'permanent_employee'
  bondState.participants.coApplicant = structuredClone(bondState.participants.primaryApplicant)
  bondState.participants.coApplicant.employment.occupation_status = 'self_employed'
  const jointRequirements = resolveBondApplicationDocumentRequirements({ applicationState: bondState, includeAllParticipants: true }).activeRequirements
  const jointReview = buildStageFourSecurityReview({ taskKey: 'payment_security_review',
    routingProfile: { financeType: 'bond', mvpProfile: { paymentSecurity: 'guarantee' } },
    bondApplicationChecklist: buildBondApplicationDocumentChecklist({ activeRequirements: jointRequirements }),
    bondApplicants: [...applicants, { role: 'co_applicant', fullName: 'Second Buyer' }] })
  assert.ok(jointReview.bondRows.some(row => row.person === 'Sample Buyer' && row.id.includes('primary_applicant_bank_statements')))
  assert.ok(jointReview.bondRows.some(row => row.person === 'Second Buyer' && row.id.includes('co_applicant_self_employed_personal_bank_statements')))
  assert.equal(new Set(jointReview.bondRows.map(row => row.id)).size, jointReview.bondRows.length,
    'each applicant requirement appears only once in the attorney handoff')
  assert.equal(buildStageFourSecurityReview({ taskKey: 'cash_funding_source_review',
    routingProfile: { financeType: 'bond' } }).taskApplicable, false)
  const developerReview = buildStageFourSecurityReview({ taskKey: 'payment_security_review',
    routingProfile: { financeType: 'developer' } })
  assert.deepEqual(developerReview.notApplicable, [], 'an unresolved developer funding split must not dismiss cash or bond checks')
  assert.match(render({ securityReview: developerReview }), /Confirm the cash\/bond funding split/)
  assert.match(render({ securityReview: mixedReview }), /Funding and payment security/)
  assert.match(render({ securityReview: mixedReview }), /Sample Buyer/)
  const stageFiveProfile = {
    financeType: 'bond', mvpProfile: { sellerExistingBond: 'no' },
    matterProfile: { status: 'confirmed', revision: 2, factFingerprint: 'stage-five-facts' },
    transferTaxDecision: { route: 'transfer_duty', status: 'confirmed', sarsStatus: 'receipted', sarsProofReference: 'SARS-5' },
  }
  const stageFivePlan = {
    ...buildMatterWorkflowPlan({ routingProfile: stageFiveProfile }),
    lanes: [
      { laneKey: 'transfer', stepKeys: ['sars_transfer_tax_receipt_verified', 'lodgement_ready', 'lodged_at_deeds_office', 'in_prep', 'registered'] },
      { laneKey: 'bond', stepKeys: ['bond_lodgement_ready', 'bond_lodged', 'bond_registered'] },
    ],
  }
  const stageFiveLanes = [
    { laneKey: 'transfer', steps: [
      { stepKey: 'sars_transfer_tax_receipt_verified', status: 'completed' },
      { stepKey: 'lodgement_ready', status: 'not_started' },
      { stepKey: 'lodged_at_deeds_office', status: 'not_started' },
    ] },
    { laneKey: 'bond', steps: [
      { stepKey: 'bond_lodgement_ready', status: 'not_started' },
      { stepKey: 'bond_lodged', status: 'not_started' },
    ] },
  ]
  const stageFiveDocuments = [{ id: 'rates-1', stage_gates: ['lodgement_ready'], requirement_level: 'blocker',
    document_definition_key: 'rates_clearance_certificate', status: 'approved', expiry_date: '2026-09-25T00:00:00Z' }]
  const stageFiveReview = buildStageFiveLodgementReview({ taskKey: 'lodgement_ready', workflowPlan: stageFivePlan,
    routingProfile: stageFiveProfile, lanes: stageFiveLanes, requiredDocuments: stageFiveDocuments, now })
  assert.equal(stageFiveReview.ready, false)
  assert.ok(stageFiveReview.issues.some(item => item.label.includes('Bond lodgement readiness')))
  assert.ok(stageFiveReview.issues.some(item => item.label.includes('rates_clearance_certificate: expired')))
  assert.match(render({ lodgementReview: stageFiveReview }), /Lodgement readiness review/)
  assert.match(render({ lodgementReview: stageFiveReview }), /Unresolved items \(2\)/)
  const currentDocuments = stageFiveDocuments.map(row => ({ ...row, expiry_date: '2030-09-25T00:00:00Z' }))
  const readyLanes = structuredClone(stageFiveLanes)
  readyLanes[1].steps[0].status = 'completed'
  assert.equal(buildStageFiveLodgementReview({ taskKey: 'lodgement_ready', workflowPlan: stageFivePlan,
    routingProfile: stageFiveProfile, lanes: readyLanes, requiredDocuments: currentDocuments, now }).ready, true)
  readyLanes[0].steps[1].status = 'completed'
  readyLanes[0].steps[2].status = 'completed'
  const prematureRegistration = buildStageFiveLodgementReview({ taskKey: 'registered', workflowPlan: stageFivePlan,
    routingProfile: stageFiveProfile, lanes: readyLanes, requiredDocuments: currentDocuments, now })
  assert.ok(prematureRegistration.issues.some(item => item.label.includes('Bond Deeds Office lodgement')))
  const staleTaxProfile = { ...stageFiveProfile, transferTaxDecision: { ...stageFiveProfile.transferTaxDecision, sarsStatus: 'pending' } }
  assert.ok(buildStageFiveLodgementReview({ taskKey: 'registered', workflowPlan: stageFivePlan,
    routingProfile: staleTaxProfile, lanes: readyLanes, requiredDocuments: currentDocuments, now }).issues.some(item => item.kind === 'tax'))
  const staleStageFivePlan = { ...stageFivePlan, matterProfileFingerprint: 'old-facts' }
  assert.ok(buildStageFiveLodgementReview({ taskKey: 'registered', workflowPlan: staleStageFivePlan,
    routingProfile: stageFiveProfile, lanes: readyLanes, requiredDocuments: currentDocuments, now }).issues.some(item => item.kind === 'plan'))
  const cancellationPlan = { ...stageFivePlan, lanes: [...stageFivePlan.lanes,
    { laneKey: 'cancellation', stepKeys: ['cancellation_lodgement_ready', 'cancellation_lodged', 'cancellation_registered'] }] }
  const cancellationLanes = [...readyLanes, { laneKey: 'cancellation', steps: [
    { stepKey: 'cancellation_lodgement_ready', status: 'not_started' },
    { stepKey: 'cancellation_lodged', status: 'not_started' },
  ] }]
  assert.ok(buildStageFiveLodgementReview({ taskKey: 'lodged_at_deeds_office', workflowPlan: cancellationPlan,
    routingProfile: stageFiveProfile, lanes: cancellationLanes, requiredDocuments: currentDocuments, now }).issues.some(item => item.label.includes('Cancellation lodgement readiness')))
  const closureTasks = [
    { key: 'registered', status: 'completed', completedAt: '2026-09-26T10:00:00Z' },
    { key: 'post_registration_closeout_review', status: 'not_started', taskConfirmations: {} },
    { key: 'matter_closed', status: 'not_started', taskConfirmations: {} },
  ]
  const financialClosure = buildStageSixClosureReview({ taskKey: 'post_registration_closeout_review', tasks: closureTasks })
  assert.equal(financialClosure.ready, false)
  assert.ok(financialClosure.issues.some(item => item.includes('final account')))
  closureTasks[1].taskConfirmations = { final_account_position_reviewed: { answer: 'yes', note: 'Reconciled.' } }
  assert.equal(buildStageSixClosureReview({ taskKey: 'post_registration_closeout_review', tasks: closureTasks }).ready, true)
  closureTasks[1].status = 'completed'
  closureTasks[2].taskConfirmations = { matter_closure_confirmed: { answer: 'yes' } }
  closureTasks[1].taskConfirmations = {}
  assert.ok(buildStageSixClosureReview({ taskKey: 'matter_closed', tasks: closureTasks }).issues.some(item => item.includes('Financial close-out')),
    'a legacy completed task without a saved final-account decision cannot authorize closure')
  closureTasks[1].taskConfirmations = { final_account_position_reviewed: { answer: 'yes', note: 'Reconciled.' } }
  const oldCommunication = [{ update_type: 'transfer_journey_progress', visibility: 'client_visible', client_recipients: ['buyer'],
    metadata: { journeyBrief: { stageKey: 'registration' } }, created_at: '2026-09-25T10:00:00Z' }]
  assert.equal(buildStageSixClosureReview({ taskKey: 'matter_closed', tasks: closureTasks, updates: oldCommunication }).ready, false,
    'a pre-registration update does not prove final communication')
  const clientCommunication = [{ ...oldCommunication[0], created_at: '2026-09-26T11:00:00Z' }]
  const closeoutReview = buildStageSixClosureReview({ taskKey: 'matter_closed', tasks: closureTasks, updates: clientCommunication })
  assert.equal(closeoutReview.ready, true)
  assert.deepEqual(closeoutReview.communication.recipients, ['buyer'])
  const closeoutHtml = render({ closureReview: closeoutReview })
  assert.match(closeoutHtml, /1 · Financial close-out/)
  assert.match(closeoutHtml, /2 · Registration communication/)
  assert.match(closeoutHtml, /Published to buyer/)
  assert.match(closeoutHtml, /3 · Administrative closure/)
  const crossLaneClosure = buildStageSixClosureReview({ taskKey: 'matter_closed', tasks: closureTasks,
    updates: clientCommunication, plannedLanes: [{ laneKey: 'bond' }], lanes: [{ laneKey: 'bond', steps: [{ stepKey: 'bond_close_out_complete', status: 'not_started' }] }] })
  assert.ok(crossLaneClosure.issues.some(item => item.includes('Bond close-out')))
  assert.doesNotMatch(render({ securityReview: mixedReview }), /example\.test\/cash\.pdf/)
  const securityWorkspace = buildTransferWorkspaceViewModel({ workflow: {
    facts: { routingProfile: { financeType: 'combination', mvpProfile: { paymentSecurity: 'guarantee' } } },
    lane: { laneKey: 'transfer', currentStage: 'payment_security_review', steps: [] },
  }, selectedTaskKey: 'payment_security_review', securityDocuments: evidence,
  bondApplicationChecklist: selfEmployedChecklist, bondApplicants: applicants })
  assert.equal(securityWorkspace.selectedTaskContext.securityReview?.cashEvidenceCount, 1)
  assert.equal(buildLegalTaskWorkbenchModel({ task: securityWorkspace.selectedTask,
    taskContext: securityWorkspace.selectedTaskContext }).securityReview?.guaranteeEvidenceCount, 1)
  const documents = [
    { id: 'missing:sales_agreement_or_otp', sourceRequirementKey: 'sales_agreement_or_otp', missing: true },
    { id: 'otp-upload', sourceRequirementKey: 'sales_agreement_or_otp', fileUrl: 'https://example.test/otp.pdf' },
    { id: 'identity-upload', sourceRequirementKey: 'buyer_id_document', fileUrl: 'https://example.test/id.pdf' },
  ]
  assert.deepEqual(relevantLegalTaskDocuments(documents, { requirementId: 'document:sales_agreement_or_otp', reviewOtp: true }).map(row => row.id),
    ['missing:sales_agreement_or_otp', 'otp-upload'])
  assert.deepEqual(relevantLegalTaskDocuments(documents.slice(2), { reviewOtp: true }), [])
  const rowModel = buildLegalTaskWorkbenchModel({
    task: { key: 'instruction_received', label: 'Instruction received', displayStatus: 'in_progress',
      operationalContract: { laneKey: 'transfer', visibilityPolicy: {} }, completionReadiness: { canComplete: false } },
    taskContext: { checklistItems: [
      { id: 'document:sales_agreement_or_otp', label: 'Signed OTP', type: 'document', required: true, complete: false },
      { id: 'data:matter_number', label: 'Matter number', type: 'data', required: true, complete: false },
    ], relatedDocuments: documents },
    workActions: [{ id: 'upload_document', label: 'Upload document' }, { id: 'open_matter', label: 'Open matter' }],
    statusActions: [{ id: 'mark_complete', label: 'Complete task', status: 'completed' }],
  })
  assert.equal(rowModel.confirmationRows.length, 3, 'each non-matching requirement needs its own editable row')
  assert.equal(rowModel.confirmationRows.find(row => row.id === 'otp_received_and_reviewed')?.action?.label, 'Review OTP')
  assert.equal(rowModel.confirmationRows.find(row => row.id === 'otp_received_and_reviewed')?.documentStatus?.attached, 1)
  assert.equal(rowModel.confirmationRows.find(row => row.id === 'requirement:data:matter_number')?.action?.id, 'open_matter')
  assert.equal(rowModel.completeAction?.id, 'mark_complete', 'task completion remains separate from row answers')
  const partyCases = [
    ['individual', 'buyer_id_document'],
    ['company', 'buyer_company_resolution'],
    ['trust', 'buyer_trust_deed'],
  ]
  for (const [entityType, documentKey] of partyCases) {
    const party = { id: `${entityType}-buyer`, name: `${entityType} Buyer`, entityType, factsVersion: entityType }
    const stageTwoModel = buildLegalTaskWorkbenchModel({
      task: { key: 'buyer_fica_review', label: 'Buyer FICA', displayStatus: 'in_progress',
        operationalContract: { laneKey: 'transfer' }, stageTwoParties: [party], completionReadiness: { canComplete: false } },
      taskContext: { checklistItems: [{ id: `document:${documentKey}`, label: documentKey, type: 'document', required: true }],
        relatedDocuments: [{ id: `${entityType}-doc`, sourceRequirementKey: documentKey, fileUrl: 'https://example.test/file.pdf' }] },
      workActions: [{ id: 'upload_document', label: 'Upload document' }],
    })
    const row = stageTwoModel.confirmationRows.find(item => item.requirement?.partyId === party.id)
    assert.ok(row, `${entityType} FICA has a named-party row`)
    assert.equal(row.documentStatus.attached, 0, 'unscoped legacy evidence cannot stand in for a named person')
    assert.equal(stageTwoModel.confirmationRows.some(item => item.id === 'buyer_fica_review_documents_checked'), false,
      'aggregate FICA approval is not offered when party facts exist')
    const profile = resolveMatterScenarioProfile({ parties: [{ id: party.id, role: 'buyer', name: party.name,
      entityType, ownershipShare: 100, maritalRegime: 'single', taxResidence: 'south_africa', identityRoute: 'sa_id',
      representatives: entityType === 'individual' ? [] : [{ id: `${entityType}-signer`, name: 'Signer', capacity: 'Authorised' }] }] })
    const workspace = buildTransferWorkspaceViewModel({ workflow: {
      facts: { scenarioProfile: profile }, lane: { laneKey: 'transfer', currentStage: 'buyer_fica_review', steps: [] },
    }, selectedTaskKey: 'buyer_fica_review' })
    assert.equal(workspace.selectedTask.stageTwoParties[0].entityType, entityType,
      `${entityType} party facts flow through to the Stage 2 Work tab`)
  }
  const twoPartyDocuments = [
    { id: 'alice-id', sourceRequirementKey: 'buyer_id_document', partyId: 'alice', fileUrl: 'https://example.test/alice.pdf' },
    { id: 'bob-id', sourceRequirementKey: 'buyer_id_document', partyId: 'bob', fileUrl: 'https://example.test/bob.pdf' },
    { id: 'unassigned-id', sourceRequirementKey: 'buyer_id_document', fileUrl: 'https://example.test/unassigned.pdf' },
  ]
  const twoPartyModel = buildLegalTaskWorkbenchModel({
    task: { key: 'buyer_fica_review', label: 'Buyer FICA', displayStatus: 'in_progress',
      operationalContract: { laneKey: 'transfer' },
      stageTwoParties: [{ id: 'alice', name: 'Alice', entityType: 'individual', factsVersion: 'v1' },
        { id: 'bob', name: 'Bob', entityType: 'individual', factsVersion: 'v1' }],
      completionReadiness: { canComplete: false } },
    taskContext: { checklistItems: [{ id: 'document:buyer_id_document', label: 'Identity document', type: 'document', required: true }],
      relatedDocuments: twoPartyDocuments },
  })
  const aliceRow = twoPartyModel.confirmationRows.find(item => item.requirement?.partyId === 'alice')
  const bobRow = twoPartyModel.confirmationRows.find(item => item.requirement?.partyId === 'bob')
  assert.equal(aliceRow.documentStatus.attached, 1)
  assert.equal(bobRow.documentStatus.attached, 1)
  assert.deepEqual(relevantLegalTaskDocuments(twoPartyDocuments, aliceRow.action).map(document => document.id), ['alice-id'])
  const manyParties = Array.from({ length: 24 }, (_, index) => ({
    id: `buyer-${index + 1}`, name: `Buyer ${index + 1}`, entityType: 'individual', factsVersion: 'v1',
  }))
  const manyPartyDocuments = manyParties.slice(0, 23).map(party => ({
    id: `${party.id}-id`, sourceRequirementKey: 'buyer_id_document', partyId: party.id,
    fileUrl: `https://example.test/${party.id}.pdf`,
  }))
  const manyPartyModel = buildLegalTaskWorkbenchModel({
    task: { key: 'buyer_fica_review', label: 'Buyer FICA', displayStatus: 'in_progress',
      operationalContract: { laneKey: 'transfer' }, stageTwoParties: manyParties,
      completionReadiness: { canComplete: false } },
    taskContext: { checklistItems: [{ id: 'document:buyer_id_document', label: 'Identity document', type: 'document', required: true }],
      relatedDocuments: manyPartyDocuments },
  })
  const partyRows = manyPartyModel.confirmationRows.filter(item => item.requirement?.partyId)
  assert.equal(partyRows.length, 24, 'large multi-party matters keep one evidence decision per person')
  assert.equal(partyRows.filter(item => item.documentStatus.attached === 1).length, 23)
  assert.equal(partyRows.find(item => item.requirement.partyId === 'buyer-24').documentStatus.attached, 0,
    'one missing identity document is not satisfied by another party’s file')
  const participantDocument = buildAllDocumentLibraryRows({ documents: [{
    id: 'linked-id', name: 'Alice identity', category: 'Buyer FICA / Compliance', document_type: 'buyer_id_document',
    related_entity_type: 'transaction_participant', related_entity_id: '2dcce63b-e6d9-4bda-8efa-a0796700e331',
  }] })[0]
  assert.equal(participantDocument.relatedEntityId, '2dcce63b-e6d9-4bda-8efa-a0796700e331')
  assert.deepEqual(relevantLegalTaskDocuments([participantDocument], {
    requirementId: 'document:buyer_id_document', partyId: 'buyer:2dcce63b-e6d9-4bda-8efa-a0796700e331',
  }).map(document => document.id), ['linked-id'])
  assert.deepEqual(relevantLegalTaskDocuments([participantDocument], {
    requirementId: 'document:buyer_id_document', partyId: 'buyer:4a5e1d02-8d6e-4b46-9bac-c6766d256db2',
  }), [], 'a different buyer cannot review or approve Alice’s ID')
  const twoBuyerProfile = resolveMatterScenarioProfile({ parties: [
    { id: 'buyer:2dcce63b-e6d9-4bda-8efa-a0796700e331', role: 'buyer', name: 'Alice', entityType: 'individual', maritalRegime: 'single', ownershipShare: 50 },
    { id: 'buyer:4a5e1d02-8d6e-4b46-9bac-c6766d256db2', role: 'buyer', name: 'Bob', entityType: 'individual', maritalRegime: 'single', ownershipShare: 50 },
  ] })
  const twoBuyerWorkspace = buildTransferWorkspaceViewModel({ workflow: {
    facts: { scenarioProfile: twoBuyerProfile }, lane: { laneKey: 'transfer', currentStage: 'buyer_fica_review', steps: [] },
  }, documents: [{ id: 'alice-id', category: 'Buyer FICA / Compliance', documentType: 'buyer_id_document',
    status: 'approved', relatedEntityType: 'transaction_participant', relatedEntityId: '2dcce63b-e6d9-4bda-8efa-a0796700e331' }],
  selectedTaskKey: 'buyer_fica_review' })
  assert.ok(twoBuyerWorkspace.selectedTask.completionReadiness.warnings.some(warning => /Bob: buyer id document is not linked/.test(warning)),
    'a document linked to Alice cannot satisfy Bob’s FICA readiness')
  assert.notEqual(aliceRow.id, bobRow.id, 'answers are stored per person')
  const duplicateSourceModel = buildLegalTaskWorkbenchModel({
    task: { key: 'buyer_fica_review', label: 'Buyer FICA', displayStatus: 'in_progress',
      operationalContract: { laneKey: 'transfer' }, stageTwoParties: [{ id: 'alice', name: 'Alice', entityType: 'individual', factsVersion: 'v1' }],
      completionReadiness: { canComplete: false } },
    taskContext: { checklistItems: [
      { id: 'document:required-row', sourceRequirementId: 'document:buyer_id_document', label: 'Buyer ID', type: 'document' },
      { id: 'document:uploaded-row', sourceRequirementId: 'document:buyer_id_document', label: 'Buyer ID upload', type: 'document' },
    ], relatedDocuments: twoPartyDocuments },
  })
  assert.equal(duplicateSourceModel.confirmationRows.length, 1, 'requirement and upload rows produce one decision per person')
  assert.notEqual(aliceRow.id, aliceRow.id.replace('v1', 'v2'), 'changed facts must not reuse an old answer key')
  const reviewed = resolveMatterScenarioProfile({ parties: [{ id: 'buyer-1', role: 'buyer', name: 'Buyer', entityType: 'company',
    ownershipShare: 100, taxResidence: 'south_africa', representatives: [{ id: 'director-1', name: 'Director', capacity: 'Director' }],
    capacityReview: { status: 'cleared', note: 'Authority verified', confirmations: {
      identity_fica: true, tax_residence: true, registration: true, beneficial_ownership: true,
      resolution: true, signatories: true }, reviewedBy: 'attorney-1', reviewedAt: '2026-09-26T10:00:00Z' } }] })
  reviewed.parties[0].capacityReview.reviewedFacts = {
    id: 'buyer-1', role: 'buyer', name: 'Buyer', entityType: 'company', maritalRegime: 'unknown', ownershipShare: 100,
    identityRoute: 'unknown', taxResidence: 'south_africa', representatives: [{ id: 'director-1', name: 'Director', capacity: 'Director' }],
  }
  const changed = structuredClone(reviewed)
  changed.parties[0].representatives[0].name = 'New Director'
  const invalidated = applyPartyCapacityDecisions(reviewed, changed, { canReview: true, userId: 'attorney-1', now: '2026-09-26T11:00:00Z' })
  assert.equal(invalidated.parties[0].capacityReview.status, 'pending')
  assert.equal(partyCapacityReviewStale(invalidated.parties[0]), true)
  const capacityWorkflow = { facts: { scenarioProfile: invalidated }, workflowPlan: { configuration: { scenarioProfile: invalidated } },
    lane: { laneKey: 'transfer', currentStage: 'buyer_party_capacity_review', steps: [], permissions: { canUpdateStage: true } } }
  const capacityView = buildTransferWorkspaceViewModel({ workflow: capacityWorkflow, selectedTaskKey: 'buyer_party_capacity_review' })
  assert.equal(capacityView.selectedTask.partyCapacity.parties[0].staleApproval, true)
  assert.ok(capacityView.selectedTask.completionReadiness.warnings.some(warning => /stale/.test(warning)))
  const capacityModel = buildLegalTaskWorkbenchModel({ task: capacityView.selectedTask, taskContext: capacityView.selectedTaskContext })
  assert.ok(capacityModel.confirmationRows.some(row => row.authoritative && row.action?.id === 'open_party_capacity'))
  const specialistModel = buildLegalTaskWorkbenchModel({
    task: { ...capacityView.selectedTask, stageTwoParties: [{ id: 'estate-1', name: 'Estate', entityType: 'estate',
      status: 'hold', specialistHold: true, signatories: [], staleApproval: false }], partyCapacity: { parties: [{
      id: 'estate-1', name: 'Estate', entityType: 'estate', status: 'hold', ready: false, specialistHold: true,
      signatories: [], checks: [{ key: 'identity_fica', label: 'Identity / FICA evidence reviewed', complete: false }],
    }] } },
    taskContext: { checklistItems: [{ id: 'party:estate-1:identity_fica', label: 'Estate: FICA', type: 'party',
      partyId: 'estate-1', specialistHold: true, complete: false }] },
  })
  assert.equal(specialistModel.confirmationRows[0].authoritative, true)
  assert.equal(specialistModel.stageTwoParties[0].specialistHold, true)
  const staleMarkup = renderToStaticMarkup(createElement(TaskConfirmations, { taskKey: 'capacity',
    items: capacityModel.confirmationRows, saved: Object.fromEntries(capacityModel.confirmationRows.map(row => [row.id, { answer: 'yes' }])),
    onSave: async () => true }))
  assert.match(staleMarkup, /Prior approval is stale/)
  assert.match(staleMarkup, /0 of \d+ answered/, 'historical Yes answers must not appear current after party facts change')
  const pageSource = readFileSync(new URL('../src/pages/AttorneyTransactionDetail.jsx', import.meta.url), 'utf8')
  assert.match(pageSource, /onSaveConfirmations=\{async \(responses\) => persistTaskUpdate\(\s*selectedTask,\s*selectedTask\.status,/,
    'Save answers must persist without changing task status')
  assert.match(pageSource, /onSelectTask=\{selectTaskWithUnsavedGuard\}/)
  assert.match(pageSource, /onConfirmationDirtyChange=\{handleConfirmationDirtyChange\}/)
  assert.match(pageSource, /activeWorkspaceMenu === 'transfer' && nextMenu !== 'transfer' && !confirmDiscardAttorneyAnswers\(\)/,
    'leaving the Work tab must guard unsaved answers')
  assert.match(pageSource, /normalized !== activeLegalWorkflowDetailKey && !confirmDiscardAttorneyAnswers\(\)/,
    'switching legal workflow lanes must guard unsaved answers')
  assert.match(pageSource, /onDirtyAnswersChange=\{handleAttorneyAnswersDirtyChange\}/)
  assert.match(pageSource, /onOpenRoutingProfile=\{onOpenRoutingProfile\}/,
    'Stage 2 party rows must open the actual matter profile editor')
  assert.match(pageSource, /canUpdateSteps = typeof onUpdateStep === 'function' && workflow\?\.lane\?\.permissions\?\.canUpdateStage === true/,
    'the Work tab must not infer write access from a callback alone')
  assert.match(pageSource, /onReviewDocument=\{workflow\?\.lane\?\.permissions\?\.canReviewDocuments \? onReviewTaskDocument : undefined\}/,
    'document review controls must follow the lane permission')
  assert.match(pageSource, /attorneyLaneKey: archlineActiveLegalTaskWorkflowKey/,
    'document reviews must send the active legal lane for database authorization')
  const browser = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost' })
  const previous = { window: globalThis.window, document: globalThis.document, HTMLElement: globalThis.HTMLElement }
  globalThis.window = browser.window
  globalThis.document = browser.window.document
  globalThis.HTMLElement = browser.window.HTMLElement
  try {
    const { render: renderInteractive, fireEvent, waitFor, cleanup } = await import('@testing-library/react')
    const dirtyChanges = []
    const saves = []
    const view = renderInteractive(createElement(TaskConfirmations, {
      taskKey: 'instruction_received', items: [{ id: 'received', label: 'Instruction received' }], saved: {},
      onDirtyChange: (taskKey, dirty) => dirtyChanges.push([taskKey, dirty]),
      onSave: async answers => { saves.push(answers); return true },
    }))
    fireEvent.click(view.getByRole('button', { name: 'Yes' }))
    assert.deepEqual(dirtyChanges.at(-1), ['instruction_received', true])
    const beforeSave = new browser.window.Event('beforeunload', { cancelable: true })
    browser.window.dispatchEvent(beforeSave)
    assert.equal(beforeSave.defaultPrevented, true, 'unsaved answers must warn before browser navigation')
    fireEvent.click(view.getByRole('button', { name: 'Save answers' }))
    await waitFor(() => assert.equal(saves.length, 1))
    await waitFor(() => assert.deepEqual(dirtyChanges.at(-1), ['instruction_received', false]))
    assert.equal(saves[0].received.answer, 'yes')
    const afterSave = new browser.window.Event('beforeunload', { cancelable: true })
    browser.window.dispatchEvent(afterSave)
    assert.equal(afterSave.defaultPrevented, false)
    cleanup()
    const reloadedView = renderInteractive(createElement(TaskConfirmations, {
      taskKey: 'instruction_received', items: [{ id: 'received', label: 'Instruction received' }], saved: saves[0],
      onSave: async () => true,
    }))
    assert.equal(reloadedView.getByRole('button', { name: 'Yes' }).getAttribute('aria-pressed'), 'true',
      'a saved answer remains selected after the task is remounted on reload')
    cleanup()
    const rowActions = []
    const rowSaves = []
    const rowView = renderInteractive(createElement(TaskConfirmations, {
      taskKey: 'instruction_received', items: [{ id: 'otp', label: 'OTP reviewed', answers: ['yes', 'no'],
        documentStatus: { attached: 1 }, action: { id: 'review_document', label: 'Review OTP' } }], saved: {},
      onSave: async draft => { rowSaves.push(draft); return true }, onRunAction: action => rowActions.push(action.id),
    }))
    fireEvent.click(rowView.getByRole('button', { name: 'Review OTP' }))
    assert.deepEqual(rowActions, ['review_document'])
    fireEvent.click(rowView.getByRole('button', { name: 'Add note' }))
    fireEvent.change(rowView.getByRole('textbox', { name: 'Note for OTP reviewed' }), { target: { value: 'Needs signed page' } })
    fireEvent.click(rowView.getByRole('button', { name: 'Save answers' }))
    assert.match(rowView.getByText('Choose an answer before saving this note.').textContent, /Choose an answer/)
    fireEvent.click(rowView.getByRole('button', { name: 'No' }))
    assert.match(rowView.getByText('Answered No · work may still be needed').textContent, /Answered No/)
    assert.match(rowView.getByText('1 of 1 answered').textContent, /1 of 1 answered/)
    fireEvent.click(rowView.getByRole('button', { name: 'Save answers' }))
    await waitFor(() => assert.equal(rowSaves.length, 1))
    assert.deepEqual(rowSaves[0].otp, { answer: 'no', note: 'Needs signed page' })
    cleanup()
    const deniedView = renderInteractive(createElement(TaskConfirmations, {
      taskKey: 'instruction_received', items: [{ id: 'received', label: 'Instruction received' }], saved: {},
      onSave: async () => false,
    }))
    fireEvent.click(deniedView.getByRole('button', { name: 'Yes' }))
    fireEvent.click(deniedView.getByRole('button', { name: 'Save answers' }))
    await waitFor(() => assert.match(deniedView.getByRole('alert').textContent, /Answers were not saved/))
    assert.ok(deniedView.getByText('Unsaved answers'), 'denied writes must keep the draft visible')
    cleanup()
    let finishSlowSave
    const slowSave = new Promise(resolve => { finishSlowSave = resolve })
    const slowView = renderInteractive(createElement(TaskConfirmations, {
      taskKey: 'transfer:instruction_received', items: [{ id: 'received', label: 'Instruction received' }], saved: {},
      onSave: () => slowSave,
    }))
    fireEvent.click(slowView.getByRole('button', { name: 'Yes' }))
    fireEvent.click(slowView.getByRole('button', { name: 'Save answers' }))
    assert.ok(slowView.getByRole('button', { name: 'Saving…' }).disabled, 'a slow save must block duplicate submission')
    slowView.rerender(createElement(TaskConfirmations, {
      taskKey: 'bond:bond_instruction_received', items: [{ id: 'bond', label: 'Bond instruction received' }], saved: {},
      onSave: async () => true,
    }))
    fireEvent.click(slowView.getByRole('button', { name: 'No' }))
    finishSlowSave(true)
    await new Promise(resolve => setTimeout(resolve, 0))
    await waitFor(() => assert.ok(slowView.getByText('Unsaved answers')))
    assert.ok(!slowView.getByRole('button', { name: 'Save answers' }).disabled,
      'a late save from the prior lane must not clear the new lane draft')
    cleanup()
    let finishUnmountedSave
    const unmountedSave = new Promise(resolve => { finishUnmountedSave = resolve })
    const staleDirtyEvents = []
    const unmountedView = renderInteractive(createElement(TaskConfirmations, {
      taskKey: 'transfer:otp_source_docs_checked', items: [{ id: 'otp', label: 'OTP reviewed' }], saved: {},
      onDirtyChange: (_, dirty) => staleDirtyEvents.push(dirty), onSave: () => unmountedSave,
    }))
    fireEvent.click(unmountedView.getByRole('button', { name: 'Yes' }))
    fireEvent.click(unmountedView.getByRole('button', { name: 'Save answers' }))
    unmountedView.unmount()
    const eventsBeforeResponse = staleDirtyEvents.length
    finishUnmountedSave(true)
    await new Promise(resolve => setTimeout(resolve, 0))
    assert.equal(staleDirtyEvents.length, eventsBeforeResponse,
      'an unmounted task must not report a late save into the next lane')
    const otpAction = { id: 'review_document', label: 'Review OTP', reviewOtp: true,
      requirementId: 'document:sales_agreement_or_otp', requirement: { id: 'document:sales_agreement_or_otp' } }
    const otpModel = {
      ...model, primaryAction: otpAction, requirementActions: { otp: otpAction },
      confirmationRows: [{ id: 'otp', label: 'OTP reviewed', answers: ['yes', 'no'], action: otpAction, documentStatus: { attached: 0 } }],
      documents: [
        { id: 'missing:sales_agreement_or_otp', sourceRequirementKey: 'sales_agreement_or_otp', missing: true },
        { id: 'id-upload', sourceRequirementKey: 'buyer_id_document', displayName: 'Buyer ID', fileUrl: 'https://example.test/id.pdf' },
      ],
      requestDocumentAction: { id: 'request_document', disabled: false },
    }
    const requested = []
    const uploaded = []
    const missingView = renderInteractive(createElement(Workbench, {
      model: otpModel, selectedPhaseKey: 'instruction', phases: [{ key: 'instruction', label: 'Instruction', completed: 0, total: 5, tasks: [] }],
      onRequestDocument: requirement => requested.push(requirement), onOpenDocuments: (document, requirement) => uploaded.push([document, requirement]), onSaveConfirmations: async () => true,
    }))
    fireEvent.click(missingView.getByRole('button', { name: /Review OTP/ }))
    assert.ok(missingView.getByText('No OTP is linked to this task yet.'))
    assert.ok(missingView.getByRole('button', { name: 'Upload OTP' }))
    assert.equal(missingView.queryByTitle('Preview Buyer ID'), null, 'Review OTP must not preview an unrelated file')
    fireEvent.click(missingView.getByRole('button', { name: 'Request OTP' }))
    await waitFor(() => assert.equal(requested.length, 1))
    assert.equal(requested[0].id, 'document:sales_agreement_or_otp')
    fireEvent.click(missingView.getByRole('button', { name: /Review OTP/ }))
    fireEvent.click(missingView.getByRole('button', { name: 'Upload OTP' }))
    await waitFor(() => assert.equal(uploaded.length, 1))
    assert.equal(uploaded[0][1].id, 'document:sales_agreement_or_otp')
    cleanup()
    const failedRequestView = renderInteractive(createElement(Workbench, {
      model: otpModel, selectedPhaseKey: 'instruction', phases: [{ key: 'instruction', label: 'Instruction', completed: 0, total: 5, tasks: [] }],
      onRequestDocument: async () => { throw new Error('Document request service unavailable') },
      onSaveConfirmations: async () => true,
    }))
    fireEvent.click(failedRequestView.getByRole('button', { name: /Review OTP/ }))
    fireEvent.click(failedRequestView.getByRole('button', { name: 'Request OTP' }))
    await waitFor(() => assert.match(failedRequestView.getByRole('alert').textContent, /Document request service unavailable/))
    assert.ok(failedRequestView.getByRole('button', { name: /Review OTP/ }),
      'a failed document request leaves the attorney able to retry')
    cleanup()
    const failedUploadView = renderInteractive(createElement(Workbench, {
      model: otpModel, selectedPhaseKey: 'instruction', phases: [{ key: 'instruction', label: 'Instruction', completed: 0, total: 5, tasks: [] }],
      onOpenDocuments: async () => { throw new Error('Upload workspace unavailable') },
      onSaveConfirmations: async () => true,
    }))
    fireEvent.click(failedUploadView.getByRole('button', { name: /Review OTP/ }))
    fireEvent.click(failedUploadView.getByRole('button', { name: 'Upload OTP' }))
    await waitFor(() => assert.match(failedUploadView.getByRole('alert').textContent, /Upload workspace unavailable/))
    assert.ok(failedUploadView.getByRole('button', { name: /Review OTP/ }),
      'a failed upload launch leaves the document action available for retry')
    cleanup()
    const attachedView = renderInteractive(createElement(Workbench, {
      model: { ...otpModel, documents: [
        { id: 'otp-upload', sourceRequirementKey: 'sales_agreement_or_otp', displayName: 'Signed OTP', fileUrl: 'https://example.test/otp.pdf' },
        { id: 'id-upload', sourceRequirementKey: 'buyer_id_document', displayName: 'Buyer ID', fileUrl: 'https://example.test/id.pdf' },
      ] },
      selectedPhaseKey: 'instruction', phases: [{ key: 'instruction', label: 'Instruction', completed: 0, total: 5, tasks: [] }],
      onOpenDocuments: () => {}, onSaveConfirmations: async () => true,
    }))
    fireEvent.click(attachedView.getByRole('button', { name: /Review OTP/ }))
    assert.equal(attachedView.getByTitle('Preview Signed OTP').getAttribute('src'), 'https://example.test/otp.pdf')
    assert.equal(attachedView.queryByText('No OTP is linked to this task yet.'), null)
    cleanup()
    const manyDocuments = Array.from({ length: 125 }, (_, index) => ({
      id: `file-${index + 1}`, displayName: `File ${index + 1}`, fileUrl: `https://example.test/file-${index + 1}.pdf`,
    }))
    const longListView = renderInteractive(createElement(Workbench, {
      model: { ...model, documents: manyDocuments }, selectedPhaseKey: 'instruction',
      phases: [{ key: 'instruction', label: 'Instruction', completed: 0, total: 5, tasks: [] }],
      onSaveConfirmations: async () => true,
    }))
    fireEvent.click(longListView.getByRole('button', { name: 'View all (125)' }))
    assert.equal(longListView.queryByRole('button', { name: 'File 125 Available' }), null,
      'a long file list should not render every document at once')
    assert.ok(longListView.getByRole('button', { name: 'Show more documents (85 remaining)' }))
    fireEvent.change(longListView.getByRole('searchbox', { name: 'Search supporting documents' }), { target: { value: 'File 125' } })
    assert.ok(longListView.getByRole('button', { name: 'File 125 Available' }),
      'files beyond the initial page must remain searchable')
    cleanup()
    let specialistOpens = 0
    const specialistView = renderInteractive(createElement(Workbench, {
      model: { ...model, taskKey: 'specialist_classification_review', taskLabel: 'Specialist classification review', specialistRouteTask: true,
        confirmationRows: [{ id: 'task:specialist_classification_review', label: 'Specialist classification reviewed', answers: ['yes', 'no'] }] },
      selectedPhaseKey: 'instruction', phases: [{ key: 'instruction', label: 'Instruction', completed: 0, total: 5, tasks: [] }],
      onSaveConfirmations: async () => true, onOpenRoutingProfile: () => { specialistOpens++ },
    }))
    fireEvent.click(specialistView.getByRole('button', { name: 'Open specialist classification' }))
    assert.equal(specialistOpens, 1, 'specialist routing remains accessible inside confirmations')
    cleanup()
    const journeyUpdates = []
    const journeyView = renderInteractive(createElement(Workbench, {
      model, selectedPhaseKey: 'instruction',
      phases: [{ key: 'instruction', label: 'Instruction', completed: 0, total: 5, tasks: [] }],
      journeyStageKey: 'instruction', canPublishJourneyUpdate: true,
      onPublishJourneyUpdate: async update => { journeyUpdates.push(update) },
      onSaveConfirmations: async () => true,
    }))
    assert.equal(journeyView.queryByLabelText('Currently'), null, 'the journey form should not fill the workbench by default')
    fireEvent.click(journeyView.getByRole('button', { name: 'Add stage update' }))
    assert.ok(journeyView.getByRole('dialog', { name: 'Client journey stage update' }))
    fireEvent.change(journeyView.getByLabelText('Currently'), { target: { value: 'Waiting for figures' } })
    fireEvent.change(journeyView.getByLabelText('Is this stage delayed?'), { target: { value: 'delayed' } })
    fireEvent.change(journeyView.getByLabelText('Reason for delay'), { target: { value: 'Municipal figures are late' } })
    fireEvent.change(journeyView.getByLabelText('Latest update from the transferring attorney'), { target: { value: 'Figures requested from the municipality.' } })
    fireEvent.click(journeyView.getByRole('button', { name: 'Publish journey update' }))
    await waitFor(() => assert.equal(journeyUpdates.length, 1))
    assert.equal(journeyUpdates[0].journeyBrief.stageKey, 'instruction')
    assert.equal(journeyUpdates[0].journeyBrief.delayReason, 'Municipal figures are late')
    await waitFor(() => assert.equal(journeyView.queryByRole('dialog', { name: 'Client journey stage update' }), null))
    cleanup()
    let publisherOpens = 0
    const closureView = renderInteractive(createElement(Workbench, {
      model: { ...model, taskKey: 'matter_closed', taskLabel: 'Matter Closed', closureReview: {
        ...closeoutReview, ready: false, issues: ['Publish a registration-stage update to the applicable buyer or seller portal.'],
        communication: { published: false, recipients: [] },
      } },
      selectedPhaseKey: 'post_registration', phases: [{ key: 'post_registration', label: 'Post-Registration & Closure', completed: 1, total: 2, tasks: [] }],
      onOpenJourneyPublisher: () => { publisherOpens++ }, onSaveConfirmations: async () => true,
    }))
    fireEvent.click(closureView.getByRole('button', { name: 'Publish registration update' }))
    assert.equal(publisherOpens, 1, 'the communication card opens the recipient-selecting publisher')
    cleanup()
  } finally {
    globalThis.window = previous.window
    globalThis.document = previous.document
    globalThis.HTMLElement = previous.HTMLElement
    browser.window.close()
  }
  console.log('Work tab simplification: task-first rendering, labels and action gates passed')
} finally {
  await server.close()
}
