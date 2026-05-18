import { createElement } from 'react'

function CommercialStatCard({ icon, label, value, supportingText, tone = 'blue' }) {
  const tones = {
    blue: 'bg-[#eef5fb] text-[#1f5a80]',
    green: 'bg-[#ecfdf5] text-[#08704c]',
    amber: 'bg-[#fff7ed] text-[#b45309]',
    slate: 'bg-slate-100 text-slate-600',
  }

  return (
    <article className="min-h-[132px] rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_14px_34px_rgba(15,23,42,0.045)]">
      <div className="flex items-start justify-between gap-3">
        <span className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${tones[tone] || tones.blue}`}>
          {createElement(icon, { size: 19 })}
        </span>
        <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-slate-500">
          Ready
        </span>
      </div>
      <p className="mt-4 text-2xl font-semibold tracking-[-0.045em] text-[#102236]">{value}</p>
      <p className="mt-1 text-sm font-semibold text-slate-700">{label}</p>
      <p className="mt-1 text-xs leading-5 text-slate-500">{supportingText}</p>
    </article>
  )
}

export default CommercialStatCard
