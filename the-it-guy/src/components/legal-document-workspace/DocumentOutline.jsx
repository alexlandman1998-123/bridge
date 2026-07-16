import { CircleDollarSign, FileCheck2, FileText, Home, Landmark, UsersRound } from 'lucide-react'

const GROUP_ICONS = Object.freeze({
  parties: UsersRound,
  property: Home,
  price: CircleDollarSign,
  finance: Landmark,
  conditions: FileText,
  signatures: FileCheck2,
})

export function DocumentOutline({ groups, activeGroupKey, onSelectGroup }) {
  return (
    <aside className="rounded-[18px] border border-[#dce5ed] bg-white p-3 shadow-[0_12px_28px_rgba(15,23,42,0.04)] xl:sticky xl:top-4 xl:self-start" aria-labelledby="document-outline-title">
      <div className="px-2 pb-3 pt-1">
        <h2 id="document-outline-title" className="text-base font-semibold text-[#102033]">Document outline</h2>
        <p className="mt-1 text-xs leading-5 text-[#728398]">Choose an area of the agreement.</p>
      </div>
      <nav className="space-y-1.5" aria-label="Document areas">
        {groups.map((group, index) => {
          const Icon = GROUP_ICONS[group.key] || FileText
          const active = group.key === activeGroupKey
          const empty = group.blocks.length === 0
          return (
            <button
              key={group.key}
              type="button"
              disabled={empty}
              aria-current={active ? 'page' : undefined}
              onClick={() => onSelectGroup(group)}
              className={`flex min-h-[58px] w-full items-center gap-3 rounded-[12px] border px-3 py-2.5 text-left transition ${active
                ? 'border-[#9fd1b2] bg-[#eff9f3] text-[#176f43] shadow-[inset_3px_0_0_#16804d]'
                : empty
                  ? 'cursor-not-allowed border-transparent text-[#a1afbc]'
                  : 'border-transparent text-[#34495f] hover:border-[#dce5ed] hover:bg-[#f8fafc]'}`}
            >
              <span className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-xs font-semibold ${active ? 'border-[#b9ddc6] bg-white' : 'border-[#e0e7ee] bg-[#f9fbfc]'}`}>
                {index + 1}
              </span>
              <span className="min-w-0 flex-1">
                <strong className="block truncate text-sm font-semibold">{group.label}</strong>
                <span className="mt-0.5 block text-[11px] text-[#8191a2]">{group.blocks.length} block{group.blocks.length === 1 ? '' : 's'}</span>
              </span>
              <Icon className="h-4 w-4 shrink-0 opacity-70" aria-hidden="true" />
            </button>
          )
        })}
      </nav>
    </aside>
  )
}
