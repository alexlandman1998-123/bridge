import { ArrowRight, FolderKanban } from 'lucide-react'

export default function DevelopmentListingIndexCard({ card, onOpen }) {
  return (
    <article
      style={{ contentVisibility: 'auto', containIntrinsicSize: '0 380px' }}
      onClick={onOpen}
      className="group cursor-pointer overflow-hidden rounded-[20px] border border-[#dce6f2] bg-white shadow-[0_8px_24px_rgba(15,23,42,0.06)] transition hover:-translate-y-0.5 hover:shadow-[0_14px_30px_rgba(15,23,42,0.1)]"
    >
      <div className="relative h-[170px] overflow-hidden border-b border-[#e5edf6] bg-white">
        <div className="absolute left-4 top-4 inline-flex items-center gap-2 rounded-full border border-[#dce6f2] bg-[#f8fbff] px-3 py-1 text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#35546c]">
          <FolderKanban size={14} />
          Development Workspace
        </div>
        <div className="absolute bottom-4 left-4 right-4">
          <p className="text-[1.08rem] font-semibold text-[#142132]">{card.name}</p>
          <p className="mt-1 text-sm text-[#60758c]">{card.location}</p>
        </div>
      </div>

      <div className="space-y-4 p-4">
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-[14px] border border-[#dce6f2] bg-[#fbfdff] p-3">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Units</p>
            <p className="mt-2 text-lg font-semibold text-[#142132]">{card.totalUnits}</p>
          </div>
          <div className="rounded-[14px] border border-[#dce6f2] bg-[#fbfdff] p-3">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Available</p>
            <p className="mt-2 text-lg font-semibold text-[#142132]">{card.unitsAvailable}</p>
          </div>
          <div className="rounded-[14px] border border-[#dce6f2] bg-[#fbfdff] p-3">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Sold / Reserved</p>
            <p className="mt-2 text-lg font-semibold text-[#142132]">{card.unitsSoldOrReserved}</p>
          </div>
        </div>

        <div className="space-y-2 rounded-[14px] border border-[#dce6f2] bg-[#fbfdff] p-3 text-[0.8rem] text-[#51657b]">
          <p>
            <span className="font-semibold text-[#35546c]">Developer:</span> {card.developer || 'Developer pending'}
          </p>
          <p>
            <span className="font-semibold text-[#35546c]">Assigned agent:</span> {card.assignedAgent || 'Assigned Agent'}
          </p>
          <p>
            <span className="font-semibold text-[#35546c]">Status:</span>{' '}
            {String(card.status || 'draft').replace(/_/g, ' ')}
          </p>
          <p>
            <span className="font-semibold text-[#35546c]">Next action:</span> {card.nextAction}
          </p>
        </div>

        <div className="flex items-center justify-end text-[0.8rem] text-[#6b7d93]">
          <span className="inline-flex items-center gap-1 font-semibold text-[#1f4f78]">
            Open workspace
            <ArrowRight size={14} />
          </span>
        </div>
      </div>
    </article>
  )
}
