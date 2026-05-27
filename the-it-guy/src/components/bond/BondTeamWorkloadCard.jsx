import { Link } from 'react-router-dom'
import BondEmptyState from './BondEmptyState'
import BondSectionCard from './BondSectionCard'

function TeamRow({ row }) {
  return (
    <div className="grid grid-cols-[auto,1fr,repeat(4,minmax(0,64px))] items-center gap-3 rounded-[18px] border border-[#edf2f7] bg-[#fbfdff] px-3 py-3">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#eaf2fb] text-sm font-semibold text-[#17324d]">
        {row.initials}
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-[#142132]">{row.name}</p>
        <p className="text-xs text-[#71869d]">{row.activeApplications} active applications</p>
      </div>
      <div>
        <p className="text-xs uppercase tracking-[0.14em] text-[#7b8ea3]">Active</p>
        <p className="mt-1 text-sm font-semibold text-[#142132]">{row.activeApplications}</p>
      </div>
      <div>
        <p className="text-xs uppercase tracking-[0.14em] text-[#7b8ea3]">Docs</p>
        <p className="mt-1 text-sm font-semibold text-[#142132]">{row.awaitingDocs}</p>
      </div>
      <div>
        <p className="text-xs uppercase tracking-[0.14em] text-[#7b8ea3]">Submitted</p>
        <p className="mt-1 text-sm font-semibold text-[#142132]">{row.submitted}</p>
      </div>
      <div>
        <p className="text-xs uppercase tracking-[0.14em] text-[#7b8ea3]">Overdue</p>
        <p className={`mt-1 text-sm font-semibold ${row.overdue > 0 ? 'text-[#9b394d]' : 'text-[#142132]'}`.trim()}>{row.overdue}</p>
      </div>
    </div>
  )
}

export default function BondTeamWorkloadCard({ title = 'Team Workload', rows = [] }) {
  return (
    <BondSectionCard
      eyebrow="Operational Row"
      title={title}
      description="Who is carrying the book today, where documents are stalling, and which queues are building up."
      action={
        <Link to="/teams?view=consultants" className="text-sm font-semibold text-[#204b84] hover:text-[#17324d]">
          View all
        </Link>
      }
    >
      <div className="space-y-3">
        {rows.length ? rows.map((row) => <TeamRow key={row.key} row={row} />) : (
          <BondEmptyState
            compact
            title="No team workload available"
            description="Team workload will appear here once bond applications are assigned."
          />
        )}
      </div>
    </BondSectionCard>
  )
}
