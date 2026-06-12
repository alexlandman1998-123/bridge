import { formatDate, formatNumber } from '../commercialFormatters'

function riskClass(risk) {
  if (risk === 'High') return 'bg-rose-50 text-rose-700 border-rose-100'
  if (risk === 'Medium') return 'bg-amber-50 text-amber-700 border-amber-100'
  return 'bg-emerald-50 text-emerald-700 border-emerald-100'
}

function CommercialExpiryTable({ rows = [] }) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_14px_34px_rgba(15,23,42,0.045)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold tracking-[-0.035em] text-[#102236]">Lease Expiry Watchlist</h2>
          <p className="mt-1 text-sm leading-6 text-slate-500">Retention risk by tenant, property and expiry horizon.</p>
        </div>
        <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-500">{rows.length} tracked</span>
      </div>

      <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200">
        <div className="grid grid-cols-[1.2fr_1.2fr_0.7fr_0.9fr_0.8fr_0.8fr_1fr] gap-3 bg-slate-50 px-4 py-3 text-xs font-semibold uppercase tracking-[0.1em] text-slate-400 max-xl:hidden">
          <span>Tenant</span>
          <span>Property</span>
          <span>GLA</span>
          <span>Expiry</span>
          <span>Days</span>
          <span>Risk</span>
          <span>Broker</span>
        </div>
        <div className="divide-y divide-slate-200">
          {rows.length ? rows.map((row) => (
            <div key={row.id} className="grid gap-3 px-4 py-4 text-sm text-slate-600 xl:grid-cols-[1.2fr_1.2fr_0.7fr_0.9fr_0.8fr_0.8fr_1fr] xl:items-center">
              <p className="font-semibold text-[#102236]">{row.tenant}</p>
              <p>{row.property}</p>
              <p>{formatNumber(row.gla, 'm²')}</p>
              <p>{formatDate(row.leaseExpiry)}</p>
              <p>{row.daysToExpiry} days</p>
              <p><span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${riskClass(row.risk)}`}>{row.risk}</span></p>
              <p>{row.assignedBroker}</p>
            </div>
          )) : (
            <div className="p-6 text-sm text-slate-500">
              No lease expiry exposure is currently visible in the next 24 months.
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

export default CommercialExpiryTable
