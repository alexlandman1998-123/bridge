import { AlertTriangle, Building2, Clock3, FileWarning, Send, ShieldAlert } from 'lucide-react'
import { Link } from 'react-router-dom'
import { cn } from '../../lib/utils'

const ICON_BY_KEY = Object.freeze({
  'file-warning': FileWarning,
  send: Send,
  'building-bank': Building2,
  'clock-alert': Clock3,
  'shield-alert': ShieldAlert,
})

const PANEL_TONE_CLASS_BY_KEY = Object.freeze({
  amber: 'border-[#f2dfb5] bg-[#fffaf0]',
  blue: 'border-[#d7e4f8] bg-[#f7fbff]',
  indigo: 'border-[#d9def8] bg-[#f8f9ff]',
  rose: 'border-[#f3d5dc] bg-[#fff7f8]',
  emerald: 'border-[#d5e9dc] bg-[#f5fcf8]',
})

const ICON_TONE_CLASS_BY_KEY = Object.freeze({
  amber: 'border-[#f2dfb5] bg-white text-[#8a5a12]',
  blue: 'border-[#d7e4f8] bg-white text-[#204b84]',
  indigo: 'border-[#d9def8] bg-white text-[#4154a3]',
  rose: 'border-[#efcfd6] bg-white text-[#9b394d]',
  emerald: 'border-[#d5e9dc] bg-white text-[#25724b]',
})

function ActionCard({ item }) {
  const Icon = ICON_BY_KEY[item.icon] || AlertTriangle
  const tone = item.tone || 'blue'

  return (
    <Link
      to={item.href}
      className={cn(
        'group rounded-[24px] border p-4 shadow-[0_14px_32px_rgba(15,23,42,0.035)] transition hover:-translate-y-[1px] hover:border-[#ccd9e8]',
        PANEL_TONE_CLASS_BY_KEY[tone] || PANEL_TONE_CLASS_BY_KEY.blue,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-[#76889d]">Priority Action</p>
          <h3 className="mt-2 text-base font-semibold text-[#142132]">{item.title}</h3>
        </div>
        <div
          className={cn(
            'rounded-[16px] border p-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.75)]',
            ICON_TONE_CLASS_BY_KEY[tone] || ICON_TONE_CLASS_BY_KEY.blue,
          )}
        >
          <Icon size={18} />
        </div>
      </div>

      <div className="mt-6 flex items-end justify-between gap-3">
        <div>
          <p className="text-[2rem] font-semibold tracking-normal text-[#142132]">{item.count}</p>
          <p className="mt-2 text-sm leading-6 text-[#5f7287]">{item.helper}</p>
        </div>
        <div className="rounded-full border border-white/80 bg-white/85 px-3 py-1 text-xs font-semibold text-[#516a83]">
          {item.trendLabel}
        </div>
      </div>
    </Link>
  )
}

export default function BondPriorityActionStrip({ items = [] }) {
  return (
    <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
      {items.map((item) => (
        <ActionCard key={item.key} item={item} />
      ))}
    </section>
  )
}
