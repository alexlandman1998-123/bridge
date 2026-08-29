export default function TransactionsRouteShell() {
  return (
    <section className="flex flex-col gap-6" aria-busy="true" aria-label="Loading transactions">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-page-title font-semibold text-textStrong">Transactions</h1>
          <p className="mt-2 text-sm text-textMuted">Preparing your active deals and transaction progress.</p>
        </div>
        <div className="h-11 w-32 animate-pulse rounded-control bg-slate-200" />
      </header>
      <div className="rounded-[18px] border border-borderDefault bg-white p-5 shadow-panel">
        <div className="flex flex-wrap gap-2">
          {[0, 1, 2, 3, 4].map((item) => (
            <span key={item} className="h-9 w-24 animate-pulse rounded-full bg-slate-100" />
          ))}
        </div>
        <div className="mt-6 space-y-3">
          {[0, 1, 2, 3, 4].map((item) => (
            <div key={item} className="h-16 animate-pulse rounded-[12px] bg-slate-100" />
          ))}
        </div>
      </div>
    </section>
  )
}
