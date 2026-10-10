import { useState } from 'react'
import { Globe2 } from 'lucide-react'

export default function ListingChannelLogo({ channel, agencyLogo = '' }) {
  const [failedLogo, setFailedLogo] = useState('')
  const internal = Boolean(channel.internalOnly)
  const destination = channel.availability || {}
  const logo = internal ? '/favicon-light.svg'
    : channel.key === 'property24' ? '/lead-sources/property24.png'
      : channel.key === 'private_property' ? '/lead-sources/private-property.jpeg'
        : destination.logoUrl || (destination.channel === 'kingdom_website' ? '' : agencyLogo)
  const label = internal ? 'Arch9' : destination.label || channel.label || 'Agency website'
  return <span className={`listing-syndication-logo shrink-0 ${internal ? 'is-internal' : ''}`}>
    {logo && failedLogo !== logo ? <img src={logo} alt={`${label} logo`} onError={() => setFailedLogo(logo)} /> : <Globe2 size={28} aria-hidden="true" />}
    {internal ? <span>Arch9</span> : null}
  </span>
}
