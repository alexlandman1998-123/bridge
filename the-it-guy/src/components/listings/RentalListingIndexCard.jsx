import { ArrowRight, CalendarDays, MoreVertical, Trash2, X } from 'lucide-react'
import ListingLiveChannels from './ListingLiveChannels'
import { formatRentalIndexStatusLabel } from '../../services/rentals/rentalListingIndexModel'

function formatCurrency(value) {
  const amount = Number(value || 0)
  if (!Number.isFinite(amount) || amount <= 0) return 'Not captured'
  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR',
    maximumFractionDigits: 0,
  }).format(amount)
}

function formatDate(value) {
  if (!value) return 'Not captured'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return new Intl.DateTimeFormat('en-ZA', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date)
}

function ListingCardImage({ src = '', alt = '' }) {
  if (src) return <img src={src} alt={alt} className="h-full w-full object-cover" />

  return (
    <div className="relative h-full w-full bg-[linear-gradient(140deg,#1f4f78_0%,#4a7da8_55%,#a8c2dc_100%)]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_22%_22%,rgba(255,255,255,0.24),transparent_52%)]" />
      <div className="absolute bottom-3 left-3 rounded-full border border-white/35 bg-white/20 px-2.5 py-1 text-[0.68rem] font-semibold uppercase text-white">
        Listing image
      </div>
    </div>
  )
}

function RentalAgentAvatar({ row = {} }) {
  const name = row.assignedAgentName || ''
  const source = name || 'Rental'
  const initials = source
    .split(/[\s.@_-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join('') || 'R'

  return (
    <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#d7e2ee] bg-[#eef4fa] text-[0.72rem] font-bold text-[#1f4f78]">
      {initials}
    </span>
  )
}

export default function RentalListingIndexCard({ row, liveChannels, onOpen, menuOpen, onMenu, onDelete, onWithdraw, actions = null }) {
  const facts = [
    row.bedrooms !== null && row.bedrooms !== undefined ? `${row.bedrooms} Beds` : '',
    row.bathrooms !== null && row.bathrooms !== undefined ? `${row.bathrooms} Baths` : '',
    row.parkingBays !== null && row.parkingBays !== undefined ? `${row.parkingBays} Parking` : '',
  ].filter(Boolean)

  return (
    <article
      onClick={onOpen}
      className="group flex h-full cursor-pointer flex-col rounded-[8px] border border-[#dce6f2] bg-white shadow-[0_6px_16px_rgba(15,23,42,0.05)] transition hover:-translate-y-0.5 hover:shadow-[0_10px_24px_rgba(15,23,42,0.09)]"
    >
      <div className="relative h-[132px] w-full border-b border-[#e5edf6]">
        <div className="absolute inset-0 overflow-hidden rounded-t-[8px]">
          <ListingCardImage src={row.imageUrl} alt={row.title} />
        </div>
        {!liveChannels.length ? (
          <span className="absolute left-3 top-3 max-w-[calc(100%-4.5rem)] truncate rounded-full border border-[#c6d8ea] bg-white/95 px-3 py-1 text-[0.72rem] font-semibold text-[#1f4f78] shadow-sm">
            {formatRentalIndexStatusLabel(row.statusGroup)}
          </span>
        ) : null}
        <div className="absolute right-3 top-3 z-10" onClick={event => event.stopPropagation()}>
          <button
            type="button"
            aria-label={`Open actions for ${row.title}`}
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            onClick={onMenu}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/45 bg-white/90 text-[#607387] shadow-sm hover:bg-white"
          >
            <MoreVertical size={16} />
          </button>
          {menuOpen ? (
            <div role="menu" className="absolute right-0 top-9 z-20 w-48 rounded-[12px] border border-[#dce6f2] bg-white py-1 shadow-lg">
              {actions || <>
              <button type="button" role="menuitem" onClick={onWithdraw} className="flex min-h-10 w-full items-center gap-2 px-3 text-left text-sm font-semibold text-[#7a4e12] hover:bg-[#fff9ed]">
                <X size={14} />Withdraw listing
              </button>
              <button type="button" role="menuitem" onClick={onDelete} className="flex min-h-10 w-full items-center gap-2 px-3 text-left text-sm font-semibold text-[#a13b35] hover:bg-[#fff5f5]">
                <Trash2 size={14} />Delete listing
              </button>
              </>}
            </div>
          ) : null}
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div>
          <h3 className="line-clamp-2 text-[1.02rem] font-semibold leading-6 text-[#142132]">{row.title}</h3>
          <p className="mt-2 text-[1.05rem] font-semibold text-[#1f4f78]">
            {formatCurrency(row.monthlyRent)}
            {row.monthlyRent > 0 ? <span className="ml-1.5 text-[0.72rem] font-medium text-[#6d8095]">/ month</span> : null}
          </p>
          <p className="mt-1 line-clamp-1 text-xs font-semibold text-[#6d8095]">{row.address || row.location || 'Address pending'}</p>
        </div>

        {facts.length ? (
          <div className="grid gap-2 rounded-[12px] border border-[#dbe6f2] bg-[#f9fbfe] px-3 py-2 text-center text-[0.76rem] font-semibold text-[#35546c]" style={{ gridTemplateColumns: `repeat(${facts.length}, minmax(0, 1fr))` }}>
            {facts.map((fact) => <span key={fact} className="truncate">{fact}</span>)}
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-2 text-[0.72rem] font-semibold text-[#607387]">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[#dbe6f2] bg-[#f9fbfe] px-3 py-1.5">
            <CalendarDays size={14} aria-hidden="true" />
            {row.availableFrom ? <>Available from <time dateTime={row.availableFrom}>{formatDate(row.availableFrom)}</time></> : 'Availability not set'}
          </span>
          {!liveChannels.some((channel) => channel.key === 'property24') ? (
            <span className="inline-flex items-center rounded-full border border-[#dbe6f2] bg-[#f9fbfe] px-3 py-1.5">Property24 · {formatRentalIndexStatusLabel(row.property24Status)}</span>
          ) : null}
        </div>

        <ListingLiveChannels channels={liveChannels} />

        <div className="mt-auto flex min-w-0 items-center gap-3 border-t border-[#eef3f8] pt-3">
          <RentalAgentAvatar row={row} />
          <div className="min-w-0">
            <p className="truncate text-[0.84rem] font-semibold text-[#20364d]">{row.assignedAgentName || 'Unassigned'}</p>
            <p className="mt-0.5 truncate text-[0.72rem] text-[#6d8095]">{row.assignedAgentContact || 'Agent contact not captured'}</p>
          </div>
        </div>

        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation()
            onOpen()
          }}
          className="inline-flex min-h-9 w-full min-w-0 items-center justify-center gap-1.5 rounded-full border border-[#c6d8ea] bg-white px-3 text-[0.76rem] font-semibold text-[#1f4f78] transition hover:border-[#9fb7d1] hover:bg-[#f6faff]"
        >
          <span className="truncate">Open</span>
          <ArrowRight size={14} className="shrink-0" aria-hidden="true" />
        </button>
      </div>
    </article>
  )
}
