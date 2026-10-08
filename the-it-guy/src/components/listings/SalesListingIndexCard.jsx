import { useState } from 'react'
import { ArrowRight, ImagePlus, UserRound } from 'lucide-react'
import ListingLiveChannels from './ListingLiveChannels'
const text = (value) => String(value ?? '').trim()

function getAgentInitials(agent = {}) {
  const name = text(agent?.name)
  if (!agent?.isAssigned) return ''
  const source = name || text(agent?.email)
  const words = source.split(/[\s.@_-]+/).filter(Boolean)
  return words.slice(0, 2).map((word) => word[0]?.toUpperCase()).join('') || 'A'
}

function ListingAgentAvatar({ agent = {} }) {
  const initials = getAgentInitials(agent)
  const avatarUrl = text(agent?.avatarUrl)

  return (
    <span className="relative inline-flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-[#d7e2ee] bg-[#eef4fa] text-[0.72rem] font-bold text-[#1f4f78]">
      {initials ? <span>{initials}</span> : <UserRound size={16} className="text-[#6f8398]" />}
      {avatarUrl ? (
        <img
          src={avatarUrl}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          onError={(event) => {
            event.currentTarget.style.display = 'none'
          }}
        />
      ) : null}
    </span>
  )
}

function ListingCardImage({ src = '', fallbackSrc = '', alt = '', priority = false }) {
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(false)
  const [usingFallback, setUsingFallback] = useState(false)
  const displayedSrc = usingFallback ? fallbackSrc : src
  return (
    <div className="relative h-full w-full bg-[#eaf0f6]">
      {!loaded && displayedSrc && !failed ? <div className="absolute inset-0 animate-pulse bg-[#e1eaf3]" aria-hidden="true" /> : null}
      {(!displayedSrc || failed) ? <ImagePlus size={24} className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-[#8da2b5]" aria-hidden="true" /> : null}
      {displayedSrc && !failed ? (
        <img
          src={displayedSrc}
          alt={alt}
          width="480"
          height="264"
          loading={priority ? 'eager' : 'lazy'}
          fetchPriority={priority ? 'high' : 'auto'}
          decoding="async"
          onLoad={() => setLoaded(true)}
          onError={() => {
            if (!usingFallback && fallbackSrc && fallbackSrc !== src) {
              setUsingFallback(true)
            } else {
              setFailed(true)
            }
          }}
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-200 ${loaded ? 'opacity-100' : 'opacity-0'}`}
        />
      ) : null}
    </div>
  )
}

export default function SalesListingIndexCard({ card, imageSource = { src: card.imageUrl }, priority = false, priceLabel, onOpen, actions = null }) {
  return (
    <article
      style={{ contentVisibility: 'auto', containIntrinsicSize: '0 430px' }}
      onClick={onOpen}
      className="group flex h-full cursor-pointer flex-col overflow-hidden rounded-[8px] border border-[#dce6f2] bg-white shadow-[0_6px_16px_rgba(15,23,42,0.05)] transition hover:-translate-y-0.5 hover:shadow-[0_10px_24px_rgba(15,23,42,0.09)]"
    >
      <div className="relative h-[132px] w-full overflow-visible border-b border-[#e5edf6]">
        <div className="absolute inset-0 overflow-hidden">
          <ListingCardImage
            key={imageSource.src || 'placeholder'}
            {...imageSource}
            alt={card.title}
            priority={priority}
          />
        </div>
        {card.inventoryStatusKey === 'draft' ? (
          <span className="absolute left-3 top-3 z-10 rounded-full border border-[#c6d8ea] bg-white/95 px-3 py-1 text-[0.72rem] font-semibold text-[#1f4f78] shadow-sm">
            {card.inventoryStatusLabel}
          </span>
        ) : null}
        {actions}

      </div>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div>
          <h3 className="truncate text-[1.02rem] font-semibold leading-6 text-[#142132]" title={card.addressLabel}>{card.addressLabel}</h3>
          <p className="mt-2 text-[1.05rem] font-semibold text-[#1f4f78]">{priceLabel}</p>
        </div>

        {card.propertyFacts?.length ? (
          <div className="grid gap-2 rounded-[12px] border border-[#dbe6f2] bg-[#f9fbfe] px-3 py-2 text-center text-[0.76rem] font-semibold text-[#35546c]" style={{ gridTemplateColumns: `repeat(${card.propertyFacts.length}, minmax(0, 1fr))` }}>
            {card.propertyFacts.map((fact) => (
              <span key={fact} className="truncate">{fact}</span>
            ))}
          </div>
        ) : null}

        <ListingLiveChannels channels={card.liveChannels} />

        <div className="mt-auto flex min-w-0 items-center gap-3 border-t border-[#eef3f8] pt-3">
          <ListingAgentAvatar agent={card.assignedAgent} />
          <div className="min-w-0">
            <p className="truncate text-[0.84rem] font-semibold text-[#20364d]">{card.assignedAgent?.name || 'Unassigned'}</p>
            {card.assignedAgent?.email ? (
              <p className="mt-0.5 truncate text-[0.72rem] text-[#6d8095]">{card.assignedAgent.email}</p>
            ) : null}
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
          <ArrowRight size={14} className="shrink-0" />
        </button>
      </div>
    </article>
  )
}
