function CommercialKpiCard({ label, value, context, trend, icon: Icon, tone = 'blue' }) {
  const toneClasses = {
    blue: 'bg-[#eef6ff] text-[#0f5f9f]',
    green: 'bg-[#eafaf2] text-[#0f8d63]',
    amber: 'bg-[#fff6e8] text-[#b96f12]',
    rose: 'bg-[#fff1f2] text-[#be123c]',
    slate: 'bg-[#eef2f7] text-[#475569]',
    indigo: 'bg-[#eef2ff] text-[#4f46e5]',
  }

  return (
    <article className="min-h-[148px] rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_14px_34px_rgba(15,23,42,0.045)]">
      <div className="flex items-start justify-between gap-3">
        <div className={`flex h-11 w-11 items-center justify-center rounded-2xl ${toneClasses[tone] || toneClasses.blue}`}>
          {Icon ? <Icon size={20} /> : null}
        </div>
        {trend ? (
          <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.09em] text-slate-500">
            {trend}
          </span>
        ) : null}
      </div>
      <p className="mt-4 text-2xl font-semibold tracking-[-0.045em] text-[#0b1f33]">{value}</p>
      <p className="mt-1 text-sm font-semibold text-[#24364a]">{label}</p>
      <p className="mt-1 text-xs leading-5 text-slate-500">{context}</p>
    </article>
  )
}

export default CommercialKpiCard
