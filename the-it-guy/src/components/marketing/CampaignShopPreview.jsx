import { useState } from 'react'
import { House, KeyRound, Search, Megaphone, PartyPopper } from 'lucide-react'

const categoryIcons = {
  property: House,
  sellers: KeyRound,
  buyers: Search,
  brand: Megaphone,
  relationships: PartyPopper,
}

export default function CampaignShopPreview({ template, category }) {
  const [failedUrl, setFailedUrl] = useState('')
  const image = template.previewImage || template.cover_url
  const Icon = categoryIcons[category] || Megaphone
  return (
    <div className={`mc-shop-preview mc-shop-preview-${category || 'custom'}`}>
      {image && failedUrl !== image ? (
        <img src={image} alt="" loading="lazy" onError={() => setFailedUrl(image)} />
      ) : <Icon className="mc-shop-preview-icon" size={32} aria-hidden="true" />}
      <span className="mc-shop-example">{template.previewImage ? 'Sample design' : 'Draft template'}</span>
      <div className="mc-shop-preview-copy">
        <span>{template.previewImage ? 'YOUR AGENCY · YOUR BRAND' : 'YOUR NEXT CAMPAIGN'}</span>
        <strong>{template.headline || template.title}</strong>
      </div>
    </div>
  )
}
