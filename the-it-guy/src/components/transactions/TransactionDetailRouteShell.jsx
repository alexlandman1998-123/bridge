export default function TransactionDetailRouteShell() {
  return (
    <section className="min-w-0 space-y-5" aria-busy="true" aria-label="Loading transaction workspace">
      <header className="rounded-[22px] border border-[#dbe7f2] bg-white p-6 shadow-[0_16px_42px_rgba(15,23,42,0.05)]">
        <div className="h-3 w-32 animate-pulse rounded-full bg-[#dfe8f1]" />
        <div className="mt-4 h-8 w-80 max-w-full animate-pulse rounded-[10px] bg-[#e8eef4]" />
        <div className="mt-3 h-4 w-64 max-w-full animate-pulse rounded-full bg-[#f0f4f8]" />
      </header>
      <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
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
