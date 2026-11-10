import { Building2, Home, UserRound } from 'lucide-react'
import { useState } from 'react'
import LeadSourceLogo from '../mobile-shell/LeadSourceLogo.jsx'
import { getLeadSourcePresentation } from '../mobile-shell/leadSourcePresentation.js'

export function DevelopmentLeadPropertyImage({ src = '', fallbackSrc = '', name = '', compact = false }) {
  const [failedUrls, setFailedUrls] = useState([])
  const image = [src, fallbackSrc].find(url => url && !failedUrls.includes(url))
  return <span className={`inline-grid ${compact ? 'h-16 w-16' : 'h-20 w-20'} shrink-0 place-items-center overflow-hidden rounded-lg border border-zinc-200 bg-zinc-100`}>
    {image ? <img src={image} alt={`Property for ${name}`} loading="lazy" className="h-full w-full object-cover" onError={() => setFailedUrls(previous => [...previous, image])} /> : <Home size={24} className="text-zinc-400" aria-label="Property image unavailable" />}
  </span>
}

export function DevelopmentLeadAgent({ agent, compact = false }) {
  const [failedUrl, setFailedUrl] = useState('')
  const initials = agent.name.split(/[^\p{L}\p{N}]+/u).filter(Boolean).slice(0, 2).map(word => word[0].toUpperCase()).join('')
  return <span className={`flex ${compact ? 'min-w-0' : 'min-w-[160px]'} items-center gap-2.5`}>
    <span className={`inline-flex ${compact ? 'h-8 w-8' : 'h-10 w-10'} shrink-0 items-center justify-center overflow-hidden rounded-full border border-zinc-200 bg-zinc-100 text-xs font-semibold text-zinc-600`}>
      {agent.avatarUrl && failedUrl !== agent.avatarUrl ? <img src={agent.avatarUrl} alt={agent.name} loading="lazy" className="h-full w-full object-cover" onError={() => setFailedUrl(agent.avatarUrl)} /> : agent.name === 'Unassigned' || agent.name === 'Assigned agent' ? <UserRound size={18} aria-hidden="true" /> : initials}
    </span>
    <span className="min-w-0 break-words text-sm leading-5 text-[#44576d]">{agent.name}</span>
  </span>
}

export function DevelopmentLeadSource({ source = '', brand = {}, compact = false }) {
  const [failedUrl, setFailedUrl] = useState('')
  const presentation = getLeadSourcePresentation(source || 'Source not recorded')
  // Portal branding always describes the actual channel; organisation branding
  // is supplied only for a matching developer-direct or agency-introduced source.
  if (presentation.logo) return <LeadSourceLogo source={source} className={`inline-flex min-h-8 max-w-full items-center [&_img]:max-h-7 ${compact ? '[&_img]:max-w-[104px]' : '[&_img]:max-w-[112px]'} [&_img]:object-contain [&_img]:object-left`} />
  return <span className="inline-flex max-w-full items-center gap-2.5">
    {brand.logoUrl && failedUrl !== brand.logoUrl ? <img src={brand.logoUrl} alt={`${brand.name || presentation.label} logo`} loading="lazy" className="max-h-7 max-w-[92px] object-contain" onError={() => setFailedUrl(brand.logoUrl)} /> : <span className="inline-grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-zinc-200 bg-white text-zinc-500"><Building2 size={16} aria-hidden="true" /></span>}
    <span className="min-w-0 break-words text-xs font-medium leading-5 text-[#44576d]">{presentation.label}</span>
  </span>
}
