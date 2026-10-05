import { getBondApplicationSigningAvailability } from '../../submission/bondApplicationSigningAvailability.js'
import { isBondApplicationSignature } from '../bondApplicationSignature.js'
import { sealBondReviewedVersion, getBondReviewedContent } from '../../submission/bondApplicationReviewedVersion.js'
import { canonicalizeBondApplicationSnapshot } from '../../submission/bondApplicationSnapshotHash.js'
import { buildBondApplicationDocumentPresentation } from '../../exports/bondApplicationDocumentPresentation.js'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
  onPrepareWetInk,
  onPrepareOnlineSigning,
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
  const reviewedAnswers = useMemo(() => canonicalizeBondApplicationSnapshot(getBondReviewedContent(buildBondApplicationSubmissionSnapshot({ applicationState, declarations }))), [applicationState, declarations])
  const previousReviewedAnswers = useRef(reviewedAnswers)

  useEffect(() => {
    if (previousReviewedAnswers.current !== reviewedAnswers) {
      setDeclarationValues(defaultDeclarationValues(declarations))
      previousReviewedAnswers.current = reviewedAnswers
    }
  }, [declarations, reviewedAnswers])

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
    const reviewedSnapshot = await sealBondReviewedVersion(snapshot)
    const snapshotHash = await hashBondApplicationSnapshot(reviewedSnapshot)
    return { snapshot: reviewedSnapshot, snapshotHash }
  }, [acceptedDeclarationEvidence, applicationState, documentChecklist, signerIdentity, submission])

  const reviewDocument = useMemo(() => buildBondApplicationDocumentPresentation(buildBondApplicationSubmissionSnapshot({ applicationState, declarations: acceptedDeclarationEvidence, documentChecklist, signerIdentity })), [applicationState, acceptedDeclarationEvidence, documentChecklist, signerIdentity])

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
    if (typeof onPrepareSubmission !== 'function') {
      setError('Application signing is not available here yet. Your saved information is unchanged.')
      return { ok: false, reason: 'submission_unavailable' }
    }
    const availability = getBondApplicationSigningAvailability()
    if (!availability.available) { setError(availability.message); return { ok: false, reason: availability.code } }
    setError('')
    if (!readiness.ready) return { ok: false, reason: 'readiness', issues: readiness.issues }
    const signatureEvidence = applicationState?.application?.signatureEvidence || {}
    if (!isBondApplicationSignature(signatureEvidence.dataUrl)) {
      setError('Draw your signature before signing the application.')
      return { ok: false, reason: 'signature_required' }
    }
    if (!signatureEvidence.confirmed) {
      setError('Confirm that the application information is complete and accurate before signing.')
      return { ok: false, reason: 'signature_confirmation_required' }
    }
    setPreparing(true)
    try {
      if (saveLatestApplication) await saveLatestApplication()
      await localSnapshotPreview()
      const result = await onPrepareSubmission({
        acceptedDeclarations: acceptedDeclarationEvidence,
        declarationValues,
        expectedSourceHash: '',
        signatureEvidence,
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
  }, [acceptedDeclarationEvidence, applicationState?.application?.signatureEvidence, declarationValues, localSnapshotPreview, onPrepareSubmission, readiness, saveLatestApplication])

  const prepareOnline = useCallback(async () => {
    setReadinessAttempted(true); setError('')
    if (readiness.issues.some((issue) => issue.category !== 'declarations')) return { ok: false, reason: 'readiness' }
    if (!onPrepareOnlineSigning) return { ok: false, reason: 'unavailable' }
    setPreparing(true)
    try { if (saveLatestApplication) await saveLatestApplication(); await onPrepareOnlineSigning(); return { ok: true } }
    catch (failure) { setError(failure.message || 'Online signing could not be prepared.'); return { ok: false } }
    finally { setPreparing(false) }
  }, [readiness, saveLatestApplication, onPrepareOnlineSigning])

  const prepareWetInk = useCallback(async () => {
    setReadinessAttempted(true)
    setError('')
    if (!readiness.ready) return { ok: false, reason: 'readiness' }
    if (!onPrepareWetInk) return { ok: false, reason: 'unavailable' }
    setPreparing(true)
    try {
      if (saveLatestApplication) await saveLatestApplication()
      await onPrepareWetInk({ declarationValues })
      return { ok: true }
    } catch (failure) {
      setError(failure.message || 'The signing copy could not be prepared. Please retry.')
      return { ok: false }
    } finally { setPreparing(false) }
  }, [readiness, onPrepareWetInk, saveLatestApplication, declarationValues])

  const startSigning = useCallback(() => {
    const availability = getBondApplicationSigningAvailability()
    if (!availability.available) { setError(availability.message); return false }
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
    if (typeof onCancelPendingSubmission !== 'function') {
      setError('We could not unlock the application for changes right now.')
      return { ok: false, reason: 'cancellation_unavailable' }
    }
    setError('')
    try {
      const result = await onCancelPendingSubmission({ submissionId: submission.id })
      const nextSubmission = result?.submission || result || { ...submission, status: BOND_APPLICATION_SUBMISSION_STATUSES.cancelled }
      setSubmission(nextSubmission)
      return { ok: true, submission: nextSubmission }
    } catch (cancelError) {
      setError(cancelError?.message || 'We could not unlock the application for changes right now.')
      return { ok: false }
    }
  }, [onCancelPendingSubmission, submission])

  return {
    signingAvailability: getBondApplicationSigningAvailability(),
    reviewSections,
    reviewDocument,
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
    prepareWetInk,
    prepareOnline,
    wetInkAvailable: typeof onPrepareWetInk === 'function',
    startSigning,
    resumeSigning: startSigning,
    makeChanges,
    refreshStatus,
    setSubmission,
  }
}
