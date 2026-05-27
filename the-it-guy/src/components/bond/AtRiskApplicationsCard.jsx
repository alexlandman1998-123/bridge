import { Link } from 'react-router-dom'
import BondEmptyState from './BondEmptyState'
import BondRiskBadge from './BondRiskBadge'
import BondSectionCard from './BondSectionCard'

export default function AtRiskApplicationsCard({ rows = [] }) {
  return (
    <BondSectionCard
      eyebrow="Operational Row"
      title="At-Risk Applications"
      description="Files with ageing feedback, missing documents, stalled grant handoff, or unresolved compliance pressure."
      action={
        <Link to="/applications?queue=overdue_applications" className="text-sm font-semibold text-[#204b84] hover:text-[#17324d]">
          View all
        </Link>
      }
    >
      <div className="space-y-3">
        {rows.length ? (
          rows.map((row) => (
            <Link
              key={`${row.transactionId}-${row.client}`}
              to={row.transactionId ? `/transactions/${row.transactionId}` : '/applications'}
              className="block rounded-[18px] border border-[#edf2f7] bg-[#fbfdff] px-3 py-3 transition hover:border-[#d6e2ee]"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-[#142132]">{row.reason}</p>
                  <p className="mt-1 text-sm text-[#5f7287]">{row.client}</p>
                </div>
                <BondRiskBadge
                  status={row.daysOverdue > 0 ? 'overdue' : 'watch'}
                  overdueDays={row.daysOverdue}
                  label={row.daysOverdue > 0 ? `${row.daysOverdue}d overdue` : 'Needs action'}
                />
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-[#71869d]">
                <span>{row.bank}</span>
                <span>•</span>
                <span>{row.bondValue}</span>
                <span>•</span>
                <span>{row.financeStage}</span>
              </div>
            </Link>
          ))
        ) : (
          <BondEmptyState
            compact
            title="No at-risk applications"
            description="No at-risk applications in the selected reporting window."
          />
        )}
      </div>
    </BondSectionCard>
  )
}
