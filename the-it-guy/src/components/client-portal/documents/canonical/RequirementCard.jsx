import { CalendarClock, UserRound } from 'lucide-react'
import { WORKFLOW_GATE_LABELS, formatCanonicalLabel } from '../../../../services/documents/canonicalDocumentWorkspaceService'
import RequirementBlockerBadge from './RequirementBlockerBadge'
import RequirementExplanationPanel from './RequirementExplanationPanel'
import RequirementReviewState from './RequirementReviewState'
import RequirementStatusBadge from './RequirementStatusBadge'
import RequirementUploadArea from './RequirementUploadArea'

function formatDate(value = '') {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString('en-ZA')
}

function RequirementCard({
  requirement = {},
  uploadingDocumentKey = '',
  openingDocumentPath = '',
  onUpload = null,
  onOpenDocument = null,
}) {
  const gates = Array.isArray(requirement.stageGates) ? requirement.stageGates : []
  const expiryDate = formatDate(requirement.expiryDate)

  return (
    <article className={`rounded-[18px] border bg-white p-4 shadow-[0_10px_24px_rgba(15,23,42,0.04)] ${
      requirement.status === 'rejected'
        ? 'border-[#f0b8b8]'
        : requirement.blocksWorkflow || requirement.requirementLevel === 'blocker'
          ? 'border-[#f2c6a0]'
          : 'border-[#e3ebf4]'
    }`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-sm font-semibold text-[#142132]">{requirement.title}</h4>
            <RequirementBlockerBadge level={requirement.requirementLevel} blocking={requirement.blocksWorkflow} />
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-[#6b7d93]">
            {requirement.requestedFromRole ? (
              <span className="inline-flex items-center gap-1">
                <UserRound size={13} />
                {formatCanonicalLabel(requirement.requestedFromRole)}
              </span>
            ) : null}
            {gates.length ? (
              <span className="inline-flex items-center gap-1">
                <CalendarClock size={13} />
                {gates.map((gate) => WORKFLOW_GATE_LABELS[gate] || formatCanonicalLabel(gate)).join(', ')}
              </span>
            ) : null}
            {expiryDate ? (
              <span className={requirement.status === 'expired' ? 'font-semibold text-[#b45309]' : ''}>
                Expires {expiryDate}
              </span>
            ) : null}
          </div>
        </div>
        <RequirementStatusBadge status={requirement.status} />
      </div>

      <RequirementExplanationPanel requirement={requirement} />
      <RequirementReviewState requirement={requirement} />
      <RequirementUploadArea
        requirement={requirement}
        uploadingDocumentKey={uploadingDocumentKey}
        openingDocumentPath={openingDocumentPath}
        onUpload={onUpload}
        onOpenDocument={onOpenDocument}
      />
    </article>
  )
}

export default RequirementCard
