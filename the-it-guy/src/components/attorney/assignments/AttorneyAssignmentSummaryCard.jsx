import { useState } from 'react'
import { getAssignmentTypeLabel } from '../../../services/transactionAttorneyAssignments'
import AttorneyAssignmentStatusBadge from './AttorneyAssignmentStatusBadge'

function Row({ label, value }) {
  return (
    <div className="grid gap-1">
      <span className="text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">{label}</span>
      <span className="text-sm font-medium text-[#1d2d3d]">{value || '—'}</span>
    </div>
  )
}

function matterReferenceLabel(assignment = {}) {
  if (assignment.attorneyRole === 'bond_attorney' || assignment.assignmentType === 'bond') return 'Bond Matter No'
  if (assignment.attorneyRole === 'cancellation_attorney' || assignment.assignmentType === 'cancellation') return 'Cancellation Matter No'
  return 'Transfer Matter No'
}

function AttorneyAssignmentSummaryCard({
  assignment,
  onEdit,
  onRemove,
  onUpdateMatterReference,
  canEditMatterReference = false,
  busy = false,
}) {
  const [editingMatterReference, setEditingMatterReference] = useState(false)
  const [matterReferenceValue, setMatterReferenceValue] = useState(assignment.matterReference || '')
  const [matterReferenceReason, setMatterReferenceReason] = useState('')
  const [savingMatterReference, setSavingMatterReference] = useState(false)
  const [matterReferenceError, setMatterReferenceError] = useState('')

  async function handleMatterReferenceSubmit(event) {
    event.preventDefault()
    if (!onUpdateMatterReference) return
    setSavingMatterReference(true)
    setMatterReferenceError('')
    try {
      const saved = await onUpdateMatterReference(assignment, {
        matterReference: matterReferenceValue,
        reason: matterReferenceReason,
        source: 'partner_portal',
      })
      setMatterReferenceValue(saved?.matterReference || matterReferenceValue || '')
      setMatterReferenceReason('')
      setEditingMatterReference(false)
    } catch (error) {
      setMatterReferenceError(error?.message || 'Unable to update matter number.')
    } finally {
      setSavingMatterReference(false)
    }
  }

  return (
    <article className="rounded-control border border-borderSoft bg-surfaceAlt p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-textStrong">{getAssignmentTypeLabel(assignment.assignmentType)}</p>
          <p className="mt-1 text-xs text-textMuted">
            {assignment.isPrimary ? 'Primary' : 'Supporting'} • Last updated {assignment.updatedAt ? new Date(assignment.updatedAt).toLocaleString() : '—'}
          </p>
        </div>
        <AttorneyAssignmentStatusBadge status={assignment.status} />
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <Row label="Firm" value={assignment.firm?.name || 'Not assigned'} />
        <Row label="Department" value={assignment.department?.name || 'Not assigned'} />
        <Row
          label={assignment.isPrimary ? 'Primary Attorney' : 'Supporting Attorney'}
          value={assignment.attorneyUser?.name || assignment.attorneyUser?.email || assignment.primaryAttorney?.name || assignment.primaryAttorney?.email || 'Not assigned'}
        />
        <Row label="Secretary" value={assignment.secretary?.name || assignment.secretary?.email || 'Not assigned'} />
        <Row label="Admin Handler" value={assignment.adminHandler?.name || assignment.adminHandler?.email || 'Not assigned'} />
        <Row label={matterReferenceLabel(assignment)} value={assignment.matterReference || 'Not captured'} />
      </div>

      {editingMatterReference ? (
        <form className="mt-4 rounded-control border border-borderSoft bg-surface p-3" onSubmit={handleMatterReferenceSubmit}>
          <div className="grid gap-2 md:grid-cols-2">
            <label className="flex flex-col gap-1.5">
              <span className="text-label font-semibold uppercase text-textMuted">{matterReferenceLabel(assignment)}</span>
              <input
                className="input"
                value={matterReferenceValue}
                onChange={(event) => setMatterReferenceValue(event.target.value)}
                disabled={savingMatterReference}
                autoFocus
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-label font-semibold uppercase text-textMuted">Audit Reason</span>
              <input
                className="input"
                value={matterReferenceReason}
                onChange={(event) => setMatterReferenceReason(event.target.value)}
                disabled={savingMatterReference}
                required
              />
            </label>
          </div>
          {matterReferenceError ? <p className="mt-2 text-sm text-danger">{matterReferenceError}</p> : null}
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="submit" className="header-primary-cta" disabled={savingMatterReference || busy}>
              {savingMatterReference ? 'Saving…' : 'Save Matter No'}
            </button>
            <button
              type="button"
              className="header-secondary-cta"
              onClick={() => {
                setMatterReferenceValue(assignment.matterReference || '')
                setMatterReferenceReason('')
                setMatterReferenceError('')
                setEditingMatterReference(false)
              }}
              disabled={savingMatterReference}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : null}

      {onEdit || onRemove || canEditMatterReference ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {canEditMatterReference && !editingMatterReference ? (
            <button
              type="button"
              className="header-secondary-cta"
              onClick={() => {
                setMatterReferenceValue(assignment.matterReference || '')
                setMatterReferenceReason('')
                setMatterReferenceError('')
                setEditingMatterReference(true)
              }}
              disabled={busy || savingMatterReference}
            >
              Edit Matter No
            </button>
          ) : null}
          {onEdit ? (
            <button type="button" className="header-secondary-cta" onClick={onEdit} disabled={busy}>
              Update Assignment
            </button>
          ) : null}
          {onRemove ? (
            <button
              type="button"
              className="header-secondary-cta"
              style={{ borderColor: '#f3d5d9', color: '#b42318' }}
              onClick={onRemove}
              disabled={busy}
            >
              Remove Assignment
            </button>
          ) : null}
        </div>
      ) : null}
    </article>
  )
}

export default AttorneyAssignmentSummaryCard
