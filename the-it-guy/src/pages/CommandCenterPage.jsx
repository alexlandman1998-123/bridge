export default function CommandCenterPage() {
  return (
    <section className="min-h-[calc(100vh-140px)] rounded-[32px] border border-slate-200/80 bg-[linear-gradient(145deg,#0f172a_0%,#172033_54%,#263449_100%)] p-6 text-white shadow-[0_24px_80px_rgba(15,23,42,0.16)] sm:p-8">
      <div className="mx-auto flex max-w-4xl flex-col justify-center py-14 sm:py-20">
        <p className="text-sm font-semibold uppercase tracking-[0.32em] text-slate-300">ARCH9 HQ</p>
        <h1 className="mt-5 text-4xl font-semibold tracking-[-0.04em] text-white sm:text-6xl">Mission Control</h1>
        <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-200">Founder-only command centre</p>
        <p className="mt-8 max-w-2xl rounded-3xl border border-white/10 bg-white/8 p-5 text-base leading-7 text-slate-100">
          Mission Control is ready. Real platform metrics will appear here once HQ data endpoints are connected.
        </p>
      </div>
    </section>
  )
}

