import { useCallback, useMemo, useState } from 'react'
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
  onReconcileDocumentRequirements,
  onUploadRequiredDocument,
  onRefreshDocuments,
} = {}) {
  const [error, setError] = useState('')
  const [uploadState, setUploadState] = useState({})
  const [reconciling, setReconciling] = useState(false)

  const resolved = useMemo(() => resolveBondApplicationDocumentRequirements({
    applicationState,
    participantRole: 'primary_applicant',
  }), [applicationState])

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

  const refresh = useCallback(async () => {
    setError('')
    setReconciling(true)
    try {
      if (onReconcileDocumentRequirements) {
        await onReconcileDocumentRequirements({
          requirements: resolved.activeRequirements,
          fingerprint: reconciliationPlan.fingerprint,
        })
      }
      await onRefreshDocuments?.()
      return { ok: true }
    } catch (refreshError) {
      setError(refreshError?.message || 'We could not refresh your document checklist. Try again.')
      return { ok: false, error: refreshError }
    } finally {
      setReconciling(false)
    }
  }, [onReconcileDocumentRequirements, onRefreshDocuments, reconciliationPlan.fingerprint, resolved.activeRequirements])

  const uploadDocument = useCallback(async (item, file) => {
    const requirement = item?.requirement || item
    if (!requirement?.key || !file) {
      setError('Choose a file to upload.')
      return { ok: false, error: 'Choose a file to upload.' }
    }
    setError('')
    setUploadState((current) => ({
      ...current,
      [requirement.key]: { status: 'uploading', error: '' },
    }))
    try {
      const result = await onUploadRequiredDocument?.(requirement.key, file, {
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
      await refresh()
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
  }, [onUploadRequiredDocument, refresh])

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
      existingRequiredDocuments: requiredDocuments,
      existingDocuments: documents,
    })
    const nextProgress = calculateBondApplicationDocumentProgress(nextChecklist)
    if (!nextProgress.canContinue) {
      setError('Upload the required documents before continuing to review.')
      return { ok: false, reason: 'missing_documents', items: nextProgress.blockingMissing }
    }
    return { ok: true, fingerprint: reconciliationPlan.fingerprint }
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
