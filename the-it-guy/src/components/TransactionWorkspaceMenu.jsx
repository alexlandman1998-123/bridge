function TransactionWorkspaceMenu({
  tabs = [],
  activeTab = '',
  onChange,
  ariaLabel = 'Transaction workspace tabs',
  sectionLabel = 'Workspace',
}) {
  return (
    <section className="no-print rounded-[24px] border border-[#d9e3ee] bg-[rgba(248,251,254,0.94)] p-4 shadow-[0_14px_28px_rgba(15,23,42,0.1)] backdrop-blur-md md:p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[0.92rem] font-semibold uppercase tracking-[0.11em] text-[#6b7d93]">
          {sectionLabel}
        </h3>
        <span className="inline-flex items-center rounded-full border border-[#d8e1eb] bg-white px-3 py-1 text-[0.72rem] font-semibold text-[#66758b]">
          {tabs.length} sections
        </span>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1 md:grid md:grid-cols-3 md:overflow-visible md:pb-0 xl:grid-cols-5" role="tablist" aria-label={ariaLabel}>
        {tabs.map((tab) => {
          const active = activeTab === tab.id
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              className={[
                'inline-flex min-h-[54px] min-w-[170px] flex-col items-center justify-center rounded-[16px] border px-4 py-2.5 text-sm font-semibold transition duration-150 ease-out md:min-w-0',
                active
                  ? 'border-[#c8daef] bg-[#274c69] text-white shadow-[0_10px_22px_rgba(15,23,42,0.14)]'
                  : 'border-[#e5edf6] bg-white text-[#4f647a] hover:border-[#d2deea] hover:bg-[#f9fbfd]',
              ].join(' ')}
              onClick={() => onChange?.(tab.id)}
            >
              <span>{tab.label}</span>
              {tab.meta ? (
                <em className={`mt-1 text-[0.7rem] not-italic ${active ? 'text-white/80' : 'text-[#8aa0b8]'}`}>
                  {tab.meta}
                </em>
              ) : null}
            </button>
          )
        })}
      </div>
    </section>
  )
}

export default TransactionWorkspaceMenu
