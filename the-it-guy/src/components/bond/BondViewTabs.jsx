export default function BondViewTabs({ tabs = [], value = 'all', counts = {}, onChange }) {
  return (
    <section className="no-print overflow-x-auto rounded-[20px] border border-[#dfe8f2] bg-white p-2 shadow-[0_10px_24px_rgba(15,23,42,0.045)]">
      <div className="flex min-w-max items-center gap-1.5">
        {tabs.map((tab) => {
          const active = tab.key === value
          const count = counts?.[tab.key]
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => onChange?.(tab.key)}
              className={`inline-flex h-10 items-center justify-center gap-2 rounded-[14px] px-3.5 text-sm font-semibold transition ${
                active
                  ? 'bg-[#102448] text-white shadow-[0_10px_20px_rgba(16,36,72,0.18)]'
                  : 'text-[#536982] hover:bg-[#f4f8fc] hover:text-[#17324b]'
              }`.trim()}
            >
              <span>{tab.label}</span>
              {Number.isFinite(Number(count)) ? (
                <span className={`rounded-full px-2 py-0.5 text-[0.72rem] ${active ? 'bg-white/18 text-white' : 'bg-[#edf3f8] text-[#60758d]'}`}>
                  {count}
                </span>
              ) : null}
            </button>
          )
        })}
      </div>
    </section>
  )
}
