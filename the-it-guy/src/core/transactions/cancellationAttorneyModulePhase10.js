import {
  CANCELLATION_ATTORNEY_PHASE0_DATA_CONTRACT,
  CANCELLATION_ATTORNEY_PHASE0_RELEASE_BLOCKERS,
  buildCancellationAttorneyPhase0BaselineReport,
} from './cancellationAttorneyModulePhase0.js'
import {
  buildCancellationAttorneyPhase1BaselineReport,
} from './cancellationAttorneyModulePhase1.js'
import {
  buildCancellationAttorneyPhase2BaselineReport,
} from './cancellationAttorneyModulePhase2.js'
import {
  buildCancellationPackWorkspace,
  buildCancellationPackWorkspaceAuditEvent,
  validateCancellationPackWorkspace,
} from './cancellationAttorneyModulePhase3.js'
import {
  CANCELLATION_OPERATIONAL_DOCUMENT_GENERATION_BOUNDARY,
  buildCancellationAttorneyPhase4BaselineReport,
} from './cancellationAttorneyModulePhase4.js'
import {
  CANCELLATION_FIGURES_CONTROL_BOUNDARY,
  buildCancellationFiguresRegister,
  validateCancellationFiguresRegister,
} from './cancellationAttorneyModulePhase5.js'
import {
  CANCELLATION_GUARANTEE_CONTROL_BOUNDARY,
  buildCancellationGuaranteeWorkspace,
  validateCancellationGuaranteeWorkspace,
} from './cancellationAttorneyModulePhase6.js'
import {
  CANCELLATION_DOCUMENT_SIGNING_CONTROL_BOUNDARY,
  buildCancellationDocumentSigningWorkspace,
  validateCancellationDocumentSigningWorkspace,
} from './cancellationAttorneyModulePhase7.js'
import {
  CANCELLATION_LODGEMENT_REGISTRATION_BOUNDARY,
  buildCancellationLodgementEvidencePacket,
  validateCancellationLodgementEvidencePacket,
} from './cancellationAttorneyModulePhase8.js'
import {
  CANCELLATION_SETTLEMENT_CLOSEOUT_BOUNDARY,
  buildCancellationSettlementCloseoutPacket,
  validateCancellationSettlementCloseoutPacket,
} from './cancellationAttorneyModulePhase9.js'

export const CANCELLATION_ATTORNEY_PHASE10_VERSION = 'cancellation_attorney_module_phase10_release_certification_v1'
export const CANCELLATION_ATTORNEY_PHASE10_RELEASE_GATE_ID = 'cancellation_attorney_pilot_release_certification'

export const CANCELLATION_ATTORNEY_PHASE10_STATUSES = Object.freeze({
  ready: 'ready',
  blocked: 'blocked',
})

export const CANCELLATION_ATTORNEY_PHASE10_CONTROL_BOUNDARY = Object.freeze({
  readOnlyCertification: true,
  releaseGateOnly: true,
  requiresPhase0Scope: true,
  requiresAllReleaseBlockersClosed: true,
  requiresConveyancerOperatingCapabilities: true,
  requiresPhase9CloseoutReadiness: true,
  keepsManualEvidencePrimary: true,
  mayProduceNextActions: true,
  mutatesMatter: false,
  writesExternalSystem: false,
  sendsNotifications: false,
  submitsToBankPortal: false,
  integratesWithExistingLenderPortal: false,
  integratesWithDeedsOffice: false,
  mutatesRegistryOutcome: false,
  executesSettlementPayment: false,
  autoOverwritesManualEvidence: false,
  autoApprovesRelease: false,
  overridesTemplateGovernance: false,
  generatesLegalInstrument: false,
})

export const CANCELLATION_ATTORNEY_PHASE10_CAPABILITY_KEYS = Object.freeze({
  matterOpening: 'existing_bond_instruction_intake',
  usability: 'role_focused_cancellation_cockpit',
  canonicalData: 'canonical_cancellation_data_ready',
  operationalDrafts: 'operational_document_drafts_ready',
  figures: 'cancellation_figures_register_ready',
  guarantees: 'guarantee_coordination_ready',
  documentSigning: 'document_signing_workspace_ready',
  lodgementEvidence: 'lodgement_registration_evidence_ready',
  settlementCloseout: 'settlement_closeout_ready',
})

const S = CANCELLATION_ATTORNEY_PHASE10_STATUSES
const C = CANCELLATION_ATTORNEY_PHASE10_CAPABILITY_KEYS

function text(value = '') {
  return String(value ?? '').trim()
}

function validDate(value) {
  return Boolean(value && Number.isFinite(new Date(value).getTime()))
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable)
  if (value && typeof value === 'object') {
    return Object.keys(value).sort().reduce((result, itemKey) => {
      result[itemKey] = stable(value[itemKey])
      return result
    }, {})
  }
  return value
}

function hash(value) {
  const source = typeof value === 'string' ? value : JSON.stringify(stable(value))
  let result = 0x811c9dc5
  for (let index = 0; index < source.length; index += 1) {
    result ^= source.charCodeAt(index)
    result = Math.imul(result, 0x01000193)
  }
  return `fnv1a_${(result >>> 0).toString(16).padStart(8, '0')}`
}

function unique(values = []) {
  return [...new Set(values.filter(Boolean))]
}

function asValidation(value = {}) {
  if (value && typeof value === 'object' && Array.isArray(value.errors)) {
    return Object.freeze({
      valid: value.valid === true,
      errors: Object.freeze(value.errors),
      warnings: Object.freeze(Array.isArray(value.warnings) ? value.warnings : []),
    })
  }
  return Object.freeze({ valid: false, errors: Object.freeze(['validation_missing']), warnings: Object.freeze([]) })
}

function hasPackItem(workspace, itemId) {
  return (workspace.packItems || []).some((item) => item.id === itemId)
}

function phase2ReportFromWorkspace(workspace = null, fallback = null) {
  if (!workspace?.canonicalData) return fallback
  const data = workspace.canonicalData
  return Object.freeze({
    readyForPhase3: data.readyForCancellationPack === true &&
      data.controls?.canonicalDataOnly === true &&
      data.controls?.persistsCanonicalFacts === false &&
      data.controls?.generatesOperationalDocuments === false &&
      data.controls?.writesExternalSystem === false,
    readyForCancellationPack: data.readyForCancellationPack === true,
    missingDefinitionKeys: Object.freeze([]),
    phase0DataContractCount: CANCELLATION_ATTORNEY_PHASE0_DATA_CONTRACT.length,
    factDefinitionCount: Array.isArray(data.facts) ? data.facts.length : CANCELLATION_ATTORNEY_PHASE0_DATA_CONTRACT.length,
    dataFingerprint: data.dataFingerprint || null,
    controls: data.controls || {},
  })
}

function countReadyPackItems(workspace, strategy) {
  return (workspace.packItems || []).filter((item) => item.strategy === strategy && item.readyForWorkspace).length
}

function criterion({
  id,
  phase,
  label,
  releaseBlockerId = null,
  passed = false,
  severity = 'high',
  proof = {},
  failures = [],
} = {}) {
  return Object.freeze({
    id,
    phase,
    label,
    releaseBlockerId,
    severity,
    passed: passed === true,
    proof: Object.freeze(proof),
    failures: Object.freeze(unique(failures)),
  })
}

function capability({
  key,
  label,
  sourcePhase,
  ownerRole = 'cancellation_attorney',
  ready = false,
  proof = {},
  missingReason = '',
} = {}) {
  return Object.freeze({
    key,
    label,
    sourcePhase,
    ownerRole,
    ready: ready === true,
    proof: Object.freeze(proof),
    missingReason: text(missingReason) || null,
  })
}

function buildArtifactFingerprints({ workspace, figuresRegister, guaranteeWorkspace, documentSigningWorkspace, lodgementPacket, settlementCloseoutPacket }) {
  return Object.freeze({
    dataFingerprint: workspace.dataFingerprint || null,
    figuresFingerprint: figuresRegister.figuresFingerprint || null,
    guaranteeFingerprint: guaranteeWorkspace.guaranteeFingerprint || null,
    documentSigningFingerprint: documentSigningWorkspace.signingFingerprint || null,
    lodgementPacketFingerprint: lodgementPacket.packetFingerprint || null,
    settlementCloseoutFingerprint: settlementCloseoutPacket.packetFingerprint || null,
  })
}

function buildReleaseBlockerCriteria({
  phase0Report,
  phase1Report,
  phase2Report,
  workspace,
  workspaceValidation,
  operationalReport,
  figuresRegister,
  guaranteeWorkspace,
  documentSigningWorkspace,
  lodgementPacket,
  settlementCloseoutPacket,
}) {
  const byBlocker = {
    cancellation_lane_usability_not_simplified: criterion({
      id: 'phase1_usability_ready',
      phase: 1,
      label: 'Cancellation cockpit is simplified around the cancellation-attorney job',
      releaseBlockerId: 'cancellation_lane_usability_not_simplified',
      passed: phase1Report.readyForPhase2 === true &&
        asValidation(phase1Report.validation).valid &&
        phase1Report.domainCount === 6 &&
        phase1Report.stageCount === 19 &&
        phase1Report.visibleRequirementCount >= 10,
      proof: {
        domainCount: phase1Report.domainCount || 0,
        stageCount: phase1Report.stageCount || 0,
        visibleRequirementCount: phase1Report.visibleRequirementCount || 0,
        nextActionCount: phase1Report.nextActionCount || 0,
      },
      failures: [
        phase1Report.readyForPhase2 !== true ? 'phase1_usability_not_ready' : null,
        !asValidation(phase1Report.validation).valid ? 'phase1_usability_invalid' : null,
        phase1Report.domainCount !== 6 ? 'cancellation_domain_count_changed' : null,
        phase1Report.stageCount !== 19 ? 'cancellation_stage_count_changed' : null,
        phase1Report.visibleRequirementCount < 10 ? 'visible_requirement_count_too_low' : null,
      ],
    }),
    cancellation_data_contract_missing: criterion({
      id: 'phase2_canonical_data_ready',
      phase: 2,
      label: 'Cancellation data contract is canonical, source-bound and safe for downstream readiness',
      releaseBlockerId: 'cancellation_data_contract_missing',
      severity: 'critical',
      passed: phase2Report.readyForPhase3 === true &&
        phase2Report.readyForCancellationPack === true &&
        phase2Report.missingDefinitionKeys?.length === 0 &&
        phase2Report.phase0DataContractCount === 24,
      proof: {
        factDefinitionCount: phase2Report.factDefinitionCount || 0,
        phase0DataContractCount: phase2Report.phase0DataContractCount || 0,
        missingDefinitionCount: phase2Report.missingDefinitionKeys?.length || 0,
        dataFingerprint: phase2Report.dataFingerprint || null,
      },
      failures: [
        phase2Report.readyForPhase3 !== true ? 'phase2_not_ready' : null,
        phase2Report.readyForCancellationPack !== true ? 'canonical_data_not_pack_ready' : null,
        phase2Report.missingDefinitionKeys?.length ? 'data_contract_definitions_missing' : null,
        phase2Report.phase0DataContractCount !== 24 ? 'phase0_data_contract_count_changed' : null,
      ],
    }),
    cancellation_pack_workspace_missing: criterion({
      id: 'phase3_cancellation_pack_workspace_ready',
      phase: 3,
      label: 'Cancellation Pack Workspace is available and bound to verified source facts',
      releaseBlockerId: 'cancellation_pack_workspace_missing',
      severity: 'critical',
      passed: workspaceValidation.valid &&
        workspace.canonicalData?.readyForCancellationPack === true &&
        workspace.counts?.itemCount === 19 &&
        workspace.counts?.blockedItemCount === 0 &&
        countReadyPackItems(workspace, 'generate_now') === 9 &&
        countReadyPackItems(workspace, 'template_controlled') === 4 &&
        countReadyPackItems(workspace, 'ingest_only') === 6,
      proof: {
        workspaceStatus: workspace.status || null,
        itemCount: workspace.counts?.itemCount || 0,
        blockedItemCount: workspace.counts?.blockedItemCount || 0,
        dataFingerprint: workspace.dataFingerprint || null,
      },
      failures: [
        !workspaceValidation.valid ? 'workspace_validation_failed' : null,
        workspace.canonicalData?.readyForCancellationPack !== true ? 'canonical_data_not_ready' : null,
        workspace.counts?.itemCount !== 19 ? 'cancellation_pack_items_incomplete' : null,
        workspace.counts?.blockedItemCount ? 'cancellation_pack_items_blocked' : null,
      ],
    }),
    cancellation_operational_generator_missing: criterion({
      id: 'phase4_operational_generator_ready',
      phase: 4,
      label: 'Low-risk operational cancellation documents can be generated as reviewable drafts',
      releaseBlockerId: 'cancellation_operational_generator_missing',
      passed: operationalReport.readyForPhase5 === true &&
        operationalReport.operationalDocumentCount === 9 &&
        operationalReport.generatedCount === 9 &&
        operationalReport.failedCount === 0 &&
        CANCELLATION_OPERATIONAL_DOCUMENT_GENERATION_BOUNDARY.finalAllowed === false &&
        CANCELLATION_OPERATIONAL_DOCUMENT_GENERATION_BOUNDARY.settlementExecutionAllowed === false,
      proof: {
        operationalDocumentCount: operationalReport.operationalDocumentCount || 0,
        generatedCount: operationalReport.generatedCount || 0,
        failedCount: operationalReport.failedCount || 0,
        finalAllowed: CANCELLATION_OPERATIONAL_DOCUMENT_GENERATION_BOUNDARY.finalAllowed,
        settlementExecutionAllowed: CANCELLATION_OPERATIONAL_DOCUMENT_GENERATION_BOUNDARY.settlementExecutionAllowed,
      },
      failures: [
        operationalReport.readyForPhase5 !== true ? 'phase4_not_ready' : null,
        operationalReport.generatedCount !== 9 ? 'operational_documents_not_all_generated' : null,
        operationalReport.failedCount ? 'operational_generation_failures' : null,
        CANCELLATION_OPERATIONAL_DOCUMENT_GENERATION_BOUNDARY.finalAllowed !== false ? 'operational_finalisation_forbidden' : null,
      ],
    }),
    cancellation_figures_register_missing: criterion({
      id: 'phase5_figures_register_ready',
      phase: 5,
      label: 'Cancellation figures are structured, current and settlement-safe',
      releaseBlockerId: 'cancellation_figures_register_missing',
      severity: 'critical',
      passed: figuresRegister.readyForPhase6 === true &&
        asValidation(figuresRegister.validation).valid &&
        figuresRegister.metrics?.readyFigureCount > 0 &&
        figuresRegister.metrics?.blockedFigureCount === 0 &&
        figuresRegister.metrics?.attentionFigureCount === 0,
      proof: {
        figureCount: figuresRegister.metrics?.figureCount || 0,
        readyFigureCount: figuresRegister.metrics?.readyFigureCount || 0,
        blockedFigureCount: figuresRegister.metrics?.blockedFigureCount || 0,
        figuresFingerprint: figuresRegister.figuresFingerprint || null,
      },
      failures: [
        figuresRegister.readyForPhase6 !== true ? 'figures_register_not_ready' : null,
        !asValidation(figuresRegister.validation).valid ? 'figures_register_invalid' : null,
        figuresRegister.metrics?.blockedFigureCount ? 'blocked_cancellation_figures' : null,
        figuresRegister.metrics?.attentionFigureCount ? 'attention_cancellation_figures' : null,
      ],
    }),
    guarantee_coordination_workspace_missing: criterion({
      id: 'phase6_guarantee_workspace_ready',
      phase: 6,
      label: 'Guarantees reconcile against cancellation figures, beneficiary, wording and acceptance evidence',
      releaseBlockerId: 'guarantee_coordination_workspace_missing',
      passed: guaranteeWorkspace.readyForPhase7 === true &&
        asValidation(guaranteeWorkspace.validation).valid &&
        guaranteeWorkspace.metrics?.matchedGuaranteeCount > 0 &&
        guaranteeWorkspace.metrics?.blockedGuaranteeCount === 0 &&
        CANCELLATION_GUARANTEE_CONTROL_BOUNDARY.acceptsGuaranteeAutomatically === false,
      proof: {
        status: guaranteeWorkspace.status || null,
        matchedGuaranteeCount: guaranteeWorkspace.metrics?.matchedGuaranteeCount || 0,
        blockedGuaranteeCount: guaranteeWorkspace.metrics?.blockedGuaranteeCount || 0,
        guaranteeFingerprint: guaranteeWorkspace.guaranteeFingerprint || null,
      },
      failures: [
        guaranteeWorkspace.readyForPhase7 !== true ? 'guarantee_workspace_not_ready' : null,
        !asValidation(guaranteeWorkspace.validation).valid ? 'guarantee_workspace_invalid' : null,
        guaranteeWorkspace.metrics?.blockedGuaranteeCount ? 'blocked_guarantees' : null,
        CANCELLATION_GUARANTEE_CONTROL_BOUNDARY.acceptsGuaranteeAutomatically !== false ? 'automatic_guarantee_acceptance_forbidden' : null,
      ],
    }),
    cancellation_document_signing_workspace_missing: criterion({
      id: 'phase7_document_signing_workspace_ready',
      phase: 7,
      label: 'Cancellation documents and seller signing evidence are lodgement-ready',
      releaseBlockerId: 'cancellation_document_signing_workspace_missing',
      passed: documentSigningWorkspace.readyForPhase8 === true &&
        asValidation(documentSigningWorkspace.validation).valid &&
        documentSigningWorkspace.metrics?.readyDocumentCount === documentSigningWorkspace.metrics?.documentCount &&
        documentSigningWorkspace.metrics?.signatureGapCount === 0 &&
        documentSigningWorkspace.legalInstrumentsGenerated === false &&
        CANCELLATION_DOCUMENT_SIGNING_CONTROL_BOUNDARY.generatesLegalInstrument === false,
      proof: {
        status: documentSigningWorkspace.status || null,
        documentCount: documentSigningWorkspace.metrics?.documentCount || 0,
        readyDocumentCount: documentSigningWorkspace.metrics?.readyDocumentCount || 0,
        signatureGapCount: documentSigningWorkspace.metrics?.signatureGapCount || 0,
        signingFingerprint: documentSigningWorkspace.signingFingerprint || null,
      },
      failures: [
        documentSigningWorkspace.readyForPhase8 !== true ? 'document_signing_workspace_not_ready' : null,
        !asValidation(documentSigningWorkspace.validation).valid ? 'document_signing_workspace_invalid' : null,
        documentSigningWorkspace.metrics?.signatureGapCount ? 'document_signature_gaps' : null,
        documentSigningWorkspace.legalInstrumentsGenerated === true ? 'legal_instrument_generation_forbidden' : null,
      ],
    }),
    cancellation_lodgement_registration_evidence_not_packet_bound: criterion({
      id: 'phase8_lodgement_registration_packet_ready',
      phase: 8,
      label: 'Lodgement and cancellation registration/discharge are packet-bound to verified evidence',
      releaseBlockerId: 'cancellation_lodgement_registration_evidence_not_packet_bound',
      passed: lodgementPacket.readyForPhase9 === true &&
        asValidation(lodgementPacket.validation).valid &&
        lodgementPacket.metrics?.satisfiedCount === lodgementPacket.metrics?.requirementCount &&
        CANCELLATION_LODGEMENT_REGISTRATION_BOUNDARY.marksRegistrationFromStageOnly === false &&
        CANCELLATION_LODGEMENT_REGISTRATION_BOUNDARY.synthesizesRegistrationOutcome === false,
      proof: {
        status: lodgementPacket.status || null,
        requirementCount: lodgementPacket.metrics?.requirementCount || 0,
        satisfiedCount: lodgementPacket.metrics?.satisfiedCount || 0,
        packetFingerprint: lodgementPacket.packetFingerprint || null,
      },
      failures: [
        lodgementPacket.readyForPhase9 !== true ? 'lodgement_packet_not_ready' : null,
        !asValidation(lodgementPacket.validation).valid ? 'lodgement_packet_invalid' : null,
        lodgementPacket.metrics?.satisfiedCount !== lodgementPacket.metrics?.requirementCount ? 'lodgement_evidence_not_fully_satisfied' : null,
        CANCELLATION_LODGEMENT_REGISTRATION_BOUNDARY.marksRegistrationFromStageOnly !== false ? 'stage_only_registration_forbidden' : null,
      ],
    }),
    settlement_closeout_packet_missing: criterion({
      id: 'phase9_settlement_closeout_packet_ready',
      phase: 9,
      label: 'Settlement proof, lender confirmation and close-out evidence reconcile safely',
      releaseBlockerId: 'settlement_closeout_packet_missing',
      passed: settlementCloseoutPacket.readyForPhase10 === true &&
        asValidation(settlementCloseoutPacket.validation).valid &&
        settlementCloseoutPacket.metrics?.satisfiedCount === settlementCloseoutPacket.metrics?.requirementCount &&
        settlementCloseoutPacket.metrics?.amountMismatchCount === 0 &&
        settlementCloseoutPacket.metrics?.unresolvedExceptionCount === 0 &&
        CANCELLATION_SETTLEMENT_CLOSEOUT_BOUNDARY.executesSettlementPayment === false,
      proof: {
        status: settlementCloseoutPacket.status || null,
        requirementCount: settlementCloseoutPacket.metrics?.requirementCount || 0,
        satisfiedCount: settlementCloseoutPacket.metrics?.satisfiedCount || 0,
        amountMismatchCount: settlementCloseoutPacket.metrics?.amountMismatchCount || 0,
        packetFingerprint: settlementCloseoutPacket.packetFingerprint || null,
      },
      failures: [
        settlementCloseoutPacket.readyForPhase10 !== true ? 'settlement_closeout_packet_not_ready' : null,
        !asValidation(settlementCloseoutPacket.validation).valid ? 'settlement_closeout_packet_invalid' : null,
        settlementCloseoutPacket.metrics?.amountMismatchCount ? 'settlement_amount_mismatch' : null,
        settlementCloseoutPacket.metrics?.unresolvedExceptionCount ? 'unresolved_closeout_exceptions' : null,
      ],
    }),
    cancellation_release_certification_missing: criterion({
      id: 'phase10_release_certification_ready',
      phase: 10,
      label: 'Cancellation release certification can certify blocker closures and safety boundaries',
      releaseBlockerId: 'cancellation_release_certification_missing',
      severity: 'medium',
      passed: true,
      proof: {
        readOnlyCertification: CANCELLATION_ATTORNEY_PHASE10_CONTROL_BOUNDARY.readOnlyCertification,
        releaseGateOnly: CANCELLATION_ATTORNEY_PHASE10_CONTROL_BOUNDARY.releaseGateOnly,
      },
      failures: [],
    }),
  }

  const blockerCriteria = CANCELLATION_ATTORNEY_PHASE0_RELEASE_BLOCKERS.map((blocker) => {
    const item = byBlocker[blocker.id]
    return item || criterion({
      id: `phase${blocker.targetPhase}_${blocker.id}`,
      phase: blocker.targetPhase,
      label: blocker.exitEvidence,
      releaseBlockerId: blocker.id,
      severity: blocker.severity,
      passed: false,
      failures: ['release_blocker_not_mapped'],
    })
  })

  return Object.freeze([
    criterion({
      id: 'phase0_scope_locked',
      phase: 0,
      label: 'Phase 0 cancellation scope, role boundary, document categories and release blockers remain intact',
      severity: 'critical',
      passed: phase0Report.readyForPhase1 === true &&
        phase0Report.releaseBlockerCount === CANCELLATION_ATTORNEY_PHASE0_RELEASE_BLOCKERS.length &&
        phase0Report.automationCounts?.generate_now === 9 &&
        phase0Report.automationCounts?.template_controlled === 4 &&
        phase0Report.automationCounts?.ingest_only === 6 &&
        phase0Report.dataContractFieldCount === 24,
      proof: {
        releaseBlockerCount: phase0Report.releaseBlockerCount,
        generateNowCount: phase0Report.automationCounts?.generate_now || 0,
        templateControlledCount: phase0Report.automationCounts?.template_controlled || 0,
        ingestOnlyCount: phase0Report.automationCounts?.ingest_only || 0,
        dataContractFieldCount: phase0Report.dataContractFieldCount || 0,
      },
      failures: [
        phase0Report.readyForPhase1 !== true ? 'phase0_not_ready' : null,
        phase0Report.releaseBlockerCount !== CANCELLATION_ATTORNEY_PHASE0_RELEASE_BLOCKERS.length ? 'phase0_release_blocker_count_changed' : null,
        phase0Report.automationCounts?.generate_now !== 9 ? 'phase0_generate_now_count_changed' : null,
        phase0Report.automationCounts?.template_controlled !== 4 ? 'phase0_template_controlled_count_changed' : null,
        phase0Report.automationCounts?.ingest_only !== 6 ? 'phase0_ingest_only_count_changed' : null,
        phase0Report.dataContractFieldCount !== 24 ? 'phase0_data_contract_count_changed' : null,
      ],
    }),
    ...blockerCriteria,
  ])
}

function buildReleaseBlockerClosures(criteria) {
  const criteriaByBlocker = criteria.reduce((result, item) => {
    if (item.releaseBlockerId) result[item.releaseBlockerId] = item
    return result
  }, {})
  return Object.freeze(CANCELLATION_ATTORNEY_PHASE0_RELEASE_BLOCKERS.map((blocker) => {
    const closure = criteriaByBlocker[blocker.id]
    return Object.freeze({
      id: blocker.id,
      targetPhase: blocker.targetPhase,
      severity: blocker.severity,
      closed: closure?.passed === true,
      criterionId: closure?.id || null,
      exitEvidence: blocker.exitEvidence,
      failures: Object.freeze(closure?.failures || ['release_blocker_closure_missing']),
    })
  }))
}

function buildCapabilityChecklist({
  phase1Report,
  workspace,
  workspaceValidation,
  operationalReport,
  figuresRegister,
  guaranteeWorkspace,
  documentSigningWorkspace,
  lodgementPacket,
  settlementCloseoutPacket,
}) {
  return Object.freeze([
    capability({
      key: C.matterOpening,
      label: 'Open the cancellation matter from existing-lender instruction and bond account evidence',
      sourcePhase: 3,
      ready: workspaceValidation.valid && hasPackItem(workspace, 'lender_cancellation_instruction') && hasPackItem(workspace, 'bond_statement'),
      proof: {
        hasLenderInstructionItem: hasPackItem(workspace, 'lender_cancellation_instruction'),
        hasBondStatementItem: hasPackItem(workspace, 'bond_statement'),
        workspaceStatus: workspace.status || null,
      },
      missingReason: !workspaceValidation.valid ? 'workspace_invalid' : 'lender_instruction_or_bond_statement_item_missing',
    }),
    capability({
      key: C.usability,
      label: 'Work the role-focused cancellation cockpit with domains, stages and next actions',
      sourcePhase: 1,
      ready: phase1Report.readyForPhase2 === true && phase1Report.visibleRequirementCount >= 10,
      proof: {
        domainCount: phase1Report.domainCount || 0,
        stageCount: phase1Report.stageCount || 0,
        nextActionCount: phase1Report.nextActionCount || 0,
      },
      missingReason: 'phase1_usability_not_ready',
    }),
    capability({
      key: C.canonicalData,
      label: 'See verified cancellation facts before figures, guarantee, signing or close-out decisions',
      sourcePhase: 2,
      ready: workspace.canonicalData?.readyForCancellationPack === true &&
        workspace.counts?.missingFactCount === 0 &&
        workspace.counts?.unverifiedFactCount === 0 &&
        workspace.counts?.staleFactCount === 0 &&
        workspace.counts?.conflictFactCount === 0,
      proof: {
        missingFactCount: workspace.counts?.missingFactCount || 0,
        unverifiedFactCount: workspace.counts?.unverifiedFactCount || 0,
        staleFactCount: workspace.counts?.staleFactCount || 0,
        conflictFactCount: workspace.counts?.conflictFactCount || 0,
      },
      missingReason: 'canonical_data_has_gaps',
    }),
    capability({
      key: C.operationalDrafts,
      label: 'Draft all low-risk cancellation operational documents with review required',
      sourcePhase: 4,
      ready: operationalReport.readyForPhase5 === true &&
        CANCELLATION_OPERATIONAL_DOCUMENT_GENERATION_BOUNDARY.reviewRequired === true &&
        CANCELLATION_OPERATIONAL_DOCUMENT_GENERATION_BOUNDARY.finalAllowed === false,
      proof: {
        generatedCount: operationalReport.generatedCount || 0,
        operationalDocumentCount: operationalReport.operationalDocumentCount || 0,
        reviewRequired: CANCELLATION_OPERATIONAL_DOCUMENT_GENERATION_BOUNDARY.reviewRequired,
      },
      missingReason: 'operational_draft_pack_not_ready',
    }),
    capability({
      key: C.figures,
      label: 'Work current cancellation figures with expiry, interest and penalty controls',
      sourcePhase: 5,
      ready: figuresRegister.readyForPhase6 === true && asValidation(figuresRegister.validation).valid,
      proof: {
        figureCount: figuresRegister.metrics?.figureCount || 0,
        readyFigureCount: figuresRegister.metrics?.readyFigureCount || 0,
        nextActionCount: figuresRegister.nextActions?.length || 0,
      },
      missingReason: 'figures_register_not_ready',
    }),
    capability({
      key: C.guarantees,
      label: 'Reconcile guarantee amount, wording, beneficiary and acceptance evidence',
      sourcePhase: 6,
      ready: guaranteeWorkspace.readyForPhase7 === true && asValidation(guaranteeWorkspace.validation).valid,
      proof: {
        status: guaranteeWorkspace.status || null,
        matchedGuaranteeCount: guaranteeWorkspace.metrics?.matchedGuaranteeCount || 0,
        blockedGuaranteeCount: guaranteeWorkspace.metrics?.blockedGuaranteeCount || 0,
      },
      missingReason: 'guarantee_workspace_not_ready',
    }),
    capability({
      key: C.documentSigning,
      label: 'Prepare governed cancellation documents and seller signing evidence before lodgement',
      sourcePhase: 7,
      ready: documentSigningWorkspace.readyForPhase8 === true && asValidation(documentSigningWorkspace.validation).valid,
      proof: {
        status: documentSigningWorkspace.status || null,
        documentCount: documentSigningWorkspace.metrics?.documentCount || 0,
        readyDocumentCount: documentSigningWorkspace.metrics?.readyDocumentCount || 0,
      },
      missingReason: 'document_signing_workspace_not_ready',
    }),
    capability({
      key: C.lodgementEvidence,
      label: 'Bind simultaneous lodgement, lodgement and cancellation registration/discharge to evidence',
      sourcePhase: 8,
      ready: lodgementPacket.readyForPhase9 === true && asValidation(lodgementPacket.validation).valid,
      proof: {
        status: lodgementPacket.status || null,
        requirementCount: lodgementPacket.metrics?.requirementCount || 0,
        satisfiedCount: lodgementPacket.metrics?.satisfiedCount || 0,
      },
      missingReason: 'lodgement_registration_packet_not_ready',
    }),
    capability({
      key: C.settlementCloseout,
      label: 'Reconcile settlement proof, lender confirmation and close-out evidence without executing payment',
      sourcePhase: 9,
      ready: settlementCloseoutPacket.readyForPhase10 === true &&
        asValidation(settlementCloseoutPacket.validation).valid &&
        CANCELLATION_SETTLEMENT_CLOSEOUT_BOUNDARY.executesSettlementPayment === false,
      proof: {
        status: settlementCloseoutPacket.status || null,
        requirementCount: settlementCloseoutPacket.metrics?.requirementCount || 0,
        satisfiedCount: settlementCloseoutPacket.metrics?.satisfiedCount || 0,
      },
      missingReason: 'settlement_closeout_packet_not_ready',
    }),
  ])
}

function buildBoundaryCriteria(controls) {
  const unsafeFlags = [
    'mutatesMatter',
    'writesExternalSystem',
    'sendsNotifications',
    'submitsToBankPortal',
    'integratesWithExistingLenderPortal',
    'integratesWithDeedsOffice',
    'mutatesRegistryOutcome',
    'executesSettlementPayment',
    'autoOverwritesManualEvidence',
    'autoApprovesRelease',
    'overridesTemplateGovernance',
    'generatesLegalInstrument',
  ]
  const failures = [
    controls.readOnlyCertification !== true ? 'read_only_certification_required' : null,
    controls.releaseGateOnly !== true ? 'release_gate_only_required' : null,
    controls.keepsManualEvidencePrimary !== true ? 'manual_evidence_primary_required' : null,
    ...unsafeFlags.map((flag) => (controls[flag] === false ? null : `${flag}_forbidden`)),
    CANCELLATION_OPERATIONAL_DOCUMENT_GENERATION_BOUNDARY.settlementExecutionAllowed !== false ? 'phase4_settlement_execution_forbidden' : null,
    CANCELLATION_FIGURES_CONTROL_BOUNDARY.executesSettlementPayment !== false ? 'phase5_settlement_execution_forbidden' : null,
    CANCELLATION_GUARANTEE_CONTROL_BOUNDARY.submitsToBankPortal !== false ? 'phase6_bank_portal_submission_forbidden' : null,
    CANCELLATION_DOCUMENT_SIGNING_CONTROL_BOUNDARY.generatesLegalInstrument !== false ? 'phase7_legal_instrument_generation_forbidden' : null,
    CANCELLATION_LODGEMENT_REGISTRATION_BOUNDARY.synthesizesRegistrationOutcome !== false ? 'phase8_registration_synthesis_forbidden' : null,
    CANCELLATION_SETTLEMENT_CLOSEOUT_BOUNDARY.executesSettlementPayment !== false ? 'phase9_settlement_execution_forbidden' : null,
  ]
  return criterion({
    id: 'phase10_release_boundary_safe',
    phase: 10,
    label: 'Release certification remains read-only and preserves all cancellation safety boundaries',
    severity: 'critical',
    passed: unique(failures).length === 0,
    proof: {
      readOnlyCertification: controls.readOnlyCertification === true,
      keepsManualEvidencePrimary: controls.keepsManualEvidencePrimary === true,
      writesExternalSystem: controls.writesExternalSystem === true,
      executesSettlementPayment: controls.executesSettlementPayment === true,
      generatesLegalInstrument: controls.generatesLegalInstrument === true,
    },
    failures,
  })
}

function buildReleaseMetrics({ criteria, releaseBlockerClosures, capabilities, nextActions }) {
  return Object.freeze({
    criterionCount: criteria.length,
    passedCriterionCount: criteria.filter((item) => item.passed).length,
    failedCriterionCount: criteria.filter((item) => !item.passed).length,
    releaseBlockerCount: releaseBlockerClosures.length,
    closedReleaseBlockerCount: releaseBlockerClosures.filter((item) => item.closed).length,
    openReleaseBlockerCount: releaseBlockerClosures.filter((item) => !item.closed).length,
    capabilityCount: capabilities.length,
    readyCapabilityCount: capabilities.filter((item) => item.ready).length,
    blockedCapabilityCount: capabilities.filter((item) => !item.ready).length,
    nextActionCount: nextActions.length,
    highPriorityNextActionCount: nextActions.filter((item) => item.priority === 'high').length,
    criticalPriorityNextActionCount: nextActions.filter((item) => item.priority === 'critical').length,
  })
}

const ACTION_LABELS = Object.freeze({
  phase0_scope_locked: 'Restore the Phase 0 cancellation-attorney scope lock',
  phase1_usability_ready: 'Restore the cancellation cockpit usability baseline',
  phase2_canonical_data_ready: 'Complete the cancellation canonical data contract',
  phase3_cancellation_pack_workspace_ready: 'Complete the Cancellation Pack Workspace',
  phase4_operational_generator_ready: 'Restore operational cancellation document generation readiness',
  phase5_figures_register_ready: 'Clear cancellation figures register blockers',
  phase6_guarantee_workspace_ready: 'Clear guarantee coordination blockers',
  phase7_document_signing_workspace_ready: 'Complete document/signing workspace readiness',
  phase8_lodgement_registration_packet_ready: 'Complete lodgement and registration evidence packet',
  phase9_settlement_closeout_packet_ready: 'Complete settlement close-out packet',
  phase10_release_certification_ready: 'Restore release certification',
  phase10_release_boundary_safe: 'Restore cancellation release boundary controls',
})

function buildNextActions({ criteria, capabilities, releaseBlockerClosures }) {
  const criterionActions = criteria
    .filter((item) => !item.passed)
    .map((item) => Object.freeze({
      actionKey: `criterion:${item.id}`,
      sourcePhase: item.phase,
      releaseBlockerId: item.releaseBlockerId,
      ownerRole: 'cancellation_attorney',
      priority: item.severity === 'critical' ? 'critical' : 'high',
      actionLabel: ACTION_LABELS[item.id] || 'Resolve cancellation-attorney release criterion',
      reason: item.failures[0] || 'criterion_not_met',
    }))
  const capabilityActions = capabilities
    .filter((item) => !item.ready)
    .map((item) => Object.freeze({
      actionKey: `capability:${item.key}`,
      sourcePhase: item.sourcePhase,
      releaseBlockerId: releaseBlockerClosures.find((closure) => closure.targetPhase === item.sourcePhase && !closure.closed)?.id || null,
      ownerRole: item.ownerRole,
      priority: 'high',
      actionLabel: `Restore capability: ${item.label}`,
      reason: item.missingReason || 'capability_not_ready',
    }))
  return Object.freeze([...criterionActions, ...capabilityActions]
    .filter((item, index, all) => all.findIndex((candidate) => candidate.actionKey === item.actionKey) === index)
    .sort((left, right) => {
      const priorityRank = { critical: 0, high: 1, normal: 2 }
      const typeRank = (item) => item.actionKey.startsWith('criterion:') ? 0 : 1
      return (priorityRank[left.priority] ?? 9) - (priorityRank[right.priority] ?? 9) ||
        typeRank(left) - typeRank(right) ||
        Number(left.sourcePhase || 99) - Number(right.sourcePhase || 99) ||
        text(left.actionKey).localeCompare(text(right.actionKey))
    }))
}

export function validateCancellationAttorneyReleaseCertification(certification = {}) {
  const errors = []
  const warnings = []
  if (certification.version !== CANCELLATION_ATTORNEY_PHASE10_VERSION) errors.push('release_certification_version_invalid')
  if (certification.releaseGateId !== CANCELLATION_ATTORNEY_PHASE10_RELEASE_GATE_ID) errors.push('release_gate_id_invalid')
  if (!Object.values(S).includes(certification.status)) errors.push('release_certification_status_invalid')
  if (certification.controls?.readOnlyCertification !== true) errors.push('read_only_certification_required')
  if (certification.controls?.releaseGateOnly !== true) errors.push('release_gate_only_required')
  if (certification.controls?.keepsManualEvidencePrimary !== true) errors.push('manual_evidence_primary_required')
  ;[
    'mutatesMatter',
    'writesExternalSystem',
    'sendsNotifications',
    'submitsToBankPortal',
    'integratesWithExistingLenderPortal',
    'integratesWithDeedsOffice',
    'mutatesRegistryOutcome',
    'executesSettlementPayment',
    'autoOverwritesManualEvidence',
    'autoApprovesRelease',
    'overridesTemplateGovernance',
    'generatesLegalInstrument',
  ].forEach((flag) => {
    if (certification.controls?.[flag] !== false) errors.push(`${flag}_forbidden`)
  })
  if (!Array.isArray(certification.criteria) || !certification.criteria.length) errors.push('release_criteria_required')
  ;(certification.criteria || []).filter((item) => item.passed !== true).forEach((item) => {
    errors.push(`${item.id}_not_met`)
  })
  if (!Array.isArray(certification.releaseBlockerClosures) || certification.releaseBlockerClosures.length !== CANCELLATION_ATTORNEY_PHASE0_RELEASE_BLOCKERS.length) {
    errors.push('release_blocker_closures_incomplete')
  }
  ;(certification.releaseBlockerClosures || []).filter((item) => item.closed !== true).forEach((item) => {
    errors.push(`${item.id}_not_closed`)
  })
  if (!Array.isArray(certification.capabilities) || !certification.capabilities.length) errors.push('conveyancer_capabilities_required')
  ;(certification.capabilities || []).filter((item) => item.ready !== true).forEach((item) => {
    errors.push(`capability_not_ready:${item.key}`)
  })
  ;(certification.nextActions || []).filter((item) => item.priority === 'normal').forEach((item) => {
    warnings.push(`normal_priority_release_action:${item.actionKey}`)
  })
  return Object.freeze({
    valid: errors.length === 0,
    errors: Object.freeze(unique(errors)),
    warnings: Object.freeze(unique(warnings)),
  })
}

function buildReleaseSummary({ readyForPilotRelease, metrics }) {
  if (readyForPilotRelease) {
    return 'Cancellation-attorney pilot release is ready: all Phase 0 blockers are closed, conveyancer capabilities are available, and release boundaries remain safe.'
  }
  return `Cancellation-attorney pilot release is blocked: ${metrics.openReleaseBlockerCount} release blocker(s), ${metrics.blockedCapabilityCount} capability gap(s), and ${metrics.failedCriterionCount} failed criterion/criteria remain.`
}

function buildCertificationFingerprint({ criteria, releaseBlockerClosures, capabilities, artifactFingerprints, controls }) {
  return hash({
    criteria: criteria.map((item) => ({ id: item.id, passed: item.passed, failures: item.failures })),
    releaseBlockerClosures: releaseBlockerClosures.map((item) => ({ id: item.id, closed: item.closed })),
    capabilities: capabilities.map((item) => ({ key: item.key, ready: item.ready, missingReason: item.missingReason })),
    artifactFingerprints,
    controls,
  })
}

function buildAuditEvent({ workspace, certification, actor, commandId, occurredAt }) {
  const auditWorkspace = {
    workspaceId: certification.workspaceId,
    transactionId: certification.transactionId,
    laneKey: 'cancellation',
    status: certification.status,
    dataFingerprint: workspace.dataFingerprint || null,
  }
  const base = buildCancellationPackWorkspaceAuditEvent({
    workspace: auditWorkspace,
    eventType: 'cancellation_attorney_release_certification_completed',
    actor,
    commandId,
    occurredAt,
  })
  return Object.freeze({
    ...base,
    version: CANCELLATION_ATTORNEY_PHASE10_VERSION,
    workspaceEventVersion: base.version,
    releaseGateId: CANCELLATION_ATTORNEY_PHASE10_RELEASE_GATE_ID,
    status: certification.status,
    readyForPilotRelease: certification.readyForPilotRelease,
    certificationFingerprint: certification.certificationFingerprint,
    metrics: certification.metrics,
    criteria: certification.criteria.map((item) => Object.freeze({
      id: item.id,
      phase: item.phase,
      releaseBlockerId: item.releaseBlockerId,
      passed: item.passed,
      failureCount: item.failures.length,
    })),
    releaseBlockerClosures: certification.releaseBlockerClosures.map((item) => Object.freeze({
      id: item.id,
      targetPhase: item.targetPhase,
      closed: item.closed,
    })),
    capabilityKeys: certification.capabilities.map((item) => Object.freeze({
      key: item.key,
      sourcePhase: item.sourcePhase,
      ready: item.ready,
    })),
    artifactFingerprints: certification.artifactFingerprints,
  })
}

export function buildCancellationAttorneyReleaseCertification({
  workspace = null,
  transaction = {},
  lane = {},
  evidence = {},
  phase1Report = null,
  phase2Report = null,
  operationalReport = null,
  figuresRegister = null,
  guaranteeWorkspace = null,
  documentSigningWorkspace = null,
  lodgementPacket = null,
  settlementCloseoutPacket = null,
  figures = null,
  settlementDate = '',
  guarantees = null,
  templates = {},
  documents = null,
  packetEvidence = [],
  settlementEvidence = [],
  actor = {},
  commandId = 'cancellation-attorney-release-certification',
  generatedAt = new Date().toISOString(),
  asOf = generatedAt,
  firmBranding = {},
  controlOverrides = {},
} = {}) {
  const phase0Report = buildCancellationAttorneyPhase0BaselineReport()
  const effectiveWorkspace = workspace || buildCancellationPackWorkspace({ transaction, lane, evidence, generatedAt })
  const workspaceValidation = validateCancellationPackWorkspace(effectiveWorkspace)
  const effectivePhase1Report = phase1Report || buildCancellationAttorneyPhase1BaselineReport(lane)
  const effectivePhase2Report = phase2Report ||
    phase2ReportFromWorkspace(effectiveWorkspace) ||
    buildCancellationAttorneyPhase2BaselineReport({ transaction, lane, evidence, resolvedAt: generatedAt })
  const effectiveOperationalReport = operationalReport || buildCancellationAttorneyPhase4BaselineReport({
    workspace: effectiveWorkspace,
    actor,
    generatedAt,
    firmBranding,
  })
  const effectiveFiguresRegister = figuresRegister || buildCancellationFiguresRegister({
    workspace: effectiveWorkspace,
    figures,
    settlementDate,
    actor,
    commandId: `${commandId}-phase5-figures-register`,
    generatedAt,
    asOf,
  })
  const figuresValidation = validateCancellationFiguresRegister(effectiveFiguresRegister)
  const effectiveGuaranteeWorkspace = guaranteeWorkspace || buildCancellationGuaranteeWorkspace({
    workspace: effectiveWorkspace,
    figuresRegister: effectiveFiguresRegister,
    guarantees,
    actor,
    commandId: `${commandId}-phase6-guarantee-workspace`,
    generatedAt,
    asOf,
  })
  const guaranteeValidation = validateCancellationGuaranteeWorkspace(effectiveGuaranteeWorkspace)
  const effectiveDocumentSigningWorkspace = documentSigningWorkspace || buildCancellationDocumentSigningWorkspace({
    workspace: effectiveWorkspace,
    guaranteeWorkspace: effectiveGuaranteeWorkspace,
    figuresRegister: effectiveFiguresRegister,
    guarantees,
    templates,
    documents,
    actor,
    commandId: `${commandId}-phase7-document-signing-workspace`,
    generatedAt,
    asOf,
  })
  const documentSigningValidation = validateCancellationDocumentSigningWorkspace(effectiveDocumentSigningWorkspace)
  const effectiveLodgementPacket = lodgementPacket || buildCancellationLodgementEvidencePacket({
    workspace: effectiveWorkspace,
    documentSigningWorkspace: effectiveDocumentSigningWorkspace,
    figuresRegister: effectiveFiguresRegister,
    guaranteeWorkspace: effectiveGuaranteeWorkspace,
    guarantees,
    templates,
    documents,
    packetEvidence,
    actor,
    commandId: `${commandId}-phase8-lodgement-registration-packet`,
    generatedAt,
    asOf,
  })
  const lodgementValidation = validateCancellationLodgementEvidencePacket(effectiveLodgementPacket)
  const effectiveSettlementCloseoutPacket = settlementCloseoutPacket || buildCancellationSettlementCloseoutPacket({
    workspace: effectiveWorkspace,
    figuresRegister: effectiveFiguresRegister,
    lodgementPacket: effectiveLodgementPacket,
    settlementEvidence,
    actor,
    commandId: `${commandId}-phase9-settlement-closeout-packet`,
    generatedAt,
    asOf,
  })
  const settlementCloseoutValidation = validateCancellationSettlementCloseoutPacket(effectiveSettlementCloseoutPacket)
  const controls = Object.freeze({ ...CANCELLATION_ATTORNEY_PHASE10_CONTROL_BOUNDARY, ...controlOverrides })
  const releaseCriteria = buildReleaseBlockerCriteria({
    phase0Report,
    phase1Report: effectivePhase1Report,
    phase2Report: effectivePhase2Report,
    workspace: effectiveWorkspace,
    workspaceValidation,
    operationalReport: effectiveOperationalReport,
    figuresRegister: { ...effectiveFiguresRegister, validation: figuresValidation },
    guaranteeWorkspace: { ...effectiveGuaranteeWorkspace, validation: guaranteeValidation },
    documentSigningWorkspace: { ...effectiveDocumentSigningWorkspace, validation: documentSigningValidation },
    lodgementPacket: { ...effectiveLodgementPacket, validation: lodgementValidation },
    settlementCloseoutPacket: { ...effectiveSettlementCloseoutPacket, validation: settlementCloseoutValidation },
  })
  const boundaryCriterion = buildBoundaryCriteria(controls)
  const criteria = Object.freeze([...releaseCriteria, boundaryCriterion])
  const releaseBlockerClosures = buildReleaseBlockerClosures(criteria)
  const capabilities = buildCapabilityChecklist({
    phase1Report: effectivePhase1Report,
    workspace: effectiveWorkspace,
    workspaceValidation,
    operationalReport: effectiveOperationalReport,
    figuresRegister: { ...effectiveFiguresRegister, validation: figuresValidation },
    guaranteeWorkspace: { ...effectiveGuaranteeWorkspace, validation: guaranteeValidation },
    documentSigningWorkspace: { ...effectiveDocumentSigningWorkspace, validation: documentSigningValidation },
    lodgementPacket: { ...effectiveLodgementPacket, validation: lodgementValidation },
    settlementCloseoutPacket: { ...effectiveSettlementCloseoutPacket, validation: settlementCloseoutValidation },
  })
  const nextActions = buildNextActions({ criteria, capabilities, releaseBlockerClosures })
  const artifactFingerprints = buildArtifactFingerprints({
    workspace: effectiveWorkspace,
    figuresRegister: effectiveFiguresRegister,
    guaranteeWorkspace: effectiveGuaranteeWorkspace,
    documentSigningWorkspace: effectiveDocumentSigningWorkspace,
    lodgementPacket: effectiveLodgementPacket,
    settlementCloseoutPacket: effectiveSettlementCloseoutPacket,
  })
  const shell = Object.freeze({
    version: CANCELLATION_ATTORNEY_PHASE10_VERSION,
    releaseGateId: CANCELLATION_ATTORNEY_PHASE10_RELEASE_GATE_ID,
    workspaceId: effectiveWorkspace.workspaceId,
    transactionId: effectiveWorkspace.transactionId,
    laneKey: 'cancellation',
    generatedAt: validDate(generatedAt) ? new Date(generatedAt).toISOString() : generatedAt,
    asOf: validDate(asOf) ? new Date(asOf).toISOString() : asOf,
    status: S.blocked,
    phase0Report: Object.freeze({
      readyForPhase1: phase0Report.readyForPhase1,
      releaseBlockerCount: phase0Report.releaseBlockerCount,
      automationCounts: phase0Report.automationCounts,
      dataContractFieldCount: phase0Report.dataContractFieldCount,
    }),
    workspaceValidation,
    figuresValidation,
    guaranteeValidation,
    documentSigningValidation,
    lodgementValidation,
    settlementCloseoutValidation,
    criteria,
    releaseBlockerClosures,
    capabilities,
    nextActions,
    artifactFingerprints,
    controls,
    readyForPilotRelease: false,
  })
  const initialValidation = validateCancellationAttorneyReleaseCertification(shell)
  const readyForPilotRelease = initialValidation.valid &&
    criteria.every((item) => item.passed) &&
    releaseBlockerClosures.every((item) => item.closed) &&
    capabilities.every((item) => item.ready) &&
    effectiveSettlementCloseoutPacket.readyForPhase10 === true
  const status = readyForPilotRelease ? S.ready : S.blocked
  const metrics = buildReleaseMetrics({ criteria, releaseBlockerClosures, capabilities, nextActions })
  const certificationFingerprint = buildCertificationFingerprint({
    criteria,
    releaseBlockerClosures,
    capabilities,
    artifactFingerprints,
    controls,
  })
  const certification = Object.freeze({
    ...shell,
    status,
    readyForPilotRelease,
    metrics,
    certificationFingerprint,
    releaseSummary: buildReleaseSummary({ readyForPilotRelease, metrics }),
    validation: initialValidation,
  })
  return Object.freeze({
    ...certification,
    auditEvent: buildAuditEvent({
      workspace: effectiveWorkspace,
      certification,
      actor,
      commandId,
      occurredAt: generatedAt,
    }),
  })
}

export function buildCancellationAttorneyPhase10BaselineReport(input = {}) {
  const certification = buildCancellationAttorneyReleaseCertification(input)
  return Object.freeze({
    version: CANCELLATION_ATTORNEY_PHASE10_VERSION,
    releaseGateId: CANCELLATION_ATTORNEY_PHASE10_RELEASE_GATE_ID,
    status: certification.status,
    readyForPilotRelease: certification.readyForPilotRelease,
    releaseSummary: certification.releaseSummary,
    closedReleaseBlockerCount: certification.metrics.closedReleaseBlockerCount,
    openReleaseBlockerCount: certification.metrics.openReleaseBlockerCount,
    readyCapabilityCount: certification.metrics.readyCapabilityCount,
    blockedCapabilityCount: certification.metrics.blockedCapabilityCount,
    failedCriterionCount: certification.metrics.failedCriterionCount,
    nextActionCount: certification.metrics.nextActionCount,
    controls: certification.controls,
    validation: certification.validation,
  })
}
