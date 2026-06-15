function CommercialWorkspaceTabs({ tabs = [], activeTab = '', onChange }) {
  if (!tabs.length) return null

  return (
    <div className="-mx-1 overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <div className="flex min-w-max gap-2">
        {tabs.map((tab) => {
          const active = tab.id === activeTab
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onChange?.(tab.id)}
              className={[
                'inline-flex min-h-10 items-center rounded-[14px] px-4 text-sm font-semibold transition',
                active
                  ? 'bg-[#102b46] text-white shadow-[0_12px_24px_rgba(16,43,70,0.18)]'
                  : 'border border-[#dbe5ef] bg-white text-[#506579] hover:border-[#c7d8ea] hover:bg-[#f7fbff] hover:text-[#123b61]',
              ].join(' ')}
              aria-pressed={active}
            >
              {tab.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default CommercialWorkspaceTabs
