import { Info } from 'lucide-react'
import { WORKFLOW_GATE_LABELS, formatCanonicalLabel } from '../../../../services/documents/canonicalDocumentWorkspaceService'

function RequirementExplanationPanel({ requirement = {} }) {
  const gates = Array.isArray(requirement.stageGates) ? requirement.stageGates : []
  const affects = gates.map((gate) => WORKFLOW_GATE_LABELS[gate] || formatCanonicalLabel(gate)).join(', ')
  const reason = requirement.description || 'This document supports transaction readiness.'

  return (
    <div className="mt-3 rounded-[14px] border border-[#dbe5ef] bg-[#fbfdff] px-3 py-2 text-xs leading-5 text-[#5f738a]">
      <div className="flex items-start gap-2">
        <Info size={14} className="mt-0.5 shrink-0 text-[#35546c]" />
        <p>
          <span className="font-semibold text-[#35546c]">Why we need this: </span>
          {reason}
          {affects ? <span> Affects: {affects}.</span> : null}
        </p>
      </div>
    </div>
  )
}

export default RequirementExplanationPanel
