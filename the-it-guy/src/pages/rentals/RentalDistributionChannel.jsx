import ListingChannelManageMenu from '../../components/listings/ListingChannelManageMenu'
import { Building2, ExternalLink } from 'lucide-react'
import { getListingChannelViewUrl, normalizeListingChannelReference } from '../../services/listings/listingMarketingChannelPresentation'
import '../../components/listings/listing-channel-table.css'

import { rentalChannelStatus } from '../../services/rentals/rentalChannelStatus'

export default function RentalDistributionChannel({ channelKey, icon = Building2, logoSrc = '', name, subtitle = '', reference = '', publicUrl = '', status = 'not_published', contextTitle = '', lastSynced = '', savedAt = '', actions = [] }) {
  const Icon = icon
  const display = rentalChannelStatus(status)
  const url = display.live ? getListingChannelViewUrl(channelKey, publicUrl) : ''
  const displayReference = normalizeListingChannelReference(reference)
  const dot = display.tone === 'live' ? 'bg-[#1f9d64]' : display.tone === 'attention' ? 'bg-[#d99321]' : display.tone === 'syncing' ? 'bg-[#2f6fb3]' : 'border border-[#aebdca] bg-white'
  const color = display.tone === 'live' ? 'text-[#18713e]' : display.tone === 'attention' ? 'text-[#9a5b13]' : display.tone === 'syncing' ? 'text-[#2f6fb3]' : 'text-[#526a82]'
  return <div className="listing-channel-columns border-b border-[#edf2f7] last:border-b-0">
    <div className="flex min-w-0 items-center gap-3">
      <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-[10px] border border-[#dbe6f2] bg-white text-[#1f4f78]">{logoSrc ? <img src={logoSrc} alt={name + ' logo'} className="max-h-7 max-w-8 object-contain" /> : <Icon size={18} />}</span>
      <div className="min-w-0"><p className="text-sm font-semibold leading-5 text-[#142132]">{name}</p>{subtitle ? <p className="text-xs leading-5 text-[#607387]">{subtitle}</p> : null}{contextTitle ? <p className="mt-1 text-xs leading-5 text-[#607387]">{contextTitle}</p> : null}</div>
    </div>
    <div><p className="text-xs text-[#607387] lg:hidden">Reference &amp; public link</p><p className="text-sm font-semibold text-[#243d56]">{displayReference || 'Not assigned'}</p>{url ? <a href={url} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-[#1f4f78] hover:underline">View listing<ExternalLink size={12} /></a> : <p className="mt-1 text-xs text-[#8a98a8]">{display.live ? 'Listing link unavailable' : 'No live listing link'}</p>}</div>
    <div><p className="text-xs text-[#607387] lg:hidden">Status</p><p className={'inline-flex items-center gap-2 text-sm font-semibold ' + color}><span className={'h-2 w-2 shrink-0 rounded-full ' + dot} />{display.label}</p></div>
    <div className="listing-channel-activity"><p className="lg:hidden">Publication activity</p>{savedAt ? <p><span>Arch9 saved</span> · {savedAt}</p> : null}{lastSynced ? <p><span>Portal updated</span> · {lastSynced}</p> : null}{!savedAt && !lastSynced ? <p>No publication activity yet</p> : null}</div>
    <div className="flex justify-start lg:justify-end">{actions.length ? <ListingChannelManageMenu channelName={name}>{actions}</ListingChannelManageMenu> : null}</div>
  </div>
}
