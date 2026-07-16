import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getLegalDocumentDefinition } from '../core/documents/legalDocumentCatalog.js'
import { legalDocumentBlocksToTemplateSections } from '../core/documents/legalDocumentBlockAdapter.js'
import { buildOtpOperationalAssurance } from '../core/documents/otpOperationalAssurance.js'
import {
  buildLegalDocumentRecoveryPermission,
  buildLegalDocumentWorkspaceEditPermission,
  buildLegalDocumentWorkspaceModel,
} from '../core/documents/legalDocumentWorkspaceModel.js'
import {
  canTransitionLegalTemplateStatus,
  resolveLegalTemplateGovernance,
} from '../core/documents/legalTemplateGovernance.js'
import {
  fetchDocumentPacketTemplate,
  rollbackCanonicalOtpVersion,
  rollbackGovernedOtpTemplate,
  updateDocumentPacketTemplate,
} from '../lib/documentPacketsApi.js'
import { useLegalDocumentLibrary } from './useLegalDocumentLibrary.js'
import { getLegalClausePackOperationalDiagnosticsSnapshot } from '../services/documents/legalClausePackOperationalDiagnosticsService.js'
import { executeLegalClausePackEscalationPlan } from '../services/documents/legalClausePackEscalationService.js'
import { getLegalClausePackResolutionSnapshot } from '../services/documents/legalClausePackResolutionService.js'

function normalizeText(value = '') {
  return String(value ?? '').trim()
}

export function useLegalDocumentWorkspace({
  documentKey = '',
  organisationId = null,
  appRole = '',
  membershipRole = '',
  actorUserId = '',
  templateId = '',
  selectedBlockId = '',
  enabled = true,
} = {}) {
  const definition = getLegalDocumentDefinition(documentKey)
  const requestIdRef = useRef(0)
  const {
    documentsByKey,
    loading: libraryLoading,
    error: libraryError,
    refresh: refreshLibrary,
  } = useLegalDocumentLibrary({
    packetTypes: definition ? [definition.packetType] : [],
    organisationId,
    enabled: enabled && Boolean(definition),
  })
  const documentModel = definition ? documentsByKey[definition.key] : null
  const resolvedTemplateId = normalizeText(templateId)
    || documentModel?.rolloutCandidateTemplateId
    || documentModel?.primaryTemplateId
    || ''
  const [detailState, setDetailState] = useState({
    templateId: '',
    template: null,
    error: '',
  })
  const [assuranceState, setAssuranceState] = useState({
    organisationId: '',
    diagnostics: null,
    loading: false,
    error: '',
  })
  const [followUpState, setFollowUpState] = useState({
    organisationId: '',
    plan: null,
    planning: false,
    applying: false,
    error: '',
  })
  const [resolutionState, setResolutionState] = useState({
    organisationId: '',
    report: null,
    checking: false,
    error: '',
  })

  const fetchTemplate = useCallback(() => {
    if (!enabled || !definition || !resolvedTemplateId) return Promise.resolve(null)
    return fetchDocumentPacketTemplate(resolvedTemplateId, { includeSections: true })
  }, [definition, enabled, resolvedTemplateId])

  useEffect(() => {
    const requestId = requestIdRef.current + 1
    requestIdRef.current = requestId
    if (enabled && definition && resolvedTemplateId) {
      void fetchTemplate()
        .then((template) => {
          if (requestId !== requestIdRef.current) return
          setDetailState({ templateId: resolvedTemplateId, template, error: '' })
        })
        .catch((error) => {
          if (requestId !== requestIdRef.current) return
          setDetailState({
            templateId: resolvedTemplateId,
            template: null,
            error: error?.message || 'Unable to load the legal document workspace.',
          })
        })
    }
    return () => {
      requestIdRef.current += 1
    }
  }, [definition, enabled, fetchTemplate, resolvedTemplateId])

  const template = detailState.templateId === resolvedTemplateId ? detailState.template : null
  const detailLoading = Boolean(
    enabled && definition && resolvedTemplateId && detailState.templateId !== resolvedTemplateId,
  )
  const workspace = useMemo(() => buildLegalDocumentWorkspaceModel({
    definition: definition || {},
    documentModel: documentModel || {},
    template,
    selectedBlockId,
  }), [definition, documentModel, selectedBlockId, template])
  const editPermission = useMemo(
    () => buildLegalDocumentWorkspaceEditPermission(template, organisationId, { appRole, membershipRole }),
    [appRole, membershipRole, organisationId, template],
  )
  const recoveryPermission = useMemo(
    () => buildLegalDocumentRecoveryPermission(documentModel?.liveTemplate, organisationId, { appRole, membershipRole }),
    [appRole, documentModel?.liveTemplate, membershipRole, organisationId],
  )
  const activeAssuranceDiagnostics = assuranceState.organisationId === normalizeText(organisationId)
    ? assuranceState.diagnostics
    : null
  const liveAssurance = useMemo(() => buildOtpOperationalAssurance({
    rolloutOperations: documentModel?.rolloutOperations || null,
    releaseDiagnostics: activeAssuranceDiagnostics,
  }), [activeAssuranceDiagnostics, documentModel?.rolloutOperations])
  const activeFollowUpPlan = followUpState.organisationId === normalizeText(organisationId)
    ? followUpState.plan
    : null
  const activeResolutionReport = resolutionState.organisationId === normalizeText(organisationId)
    ? resolutionState.report
    : null

  const refresh = useCallback(async () => {
    await refreshLibrary()
    const requestId = requestIdRef.current + 1
    requestIdRef.current = requestId
    try {
      const nextTemplate = await fetchTemplate()
      if (requestId !== requestIdRef.current) return null
      setDetailState({ templateId: resolvedTemplateId, template: nextTemplate, error: '' })
      return nextTemplate
    } catch (error) {
      if (requestId !== requestIdRef.current) return null
      setDetailState({
        templateId: resolvedTemplateId,
        template: null,
        error: error?.message || 'Unable to load the legal document workspace.',
      })
      return null
    }
  }, [fetchTemplate, refreshLibrary, resolvedTemplateId])

  const saveBlocks = useCallback(async (blocks = []) => {
    if (!resolvedTemplateId || !template) throw new Error('No working draft is available to save.')
    const permission = buildLegalDocumentWorkspaceEditPermission(template, organisationId, { appRole, membershipRole })
    if (!permission.editable) throw new Error(permission.reason)
    const governance = resolveLegalTemplateGovernance(template)
    const updatedTemplate = await updateDocumentPacketTemplate(resolvedTemplateId, {
      organisationId,
      ...(governance.status === 'approved' ? { templateStatus: 'attorney_review' } : {}),
      sections: legalDocumentBlocksToTemplateSections(blocks),
    })
    setDetailState({ templateId: resolvedTemplateId, template: updatedTemplate, error: '' })
    await refreshLibrary()
    return updatedTemplate
  }, [appRole, membershipRole, organisationId, refreshLibrary, resolvedTemplateId, template])

  const changeReviewStatus = useCallback(async (nextStatus = '') => {
    if (!resolvedTemplateId || !template) throw new Error('No working draft is available for review.')
    const permission = buildLegalDocumentWorkspaceEditPermission(template, organisationId, { appRole, membershipRole })
    if (!permission.editable) throw new Error(permission.reason)
    const governance = resolveLegalTemplateGovernance(template)
    if (!canTransitionLegalTemplateStatus(governance.status, nextStatus)) {
      throw new Error(`This document cannot move from ${governance.status.replace(/_/g, ' ')} to ${String(nextStatus || '').replace(/_/g, ' ')}.`)
    }
    const updatedTemplate = await updateDocumentPacketTemplate(resolvedTemplateId, {
      organisationId,
      templateStatus: nextStatus,
    })
    setDetailState({ templateId: resolvedTemplateId, template: updatedTemplate, error: '' })
    await refreshLibrary()
    return updatedTemplate
  }, [appRole, membershipRole, organisationId, refreshLibrary, resolvedTemplateId, template])

  const submitForReview = useCallback(
    () => changeReviewStatus('attorney_review'),
    [changeReviewStatus],
  )
  const returnToDraft = useCallback(
    () => changeReviewStatus('draft'),
    [changeReviewStatus],
  )

  const runLiveAssurance = useCallback(async () => {
    const activeOrganisationId = normalizeText(organisationId)
    if (definition?.key !== 'otp') throw new Error('Live operational assurance is available for the OTP workspace only.')
    if (!activeOrganisationId) throw new Error('Select an organisation before running the live OTP audit.')
    if (assuranceState.loading) return null
    try {
      setFollowUpState({ organisationId: activeOrganisationId, plan: null, planning: false, applying: false, error: '' })
      setResolutionState({ organisationId: activeOrganisationId, report: null, checking: false, error: '' })
      setAssuranceState({ organisationId: activeOrganisationId, diagnostics: activeAssuranceDiagnostics, loading: true, error: '' })
      const diagnostics = await getLegalClausePackOperationalDiagnosticsSnapshot({
        organisationId: activeOrganisationId,
        limit: 100,
      })
      setAssuranceState({ organisationId: activeOrganisationId, diagnostics, loading: false, error: '' })
      return diagnostics
    } catch (error) {
      setAssuranceState({
        organisationId: activeOrganisationId,
        diagnostics: activeAssuranceDiagnostics,
        loading: false,
        error: error?.message || 'Unable to run the live OTP operational audit.',
      })
      throw error
    }
  }, [activeAssuranceDiagnostics, assuranceState.loading, definition?.key, organisationId])

  const planReviewFollowUp = useCallback(async () => {
    const activeOrganisationId = normalizeText(organisationId)
    const permission = buildLegalDocumentRecoveryPermission(documentModel?.liveTemplate, activeOrganisationId, { appRole, membershipRole })
    if (!permission.allowed) throw new Error('Only an agency administrator can prepare OTP review notifications.')
    if (!activeAssuranceDiagnostics || !liveAssurance.auditRun) throw new Error('Run the operational audit before preparing review notifications.')
    if (!liveAssurance.dataComplete) throw new Error('The operational audit is incomplete. Repair the audit data path before planning notifications.')
    if (followUpState.planning || followUpState.applying) return null
    try {
      setResolutionState({ organisationId: activeOrganisationId, report: null, checking: false, error: '' })
      setFollowUpState({ organisationId: activeOrganisationId, plan: activeFollowUpPlan, planning: true, applying: false, error: '' })
      const plan = await executeLegalClausePackEscalationPlan({ diagnostics: activeAssuranceDiagnostics, dryRun: true })
      setFollowUpState({ organisationId: activeOrganisationId, plan, planning: false, applying: false, error: '' })
      return plan
    } catch (error) {
      setFollowUpState({ organisationId: activeOrganisationId, plan: activeFollowUpPlan, planning: false, applying: false, error: error?.message || 'Unable to prepare the OTP notification plan.' })
      throw error
    }
  }, [activeAssuranceDiagnostics, activeFollowUpPlan, appRole, documentModel?.liveTemplate, followUpState.applying, followUpState.planning, liveAssurance.auditRun, liveAssurance.dataComplete, membershipRole, organisationId])

  const applyReviewFollowUp = useCallback(async () => {
    const activeOrganisationId = normalizeText(organisationId)
    const permission = buildLegalDocumentRecoveryPermission(documentModel?.liveTemplate, activeOrganisationId, { appRole, membershipRole })
    const reviewedPlan = activeFollowUpPlan
    if (!permission.allowed) throw new Error('Only an agency administrator can notify OTP reviewers.')
    if (!reviewedPlan?.dryRun || !reviewedPlan.canApply) throw new Error('Prepare and review a current notification plan before confirming.')
    if (followUpState.applying) return null
    let latestDiagnostics = null
    try {
      setResolutionState({ organisationId: activeOrganisationId, report: null, checking: false, error: '' })
      setFollowUpState({ organisationId: activeOrganisationId, plan: reviewedPlan, planning: false, applying: true, error: '' })
      latestDiagnostics = await getLegalClausePackOperationalDiagnosticsSnapshot({ organisationId: activeOrganisationId, limit: 100 })
      const appliedPlan = await executeLegalClausePackEscalationPlan({
        diagnostics: latestDiagnostics,
        dryRun: false,
        approvedPlanFingerprint: reviewedPlan.planFingerprint,
        approvedActionKeys: reviewedPlan.actionKeys,
        actorUserId: normalizeText(actorUserId) || null,
      })
      setAssuranceState({ organisationId: activeOrganisationId, diagnostics: latestDiagnostics, loading: false, error: '' })
      setFollowUpState({ organisationId: activeOrganisationId, plan: appliedPlan, planning: false, applying: false, error: '' })
      return appliedPlan
    } catch (error) {
      if (latestDiagnostics) {
        setAssuranceState({ organisationId: activeOrganisationId, diagnostics: latestDiagnostics, loading: false, error: '' })
      }
      setFollowUpState({ organisationId: activeOrganisationId, plan: null, planning: false, applying: false, error: error?.message || 'Unable to apply the OTP notification plan.' })
      throw error
    }
  }, [activeFollowUpPlan, actorUserId, appRole, documentModel?.liveTemplate, followUpState.applying, membershipRole, organisationId])

  const checkReviewResolution = useCallback(async () => {
    const activeOrganisationId = normalizeText(organisationId)
    const permission = buildLegalDocumentRecoveryPermission(documentModel?.liveTemplate, activeOrganisationId, { appRole, membershipRole })
    if (!permission.allowed) throw new Error('Only an agency administrator can check OTP review resolution.')
    if (!activeOrganisationId) throw new Error('Select an organisation before checking OTP review resolution.')
    if (resolutionState.checking || followUpState.applying) return null
    try {
      setResolutionState({ organisationId: activeOrganisationId, report: activeResolutionReport, checking: true, error: '' })
      const report = await getLegalClausePackResolutionSnapshot({
        organisationId: activeOrganisationId,
        limit: 100,
      })
      setAssuranceState({ organisationId: activeOrganisationId, diagnostics: report.diagnostics || null, loading: false, error: '' })
      setFollowUpState({ organisationId: activeOrganisationId, plan: null, planning: false, applying: false, error: '' })
      setResolutionState({ organisationId: activeOrganisationId, report, checking: false, error: '' })
      return report
    } catch (error) {
      setResolutionState({
        organisationId: activeOrganisationId,
        report: activeResolutionReport,
        checking: false,
        error: error?.message || 'Unable to check OTP review follow-up resolution.',
      })
      throw error
    }
  }, [activeResolutionReport, appRole, documentModel?.liveTemplate, followUpState.applying, membershipRole, organisationId, resolutionState.checking])

  const restorePreviousLiveVersion = useCallback(async (reason = '') => {
    const normalizedReason = normalizeText(reason)
    const liveTemplate = documentModel?.liveTemplate
    const recovery = documentModel?.rolloutOperations
    const permission = buildLegalDocumentRecoveryPermission(liveTemplate, organisationId, { appRole, membershipRole })
    if (!permission.allowed) throw new Error(permission.reason)
    if (!recovery?.canRollback || !liveTemplate?.id || !recovery.rollbackTarget?.id) {
      throw new Error(recovery?.blockers?.[0] || 'The previous live OTP is not currently safe to restore.')
    }
    if (normalizedReason.length < 12) {
      throw new Error('Add an operational reason of at least 12 characters before restoring the previous OTP.')
    }
    if (recovery.canonical) {
      await rollbackCanonicalOtpVersion({ templateId: liveTemplate.id, reason: normalizedReason })
    } else {
      await rollbackGovernedOtpTemplate({
        currentTemplateId: liveTemplate.id,
        rollbackTemplateId: recovery.rollbackTarget.id,
        reason: normalizedReason,
      })
    }
    setAssuranceState({ organisationId: '', diagnostics: null, loading: false, error: '' })
    setFollowUpState({ organisationId: '', plan: null, planning: false, applying: false, error: '' })
    setResolutionState({ organisationId: '', report: null, checking: false, error: '' })
    await refresh()
  }, [appRole, documentModel?.liveTemplate, documentModel?.rolloutOperations, membershipRole, organisationId, refresh])

  return {
    ...workspace,
    definition,
    template,
    loading: libraryLoading || detailLoading,
    error: detailState.templateId === resolvedTemplateId ? detailState.error || libraryError : libraryError,
    editPermission,
    recoveryPermission,
    liveAssurance: {
      ...liveAssurance,
      loading: assuranceState.loading && assuranceState.organisationId === normalizeText(organisationId),
      error: assuranceState.organisationId === normalizeText(organisationId) ? assuranceState.error : '',
      diagnostics: activeAssuranceDiagnostics,
      findings: (activeAssuranceDiagnostics?.records || [])
        .filter((record) => record.severity === 'critical' || record.severity === 'warning')
        .slice(0, 6),
    },
    followUp: {
      permission: recoveryPermission.allowed
        ? { allowed: true, reason: '' }
        : { allowed: false, reason: 'Only an agency administrator can manage OTP review notifications.' },
      plan: activeFollowUpPlan,
      planning: followUpState.planning && followUpState.organisationId === normalizeText(organisationId),
      applying: followUpState.applying && followUpState.organisationId === normalizeText(organisationId),
      error: followUpState.organisationId === normalizeText(organisationId) ? followUpState.error : '',
    },
    resolution: {
      permission: recoveryPermission.allowed
        ? { allowed: true, reason: '' }
        : { allowed: false, reason: 'Only an agency administrator can check OTP review resolution.' },
      report: activeResolutionReport,
      checking: resolutionState.checking && resolutionState.organisationId === normalizeText(organisationId),
      error: resolutionState.organisationId === normalizeText(organisationId) ? resolutionState.error : '',
    },
    refresh,
    saveBlocks,
    submitForReview,
    returnToDraft,
    restorePreviousLiveVersion,
    runLiveAssurance,
    planReviewFollowUp,
    applyReviewFollowUp,
    checkReviewResolution,
  }
}
