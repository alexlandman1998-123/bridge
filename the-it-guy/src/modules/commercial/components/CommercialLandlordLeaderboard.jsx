import { formatNumber } from '../commercialFormatters'

function CommercialLandlordLeaderboard({ rows = [] }) {
  return (
    <section className="h-full rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_14px_34px_rgba(15,23,42,0.045)]">
      <h2 className="text-lg font-semibold tracking-[-0.035em] text-[#102236]">Top Landlords By GLA</h2>
      <p className="mt-1 text-sm leading-6 text-slate-500">Portfolio concentration and vacancy exposure.</p>

      <div className="mt-5 space-y-3">
        {rows.length ? rows.map((row, index) => (
          <div key={row.id} className="rounded-2xl border border-slate-200 bg-[#fbfcfe] p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[#102236]">
                  <span className="mr-2 text-slate-400">#{index + 1}</span>{row.name}
                </p>
                <p className="mt-1 text-xs text-slate-500">{row.properties} properties · {formatNumber(row.available, 'm²')} exposed</p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-sm font-semibold text-[#102236]">{formatNumber(row.gla, 'm²')}</p>
                <p className="text-xs text-slate-500">{row.vacancyRate}% vacant</p>
              </div>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-[#0f5f9f]" style={{ width: `${Math.min(100, row.vacancyRate)}%` }} />
            </div>
          </div>
        )) : (
          <p className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
            Landlord rankings will appear once commercial properties are linked to landlords.
          </p>
        )}
      </div>
    </section>
  )
}

export default CommercialLandlordLeaderboard
