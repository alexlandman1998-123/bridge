import { useState } from 'react'
import { X } from 'lucide-react'
import DocumentRequirementManager from './DocumentRequirementManager.jsx'

export function documentRemovalRequirementId(row = {}) {
  const requirement = row.requirement || row.requiredDocument || row.original?.requirement || {}
  return row.canonicalRequirementInstanceId || row.canonical_requirement_instance_id
    || requirement.canonicalRequirementInstanceId || requirement.canonical_requirement_instance_id
    || row.raw?.canonical_requirement_instance_id || row.linkedDocument?.canonical_requirement_instance_id
    || row.requirementId || row.requirement_id || requirement.id
    || (row.sharedRequirement || row.source === 'requirement' ? row.id : '')
}

export default function DocumentRequirementRemoveButton({ row = {}, client, contextType, contextId, party, onChange, disabled = false }) {
  if (!client || !contextId) return null
  const label = row.label || row.displayName || row.title || row.name || 'Document'
  const requirementId = documentRemovalRequirementId(row) || `unlinked:${row.id || row.key || label}`
  return <RemovalControl key={`${contextType}:${contextId}:${requirementId}`} {...{ client, contextType, contextId, party, onChange, disabled, label, requirementId }} />
}

function RemovalControl({ client, contextType, contextId, party, onChange, disabled, label, requirementId }) {
  const [open, setOpen] = useState(false)
  return <>
    <button type="button" aria-label={`Mark ${label} as not relevant`} title="Not relevant to this matter" disabled={disabled} onClick={() => setOpen(true)} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#dbe6f2] bg-white text-[#71849a] transition hover:border-[#efcbc8] hover:bg-red-50 hover:text-[#963d35] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#963d35] disabled:opacity-50"><X size={15} /></button>
    {open ? <DocumentRequirementManager client={client} contextType={contextType} contextId={contextId} party={party} onChange={onChange} presentation="dialog" open initialRequirementId={requirementId} documentLabel={label} onClose={() => setOpen(false)} /> : null}
  </>
}
