import { ArrowUpRight, Building2, MapPin } from 'lucide-react'
import { useState } from 'react'
import { WORKFLOW_MAIN_STAGE_LABELS } from '../../core/workflows/workflowConstants.js'
import './mobile-transactions.css'

export default function MobileTransactionCard({ item, onOpen }) {
  const [failedImageUrl, setFailedImageUrl] = useState('')
  const stage = WORKFLOW_MAIN_STAGE_LABELS[String(item.stage || '').toUpperCase()] || item.stage || 'In progress'
  const price = Number(item.valueRaw) > 0
    ? new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(item.valueRaw)
    : item.value || 'Value not set'
  const hasImage = Boolean(item.imageUrl && item.imageUrl !== failedImageUrl)
  const Card = onOpen ? item.to ? 'a' : 'button' : 'article'

  return (
    <Card type={Card === 'button' ? 'button' : undefined} href={Card === 'a' ? item.to : undefined} className="mobile-property-deal" onClick={onOpen ? (event) => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      event.preventDefault()
      onOpen(item)
    } : undefined}>
      <span className={`mobile-property-deal-media${hasImage ? ' has-photo' : ''}`}>
        {hasImage ? <img src={item.imageUrl} alt="" loading="lazy" onError={() => setFailedImageUrl(item.imageUrl)} />
          : <span className="mobile-property-deal-placeholder"><Building2 size={40} strokeWidth={1.2} aria-hidden="true" /><span>Property photo unavailable</span></span>}
        <span className="mobile-property-deal-stage">{stage}</span>
        {item.propertyType && <span className="mobile-property-deal-type">{item.propertyType}</span>}
      </span>
      <span className="mobile-property-deal-body">
        {item.unitLabel && <span className="mobile-property-deal-unit">{item.unitLabel}</span>}
        <span className="mobile-property-deal-title" role="heading" aria-level="2">{item.unitLabel && item.propertyTitle ? item.propertyTitle : item.title}</span>
        {item.location && <span className="mobile-property-deal-location"><MapPin size={13} aria-hidden="true" /><span>{item.location}</span></span>}
        <span className="mobile-property-deal-facts">
          <span><span className="mobile-property-deal-label">Deal value</span><strong className="mobile-property-deal-price">{price}</strong></span>
          <span><span className="mobile-property-deal-label">Buyer</span><strong className="mobile-property-deal-buyer">{item.eyebrow || 'Buyer pending'}</strong></span>
        </span>
        {item.nextAction && <span className="mobile-property-deal-action"><span className="mobile-property-deal-label">Next action</span><span>{item.nextAction}</span></span>}
        {onOpen && <span className="mobile-property-deal-footer"><span>{item.reference || 'Open transaction'}</span><ArrowUpRight size={18} aria-hidden="true" /></span>}
      </span>
    </Card>
  )
}
