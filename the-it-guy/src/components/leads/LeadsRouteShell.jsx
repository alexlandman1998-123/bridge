export default function LeadsRouteShell({ detail = false, label = '' }) {
  return (
    <section className="min-w-0 space-y-5" aria-busy="true" aria-label={label || (detail ? 'Loading lead workspace' : 'Loading leads')}>
      <header className="rounded-[22px] border border-[#dbe7f2] bg-white p-6 shadow-[0_16px_42px_rgba(15,23,42,0.05)]">
        <div className="h-3 w-28 animate-pulse rounded-full bg-[#dfe8f1]" />
        <div className="mt-4 h-8 w-72 max-w-full animate-pulse rounded-[10px] bg-[#e8eef4]" />
        <div className="mt-3 h-4 w-96 max-w-full animate-pulse rounded-full bg-[#f0f4f8]" />
        <div className="mt-6 flex gap-3 overflow-hidden">
          {[0, 1, 2, 3, 4].map((item) => <div key={item} className="h-11 w-32 shrink-0 animate-pulse rounded-[12px] bg-[#f0f4f8]" />)}
        </div>
      </header>
      <div className={detail ? 'grid gap-5 xl:grid-cols-[1.1fr_1fr_0.9fr]' : 'grid gap-4 sm:grid-cols-2 xl:grid-cols-4'}>
        {(detail ? [0, 1, 2] : [0, 1, 2, 3]).map((item) => (
          <div key={item} className="min-h-40 rounded-[20px] border border-[#dbe7f2] bg-white p-5 shadow-[0_12px_34px_rgba(15,23,42,0.04)]">
            <div className="h-5 w-32 animate-pulse rounded-full bg-[#e3eaf1]" />
            <div className="mt-5 h-20 animate-pulse rounded-[16px] bg-[#f1f5f8]" />
          </div>
        ))}
      </div>
    </section>
  )
}
