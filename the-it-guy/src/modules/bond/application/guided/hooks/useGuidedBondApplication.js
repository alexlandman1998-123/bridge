import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { buildLegacyBondApplicationPersistencePayload } from '../../bondApplicationPersistence.js'
import { cloneBondApplicationValue } from '../../bondApplicationState.js'
import {
  GUIDED_BOND_APPLICATION_PHASE3_DOCUMENTS_HANDOFF_REASON,
  GUIDED_BOND_APPLICATION_PHASE3_DOCUMENTS_HANDOFF_SECTION,
  GUIDED_BOND_APPLICATION_PHASE4_REVIEW_SIGN_HANDOFF_REASON,
  GUIDED_BOND_APPLICATION_PHASE4_REVIEW_SIGN_HANDOFF_SECTION,
} from '../../flow/bondApplicationFlowContract.js'
import { detectEmploymentBranchChange } from '../../flow/bondApplicationBranchChanges.js'
import { resolveBondApplicationFlow } from '../../flow/resolveBondApplicationFlow.js'
import { validateBondApplicationScreen, validateBondApplicationSteps } from '../../flow/bondApplicationScreenValidation.js'
import { buildBondApplicationState, toLegacyBondApplication } from '../../legacy/bondApplicationLegacyAdapter.js'
import { createGuidedBondApplicationSaveController } from '../guidedBondApplicationSaveController.js'
import {
  GUIDED_BOND_APPLICATION_PHASE2_HANDOFF_SECTION,
  applyGuidedBondApplicationMetadata,
  createGuidedBondApplicationMetadataPatch,
  getGuidedBondApplicationMetadataFromState,
  resolveGuidedBondApplicationScreenKey,
} from '../phase2GuidedFlow.js'

const AUTO_SAVE_DELAY_MS = 850

function getPathValue(source, path) {
  return String(path || '').split('.').filter(Boolean).reduce((current, key) => current?.[key], source)
}

function setPathValue(source, path, value) {
  const parts = String(path || '').split('.').filter(Boolean)
  if (!parts.length) return source
  const next = cloneBondApplicationValue(source) || {}
  let current = next
  parts.forEach((part, index) => {
    if (index === parts.length - 1) {
      current[part] = value
      return
    }
    const existing = current[part]
    current[part] = existing && typeof existing === 'object' && !Array.isArray(existing) ? { ...existing } : {}
    current = current[part]
  })
  return next
}

function normalizeCompletedScreenKeys(value) {
  return Array.isArray(value) ? [...new Set(value.map((item) => String(item || '').trim()).filter(Boolean))] : []
}

function buildStateWithMetadata(state, {
  currentScreenKey,
  completedScreenKeys,
  handoffReason = null,
  markHandoff = false,
  documentRuleSetVersion = null,
  documentRequirementFingerprint = null,
  now = new Date().toISOString(),
} = {}) {
  const legacy = toLegacyBondApplication(state)
  const existingMetadata = getGuidedBondApplicationMetadataFromState(state)
  const metadata = createGuidedBondApplicationMetadataPatch({
    existingMetadata,
    currentScreenKey,
    completedScreenKeys,
    handoffReason,
    handoffAt: markHandoff ? now : null,
    documentRuleSetVersion,
    documentRequirementFingerprint,
    reviewSignHandoffAt: markHandoff && handoffReason === GUIDED_BOND_APPLICATION_PHASE4_REVIEW_SIGN_HANDOFF_REASON ? now : null,
    reviewSignHandoffReason: handoffReason === GUIDED_BOND_APPLICATION_PHASE4_REVIEW_SIGN_HANDOFF_REASON ? handoffReason : null,
    now,
  })
  const legacyWithMetadata = applyGuidedBondApplicationMetadata(legacy, metadata)
  const nextState = cloneBondApplicationValue(state)
  nextState.compatibility = {
    ...(nextState.compatibility || {}),
    legacyBase: legacyWithMetadata,
  }
  return { nextState, legacyWithMetadata, metadata }
}

export function useGuidedBondApplication({
  portal,
  token,
  saveClientPortalOnboardingDraft,
  onLegacyHandoff,
  onSaveAndExit,
} = {}) {
  const initialState = useMemo(() => buildBondApplicationState(portal), [portal])
  const initialMetadata = useMemo(() => getGuidedBondApplicationMetadataFromState(initialState), [initialState])
  const [applicationState, setApplicationState] = useState(initialState)
  const [currentScreenKey, setCurrentScreenKey] = useState(() => resolveGuidedBondApplicationScreenKey(initialMetadata))
  const [completedScreenKeys, setCompletedScreenKeys] = useState(() => normalizeCompletedScreenKeys(initialMetadata?.completed_screen_keys))
  const [validationIssues, setValidationIssues] = useState([])
  const [saveStatus, setSaveStatus] = useState('saved')
  const [saveError, setSaveError] = useState('')
  const [handoffReason, setHandoffReason] = useState('')
  const [pendingBranchChange, setPendingBranchChange] = useState(null)
  const dirtyRef = useRef(false)
  const latestStateRef = useRef(applicationState)
  const latestScreenRef = useRef(currentScreenKey)
  const latestCompletedRef = useRef(completedScreenKeys)
  const saveControllerRef = useRef(null)

  useEffect(() => {
    setApplicationState(initialState)
    setCurrentScreenKey(resolveGuidedBondApplicationScreenKey(initialMetadata))
    setCompletedScreenKeys(normalizeCompletedScreenKeys(initialMetadata?.completed_screen_keys))
    setValidationIssues([])
    setSaveStatus('saved')
    setSaveError('')
    setHandoffReason('')
    setPendingBranchChange(null)
    dirtyRef.current = false
  }, [initialState, initialMetadata])

  const flow = useMemo(() => resolveBondApplicationFlow({
    applicationState,
    currentScreenKey,
    completedScreenKeys,
  }), [applicationState, completedScreenKeys, currentScreenKey])

  useEffect(() => {
    latestStateRef.current = applicationState
  }, [applicationState])

  useEffect(() => {
    latestScreenRef.current = currentScreenKey
  }, [currentScreenKey])

  useEffect(() => {
    latestCompletedRef.current = completedScreenKeys
  }, [completedScreenKeys])

  const persistState = useCallback(async (state, {
    screenKey = latestScreenRef.current,
    completed = latestCompletedRef.current,
    markHandoff = false,
    reason = null,
    documentRuleSetVersion = null,
    documentRequirementFingerprint = null,
  } = {}) => {
    if (!saveClientPortalOnboardingDraft) return null
    const { nextState, legacyWithMetadata } = buildStateWithMetadata(state, {
      currentScreenKey: screenKey,
      completedScreenKeys: completed,
      markHandoff,
      handoffReason: reason,
      documentRuleSetVersion,
      documentRequirementFingerprint,
    })
    const { draftToPersist, formData } = buildLegacyBondApplicationPersistencePayload({
      existingFormData: portal?.onboardingFormData?.formData || {},
      legacyBondApplication: legacyWithMetadata,
      submitted: false,
    })

    await saveClientPortalOnboardingDraft({ token, formData })

    const persistedState = cloneBondApplicationValue(nextState)
    persistedState.compatibility = {
      ...(persistedState.compatibility || {}),
      legacyBase: draftToPersist,
    }
    return { state: persistedState, draftToPersist, formData }
  }, [portal?.onboardingFormData?.formData, saveClientPortalOnboardingDraft, token])

  if (!saveControllerRef.current) {
    saveControllerRef.current = createGuidedBondApplicationSaveController(persistState)
  }

  const saveNow = useCallback(async (state = latestStateRef.current, options = {}) => {
    setSaveStatus(options.retry ? 'retrying' : 'saving')
    setSaveError('')
    try {
      const saveResult = await saveControllerRef.current.save(state, options)
      if (!saveResult.stale && saveResult.result?.state) {
        setApplicationState(saveResult.result.state)
        latestStateRef.current = saveResult.result.state
        dirtyRef.current = false
        setSaveStatus('saved')
      }
      return saveResult
    } catch (error) {
      setSaveStatus('error')
      setSaveError('We could not save your latest changes. Check your connection and try again.')
      throw error
    }
  }, [])

  useEffect(() => {
    if (!dirtyRef.current) return undefined
    setSaveStatus('dirty')
    const timeout = setTimeout(() => {
      void saveNow(latestStateRef.current).catch(() => {})
    }, AUTO_SAVE_DELAY_MS)
    return () => clearTimeout(timeout)
  }, [applicationState, saveNow])

  const updateField = useCallback((path, value) => {
    setApplicationState((previous) => {
      if (path === 'participants.primaryApplicant.employment.occupation_status') {
        const branchChange = detectEmploymentBranchChange(previous, value)
        if (branchChange.changesBranch && branchChange.pathsWithData.length > 0) {
          setPendingBranchChange({
            path,
            value,
            pathsWithData: branchChange.pathsWithData,
          })
          return previous
        }
      }
      let next = setPathValue(previous, path, value)
      if (path === 'participants.primaryApplicant.contact.email') {
        next = setPathValue(next, 'participants.primaryApplicant.personal.email', value)
      }
      if (path === 'participants.primaryApplicant.contact.phone') {
        next = setPathValue(next, 'participants.primaryApplicant.personal.phone', value)
      }
      if (path === 'application.applicantStructure') {
        next = setPathValue(next, 'application.requiresSurety', value === 'surety' ? 'yes' : 'no')
      }
      dirtyRef.current = true
      return next
    })
  }, [])

  const confirmBranchChange = useCallback(() => {
    const pending = pendingBranchChange
    if (!pending) return
    let computedNext = null
    setApplicationState((previous) => {
      let next = previous
      pending.pathsWithData.forEach((path) => {
        const existing = getPathValue(next, path)
        next = setPathValue(next, path, Array.isArray(existing) ? [] : null)
      })
      next = setPathValue(next, pending.path, pending.value)
      computedNext = next
      dirtyRef.current = true
      return next
    })
    setPendingBranchChange(null)
    if (computedNext) void saveNow(computedNext).catch(() => {})
  }, [pendingBranchChange, saveNow])

  const cancelBranchChange = useCallback(() => {
    setPendingBranchChange(null)
  }, [])

  const updateRepeatableGroup = useCallback((path, records = []) => {
    setApplicationState((previous) => setPathValue(previous, path, records))
    dirtyRef.current = true
  }, [])

  const updateFields = useCallback((entries = {}) => {
    setApplicationState((previous) => {
      let next = previous
      Object.entries(entries).forEach(([path, value]) => {
        next = setPathValue(next, path, value)
      })
      dirtyRef.current = true
      return next
    })
  }, [])

  const retrySave = useCallback(() => saveNow(latestStateRef.current, { retry: true }), [saveNow])

  const openAboutYouEdit = useCallback(() => {
    const nextCompleted = normalizeCompletedScreenKeys([...latestCompletedRef.current, 'about_you_confirmation'])
    setCompletedScreenKeys(nextCompleted)
    setCurrentScreenKey('about_you_edit')
    setValidationIssues([])
    void saveNow(latestStateRef.current, { screenKey: 'about_you_edit', completed: nextCompleted }).catch(() => {})
  }, [saveNow])

  const continueForward = useCallback(async (options = {}) => {
    const validation = validateBondApplicationScreen({
      applicationState: latestStateRef.current,
      screenKey: latestScreenRef.current,
    })
    setValidationIssues(validation.issues)
    if (!validation.valid) return { ok: false, reason: 'validation', issues: validation.issues }

    const current = latestScreenRef.current
    const completed = normalizeCompletedScreenKeys([...latestCompletedRef.current, current])
    const resolved = resolveBondApplicationFlow({
      applicationState: latestStateRef.current,
      currentScreenKey: current,
      completedScreenKeys: completed,
    })
    let nextScreenKey = current === 'about_you_confirmation' && options.enterAboutYouEdit
      ? 'about_you_edit'
      : resolved.nextScreenKey
    let nextState = latestStateRef.current

    if (current === 'applicant_structure' && getPathValue(nextState, 'application.applicantStructure') !== 'sole') {
      setHandoffReason(getPathValue(nextState, 'application.applicantStructure') === 'surety' ? 'surety_application' : 'joint_application')
      nextScreenKey = 'phase2_completion_handoff'
    }

    if (current === 'phase3_documents_handoff') {
      const fullValidation = validateBondApplicationSteps({
        applicationState: nextState,
        throughStepOrder: 6,
      })
      setValidationIssues(fullValidation.issues)
      if (!fullValidation.valid) return { ok: false, reason: 'validation', issues: fullValidation.issues }
      setHandoffReason(GUIDED_BOND_APPLICATION_PHASE3_DOCUMENTS_HANDOFF_REASON)
    }

    const saveResult = await saveNow(nextState, { screenKey: nextScreenKey, completed })
    if (saveResult?.stale === false || saveResult?.result) {
      setCompletedScreenKeys(completed)
      setCurrentScreenKey(nextScreenKey)
      setValidationIssues([])
    }
    return { ok: true, screenKey: nextScreenKey }
  }, [saveNow])

  const goBack = useCallback(async () => {
    const resolved = resolveBondApplicationFlow({
      applicationState: latestStateRef.current,
      currentScreenKey: latestScreenRef.current,
      completedScreenKeys: latestCompletedRef.current,
    })
    const previousScreenKey = resolved.previousScreenKey
    if (!previousScreenKey) return { ok: false, reason: 'first_screen' }
    setValidationIssues([])
    setCurrentScreenKey(previousScreenKey)
    try {
      await saveNow(latestStateRef.current, { screenKey: previousScreenKey, completed: latestCompletedRef.current })
    } catch {
      // Back navigation preserves in-memory data even if metadata save fails.
    }
    return { ok: true, screenKey: previousScreenKey }
  }, [saveNow])

  const saveAndExit = useCallback(async () => {
    await saveNow(latestStateRef.current, { screenKey: latestScreenRef.current, completed: latestCompletedRef.current })
    onSaveAndExit?.()
  }, [onSaveAndExit, saveNow])

  const saveCurrent = useCallback(async () => {
    return saveNow(latestStateRef.current, { screenKey: latestScreenRef.current, completed: latestCompletedRef.current })
  }, [saveNow])

  const openScreen = useCallback(async (screenKey) => {
    const nextScreenKey = String(screenKey || '').trim()
    if (!nextScreenKey) return { ok: false, reason: 'missing_screen' }
    setValidationIssues([])
    setCurrentScreenKey(nextScreenKey)
    try {
      await saveNow(latestStateRef.current, { screenKey: nextScreenKey, completed: latestCompletedRef.current })
    } catch {
      // Navigation remains in-memory if the metadata save fails.
    }
    return { ok: true, screenKey: nextScreenKey }
  }, [saveNow])

  const handoffToLegacy = useCallback(async (reason = handoffReason || GUIDED_BOND_APPLICATION_PHASE4_REVIEW_SIGN_HANDOFF_REASON, options = {}) => {
    const isDocumentsHandoff = reason === GUIDED_BOND_APPLICATION_PHASE3_DOCUMENTS_HANDOFF_REASON
    const isReviewHandoff = reason === GUIDED_BOND_APPLICATION_PHASE4_REVIEW_SIGN_HANDOFF_REASON
    const sectionKey = isReviewHandoff
      ? GUIDED_BOND_APPLICATION_PHASE4_REVIEW_SIGN_HANDOFF_SECTION
      : isDocumentsHandoff
        ? GUIDED_BOND_APPLICATION_PHASE3_DOCUMENTS_HANDOFF_SECTION
        : GUIDED_BOND_APPLICATION_PHASE2_HANDOFF_SECTION
    const screenKey = isReviewHandoff
      ? 'phase4_review_sign_handoff'
      : isDocumentsHandoff
        ? 'phase3_documents_handoff'
        : 'phase2_completion_handoff'
    if (isDocumentsHandoff || isReviewHandoff) {
      const fullValidation = validateBondApplicationSteps({
        applicationState: latestStateRef.current,
        throughStepOrder: 6,
      })
      setValidationIssues(fullValidation.issues)
      if (!fullValidation.valid) return { ok: false, reason: 'validation', issues: fullValidation.issues }
    }
    await saveNow(latestStateRef.current, {
      screenKey,
      completed: latestCompletedRef.current,
      markHandoff: true,
      reason,
      documentRuleSetVersion: options.documentRuleSetVersion || null,
      documentRequirementFingerprint: options.documentRequirementFingerprint || null,
    })
    onLegacyHandoff?.({
      reason,
      sectionKey,
    })
    return { ok: true, sectionKey }
  }, [handoffReason, onLegacyHandoff, saveNow])

  return {
    applicationState,
    currentScreenKey,
    completedScreenKeys,
    validationIssues,
    saveStatus,
    saveError,
    handoffReason,
    pendingBranchChange,
    flow,
    autoSaveDelayMs: AUTO_SAVE_DELAY_MS,
    updateField,
    updateFields,
    updateRepeatableGroup,
    confirmBranchChange,
    cancelBranchChange,
    continueForward,
    goBack,
    saveAndExit,
    saveCurrent,
    retrySave,
    openAboutYouEdit,
    openScreen,
    handoffToLegacy,
  }
}
