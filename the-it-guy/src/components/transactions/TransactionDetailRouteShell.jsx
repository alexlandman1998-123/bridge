export default function TransactionDetailRouteShell() {
  return (
    <section className="min-w-0 space-y-5" aria-busy="true" aria-label="Loading transaction workspace">
      <span className="sr-only" role="status">Opening matter workspace</span>
      <header aria-hidden="true" className="flex min-h-[385px] flex-col justify-between rounded-[24px] border border-[#dbe7f2] bg-slate-100 p-6 md:min-h-[405px]">
        <div className="h-11 w-44 rounded-[13px] bg-slate-200" />
        <div className="space-y-4">
          <div className="h-3 w-32 rounded-full bg-slate-200" />
          <div className="h-10 w-80 max-w-full rounded-[10px] bg-slate-200" />
          <div className="h-5 w-64 max-w-full rounded-full bg-slate-200" />
          <div className="grid grid-cols-2 gap-5 pt-3 md:grid-cols-4">
            {[0, 1, 2, 3].map(item => <div key={item} className="h-12 rounded-lg bg-slate-200" />)}
          </div>
        </div>
      </header>
      <div aria-hidden="true" className="flex gap-4 overflow-hidden rounded-[20px] border border-[#dbe7f2] bg-white p-5">
        {[0, 1, 2, 3, 4, 5].map(item => <div key={item} className="h-24 min-w-32 flex-1 rounded-lg bg-slate-100" />)}
      </div>
      <div aria-hidden="true" className="h-16 rounded-[20px] border border-[#dbe7f2] bg-white" />
      <div aria-hidden="true" className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        {[0, 1].map((item) => (
          <article key={item} className="min-h-56 rounded-[20px] border border-[#dbe7f2] bg-white p-5 shadow-[0_12px_34px_rgba(31,54,78,0.04)]">
            <div className="h-5 w-36 animate-pulse rounded-full bg-[#e3eaf1]" />
            <div className="mt-5 space-y-3">
              {[0, 1, 2, 3].map((line) => <div key={line} className="h-11 animate-pulse rounded-[12px] bg-[#f1f5f8]" />)}
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}
