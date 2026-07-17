import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  FileClock,
  Pencil,
} from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import {
  checkAttorneyMatterReferenceAvailability,
  ensureAttorneyMatterFile,
  listAttorneyMatterReferenceHistory,
  resolveAttorneyMatterReference,
  setAttorneyMatterFilingReference,
  validateAttorneyMatterFilingReference,
} from '../../services/attorneyMatterNumberingService.js'
import Button from '../ui/Button.jsx'
import Field from '../ui/Field.jsx'
import Modal from '../ui/Modal.jsx'

function formatDateTime(value) {
  if (!value) return 'Unknown date'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Unknown date'
  return date.toLocaleString('en-ZA', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function historyLabel(changeType) {
  if (changeType === 'generated') return 'Provisional number generated'
  if (changeType === 'confirmed') return 'Filing number confirmed'
  if (changeType === 'cleared') return 'Filing number cleared'
  return 'Filing number changed'
}

function availabilityMessage(state) {
  if (state === 'checking') return 'Checking availability…'
  if (state === 'available') return 'This filing number is available.'
  if (state === 'duplicate') return 'This filing number is already used by another matter in your firm.'
  return ''
}

export default function AttorneyMatterReferenceCard({
  transactionId,
  firmId,
  lane = 'transfer',
  canManage = false,
  hasGeneratedDocuments = false,
  fallbackReference = '',
  onReferenceChange = null,
}) {
  const [matterReference, setMatterReference] = useState(null)
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [referenceDraft, setReferenceDraft] = useState('')
  const [reasonDraft, setReasonDraft] = useState('')
  const [availability, setAvailability] = useState('idle')
  const [saving, setSaving] = useState(false)

  const loadReference = useCallback(async () => {
    if (!transactionId || !firmId) return
    setLoading(true)
    setError('')
    try {
      let resolved = await resolveAttorneyMatterReference({ transactionId, firmId, lane })
      if (!resolved.id && canManage) {
        resolved = await ensureAttorneyMatterFile({ transactionId, firmId, lane })
      }
      const nextHistory = resolved.id
        ? await listAttorneyMatterReferenceHistory(resolved.id)
        : []
      setMatterReference(resolved)
      setHistory(nextHistory)
      onReferenceChange?.(resolved)
    } catch (loadError) {
      setError(loadError?.message || 'Unable to load the firm matter number.')
    } finally {
      setLoading(false)
    }
  }, [canManage, firmId, lane, onReferenceChange, transactionId])

  useEffect(() => {
    // Loading remote matter state is the synchronization this effect owns.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadReference()
  }, [loadReference])

  const currentReference = matterReference?.effectiveReference || fallbackReference || 'Pending'
  const isConfirmed = matterReference?.referenceStatus === 'confirmed'
  const draftValidationError = validateAttorneyMatterFilingReference(referenceDraft)
  const draftMatchesCurrent = referenceDraft.trim().toLowerCase() === currentReference.trim().toLowerCase()

  const statusClasses = isConfirmed
    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
    : 'border-amber-200 bg-amber-50 text-amber-700'

  const modalTitle = isConfirmed ? 'Edit matter number' : 'Confirm matter number'
  const saveLabel = isConfirmed ? 'Save matter number' : 'Confirm matter number'

  const duplicateStatusText = availabilityMessage(availability)

  function openEditor() {
    setReferenceDraft(matterReference?.filingReference || matterReference?.provisionalReference || currentReference)
    setReasonDraft('')
    setAvailability('idle')
    setError('')
    setModalOpen(true)
  }

  async function checkAvailability() {
    if (draftValidationError || draftMatchesCurrent) {
      setAvailability('idle')
      return !draftValidationError
    }
    setAvailability('checking')
    try {
      const result = await checkAttorneyMatterReferenceAvailability({
        firmId,
        reference: referenceDraft,
        excludeMatterFileId: matterReference?.id,
      })
      setAvailability(result.available ? 'available' : 'duplicate')
      return result.available
    } catch (availabilityError) {
      setAvailability('idle')
      setError(availabilityError?.message || 'Unable to check matter-number availability.')
      return false
    }
  }

  async function saveReference() {
    if (draftValidationError || !matterReference?.id) return
    setSaving(true)
    setError('')
    try {
      const available = await checkAvailability()
      if (!available) return
      await setAttorneyMatterFilingReference({
        matterFileId: matterReference.id,
        reference: referenceDraft,
        changeReason: reasonDraft,
      })
      setModalOpen(false)
      await loadReference()
    } catch (saveError) {
      setError(saveError?.message || 'Unable to save the matter number.')
    } finally {
      setSaving(false)
    }
  }

  if (!firmId) return null

  return (
    <>
      <section className="rounded-[18px] border border-borderDefault bg-white px-5 py-4 shadow-[0_10px_22px_rgba(15,23,42,0.04)] md:px-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-textMuted">Firm matter number</span>
              <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClasses}`}>
                {isConfirmed ? <CheckCircle2 size={13} /> : <Clock3 size={13} />}
                {isConfirmed ? 'Confirmed' : 'Provisional'}
              </span>
            </div>
            <strong className="mt-2 block break-words text-xl text-textStrong">
              {loading ? 'Loading matter number…' : currentReference}
            </strong>
            <p className="mt-1 text-xs text-textMuted">
              Arch9 reference: <span className="font-mono text-textBody">{matterReference?.platformReference || 'Pending'}</span>
              <span aria-hidden> · </span>
              {lane === 'bond' ? 'Bond registration file' : lane === 'cancellation' ? 'Bond cancellation file' : 'Transfer file'}
            </p>
            {error ? <p className="mt-2 text-sm text-danger">{error}</p> : null}
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            {history.length ? (
              <Button type="button" variant="ghost" size="sm" onClick={() => setHistoryOpen(true)}>
                <FileClock size={14} />
                History
              </Button>
            ) : null}
            {canManage ? (
              <Button type="button" variant="secondary" size="sm" onClick={openEditor} disabled={loading || !matterReference?.id}>
                <Pencil size={14} />
                {isConfirmed ? 'Edit matter number' : 'Confirm matter number'}
              </Button>
            ) : null}
          </div>
        </div>
      </section>

      <Modal
        open={modalOpen}
        onClose={() => !saving && setModalOpen(false)}
        title={modalTitle}
        subtitle="Use the reference exactly as it appears in your firm's filing system."
        footer={(
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setModalOpen(false)} disabled={saving}>Cancel</Button>
            <Button
              type="button"
              onClick={() => void saveReference()}
              disabled={saving || Boolean(draftValidationError) || availability === 'duplicate'}
            >
              {saving ? 'Saving…' : saveLabel}
            </Button>
          </div>
        )}
      >
        <div className="space-y-5">
          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-textStrong">Filing reference</span>
            <Field
              value={referenceDraft}
              onChange={(event) => {
                setReferenceDraft(event.target.value)
                setAvailability('idle')
              }}
              onBlur={() => void checkAvailability()}
              maxLength={160}
              autoFocus
              aria-invalid={Boolean(draftValidationError || availability === 'duplicate')}
            />
            {draftValidationError ? <span className="mt-1.5 block text-xs text-danger">{draftValidationError}</span> : null}
            {duplicateStatusText ? (
              <span className={`mt-1.5 block text-xs ${availability === 'duplicate' ? 'text-danger' : 'text-textMuted'}`}>
                {duplicateStatusText}
              </span>
            ) : null}
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-textStrong">Reason for change <span className="font-normal text-textMuted">(optional)</span></span>
            <Field
              as="textarea"
              className="min-h-[90px]"
              value={reasonDraft}
              onChange={(event) => setReasonDraft(event.target.value)}
              maxLength={500}
              placeholder="For example: Updated to match the firm's physical file."
            />
          </label>

          {hasGeneratedDocuments && isConfirmed && !draftMatchesCurrent ? (
            <div className="flex gap-3 rounded-[14px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <AlertTriangle className="mt-0.5 shrink-0" size={17} />
              <p>Documents already generated for this matter keep the number printed on them. Regenerate affected documents if the new filing number must appear.</p>
            </div>
          ) : null}

          {!isConfirmed ? (
            <p className="rounded-[14px] border border-borderSoft bg-surfaceAlt px-4 py-3 text-sm text-textMuted">
              Confirming the generated provisional number is allowed. This completes the initial matter-number capture; later edits preserve that completion state.
            </p>
          ) : null}
        </div>
      </Modal>

      <Modal
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        title="Matter number history"
        subtitle="An immutable audit trail of generated, confirmed, and changed references."
      >
        <div className="space-y-3">
          {history.map((entry) => (
            <article key={entry.id} className="rounded-[14px] border border-borderSoft bg-surfaceAlt px-4 py-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <strong className="text-sm text-textStrong">{historyLabel(entry.changeType)}</strong>
                <span className="text-xs text-textMuted">{formatDateTime(entry.changedAt)}</span>
              </div>
              <p className="mt-2 break-words text-sm text-textBody">
                {entry.previousReference ? <><span className="line-through text-textMuted">{entry.previousReference}</span><span aria-hidden> → </span></> : null}
                <span className="font-semibold">{entry.newReference || 'No filing reference'}</span>
              </p>
              {entry.changeReason ? <p className="mt-2 text-xs leading-5 text-textMuted">Reason: {entry.changeReason}</p> : null}
            </article>
          ))}
        </div>
      </Modal>
    </>
  )
}
