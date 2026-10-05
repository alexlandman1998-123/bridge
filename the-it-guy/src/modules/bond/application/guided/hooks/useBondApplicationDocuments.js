import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { isBondStatementHandoff } from '../../documents/bondDocumentWorkspacePresentation.js'
import {
  buildBondApplicationDocumentChecklist,
  buildBondApplicationDocumentReconciliationPlan,
  calculateBondApplicationDocumentProgress,
  resolveBondApplicationDocumentRequirements,
} from '../../documents/index.js'

export function useBondApplicationDocuments({
  applicationState,
  requiredDocuments = [],
  documents = [],
  additionalRequirements = [],
  onReconcileDocumentRequirements,
  onUploadRequiredDocument,
  onRefreshDocuments,
  saveLatestApplication,
  active = false,
} = {}) {
  const [error, setError] = useState('')
  const [uploadState, setUploadState] = useState({})
  const [reconciling, setReconciling] = useState(false)

  const resolved = useMemo(() => {
    const result = resolveBondApplicationDocumentRequirements({ applicationState, participantRole: 'primary_applicant' })
    return { ...result, activeRequirements: [...result.activeRequirements, ...additionalRequirements.filter((item) => !result.activeRequirements.some((rule) => rule.key === item.key))] }
  }, [applicationState, additionalRequirements])

  const reconciliationPlan = useMemo(() => buildBondApplicationDocumentReconciliationPlan({
    transactionId: applicationState?.application?.transactionId || null,
    activeRequirements: resolved.activeRequirements,
    existingRequiredDocuments: requiredDocuments,
  }), [applicationState?.application?.transactionId, requiredDocuments, resolved.activeRequirements])

  const checklist = useMemo(() => buildBondApplicationDocumentChecklist({
    activeRequirements: resolved.activeRequirements,
    existingRequiredDocuments: requiredDocuments,
    existingDocuments: documents,
  }), [documents, requiredDocuments, resolved.activeRequirements])

  const progress = useMemo(() => calculateBondApplicationDocumentProgress(checklist), [checklist])

  const refresh = useCallback(async ({ persist = true, reconcile = true } = {}) => {
    setError('')
    setReconciling(true)
    try {
      if (persist) await saveLatestApplication?.()
      if (reconcile && onReconcileDocumentRequirements) {
        await onReconcileDocumentRequirements({
          requirements: resolved.activeRequirements,
          fingerprint: reconciliationPlan.fingerprint,
        })
      }
      const refreshed = await onRefreshDocuments?.()
      return { ok: true, ...(refreshed || {}) }
    } catch (refreshError) {
      setError(refreshError?.message || 'We could not refresh your document checklist. Try again.')
      return { ok: false, error: refreshError }
    } finally {
      setReconciling(false)
    }
  }, [saveLatestApplication, onReconcileDocumentRequirements, onRefreshDocuments, reconciliationPlan.fingerprint, resolved.activeRequirements])

  const refreshRef = useRef(refresh)
  refreshRef.current = refresh
  useEffect(() => {
    if (!active) return undefined
    void refreshRef.current()
    const onFocus = () => { void refreshRef.current({ persist: false, reconcile: false }) }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [active, reconciliationPlan.fingerprint])

  const uploadDocument = useCallback(async (item, file) => {
    const requirement = item?.requirement || item
    if (!requirement?.key || !file) {
      setError('Choose a file to upload.')
      return { ok: false, error: 'Choose a file to upload.' }
    }
    if (isBondStatementHandoff(requirement)) {
      const message = 'Bank statements must be sent through your consultant’s secure connection. It is not connected yet.'
      setError(message)
      return { ok: false, error: message }
    }
    setError('')
    setUploadState((current) => ({
      ...current,
      [requirement.key]: { status: 'uploading', error: '' },
    }))
    try {
      if (typeof onUploadRequiredDocument !== 'function') {
        throw new Error('Document upload is not available in this application yet.')
      }
      await saveLatestApplication?.()
      const result = await onUploadRequiredDocument(requirement.key, file, {
        category: requirement.category || 'Bond application documents',
        documentType: requirement.canonicalDocumentType || requirement.key,
        uploadingKey: requirement.key,
      })
      if (result && result.ok === false) {
        throw new Error(result.error || 'Upload failed. Please try again.')
      }
      setUploadState((current) => ({
        ...current,
        [requirement.key]: { status: 'uploaded', error: '' },
      }))
      await refresh({ persist: false })
      return { ok: true, document: result?.document || result }
    } catch (uploadError) {
      const message = uploadError?.message || 'Upload failed. Please try again.'
      setError(message)
      setUploadState((current) => ({
        ...current,
        [requirement.key]: { status: 'error', error: message, file },
      }))
      return { ok: false, error: message }
    }
  }, [onUploadRequiredDocument, refresh, saveLatestApplication])

  const retryUpload = useCallback(async (item) => {
    const requirement = item?.requirement || item
    const file = uploadState[requirement?.key]?.file
    if (!file) return { ok: false, error: 'Choose the file again to retry.' }
    return uploadDocument(item, file)
  }, [uploadDocument, uploadState])

  const continueToReview = useCallback(async () => {
    const refreshResult = await refresh()
    if (!refreshResult.ok) return refreshResult
    const nextChecklist = buildBondApplicationDocumentChecklist({
      activeRequirements: resolved.activeRequirements,
      existingRequiredDocuments: refreshResult.requiredDocuments || requiredDocuments,
      existingDocuments: refreshResult.documents || documents,
    })
    const nextProgress = calculateBondApplicationDocumentProgress(nextChecklist)
    return { ok: true, fingerprint: reconciliationPlan.fingerprint, outstandingDocuments: nextProgress.blockingMissing }
  }, [documents, reconciliationPlan.fingerprint, refresh, requiredDocuments, resolved.activeRequirements])

  return {
    checklist,
    groups: checklist.groups,
    resolving: false,
    reconciling,
    uploadState,
    error,
    progress,
    canContinue: progress.canContinue,
    diagnostics: resolved.diagnostics,
    reconciliationPlan,
    refresh,
    uploadDocument,
    replaceDocument: uploadDocument,
    retryUpload,
    continueToReview,
  }
}
