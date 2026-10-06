import { ArrowUpRight, Building2, MapPin } from 'lucide-react'
import { useState } from 'react'
import './mobile-transactions.css'

export default function MobileDevelopmentCard({ item, onOpen, compact = false }) {
  const [failedImage, setFailedImage] = useState('')
  const hasImage = Boolean(item.imageUrl && item.imageUrl !== failedImage)
  const Card = onOpen ? 'a' : 'article'
  return (
    <Card href={onOpen ? item.to : undefined} className={`mobile-property-deal mobile-development-card${compact ? ' is-compact' : ''}`} onClick={onOpen ? (event) => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      event.preventDefault()
      onOpen(item)
    } : undefined}>
      <span className={`mobile-property-deal-media${hasImage ? ' has-photo' : ''}`}>
        {hasImage ? <img src={item.imageUrl} alt="" loading="lazy" onError={() => setFailedImage(item.imageUrl)} /> : <span className="mobile-property-deal-placeholder"><Building2 size={40} strokeWidth={1.2} aria-hidden="true" /><span>Development photo unavailable</span></span>}
        <span className="mobile-property-deal-stage">{item.status}</span>
      </span>
      <span className="mobile-property-deal-body">
        <span className="mobile-property-deal-title" role="heading" aria-level="2">{item.title}</span>
        {item.location && <span className="mobile-property-deal-location"><MapPin size={13} aria-hidden="true" /><span>{item.location}</span></span>}
        <span className="mobile-development-facts">
          {[[item.totalUnits, 'Units'], [item.availableUnits, 'Available'], [item.activeDeals, 'Live deals']].map(([value, label]) => <span key={label}><strong>{value}</strong><span className="mobile-property-deal-label">{label}</span></span>)}
        </span>
        {onOpen && !compact && <span className="mobile-property-deal-footer"><span>Open development</span><ArrowUpRight size={18} aria-hidden="true" /></span>}
      </span>
    </Card>
  )
}
