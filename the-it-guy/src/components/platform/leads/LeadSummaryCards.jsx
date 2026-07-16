import { AlertCircle, Inbox, UserRoundCheck, UsersRound } from 'lucide-react'
import { createElement } from 'react'

const CARD_CONFIG = [
  { key: 'total', label: 'All intake leads', helper: 'Complete new-business pipeline', icon: UsersRound },
  { key: 'new', label: 'New', helper: 'Waiting for first review', icon: Inbox },
  { key: 'unassigned', label: 'Unassigned', helper: 'Needs an internal owner', icon: UserRoundCheck },
  { key: 'overdue', label: 'Follow-up overdue', helper: 'Past the next-action date', icon: AlertCircle },
]

export function LeadSummaryCards({ summary }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Lead pipeline summary">
      {CARD_CONFIG.map(({ key, label, helper, icon }) => (
        <article key={key} className="rounded-[18px] border border-[#e1e8ef] bg-white px-5 py-4 shadow-[0_16px_40px_rgba(23,42,58,0.045)]">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[0.72rem] font-medium uppercase tracking-[0.08em] text-[#6b7d8f]">{label}</p>
              <p className="mt-2 text-[1.7rem] font-semibold tracking-[-0.045em] text-[#132535]">{summary?.[key] || 0}</p>
            </div>
            <span className={`grid h-9 w-9 place-items-center rounded-[12px] ${key === 'overdue' ? 'bg-[#fff3ec] text-[#a34b1d]' : 'bg-[#edf8f3] text-[#176149]'}`}>
              {createElement(icon, { className: 'h-[17px] w-[17px]', 'aria-hidden': true })}
            </span>
          </div>
          <p className="mt-2 text-xs font-medium text-[#83919e]">{helper}</p>
        </article>
      ))}
    </div>
  )
}
