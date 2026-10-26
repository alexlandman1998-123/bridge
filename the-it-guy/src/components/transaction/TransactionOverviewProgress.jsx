import { Activity, Banknote, ChevronRight, Landmark } from 'lucide-react'
import { selectImmediateWorkflow } from '../../core/transactions/overviewWorkflowProgress.js'

const STATUS = {
  complete: { label: 'Complete', tone: 'bg-emerald-50 text-emerald-700', dot: 'bg-emerald-600' },
  waiting: { label: 'Waiting', tone: 'bg-amber-50 text-amber-700', dot: 'bg-amber-500' },
  blocked: { label: 'Needs attention', tone: 'bg-amber-50 text-amber-700', dot: 'bg-amber-500' },
  in_progress: { label: 'In progress', tone: 'bg-blue-50 text-blue-700', dot: 'bg-blue-500' },
  pending: { label: 'Pending', tone: 'bg-slate-100 text-slate-500', dot: 'bg-slate-400' },
  unknown: { label: 'Unknown', tone: 'bg-slate-100 text-slate-500', dot: 'bg-slate-300' },
}

export default function TransactionOverviewProgress({ workflows = [], dealSummary, loading = false, onOpenWorkspace }) {
  const panel = 'min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm'
  const immediate = selectImmediateWorkflow(workflows)
  const status = STATUS[immediate.status] || STATUS.unknown
  const targetLabel = { deal_setup: 'Deal Setup', finance: 'Finance', transfer: 'Conveyancing' }[immediate.target]
  return <section className="grid items-stretch gap-4 xl:grid-cols-2" aria-label="Transaction progress and deal summary">
    <article data-overview-panel="progress" aria-busy={loading} className="flex min-h-[232px] min-w-0 flex-col rounded-2xl border border-[#124b38] bg-[#124b38] p-5 shadow-sm">
      <header className="flex items-center justify-between gap-3"><h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-emerald-100"><span className="rounded-full bg-white/15 p-2"><Activity size={16} aria-hidden="true" /></span>Current progress</h2><span className={`rounded-md px-2 py-1 text-[11px] font-medium ${status.tone}`}>{loading ? 'Loading' : status.label}</span></header>
      <div className="flex flex-1 flex-col justify-center py-4"><h3 className="text-xl font-semibold leading-7 tracking-tight text-white">{loading ? 'Loading saved progress…' : immediate.detail}</h3>{!loading ? <p className="mt-2 text-sm text-emerald-100">{immediate.label}{immediate.owner ? ` · ${immediate.owner}` : ''}{immediate.note ? ` · ${immediate.note}` : ''}</p> : null}</div>
      {targetLabel && onOpenWorkspace ? <button type="button" disabled={loading} onClick={() => onOpenWorkspace(immediate.target)} className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-[#124b38] transition hover:bg-emerald-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:opacity-50">Open {targetLabel}<ChevronRight size={15} aria-hidden="true" /></button> : null}
    </article>
    <article data-overview-panel="summary" className={`${panel} flex flex-col`}>
      <h2 className="text-base font-semibold text-slate-950">Deal Summary</h2>
      <div className="flex flex-1 flex-col justify-center py-5"><span className="text-xs font-medium text-slate-500">Purchase price</span><strong className="mt-2 break-words text-3xl font-semibold tracking-tight text-emerald-800">{dealSummary?.purchasePriceLabel || 'Not captured'}</strong></div>
      <dl className="flex gap-4 border-t border-slate-100 pt-4">
        <div className="min-w-0 flex-1"><dt className="flex items-center gap-2 text-xs text-slate-500"><Banknote size={15} className="text-emerald-700" aria-hidden="true" />Finance type</dt><dd className="mt-2 text-sm font-semibold text-slate-800">{dealSummary?.financeTypeLabel || 'Not captured'}</dd></div>
        <div className="min-w-0 flex-1 border-l border-slate-100 pl-4"><dt className="flex items-center gap-2 text-xs text-slate-500"><Landmark size={15} className="text-emerald-700" aria-hidden="true" />Existing bond</dt><dd className="mt-2 text-sm font-semibold text-slate-800">{dealSummary?.existingBondLabel || 'Not confirmed'}</dd></div>
      </dl>
    </article>
  </section>
}
