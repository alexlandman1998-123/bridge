import { ArrowRight, CircleCheck, CircleDotDashed } from 'lucide-react'
import { financeTypeShortLabel } from '../core/transactions/financeType'
import { getLifecycleStatus } from '../lib/stages'

function UnitCardsView({ rows, onCardClick }) {
  return (
    <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-3" aria-label="Unit cards view">
      {rows.map((row) => {
        const lifecycle = getLifecycleStatus(row.stage)
        const uploadedCount = row.documentSummary?.uploadedCount || 0
        const totalRequired = row.documentSummary?.totalRequired || 0
        const completionPercent = totalRequired ? Math.round((uploadedCount / totalRequired) * 100) : 0
        const progressWidth = Math.max(completionPercent, 10)

        return (
          <article
            key={row.unit.id}
            className="group flex flex-col gap-5 rounded-[24px] border border-[#dfe7f1] bg-white p-5 shadow-[0_12px_28px_rgba(15,23,42,0.08)] transition duration-150 ease-out hover:-translate-y-[2px] hover:border-[#ccd6e3] hover:shadow-[0_20px_40px_rgba(15,23,42,0.12)]"
            onClick={() => onCardClick(row.unit.id, row.unit.unit_number)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                onCardClick(row.unit.id, row.unit.unit_number)
              }
            }}
            tabIndex={0}
            role="button"
          >
            <div className="rounded-[18px] border border-[#e0e6f2] bg-[#f8fbff] p-4">
              <p className="text-sm uppercase tracking-[0.2em] text-[#6c7c96]">{row.development?.name || 'Unknown Development'}</p>
              <div className="mt-2 flex items-center gap-2 text-lg font-semibold text-[#142132]">
                <span>Unit {row.unit.unit_number}</span>
                <span className="inline-flex items-center rounded-full border border-[#dde4ee] bg-white px-3 py-1 text-xs font-semibold text-[#51657c]">
                  {lifecycle}
                </span>
              </div>
              <p className="mt-1 text-sm text-[#6b7d93]">
                {row.transaction?.transaction_reference || `TRX-${String(row.unit.id).slice(0, 6)}`}
              </p>
            </div>

            <header className="flex flex-col gap-3">
              <strong className="text-[1.1rem] font-semibold text-[#142132]">{row.buyer?.name || 'Buyer pending'}</strong>
              <div className="inline-flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center rounded-full border border-[#e2e8f0] bg-[#f8fafc] px-3 py-1 text-[0.72rem] font-semibold text-[#4f647a]">
                  {financeTypeShortLabel(row.transaction?.finance_type) || 'Finance not set'}
                </span>
                <span className="inline-flex items-center rounded-full border border-[#e2e8f0] bg-[#f8fafc] px-3 py-1 text-[0.72rem] font-semibold text-[#4f647a]">
                  {row.transaction?.attorney || 'Attorney pending'}
                </span>
              </div>
            </header>

            <div className="grid gap-3">
              <article className="rounded-[16px] border border-[#edf0f3] bg-[#fbfcfe] px-3 py-3 text-sm">
                <span className="text-[0.72rem] uppercase tracking-[0.12em] text-[#7b8ca2]">Current Stage</span>
                <p className="mt-1 font-semibold text-[#142132]">{row.stage || 'Stage pending'}</p>
              </article>
              <article className="rounded-[16px] border border-[#edf0f3] bg-[#fbfcfe] px-3 py-3 text-sm">
                <span className="text-[0.72rem] uppercase tracking-[0.12em] text-[#7b8ca2]">Documents</span>
                <p className="mt-1 font-semibold text-[#142132]">
                  {uploadedCount} / {totalRequired || 8}
                </p>
              </article>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-[0.78rem] font-semibold uppercase tracking-[0.12em] text-[#70839a]">
                <span>Progress</span>
                <span>{completionPercent}%</span>
              </div>
              <div className="h-2 w-full rounded-full bg-[#edf2f7]" aria-hidden>
                <span
                  className="block h-full rounded-full bg-gradient-to-r from-[#35546c] via-[#5d7aa5] to-[#7da3d3]"
                  style={{ width: `${progressWidth}%` }}
                />
              </div>
            </div>

            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1 text-sm font-semibold text-[#35546c] transition group-hover:gap-2">
                Open Unit
                <ArrowRight size={14} />
              </span>
              {uploadedCount > 0 && uploadedCount === totalRequired ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-[#d0e9d5] bg-[#ecf9f1] px-3 py-1 text-[0.72rem] font-semibold text-[#1e7a46]">
                  <CircleCheck size={14} />
                  Checklist complete
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-[#f3d7a8] bg-[#fff8ed] px-3 py-1 text-[0.72rem] font-semibold text-[#9a5b0f]">
                  <CircleDotDashed size={14} />
                  Documents pending
                </span>
              )}
            </div>
          </article>
        )
      })}

      {!rows.length ? <p className="text-sm text-[#6b7d93]">No units found for this development.</p> : null}
    </section>
  )
}

export default UnitCardsView
