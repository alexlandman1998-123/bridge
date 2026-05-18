function CommercialActivitySnapshot({ items = [] }) {
  return (
    <section className="h-full rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_14px_34px_rgba(15,23,42,0.045)]">
      <h2 className="text-lg font-semibold tracking-[-0.035em] text-[#102236]">Activity Snapshot</h2>
      <p className="mt-1 text-sm leading-6 text-slate-500">Operational pulse across demand, vacancies, HOT and leases.</p>

      <div className="mt-5 grid gap-3">
        {items.map((item) => (
          <div key={item.label} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-[#fbfcfe] p-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-[#102236]">{item.label}</p>
              <p className="mt-1 text-xs text-slate-500">{item.detail}</p>
            </div>
            <p className="shrink-0 text-2xl font-semibold tracking-[-0.045em] text-[#0f5f9f]">{item.value}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

export default CommercialActivitySnapshot
