function AttorneyKpiCard({ icon: Icon, label, value, helperText = '', trendText = '' }) {
  return (
    <div className="grid min-h-[128px] gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</p>
        {Icon ? (
          <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl bg-slate-50 text-slate-500">
            <Icon size={17} />
          </span>
        ) : null}
      </div>
      <p className="text-3xl font-semibold leading-none text-slate-950">{value}</p>
      {helperText ? <p className="text-sm text-slate-600">{helperText}</p> : null}
      {trendText ? <p className="text-sm text-slate-500">{trendText}</p> : null}
    </div>
  )
}

export default AttorneyKpiCard
