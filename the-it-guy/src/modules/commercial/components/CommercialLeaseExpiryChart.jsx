import { formatNumber } from '../commercialFormatters'

function CommercialLeaseExpiryChart({ data = [] }) {
  const maxCount = Math.max(1, ...data.map((item) => Number(item.count || 0)))

  return (
    <section className="h-full rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_14px_34px_rgba(15,23,42,0.045)]">
      <h2 className="text-lg font-semibold tracking-[-0.035em] text-[#102236]">Lease Expiry Distribution</h2>
      <p className="mt-1 text-sm leading-6 text-slate-500">Retention risk by expiry horizon.</p>

      <div className="mt-5 flex h-44 items-end gap-3 rounded-2xl border border-slate-100 bg-[#f8fbfd] p-4">
        {data.map((bucket) => {
          const height = Math.max(8, (Number(bucket.count || 0) / maxCount) * 100)
          return (
            <div key={bucket.key} className="flex min-w-0 flex-1 flex-col items-center gap-2">
              <div className="flex h-28 w-full items-end justify-center">
                <div
                  className="w-full max-w-8 rounded-t-xl bg-[linear-gradient(180deg,#0f5f9f,#7cc3d6)]"
                  style={{ height: `${height}%` }}
                  title={`${bucket.count} lease expiries`}
                />
              </div>
              <span className="text-[11px] font-semibold text-slate-500">{bucket.label}</span>
            </div>
          )
        })}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        {data.slice(0, 4).map((bucket) => (
          <div key={`${bucket.key}-metric`} className="rounded-2xl border border-slate-100 bg-slate-50 p-3">
            <p className="text-sm font-semibold text-[#102236]">{bucket.count} leases</p>
            <p className="text-xs text-slate-500">{bucket.label} · {formatNumber(bucket.gla, 'm²')}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

export default CommercialLeaseExpiryChart
