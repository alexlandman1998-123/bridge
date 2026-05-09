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

function AttorneyAssignmentSummaryCard({ assignment, onEdit, onRemove, busy = false }) {
  return (
    <article className="rounded-control border border-borderSoft bg-surfaceAlt p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-textStrong">{getAssignmentTypeLabel(assignment.assignmentType)}</p>
          <p className="mt-1 text-xs text-textMuted">Last updated {assignment.updatedAt ? new Date(assignment.updatedAt).toLocaleString() : '—'}</p>
        </div>
        <AttorneyAssignmentStatusBadge status={assignment.status} />
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <Row label="Firm" value={assignment.firm?.name || 'Not assigned'} />
        <Row label="Department" value={assignment.department?.name || 'Not assigned'} />
        <Row label="Primary Attorney" value={assignment.primaryAttorney?.name || assignment.primaryAttorney?.email || 'Not assigned'} />
        <Row label="Secretary" value={assignment.secretary?.name || assignment.secretary?.email || 'Not assigned'} />
        <Row label="Admin Handler" value={assignment.adminHandler?.name || assignment.adminHandler?.email || 'Not assigned'} />
      </div>

      {onEdit || onRemove ? (
        <div className="mt-4 flex flex-wrap gap-2">
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
