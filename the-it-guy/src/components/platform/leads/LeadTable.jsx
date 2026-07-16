import { ArrowRight, CalendarClock, Mail, UserRoundX } from 'lucide-react'
import {
  formatIntakeKind,
  formatLeadDate,
  formatLeadStage,
  getLeadName,
  isLeadOverdue,
  LEAD_STAGE_TONES,
} from '../../../lib/adminIntakeLeadPresentation'

function StageBadge({ stage }) {
  const safeStage = stage || 'new'
  return (
    <span className={`inline-flex min-h-7 items-center rounded-full border px-2.5 text-[0.72rem] font-semibold ${LEAD_STAGE_TONES[safeStage] || LEAD_STAGE_TONES.contacted}`}>
      {formatLeadStage(safeStage)}
    </span>
  )
}

export function LeadTable({ leads, assignees = [], loading, selectedId, onSelect }) {
  return (
    <div className="overflow-hidden rounded-[20px] border border-[#dfe7ee] bg-white shadow-[0_20px_48px_rgba(23,42,58,0.045)]">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] text-left text-sm">
          <thead className="border-b border-[#e9eef3] bg-[#f8fafb] text-[0.7rem] font-medium uppercase tracking-[0.075em] text-[#718293]">
            <tr>
              <th scope="col" className="px-5 py-3.5">Lead</th>
              <th scope="col" className="px-4 py-3.5">Intake</th>
              <th scope="col" className="px-4 py-3.5">Stage</th>
              <th scope="col" className="px-4 py-3.5">Priority</th>
              <th scope="col" className="px-4 py-3.5">Owner</th>
              <th scope="col" className="px-4 py-3.5">Next action</th>
              <th scope="col" className="px-4 py-3.5">Received</th>
              <th scope="col" className="w-14 px-4 py-3.5"><span className="sr-only">View lead</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#edf1f4]">
            {loading ? (
              <tr><td colSpan={8} className="px-5 py-16 text-center text-sm font-medium text-[#748596]">Loading intake leads…</td></tr>
            ) : leads.length ? leads.map((lead) => {
              const overdue = isLeadOverdue(lead)
              const selected = selectedId === lead.id
              const owner = assignees.find((assignee) => assignee.id === lead.assigned_to_user_id)
              return (
                <tr key={lead.id} className={selected ? 'bg-[#f1faf6]' : 'transition-colors hover:bg-[#fafcfd]'}>
                  <td className="px-5 py-4">
                    <button type="button" className="block max-w-[260px] text-left focus:outline-none focus-visible:rounded-md focus-visible:ring-2 focus-visible:ring-[#17805f]" onClick={() => onSelect(lead.id)}>
                      <span className="block truncate font-semibold text-[#172a39]">{getLeadName(lead)}</span>
                      <span className="mt-0.5 block truncate text-xs font-medium text-[#687b8c]">{lead.company || 'Company not supplied'}</span>
                      <span className="mt-1 inline-flex max-w-full items-center gap-1.5 text-[0.72rem] text-[#8795a2]"><Mail className="h-3 w-3 shrink-0" aria-hidden="true" /><span className="truncate">{lead.email}</span></span>
                    </button>
                  </td>
                  <td className="px-4 py-4">
                    <p className="font-medium text-[#344b5c]">{formatIntakeKind(lead.intake_kind)}</p>
                    <p className="mt-1 text-xs text-[#83919e]">{lead.source || 'Direct'}</p>
                  </td>
                  <td className="px-4 py-4"><StageBadge stage={lead.sales_stage} /></td>
                  <td className="px-4 py-4 capitalize text-[#455b6c]">{lead.priority || 'normal'}</td>
                  <td className="px-4 py-4">
                    {lead.assigned_to_user_id ? <span className="text-[#455b6c]">{owner?.name || 'Assigned'}</span> : <span className="inline-flex items-center gap-1.5 text-[#9a5b2a]"><UserRoundX className="h-3.5 w-3.5" aria-hidden="true" />Unassigned</span>}
                  </td>
                  <td className="px-4 py-4">
                    <p className={`max-w-[180px] truncate font-medium ${overdue ? 'text-[#a44625]' : 'text-[#455b6c]'}`}>{lead.next_action || 'Not set'}</p>
                    {lead.next_action_at ? <p className={`mt-1 inline-flex items-center gap-1 text-xs ${overdue ? 'text-[#b34c29]' : 'text-[#83919e]'}`}><CalendarClock className="h-3 w-3" aria-hidden="true" />{formatLeadDate(lead.next_action_at, { includeTime: false })}</p> : null}
                  </td>
                  <td className="px-4 py-4 text-xs font-medium text-[#687b8c]">{formatLeadDate(lead.submitted_at || lead.created_at)}</td>
                  <td className="px-4 py-4">
                    <button type="button" onClick={() => onSelect(lead.id)} aria-label={`View ${getLeadName(lead)}`} className="grid h-9 w-9 place-items-center rounded-full border border-[#dce5eb] text-[#486071] transition hover:border-[#9dcdbb] hover:bg-[#f0faf6] hover:text-[#126148] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#17805f]">
                      <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </td>
                </tr>
              )
            }) : (
              <tr><td colSpan={8} className="px-5 py-16 text-center"><p className="font-semibold text-[#344b5c]">No leads match this view</p><p className="mt-1 text-sm text-[#7c8c99]">Clear or change the filters to widen the result.</p></td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
