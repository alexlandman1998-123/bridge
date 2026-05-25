import { ChevronDown, ChevronRight } from 'lucide-react'
import RequirementCard from './RequirementCard'

function DocumentPackSection({
  pack = {},
  expanded = false,
  onToggle = null,
  uploadingDocumentKey = '',
  openingDocumentPath = '',
  onUpload = null,
  onOpenDocument = null,
}) {
  const requirements = Array.isArray(pack.requirements) ? pack.requirements : []
  return (
    <section className="rounded-[22px] border border-[#dbe5ef] bg-white shadow-[0_14px_32px_rgba(15,23,42,0.05)]">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full flex-col gap-4 px-4 py-4 text-left sm:flex-row sm:items-center sm:justify-between"
        aria-expanded={expanded}
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {expanded ? <ChevronDown size={18} className="text-[#35546c]" /> : <ChevronRight size={18} className="text-[#35546c]" />}
            <h3 className="text-base font-semibold tracking-[-0.02em] text-[#142132]">{pack.displayLabel}</h3>
          </div>
          <p className="mt-1 pl-7 text-sm leading-6 text-[#6b7d93]">{pack.description}</p>
        </div>
        <div className="grid min-w-[260px] grid-cols-4 gap-2 text-center">
          <div className="rounded-[14px] border border-[#dbe5ef] bg-[#f8fbff] px-2 py-2">
            <p className="text-sm font-semibold text-[#142132]">{pack.percentComplete ?? 0}%</p>
            <p className="text-[0.68rem] uppercase tracking-[0.08em] text-[#7b8ca2]">Ready</p>
          </div>
          <div className="rounded-[14px] border border-[#dbe5ef] bg-white px-2 py-2">
            <p className="text-sm font-semibold text-[#142132]">{pack.completedCount || 0}</p>
            <p className="text-[0.68rem] uppercase tracking-[0.08em] text-[#7b8ca2]">Done</p>
          </div>
          <div className="rounded-[14px] border border-[#f7d6b7] bg-[#fff7ed] px-2 py-2">
            <p className="text-sm font-semibold text-[#9a4d00]">{pack.missingCount || 0}</p>
            <p className="text-[0.68rem] uppercase tracking-[0.08em] text-[#9a4d00]">Missing</p>
          </div>
          <div className="rounded-[14px] border border-[#f4b7b7] bg-[#fff1f1] px-2 py-2">
            <p className="text-sm font-semibold text-[#b42318]">{pack.blockerCount || 0}</p>
            <p className="text-[0.68rem] uppercase tracking-[0.08em] text-[#b42318]">Blockers</p>
          </div>
        </div>
      </button>
      {expanded ? (
        <div className="border-t border-[#e3ebf4] bg-[#fbfdff] px-4 py-4">
          <div className="grid gap-3">
            {requirements.map((requirement) => (
              <RequirementCard
                key={requirement.id}
                requirement={requirement}
                uploadingDocumentKey={uploadingDocumentKey}
                openingDocumentPath={openingDocumentPath}
                onUpload={onUpload}
                onOpenDocument={onOpenDocument}
              />
            ))}
          </div>
        </div>
      ) : null}
    </section>
  )
}

export default DocumentPackSection
