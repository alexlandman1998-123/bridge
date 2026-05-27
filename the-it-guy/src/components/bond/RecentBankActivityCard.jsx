import { Link } from 'react-router-dom'
import BondEmptyState from './BondEmptyState'
import BondSectionCard from './BondSectionCard'

const TONE_CLASS_BY_KEY = Object.freeze({
  success: 'bg-[#1e8a55]',
  warning: 'bg-[#b26c12]',
  info: 'bg-[#2f5f95]',
})

export default function RecentBankActivityCard({ rows = [] }) {
  return (
    <BondSectionCard
      eyebrow="Operational Row"
      title="Recent Bank Activity"
      description="A compact feed of lender responses, queries, submissions, and approvals coming back into the desk."
      action={
        <Link to="/banks?view=submissions" className="text-sm font-semibold text-[#204b84] hover:text-[#17324d]">
          View all
        </Link>
      }
    >
      <div className="space-y-3">
        {rows.length ? (
          rows.map((row) => (
            <div key={`${row.transactionId}-${row.bank}`} className="rounded-[18px] border border-[#edf2f7] bg-[#fbfdff] px-3 py-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-[#142132]">{row.bank}</p>
                  <p className="mt-1 text-sm leading-6 text-[#5f7287]">{row.action}</p>
                </div>
                <span className={`mt-1 h-2.5 w-2.5 rounded-full ${TONE_CLASS_BY_KEY[row.statusTone] || TONE_CLASS_BY_KEY.info}`.trim()} />
              </div>
              <div className="mt-3 flex items-center justify-between gap-3 text-xs text-[#71869d]">
                <span>{row.client}</span>
                <span>{row.timeLabel}</span>
              </div>
              <p className="mt-2 text-xs font-semibold uppercase tracking-[0.16em] text-[#7d90a5]">{row.statusLabel}</p>
            </div>
          ))
        ) : (
          <BondEmptyState
            compact
            title="No bank responses yet"
            description="Bank updates will appear here as files move through lender review."
          />
        )}
      </div>
    </BondSectionCard>
  )
}
