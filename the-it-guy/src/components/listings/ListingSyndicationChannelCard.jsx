import { useState } from 'react'
import { CheckCircle2, Globe2 } from 'lucide-react'
import './listing-syndication.css'

export default function ListingSyndicationChannelCard({ channel, selected, onToggle, agencyLogo = '', disabled = false, status = '', needsAttention = '', description = '', children }) {
  const [failedLogo, setFailedLogo] = useState('')
  const internal = Boolean(channel.internalOnly)
  const logo = internal ? '/favicon-light.svg' : channel.key === 'property24' ? '/lead-sources/property24.png' : channel.key === 'private_property' ? '/lead-sources/private-property.jpeg' : agencyLogo
  const label = channel.key === 'agency_website' ? 'Agency website' : channel.label
  const channelDescription = description || (internal ? 'Keep your listing in Arch9. External publication is optional.' : channel.key === 'agency_website' ? 'Publish on your agency’s property website.' : `Syndicate your listing to ${label}.`)
  return <article className={`listing-syndication-card ${selected ? 'is-selected' : ''}`}>
    <button type="button" data-rental-control="distribution-channel" aria-label={label} aria-pressed={selected} disabled={disabled || internal} onClick={() => onToggle?.(channel.key)}>
      <span className="listing-syndication-card-top">
        <span className={`listing-syndication-logo ${internal ? 'is-internal' : ''}`}>{logo && failedLogo !== logo ? <img src={logo} alt="" onError={() => setFailedLogo(logo)} /> : <Globe2 size={28} aria-hidden="true" />}{internal ? <span>Arch9</span> : null}</span>
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
