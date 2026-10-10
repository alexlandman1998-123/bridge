import { CheckCircle2 } from 'lucide-react'
import './listing-syndication.css'
import ListingChannelLogo from './ListingChannelLogo'

export default function ListingSyndicationChannelCard({ channel, selected, onToggle, agencyLogo = '', disabled = false, status = '', needsAttention = '', description = '', children }) {
  const internal = Boolean(channel.internalOnly)
  const label = channel.key === 'agency_website' ? channel.availability?.label || 'Agency website' : channel.label
  const channelDescription = description || (internal ? 'Keep your listing in Arch9. External publication is optional.' : channel.key === 'agency_website' ? channel.availability?.hostname ? `Publish on ${channel.availability.hostname}.` : 'Publish on your agency’s property website.' : `Syndicate your listing to ${label}.`)
  return <article className={`listing-syndication-card ${selected ? 'is-selected' : ''}`}>
    <button type="button" data-rental-control="distribution-channel" aria-label={label} aria-pressed={selected} disabled={disabled || internal} onClick={() => onToggle?.(channel.key)}>
      <span className="listing-syndication-card-top">
        <ListingChannelLogo channel={channel} agencyLogo={agencyLogo} />
        <span className="listing-syndication-check" aria-hidden="true">{selected ? <CheckCircle2 size={16} /> : null}</span>
      </span>
      <span className="listing-syndication-label">{label}</span>
      <span className="listing-syndication-description">{channelDescription}</span>
      <span className={`listing-syndication-status ${needsAttention ? 'needs-attention' : ''}`}>{status || (internal ? 'Always included · internal only' : selected ? needsAttention ? 'Needs attention' : 'Selected' : 'Not selected')}</span>
      {needsAttention ? <span className="listing-syndication-attention">{needsAttention}</span> : null}
    </button>
    {children ? <div className="listing-syndication-card-actions">{children}</div> : null}
  </article>
}
