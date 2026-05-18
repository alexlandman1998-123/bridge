import { ArrowRight } from 'lucide-react'

function CommercialPlaceholderPage({ title, description, badge = 'Workspace ready', cards = [] }) {
  return (
    <div className="grid gap-5">
      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_14px_34px_rgba(15,23,42,0.045)]">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-[-0.045em] text-[#102236]">{title}</h1>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">{description}</p>
          </div>
          <span className="inline-flex w-fit rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">
            {badge}
          </span>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {cards.map((card) => {
          const Icon = card.icon
          return (
            <article key={card.title} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_14px_34px_rgba(15,23,42,0.045)]">
              {Icon ? (
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-[#eef5fb] text-[#123b61]">
                  <Icon size={19} />
                </span>
              ) : null}
              <h2 className="mt-4 text-sm font-semibold text-[#102236]">{card.title}</h2>
              <p className="mt-1 text-xs leading-5 text-slate-500">{card.description}</p>
              <span className="mt-4 inline-flex items-center gap-2 text-xs font-semibold text-[#1b6f55]">
                Ready for workflow
                <ArrowRight size={14} />
              </span>
            </article>
          )
        })}
      </section>
    </div>
  )
}

export default CommercialPlaceholderPage
