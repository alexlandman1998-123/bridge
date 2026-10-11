import { AlertTriangle, Building2, CheckCircle2, CircleDollarSign, Home, Settings2, Users } from 'lucide-react'
import { useEffect, useRef } from 'react'

const SECTIONS = [
  { id: 'general', label: 'Development', icon: Building2 },
  { id: 'seller-entity', label: 'Developer', icon: Home },
  { id: 'bond-originator', label: 'Bond Originator', icon: CircleDollarSign },
  { id: 'team-access', label: 'Agents', icon: Users },
]

function groupForSection(section) {
  return ['seller-entity', 'bond-originator', 'team-access'].includes(section) ? section : 'general'
}

export default function DevelopmentConfigurationWorkspace({ section, statuses = [], onSelectSection, children }) {
  const group = groupForSection(section)
  const menu = useRef(null)
  useEffect(() => {
    const nav = menu.current
    const active = nav?.querySelector('[aria-current="page"]')
    if (!active) return
    const bounds = nav.getBoundingClientRect()
    const item = active.getBoundingClientRect()
    if (item.left < bounds.left) nav.scrollLeft += item.left - bounds.left - 8
    else if (item.right > bounds.right) nav.scrollLeft += item.right - bounds.right + 8
  }, [group])
  return <div className="grid min-w-0 gap-5">
    <section className="relative overflow-hidden rounded-[24px] border border-[#183a3c] bg-[#0c2527] shadow-[0_20px_48px_rgba(15,23,42,0.14)]" aria-label="Development configuration status">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_12%_0%,rgba(69,160,124,0.34),transparent_45%),radial-gradient(circle_at_95%_10%,rgba(225,179,85,0.18),transparent_30%)]" aria-hidden="true" />
      <div className="relative grid grid-cols-2 gap-3 p-4 lg:grid-cols-5 lg:p-6">
        {statuses.map(item => {
          const Icon = item.complete ? CheckCircle2 : item.optional ? CircleDollarSign : AlertTriangle
          const state = item.complete ? 'Ready' : item.optional ? 'Optional' : 'Needs attention'
          const tone = item.complete ? 'text-[#a4e4bc]' : item.optional ? 'text-[#a8c3ba]' : 'text-[#f0ca88]'
          return <button type="button" key={item.id} onClick={() => onSelectSection(item.id)} aria-label={`${item.label}: ${state}`} className={`flex min-w-0 items-center gap-2 rounded-[16px] border p-3 text-left transition last:col-span-2 hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#a4d9bd] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0c2527] sm:gap-3 sm:px-4 sm:py-4 lg:last:col-span-1 ${section === item.id ? 'border-white/30 bg-white/15' : 'border-white/10 bg-white/[0.05]'}`}>
            <Icon size={20} className={`shrink-0 ${tone}`} aria-hidden="true" />
            <span className="min-w-0"><strong className="block text-sm font-semibold text-white">{item.label}</strong><span className={`mt-1 block text-xs ${tone}`}><span className="sm:hidden">{item.complete ? 'Ready' : item.optional ? 'Optional' : 'Missing'}</span><span className="hidden sm:inline">{state}</span></span></span>
          </button>
        })}
      </div>
    </section>
    <nav ref={menu} className="snap-x snap-mandatory overflow-x-auto rounded-[22px] border border-[#d8e5de] bg-gradient-to-br from-[#f3f8f5] to-[#eaf2ee] p-2 shadow-[0_8px_24px_rgba(28,63,45,0.04)]" aria-label="Development configuration sections">
      <div className="grid min-w-[560px] grid-cols-4 gap-2">
        {SECTIONS.map(item => {
          const active = group === item.id
          const Icon = item.icon
          return <button key={item.id} type="button" aria-current={active ? 'page' : undefined} onClick={() => onSelectSection(item.id)} className={`group relative flex min-h-[104px] min-w-0 snap-start flex-col items-center justify-center gap-2.5 rounded-[16px] border px-3 py-4 text-sm font-semibold transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#238355] focus-visible:ring-offset-2 motion-safe:hover:-translate-y-0.5 motion-safe:active:scale-[0.985] motion-reduce:transition-none ${active ? 'border-[#bdd8c8] bg-white text-[#154d36] shadow-[0_5px_18px_rgba(28,63,45,0.08)]' : 'border-transparent text-[#667a6e] hover:border-[#d2e2d8] hover:bg-white/70 hover:text-[#176447]'}`}>
            <span className={`grid h-9 w-9 place-items-center rounded-xl transition-colors duration-200 ${active ? 'bg-[#176447] text-white shadow-[0_3px_8px_rgba(23,100,71,0.18)]' : 'bg-white/80 text-[#6a8879] group-hover:bg-[#e3f0e8] group-hover:text-[#176447]'}`}><Icon size={20} aria-hidden="true" /></span>
            <span className="whitespace-nowrap">{item.label}</span>
            <span className={`absolute inset-x-8 bottom-0 h-[3px] rounded-t-full bg-[#238355] transition-opacity duration-200 ${active ? 'opacity-100' : 'opacity-0 group-hover:opacity-40'}`} aria-hidden="true" />
          </button>
        })}
      </div>
    </nav>
    {children}
    {group === 'general' && section !== 'danger-zone' ? <div className="flex justify-end"><button type="button" onClick={() => onSelectSection('danger-zone')} className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold text-[#718299] transition hover:bg-white hover:text-[#35546c] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#238355]"><Settings2 size={15} aria-hidden="true" />Advanced settings</button></div> : null}
  </div>
}
