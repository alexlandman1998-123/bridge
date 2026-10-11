import { useId, useState } from 'react'
import { ImageIcon } from 'lucide-react'
import { buildListingAdvertPreview } from '../../services/listings/listingAdvertPreviewModel'
import './listing-capture-layout.css'

export default function ListingCaptureLayout({ form, rental = false, onEdit, children }) {
  const [expanded, setExpanded] = useState(false)
  const previewId = useId()
  const preview = buildListingAdvertPreview(form, rental)
  return <div className="listing-capture-layout">
    <div className="listing-capture-grid">
      <div className="listing-capture-fields">{children}</div>
      <aside className="listing-capture-preview" aria-label="Draft advert preview">
        <button type="button" className="listing-preview-toggle" aria-controls={previewId} aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>{expanded ? 'Hide draft preview' : 'Show draft preview'}</button>
        <div id={previewId} className={`listing-preview-content ${expanded ? 'is-expanded' : ''}`}>
          <div className="listing-preview-heading"><h2>Draft advert preview</h2><p>Updates as you type. Each website may display it differently. This preview does not save or publish.</p></div>
          <div className="listing-preview-photo">
            {preview.coverUrl ? <img src={preview.coverUrl} alt="Selected cover photo" /> : <div><ImageIcon size={32} aria-hidden="true" /><p>Add photos to see the cover here</p></div>}
            <span>{preview.photoCount} photo{preview.photoCount === 1 ? '' : 's'}</span>
          </div>
          <div className="listing-preview-body">
            <p className="listing-preview-price">{preview.price}</p>
            <h3>{preview.title}</h3><p className="listing-preview-location">{preview.location}</p>
            <p className="listing-preview-type">{preview.category} · {preview.type}</p>
            <dl>{preview.facts.map(fact => <div key={fact.label}><dt>{fact.label}</dt><dd>{fact.value}</dd></div>)}</dl>
            {rental ? <p>{preview.deposit}{preview.availableFrom ? ` · Available from ${preview.availableFrom}` : ''}</p> : null}
            <p className="listing-preview-description">{preview.description || 'Add a description to see it here.'}</p>
            <div className="listing-preview-edit"><button type="button" onClick={() => onEdit('property')}>Change property details</button><button type="button" onClick={() => onEdit(rental ? 'terms' : 'property')}>Change {rental ? 'rent' : 'price'}</button><button type="button" onClick={() => onEdit('marketing')}>Change photos and description</button></div>
          </div>
        </div>
      </aside>
    </div>
  </div>
}
