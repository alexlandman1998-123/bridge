import {
  BOND_ATTORNEY_PHASE0_RELEASE_BLOCKERS,
  buildBondAttorneyPhase0BaselineReport,
} from './bondAttorneyModulePhase0.js'
import {
  buildBondPackWorkspace,
  buildBondPackWorkspaceAuditEvent,
  validateBondPackWorkspace,
} from './bondAttorneyModulePhase3.js'
import {
  BOND_OPERATIONAL_DOCUMENT_GENERATION_BOUNDARY,
  buildBondAttorneyPhase4BaselineReport,
} from './bondAttorneyModulePhase4.js'
import {
  BOND_BANK_CONDITION_CONTROL_BOUNDARY,
  buildBondConditionRegister,
  validateBondConditionRegister,
} from './bondAttorneyModulePhase5.js'
import {
  BOND_SIGNING_WORKSPACE_CONTROL_BOUNDARY,
  buildBondSigningWorkspace,
  validateBondSigningWorkspace,
} from './bondAttorneyModulePhase6.js'
import {
  BOND_LEGAL_TEMPLATE_GOVERNANCE_BOUNDARY,
  buildBondLegalTemplateGate,
} from './bondAttorneyModulePhase7.js'
import {
  BOND_LODGEMENT_REGISTRATION_BOUNDARY,
  buildBondLodgementEvidencePacket,
  validateBondLodgementEvidencePacket,
} from './bondAttorneyModulePhase8.js'
import {
  BOND_INBOUND_SIGNAL_RECONCILIATION_BOUNDARY,
  buildBondInboundSignalRegister,
  validateBondInboundSignalRegister,
} from './bondAttorneyModulePhase9.js'

export const BOND_ATTORNEY_PHASE10_VERSION = 'bond_attorney_module_phase10_release_certification_v1'
export const BOND_ATTORNEY_PHASE10_RELEASE_GATE_ID = 'bond_attorney_pilot_release_certification'

export const BOND_ATTORNEY_PHASE10_STATUSES = Object.freeze({
  ready: 'ready',
  blocked: 'blocked',
})

export const BOND_ATTORNEY_PHASE10_CONTROL_BOUNDARY = Object.freeze({
  readOnlyCertification: true,
  releaseGateOnly: true,
  requiresPhase0Scope: true,
  requiresAllReleaseBlockersClosed: true,
  requiresConveyancerOperatingCapabilities: true,
  requiresPhase9ReleaseReadiness: true,
  keepsManualEvidencePrimary: true,
  mayProduceNextActions: true,
  mutatesMatter: false,
  writesExternalSystem: false,
  sendsNotifications: false,
  submitsToBankPortal: false,
  mutatesRegistryOutcome: false,
  autoOverwritesManualEvidence: false,
  autoApprovesRelease: false,
  overridesTemplateGovernance: false,
  generatesLegalInstrument: false,
})

export const BOND_ATTORNEY_PHASE10_CAPABILITY_KEYS = Object.freeze({
  matterOpening: 'matter_opening_and_bank_instruction_intake',
  canonicalData: 'canonical_bond_data_ready',
  operationalDrafts: 'operational_document_drafts_ready',
  bankConditions: 'bank_condition_worklist_ready',
  signing: 'signing_and_bank_submission_readiness',
  legalTemplates: 'legal_template_governance_ready',
  lodgementEvidence: 'lodgement_registration_evidence_ready',
  inboundReconciliation: 'inbound_bank_and_registry_reconciliation_ready',
  closeout: 'registration_and_bank_closeout_ready',
})

const S = BOND_ATTORNEY_PHASE10_STATUSES
const C = BOND_ATTORNEY_PHASE10_CAPABILITY_KEYS

function text(value = '') {
  return String(value ?? '').trim()
}

function key(value = '') {
  return text(value).toLowerCase().replace(/[\s./-]+/g, '_').replace(/[^a-z0-9_:]+/g, '').replace(/^_+|_+$/g, '')
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
  key: capabilityKey,
  label,
  sourcePhase,
  ownerRole = 'bond_attorney',
  ready = false,
  proof = {},
  missingReason = '',
} = {}) {
  return Object.freeze({
    key: capabilityKey,
    label,
    sourcePhase,
    ownerRole,
    ready: ready === true,
    proof: Object.freeze(proof),
    missingReason: text(missingReason) || null,
  })
}

function buildArtifactFingerprints({ workspace, conditionRegister, signingWorkspace, legalTemplateGate, lodgementPacket, inboundSignalRegister }) {
  return Object.freeze({
    dataFingerprint: workspace.dataFingerprint || null,
    conditionFingerprint: conditionRegister.conditionFingerprint || null,
    signingFingerprint: signingWorkspace.signingFingerprint || null,
    templateSigningFingerprint: legalTemplateGate.signingFingerprint || null,
    lodgementPacketFingerprint: lodgementPacket.packetFingerprint || null,
    inboundReconciliationFingerprint: inboundSignalRegister.reconciliationFingerprint || null,
  })
}

function buildReleaseBlockerCriteria({
  phase0Report,
  workspace,
  workspaceValidation,
  operationalReport,
  conditionRegister,
  signingWorkspace,
  legalTemplateGate,
  lodgementPacket,
  inboundSignalRegister,
}) {
  const phase4Ready = operationalReport.readyForPhase5 === true &&
    operationalReport.operationalDocumentCount === 8 &&
    operationalReport.generatedCount === 8 &&
    operationalReport.failedCount === 0 &&
    BOND_OPERATIONAL_DOCUMENT_GENERATION_BOUNDARY.finalAllowed === false

  const byBlocker = {
    bond_pack_workspace_missing: criterion({
      id: 'phase3_bond_pack_workspace_ready',
      phase: 3,
      label: 'Bond Pack Workspace is available and bound to verified canonical facts',
      releaseBlockerId: 'bond_pack_workspace_missing',
      severity: 'critical',
      passed: workspaceValidation.valid &&
        workspace.canonicalData?.readyForDrafting === true &&
        workspace.counts?.itemCount >= 16 &&
        countReadyPackItems(workspace, 'generate_now') === 8,
      proof: {
        workspaceStatus: workspace.status || null,
        itemCount: workspace.counts?.itemCount || 0,
        generateNowReadyCount: countReadyPackItems(workspace, 'generate_now'),
        dataFingerprint: workspace.dataFingerprint || null,
      },
      failures: [
        !workspaceValidation.valid ? 'workspace_validation_failed' : null,
        workspace.canonicalData?.readyForDrafting !== true ? 'canonical_data_not_ready' : null,
        workspace.counts?.itemCount < 16 ? 'bond_pack_items_incomplete' : null,
        countReadyPackItems(workspace, 'generate_now') !== 8 ? 'operational_pack_items_not_ready' : null,
      ],
    }),
    bond_operational_generator_missing: criterion({
      id: 'phase4_operational_generator_ready',
      phase: 4,
      label: 'Operational document generator can draft the approved bond pack',
      releaseBlockerId: 'bond_operational_generator_missing',
      passed: phase4Ready,
      proof: {
        operationalDocumentCount: operationalReport.operationalDocumentCount || 0,
        generatedCount: operationalReport.generatedCount || 0,
        failedCount: operationalReport.failedCount || 0,
        finalAllowed: BOND_OPERATIONAL_DOCUMENT_GENERATION_BOUNDARY.finalAllowed,
        signingAllowed: BOND_OPERATIONAL_DOCUMENT_GENERATION_BOUNDARY.signingAllowed,
      },
      failures: [
        operationalReport.readyForPhase5 !== true ? 'phase4_not_ready' : null,
        operationalReport.generatedCount !== 8 ? 'operational_documents_not_all_generated' : null,
        operationalReport.failedCount ? 'operational_generation_failures' : null,
        BOND_OPERATIONAL_DOCUMENT_GENERATION_BOUNDARY.finalAllowed !== false ? 'operational_finalisation_forbidden' : null,
      ],
    }),
    bank_conditions_not_structured: criterion({
      id: 'phase5_bank_conditions_ready',
      phase: 5,
      label: 'Bank conditions are structured, owned, due-dated and evidence-backed',
      releaseBlockerId: 'bank_conditions_not_structured',
      passed: conditionRegister.readyForPhase6 === true &&
        asValidation(conditionRegister.validation).valid &&
        conditionRegister.metrics?.blockingOpenCount === 0 &&
        conditionRegister.metrics?.evidenceGapCount === 0,
      proof: {
        conditionCount: conditionRegister.metrics?.conditionCount || 0,
        blockingOpenCount: conditionRegister.metrics?.blockingOpenCount || 0,
        evidenceGapCount: conditionRegister.metrics?.evidenceGapCount || 0,
        conditionFingerprint: conditionRegister.conditionFingerprint || null,
      },
      failures: [
        conditionRegister.readyForPhase6 !== true ? 'condition_register_not_ready' : null,
        !asValidation(conditionRegister.validation).valid ? 'condition_register_invalid' : null,
        conditionRegister.metrics?.blockingOpenCount ? 'open_bank_blocking_conditions' : null,
        conditionRegister.metrics?.evidenceGapCount ? 'bank_condition_evidence_gaps' : null,
      ],
    }),
    signing_workspace_missing: criterion({
      id: 'phase6_signing_workspace_ready',
      phase: 6,
      label: 'Signing workspace tracks capacity, originals and signed-pack evidence',
      releaseBlockerId: 'signing_workspace_missing',
      passed: signingWorkspace.readyForPhase7 === true &&
        signingWorkspace.readyForBankSubmission === true &&
        asValidation(signingWorkspace.validation).valid,
      proof: {
        status: signingWorkspace.status || null,
        signerCount: signingWorkspace.metrics?.signerCount || 0,
        signedRequiredCount: signingWorkspace.metrics?.signedRequiredCount || 0,
        requiredSignerCount: signingWorkspace.metrics?.requiredSignerCount || 0,
        missingOriginalCount: signingWorkspace.metrics?.missingOriginalCount || 0,
        signingFingerprint: signingWorkspace.signingFingerprint || null,
      },
      failures: [
        signingWorkspace.readyForPhase7 !== true ? 'signing_workspace_not_phase7_ready' : null,
        signingWorkspace.readyForBankSubmission !== true ? 'signing_workspace_not_bank_submission_ready' : null,
        !asValidation(signingWorkspace.validation).valid ? 'signing_workspace_invalid' : null,
      ],
    }),
    legal_instrument_templates_not_approved: criterion({
      id: 'phase7_legal_template_governance_ready',
      phase: 7,
      label: 'Legal instruments are governed by exact approved templates',
      releaseBlockerId: 'legal_instrument_templates_not_approved',
      severity: 'critical',
      passed: legalTemplateGate.readyForPhase8 === true &&
        legalTemplateGate.readyTemplateCount === legalTemplateGate.templateControlledCount &&
        legalTemplateGate.legalInstrumentsGenerated === false &&
        BOND_LEGAL_TEMPLATE_GOVERNANCE_BOUNDARY.allowsGenericFallback === false,
      proof: {
        status: legalTemplateGate.status || null,
        templateControlledCount: legalTemplateGate.templateControlledCount || 0,
        readyTemplateCount: legalTemplateGate.readyTemplateCount || 0,
        legalInstrumentsGenerated: legalTemplateGate.legalInstrumentsGenerated === true,
        allowsGenericFallback: BOND_LEGAL_TEMPLATE_GOVERNANCE_BOUNDARY.allowsGenericFallback,
      },
      failures: [
        legalTemplateGate.readyForPhase8 !== true ? 'legal_template_gate_not_ready' : null,
        legalTemplateGate.readyTemplateCount !== legalTemplateGate.templateControlledCount ? 'controlled_templates_not_all_ready' : null,
        legalTemplateGate.legalInstrumentsGenerated === true ? 'legal_instrument_generation_forbidden' : null,
        BOND_LEGAL_TEMPLATE_GOVERNANCE_BOUNDARY.allowsGenericFallback !== false ? 'generic_template_fallback_forbidden' : null,
      ],
    }),
    lodgement_registration_evidence_not_packet_bound: criterion({
      id: 'phase8_lodgement_registration_packet_ready',
      phase: 8,
      label: 'Lodgement and registration are packet-bound to verified evidence',
      releaseBlockerId: 'lodgement_registration_evidence_not_packet_bound',
      passed: lodgementPacket.readyForPhase9 === true &&
        asValidation(lodgementPacket.validation).valid &&
        lodgementPacket.metrics?.satisfiedCount === lodgementPacket.metrics?.requirementCount &&
        BOND_LODGEMENT_REGISTRATION_BOUNDARY.synthesizesBankApproval === false &&
        BOND_LODGEMENT_REGISTRATION_BOUNDARY.synthesizesDeedsOutcome === false,
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
        BOND_LODGEMENT_REGISTRATION_BOUNDARY.synthesizesBankApproval !== false ? 'bank_approval_synthesis_forbidden' : null,
        BOND_LODGEMENT_REGISTRATION_BOUNDARY.synthesizesDeedsOutcome !== false ? 'deeds_outcome_synthesis_forbidden' : null,
      ],
    }),
    bank_and_deeds_integrations_absent: criterion({
      id: 'phase9_inbound_reconciliation_ready',
      phase: 9,
      label: 'Optional bank and registry signals reconcile safely against manual evidence',
      releaseBlockerId: 'bank_and_deeds_integrations_absent',
      severity: 'medium',
      passed: inboundSignalRegister.readyForRelease === true &&
        asValidation(inboundSignalRegister.validation).valid &&
        inboundSignalRegister.metrics?.blockingCount === 0 &&
        BOND_INBOUND_SIGNAL_RECONCILIATION_BOUNDARY.manualEvidenceRemainsPrimary === true &&
        BOND_INBOUND_SIGNAL_RECONCILIATION_BOUNDARY.writesExternalSystem === false,
      proof: {
        signalCount: inboundSignalRegister.metrics?.signalCount || 0,
        matchedCount: inboundSignalRegister.metrics?.matchedCount || 0,
        blockingCount: inboundSignalRegister.metrics?.blockingCount || 0,
        reconciliationFingerprint: inboundSignalRegister.reconciliationFingerprint || null,
      },
      failures: [
        inboundSignalRegister.readyForRelease !== true ? 'inbound_reconciliation_not_release_ready' : null,
        !asValidation(inboundSignalRegister.validation).valid ? 'inbound_reconciliation_invalid' : null,
        inboundSignalRegister.metrics?.blockingCount ? 'blocking_inbound_signal_results' : null,
        BOND_INBOUND_SIGNAL_RECONCILIATION_BOUNDARY.manualEvidenceRemainsPrimary !== true ? 'manual_evidence_primary_control_missing' : null,
        BOND_INBOUND_SIGNAL_RECONCILIATION_BOUNDARY.writesExternalSystem !== false ? 'inbound_external_writes_forbidden' : null,
      ],
    }),
  }

  const criteria = BOND_ATTORNEY_PHASE0_RELEASE_BLOCKERS.map((blocker) => {
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
      label: 'Phase 0 scope, role boundary, document categories and release blockers remain intact',
      severity: 'critical',
      passed: phase0Report.readyForPhase1 === true &&
        phase0Report.releaseBlockerCount === BOND_ATTORNEY_PHASE0_RELEASE_BLOCKERS.length &&
        phase0Report.automationCounts?.generate_now === 8 &&
        phase0Report.automationCounts?.template_controlled === 4 &&
        phase0Report.automationCounts?.ingest_only === 4,
      proof: {
        releaseBlockerCount: phase0Report.releaseBlockerCount,
        generateNowCount: phase0Report.automationCounts?.generate_now || 0,
        templateControlledCount: phase0Report.automationCounts?.template_controlled || 0,
        ingestOnlyCount: phase0Report.automationCounts?.ingest_only || 0,
      },
      failures: [
        phase0Report.readyForPhase1 !== true ? 'phase0_not_ready' : null,
        phase0Report.releaseBlockerCount !== BOND_ATTORNEY_PHASE0_RELEASE_BLOCKERS.length ? 'phase0_release_blocker_count_changed' : null,
        phase0Report.automationCounts?.generate_now !== 8 ? 'phase0_generate_now_count_changed' : null,
        phase0Report.automationCounts?.template_controlled !== 4 ? 'phase0_template_controlled_count_changed' : null,
        phase0Report.automationCounts?.ingest_only !== 4 ? 'phase0_ingest_only_count_changed' : null,
      ],
    }),
    ...criteria,
  ])
}

function buildReleaseBlockerClosures(criteria) {
  const criteriaByBlocker = criteria.reduce((result, item) => {
    if (item.releaseBlockerId) result[item.releaseBlockerId] = item
    return result
  }, {})
  return Object.freeze(BOND_ATTORNEY_PHASE0_RELEASE_BLOCKERS.map((blocker) => {
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
  workspace,
  workspaceValidation,
  operationalReport,
  conditionRegister,
  signingWorkspace,
  legalTemplateGate,
  lodgementPacket,
  inboundSignalRegister,
}) {
  return Object.freeze([
    capability({
      key: C.matterOpening,
      label: 'Open the bond matter from the bank instruction and track source evidence',
      sourcePhase: 3,
      ready: workspaceValidation.valid && hasPackItem(workspace, 'bond_instruction') && hasPackItem(workspace, 'bond_grant_letter'),
      proof: {
        hasBondInstructionItem: hasPackItem(workspace, 'bond_instruction'),
        hasBondGrantLetterItem: hasPackItem(workspace, 'bond_grant_letter'),
        workspaceStatus: workspace.status || null,
      },
      missingReason: !workspaceValidation.valid ? 'workspace_invalid' : 'bank_instruction_or_grant_letter_item_missing',
    }),
    capability({
      key: C.canonicalData,
      label: 'See verified bond facts before drafting or readiness decisions',
      sourcePhase: 2,
      ready: workspace.canonicalData?.readyForDrafting === true &&
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
      label: 'Draft all low-risk operational documents with review required',
      sourcePhase: 4,
      ready: operationalReport.readyForPhase5 === true &&
        BOND_OPERATIONAL_DOCUMENT_GENERATION_BOUNDARY.reviewRequired === true &&
        BOND_OPERATIONAL_DOCUMENT_GENERATION_BOUNDARY.finalAllowed === false,
      proof: {
        generatedCount: operationalReport.generatedCount || 0,
        operationalDocumentCount: operationalReport.operationalDocumentCount || 0,
        reviewRequired: BOND_OPERATIONAL_DOCUMENT_GENERATION_BOUNDARY.reviewRequired,
      },
      missingReason: 'operational_draft_pack_not_ready',
    }),
    capability({
      key: C.bankConditions,
      label: 'Work bank conditions as typed, owned and due-dated tasks',
      sourcePhase: 5,
      ready: conditionRegister.readyForPhase6 === true && asValidation(conditionRegister.validation).valid,
      proof: {
        conditionCount: conditionRegister.metrics?.conditionCount || 0,
        nextActionCount: conditionRegister.nextActions?.length || 0,
      },
      missingReason: 'bank_condition_register_not_ready',
    }),
    capability({
      key: C.signing,
      label: 'Prepare signing, capacity, originals and bank-submission readiness',
      sourcePhase: 6,
      ready: signingWorkspace.readyForPhase7 === true && signingWorkspace.readyForBankSubmission === true,
      proof: {
        status: signingWorkspace.status || null,
        requiredSignerCount: signingWorkspace.metrics?.requiredSignerCount || 0,
        signedRequiredCount: signingWorkspace.metrics?.signedRequiredCount || 0,
      },
      missingReason: 'signing_workspace_not_ready_for_bank_submission',
    }),
    capability({
      key: C.legalTemplates,
      label: 'Use governed legal-instrument templates without generic fallback',
      sourcePhase: 7,
      ready: legalTemplateGate.readyForPhase8 === true &&
        legalTemplateGate.readyTemplateCount === legalTemplateGate.templateControlledCount &&
        legalTemplateGate.legalInstrumentsGenerated === false,
      proof: {
        templateControlledCount: legalTemplateGate.templateControlledCount || 0,
        readyTemplateCount: legalTemplateGate.readyTemplateCount || 0,
        legalInstrumentsGenerated: legalTemplateGate.legalInstrumentsGenerated === true,
      },
      missingReason: 'legal_template_gate_not_ready',
    }),
    capability({
      key: C.lodgementEvidence,
      label: 'Bind approval-to-lodge, guarantees, lodgement and registration to evidence',
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
      key: C.inboundReconciliation,
      label: 'Reconcile optional bank and registry signals without overwriting manual evidence',
      sourcePhase: 9,
      ready: inboundSignalRegister.readyForRelease === true &&
        asValidation(inboundSignalRegister.validation).valid &&
        BOND_INBOUND_SIGNAL_RECONCILIATION_BOUNDARY.manualEvidenceRemainsPrimary === true,
      proof: {
        signalCount: inboundSignalRegister.metrics?.signalCount || 0,
        blockingCount: inboundSignalRegister.metrics?.blockingCount || 0,
        manualEvidenceRemainsPrimary: BOND_INBOUND_SIGNAL_RECONCILIATION_BOUNDARY.manualEvidenceRemainsPrimary,
      },
      missingReason: 'inbound_signal_reconciliation_not_ready',
    }),
    capability({
      key: C.closeout,
      label: 'Prepare registration notification and bank close-out without synthesizing external outcomes',
      sourcePhase: 4,
      ready: operationalReport.readyForPhase5 === true &&
        hasPackItem(workspace, 'registration_notification') &&
        hasPackItem(workspace, 'bank_closeout_report') &&
        lodgementPacket.status === 'registered' &&
        BOND_LODGEMENT_REGISTRATION_BOUNDARY.synthesizesDeedsOutcome === false,
      proof: {
        hasRegistrationNotification: hasPackItem(workspace, 'registration_notification'),
        hasBankCloseoutReport: hasPackItem(workspace, 'bank_closeout_report'),
        packetStatus: lodgementPacket.status || null,
      },
      missingReason: 'registration_or_bank_closeout_not_ready',
    }),
  ])
}

function buildBoundaryCriteria(controls) {
  const unsafeFlags = [
    'mutatesMatter',
    'writesExternalSystem',
    'sendsNotifications',
    'submitsToBankPortal',
    'mutatesRegistryOutcome',
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
    BOND_BANK_CONDITION_CONTROL_BOUNDARY.submitsToBankPortal !== false ? 'phase5_bank_portal_submission_forbidden' : null,
    BOND_SIGNING_WORKSPACE_CONTROL_BOUNDARY.createsSigningProviderEnvelope !== false ? 'phase6_signing_provider_envelope_forbidden' : null,
    BOND_LEGAL_TEMPLATE_GOVERNANCE_BOUNDARY.generatesLegalInstrument !== false ? 'phase7_legal_instrument_generation_forbidden' : null,
    BOND_LODGEMENT_REGISTRATION_BOUNDARY.mutatesRegistryOutcome !== false ? 'phase8_registry_mutation_forbidden' : null,
    BOND_INBOUND_SIGNAL_RECONCILIATION_BOUNDARY.writesExternalSystem !== false ? 'phase9_external_write_forbidden' : null,
  ]
  return criterion({
    id: 'phase10_release_boundary_safe',
    phase: 10,
    label: 'Release certification remains read-only and preserves all safety boundaries',
    severity: 'critical',
    passed: unique(failures).length === 0,
    proof: {
      readOnlyCertification: controls.readOnlyCertification === true,
      keepsManualEvidencePrimary: controls.keepsManualEvidencePrimary === true,
      writesExternalSystem: controls.writesExternalSystem === true,
      generatesLegalInstrument: controls.generatesLegalInstrument === true,
      mutatesRegistryOutcome: controls.mutatesRegistryOutcome === true,
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
  })
}

const ACTION_LABELS = Object.freeze({
  phase0_scope_locked: 'Restore the Phase 0 bond-attorney scope lock',
  phase3_bond_pack_workspace_ready: 'Complete the Bond Pack Workspace',
  phase4_operational_generator_ready: 'Restore operational document generation readiness',
  phase5_bank_conditions_ready: 'Clear structured bank-condition blockers',
  phase6_signing_workspace_ready: 'Complete signing workspace readiness',
  phase7_legal_template_governance_ready: 'Approve governed legal templates',
  phase8_lodgement_registration_packet_ready: 'Complete lodgement and registration evidence packet',
  phase9_inbound_reconciliation_ready: 'Resolve Phase 9 inbound signal reconciliation',
  phase10_release_boundary_safe: 'Restore release boundary controls',
})

function buildNextActions({ criteria, capabilities, releaseBlockerClosures }) {
  const criterionActions = criteria
    .filter((item) => !item.passed)
    .map((item) => Object.freeze({
      actionKey: `criterion:${item.id}`,
      sourcePhase: item.phase,
      releaseBlockerId: item.releaseBlockerId,
      ownerRole: 'bond_attorney',
      priority: 'high',
      actionLabel: ACTION_LABELS[item.id] || 'Resolve bond-attorney release criterion',
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
      const priorityRank = { high: 0, normal: 1 }
      const typeRank = (item) => item.actionKey.startsWith('criterion:') ? 0 : 1
      return (priorityRank[left.priority] ?? 9) - (priorityRank[right.priority] ?? 9) ||
        typeRank(left) - typeRank(right) ||
        Number(left.sourcePhase || 99) - Number(right.sourcePhase || 99) ||
        text(left.actionKey).localeCompare(text(right.actionKey))
    }))
}

export function validateBondAttorneyReleaseCertification(certification = {}) {
  const errors = []
  const warnings = []
  if (certification.version !== BOND_ATTORNEY_PHASE10_VERSION) errors.push('release_certification_version_invalid')
  if (certification.releaseGateId !== BOND_ATTORNEY_PHASE10_RELEASE_GATE_ID) errors.push('release_gate_id_invalid')
  if (!Object.values(S).includes(certification.status)) errors.push('release_certification_status_invalid')
  if (certification.controls?.readOnlyCertification !== true) errors.push('read_only_certification_required')
  if (certification.controls?.releaseGateOnly !== true) errors.push('release_gate_only_required')
  if (certification.controls?.keepsManualEvidencePrimary !== true) errors.push('manual_evidence_primary_required')
  ;[
    'mutatesMatter',
    'writesExternalSystem',
    'sendsNotifications',
    'submitsToBankPortal',
    'mutatesRegistryOutcome',
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
  if (!Array.isArray(certification.releaseBlockerClosures) || certification.releaseBlockerClosures.length !== BOND_ATTORNEY_PHASE0_RELEASE_BLOCKERS.length) {
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
    return 'Bond-attorney pilot release is ready: all Phase 0 blockers are closed, conveyancer capabilities are available, and release boundaries remain safe.'
  }
  return `Bond-attorney pilot release is blocked: ${metrics.openReleaseBlockerCount} release blocker(s), ${metrics.blockedCapabilityCount} capability gap(s), and ${metrics.failedCriterionCount} failed criterion/criteria remain.`
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
    laneKey: 'bond',
    status: certification.status,
    dataFingerprint: workspace.dataFingerprint || null,
  }
  const base = buildBondPackWorkspaceAuditEvent({
    workspace: auditWorkspace,
    eventType: 'bond_attorney_release_certification_completed',
    actor,
    commandId,
    occurredAt,
  })
  return Object.freeze({
    ...base,
    version: BOND_ATTORNEY_PHASE10_VERSION,
    workspaceEventVersion: base.version,
    releaseGateId: BOND_ATTORNEY_PHASE10_RELEASE_GATE_ID,
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

export function buildBondAttorneyReleaseCertification({
  workspace = null,
  transaction = {},
  lane = {},
  evidence = {},
  operationalReport = null,
  conditionRegister = null,
  signingWorkspace = null,
  legalTemplateGate = null,
  lodgementPacket = null,
  inboundSignalRegister = null,
  templates = {},
  signers = null,
  packetEvidence = [],
  inboundSignals = [],
  actor = {},
  commandId = 'bond-attorney-release-certification',
  generatedAt = new Date().toISOString(),
  asOf = generatedAt,
  firmBranding = {},
  controlOverrides = {},
} = {}) {
  const phase0Report = buildBondAttorneyPhase0BaselineReport()
  const effectiveWorkspace = workspace || buildBondPackWorkspace({ transaction, lane, evidence, generatedAt })
  const workspaceValidation = validateBondPackWorkspace(effectiveWorkspace)
  const effectiveOperationalReport = operationalReport || buildBondAttorneyPhase4BaselineReport({
    workspace: effectiveWorkspace,
    actor,
    generatedAt,
    firmBranding,
  })
  const effectiveConditionRegister = conditionRegister || buildBondConditionRegister({
    workspace: effectiveWorkspace,
    actor,
    commandId: `${commandId}-phase5-condition-register`,
    generatedAt,
    asOf,
  })
  const conditionValidation = validateBondConditionRegister(effectiveConditionRegister)
  const effectiveSigningWorkspace = signingWorkspace || buildBondSigningWorkspace({
    workspace: effectiveWorkspace,
    conditionRegister: effectiveConditionRegister,
    signers,
    actor,
    commandId: `${commandId}-phase6-signing-workspace`,
    generatedAt,
  })
  const signingValidation = validateBondSigningWorkspace(effectiveSigningWorkspace)
  const effectiveLegalTemplateGate = legalTemplateGate || buildBondLegalTemplateGate({
    workspace: effectiveWorkspace,
    signingWorkspace: effectiveSigningWorkspace,
    conditionRegister: effectiveConditionRegister,
    templates,
    actor,
    commandId: `${commandId}-phase7-template-gate`,
    generatedAt,
    asOf,
  })
  const effectiveLodgementPacket = lodgementPacket || buildBondLodgementEvidencePacket({
    workspace: effectiveWorkspace,
    legalTemplateGate: effectiveLegalTemplateGate,
    signingWorkspace: effectiveSigningWorkspace,
    conditionRegister: effectiveConditionRegister,
    templates,
    signers,
    packetEvidence,
    actor,
    commandId: `${commandId}-phase8-lodgement-packet`,
    generatedAt,
    asOf,
  })
  const lodgementValidation = validateBondLodgementEvidencePacket(effectiveLodgementPacket)
  const effectiveInboundSignalRegister = inboundSignalRegister || buildBondInboundSignalRegister({
    lodgementPacket: effectiveLodgementPacket,
    inboundSignals,
    actor,
    commandId: `${commandId}-phase9-inbound-reconciliation`,
    generatedAt,
    asOf,
  })
  const inboundValidation = validateBondInboundSignalRegister(effectiveInboundSignalRegister)
  const controls = Object.freeze({ ...BOND_ATTORNEY_PHASE10_CONTROL_BOUNDARY, ...controlOverrides })
  const releaseCriteria = buildReleaseBlockerCriteria({
    phase0Report,
    workspace: effectiveWorkspace,
    workspaceValidation,
    operationalReport: effectiveOperationalReport,
    conditionRegister: { ...effectiveConditionRegister, validation: conditionValidation },
    signingWorkspace: { ...effectiveSigningWorkspace, validation: signingValidation },
    legalTemplateGate: effectiveLegalTemplateGate,
    lodgementPacket: { ...effectiveLodgementPacket, validation: lodgementValidation },
    inboundSignalRegister: { ...effectiveInboundSignalRegister, validation: inboundValidation },
  })
  const boundaryCriterion = buildBoundaryCriteria(controls)
  const criteria = Object.freeze([...releaseCriteria, boundaryCriterion])
  const releaseBlockerClosures = buildReleaseBlockerClosures(criteria)
  const capabilities = buildCapabilityChecklist({
    workspace: effectiveWorkspace,
    workspaceValidation,
    operationalReport: effectiveOperationalReport,
    conditionRegister: { ...effectiveConditionRegister, validation: conditionValidation },
    signingWorkspace: { ...effectiveSigningWorkspace, validation: signingValidation },
    legalTemplateGate: effectiveLegalTemplateGate,
    lodgementPacket: { ...effectiveLodgementPacket, validation: lodgementValidation },
    inboundSignalRegister: { ...effectiveInboundSignalRegister, validation: inboundValidation },
  })
  const nextActions = buildNextActions({ criteria, capabilities, releaseBlockerClosures })
  const artifactFingerprints = buildArtifactFingerprints({
    workspace: effectiveWorkspace,
    conditionRegister: effectiveConditionRegister,
    signingWorkspace: effectiveSigningWorkspace,
    legalTemplateGate: effectiveLegalTemplateGate,
    lodgementPacket: effectiveLodgementPacket,
    inboundSignalRegister: effectiveInboundSignalRegister,
  })
  const shell = Object.freeze({
    version: BOND_ATTORNEY_PHASE10_VERSION,
    releaseGateId: BOND_ATTORNEY_PHASE10_RELEASE_GATE_ID,
    workspaceId: effectiveWorkspace.workspaceId,
    transactionId: effectiveWorkspace.transactionId,
    laneKey: 'bond',
    generatedAt: validDate(generatedAt) ? new Date(generatedAt).toISOString() : generatedAt,
    asOf: validDate(asOf) ? new Date(asOf).toISOString() : asOf,
    status: S.blocked,
    phase0Report: Object.freeze({
      readyForPhase1: phase0Report.readyForPhase1,
      releaseBlockerCount: phase0Report.releaseBlockerCount,
      automationCounts: phase0Report.automationCounts,
    }),
    workspaceValidation,
    conditionValidation,
    signingValidation,
    lodgementValidation,
    inboundValidation,
    criteria,
    releaseBlockerClosures,
    capabilities,
    nextActions,
    artifactFingerprints,
    controls,
    readyForPilotRelease: false,
  })
  const initialValidation = validateBondAttorneyReleaseCertification(shell)
  const readyForPilotRelease = initialValidation.valid &&
    criteria.every((item) => item.passed) &&
    releaseBlockerClosures.every((item) => item.closed) &&
    capabilities.every((item) => item.ready) &&
    effectiveInboundSignalRegister.readyForRelease === true
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

export function buildBondAttorneyPhase10BaselineReport(input = {}) {
  const certification = buildBondAttorneyReleaseCertification(input)
  return Object.freeze({
    version: BOND_ATTORNEY_PHASE10_VERSION,
    releaseGateId: BOND_ATTORNEY_PHASE10_RELEASE_GATE_ID,
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
