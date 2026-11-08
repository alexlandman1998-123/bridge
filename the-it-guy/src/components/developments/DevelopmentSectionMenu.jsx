export default function DevelopmentSectionMenu({ label, items, value, onChange }) {
  return (
    <nav className="mb-6 snap-x snap-mandatory overflow-x-auto rounded-[22px] border border-[#d8e5de] bg-gradient-to-br from-[#f3f8f5] to-[#eaf2ee] p-2 shadow-[0_8px_24px_rgba(28,63,45,0.04)]" aria-label={label}>
      <div className={`grid gap-2 ${items.length === 2 ? 'grid-cols-2' : 'min-w-[720px] grid-cols-6'}`}>
        {items.map(section => {
          const isActive = value === section.id
          const Icon = section.icon
          return (
            <button
              key={section.id}
              type="button"
              aria-current={isActive ? 'page' : undefined}
              onClick={() => onChange(section.id)}
              className={`group relative flex min-h-[104px] min-w-0 snap-start flex-col items-center justify-center gap-2.5 rounded-[16px] border px-3 py-4 text-sm font-semibold transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#238355] focus-visible:ring-offset-2 motion-safe:hover:-translate-y-0.5 motion-safe:active:scale-[0.985] motion-reduce:transition-none ${isActive ? 'border-[#bdd8c8] bg-white text-[#154d36] shadow-[0_5px_18px_rgba(28,63,45,0.08)]' : 'border-transparent text-[#667a6e] hover:border-[#d2e2d8] hover:bg-white/70 hover:text-[#176447]'}`}
            >
              <span className={`grid h-9 w-9 place-items-center rounded-xl transition-colors duration-200 ${isActive ? 'bg-[#176447] text-white shadow-[0_3px_8px_rgba(23,100,71,0.18)]' : 'bg-white/80 text-[#6a8879] group-hover:bg-[#e3f0e8] group-hover:text-[#176447]'}`}>
                <Icon size={20} aria-hidden="true" />
              </span>
              <span className="whitespace-nowrap">{section.label}</span>
              <span className={`absolute inset-x-8 bottom-0 h-[3px] rounded-t-full bg-[#238355] transition-opacity duration-200 ${isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-40'}`} aria-hidden="true" />
            </button>
          )
        })}
      </div>
    </nav>
  )
}
