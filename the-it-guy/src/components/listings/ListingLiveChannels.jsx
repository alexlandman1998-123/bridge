import { CheckCircle2, Globe2 } from 'lucide-react'

export default function ListingLiveChannels({ channels = [] }) {
  if (!channels.length) return null
  return (
    <div className="rounded-[12px] border border-[#d7e7dc] bg-[#f6fbf7] px-3 py-2" aria-label={`Live on ${channels.map((channel) => channel.label).join(', ')}`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-[#537064]">Live on</span>
        {channels.map((channel) => (
          <span key={channel.key} className="inline-flex items-center gap-1.5 text-[0.75rem] font-semibold text-[#285f3d]">
            {channel.logoSrc ? <img src={channel.logoSrc} alt="" className="h-4 w-4 rounded-sm object-contain" /> : <Globe2 size={15} aria-hidden="true" />}
            <span>{channel.label}</span>
            <CheckCircle2 size={15} className="text-[#23834a]" aria-label="Live" />
          </span>
        ))}
      </div>
    </div>
  )
}
