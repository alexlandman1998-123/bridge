import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  BOND_APPLICATION_SUBMISSION_STATUSES,
  buildBondApplicationDeclarationEvidence,
  buildBondApplicationReviewSections,
  buildBondApplicationSubmissionSnapshot,
  hashBondApplicationSnapshot,
  resolveBondApplicationDeclarations,
  resolveBondApplicationSignerIdentity,
  validateBondApplicationSubmissionReadiness,
} from '../../submission/index.js'

function normalizeStatus(value) {
  return String(value || '').trim().toLowerCase()
}

function defaultDeclarationValues(declarations = []) {
  return declarations.reduce((accumulator, declaration) => {
    accumulator[declaration.key] = false
    return accumulator
  }, {})
}

export function useBondApplicationSubmission({
  applicationState,
  documentChecklist,
  documentProgress,
  saveStatus = 'saved',
  saveLatestApplication,
  onPrepareSubmission,
  onRefreshSubmission,
  onCancelPendingSubmission,
  onFinalized,
} = {}) {
  const declarations = useMemo(() => resolveBondApplicationDeclarations({ applicationState }), [applicationState])
  const [declarationValues, setDeclarationValues] = useState(() => defaultDeclarationValues(declarations))
  const [submission, setSubmission] = useState(null)
  const [preparing, setPreparing] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [readinessAttempted, setReadinessAttempted] = useState(false)

  useEffect(() => {
    setDeclarationValues((current) => ({
      ...defaultDeclarationValues(declarations),
      ...current,
    }))
  }, [declarations])

  const signerIdentity = useMemo(() => resolveBondApplicationSignerIdentity(applicationState), [applicationState])

  const acceptedDeclarationEvidence = useMemo(() => buildBondApplicationDeclarationEvidence({
    declarations,
    values: declarationValues,
    selectedBankIds: applicationState?.application?.selectedBankIds || [],
  }), [applicationState?.application?.selectedBankIds, declarationValues, declarations])

  const readiness = useMemo(() => validateBondApplicationSubmissionReadiness({
    applicationState,
    documentChecklist,
    selectedBankIds: applicationState?.application?.selectedBankIds || [],
    signerIdentity,
    declarations,
    declarationValues,
    latestSaveStatus: saveStatus,
    submission,
  }), [applicationState, declarationValues, declarations, documentChecklist, saveStatus, signerIdentity, submission])

  const reviewSections = useMemo(() => buildBondApplicationReviewSections({
    applicationState,
    documentProgress: documentProgress || readiness.documentProgress,
    readinessIssues: readiness.issues,
  }), [applicationState, documentProgress, readiness.documentProgress, readiness.issues])

  const localSnapshotPreview = useCallback(async () => {
    const snapshot = buildBondApplicationSubmissionSnapshot({
      applicationState,
      submissionVersion: submission?.submission_version || submission?.submissionVersion || 1,
      declarations: acceptedDeclarationEvidence,
      documentChecklist,
      signerIdentity,
      source: {
        onboardingFormDataId: applicationState?.compatibility?.legacyBase?._source?.onboarding_form_data_id || null,
        sourceUpdatedAt: applicationState?.compatibility?.legacyBase?._source?.updated_at || null,
      },
    })
    const snapshotHash = await hashBondApplicationSnapshot(snapshot)
    return { snapshot, snapshotHash }
  }, [acceptedDeclarationEvidence, applicationState, documentChecklist, signerIdentity, submission])

  const updateDeclaration = useCallback((declarationKey, accepted) => {
    setDeclarationValues((current) => ({ ...current, [declarationKey]: Boolean(accepted) }))
  }, [])

  const refreshStatus = useCallback(async () => {
    if (!onRefreshSubmission) return submission
    setRefreshing(true)
    setError('')
    try {
      const result = await onRefreshSubmission()
      const nextSubmission = result?.submission || result || null
      setSubmission(nextSubmission)
      if (normalizeStatus(nextSubmission?.status) === BOND_APPLICATION_SUBMISSION_STATUSES.submitted) {
        onFinalized?.(nextSubmission)
      }
      return nextSubmission
    } catch {
      setError('We could not refresh the signing status right now.')
      return submission
    } finally {
      setRefreshing(false)
    }
  }, [onFinalized, onRefreshSubmission, submission])

  const prepareForSignature = useCallback(async () => {
    setReadinessAttempted(true)
    setError('')
    if (!readiness.ready) return { ok: false, reason: 'readiness', issues: readiness.issues }
    setPreparing(true)
    try {
      if (saveLatestApplication) await saveLatestApplication()
      await localSnapshotPreview()
      const result = await onPrepareSubmission?.({
        acceptedDeclarations: acceptedDeclarationEvidence,
        declarationValues,
        expectedSourceHash: '',
      })
      const nextSubmission = result?.submission || result || null
      setSubmission(nextSubmission)
      return { ok: true, submission: nextSubmission, signPath: result?.signPath || nextSubmission?.sign_path || '' }
    } catch (prepareError) {
      setError(prepareError?.message || 'We could not prepare your application for signing. Your information is still saved. Please try again.')
      return { ok: false, reason: 'prepare_failed' }
    } finally {
      setPreparing(false)
    }
  }, [acceptedDeclarationEvidence, declarationValues, localSnapshotPreview, onPrepareSubmission, readiness, saveLatestApplication])

  const startSigning = useCallback(() => {
    const signPath = submission?.signPath || submission?.sign_path || submission?.signing?.signPath || ''
    if (!signPath) {
      setError('The signing link is not ready yet. Refresh the signing status and try again.')
      return false
    }
    window.location.assign(signPath)
    return true
  }, [submission])

  const makeChanges = useCallback(async () => {
    if (!submission?.id) return { ok: true }
    setError('')
    try {
      const result = await onCancelPendingSubmission?.({ submissionId: submission.id })
      const nextSubmission = result?.submission || result || { ...submission, status: BOND_APPLICATION_SUBMISSION_STATUSES.cancelled }
      setSubmission(nextSubmission)
      return { ok: true, submission: nextSubmission }
    } catch (cancelError) {
      setError(cancelError?.message || 'We could not unlock the application for changes right now.')
      return { ok: false }
    }
  }, [onCancelPendingSubmission, submission])

  return {
    reviewSections,
    readiness,
    readinessAttempted,
    declarations,
    declarationValues,
    acceptedDeclarationEvidence,
    signerIdentity,
    submission,
    preparing,
    refreshing,
    error,
    updateDeclaration,
    prepareForSignature,
    startSigning,
    resumeSigning: startSigning,
    makeChanges,
    refreshStatus,
    setSubmission,
  }
}
