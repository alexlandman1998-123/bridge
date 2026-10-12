import { House, MapPin, ImageIcon, Banknote, Ruler, BedDouble, Bath, Tag, Eye, CalendarDays, FileText, Pencil, Video, Link2, Layers } from 'lucide-react'
import { getListingDescriptionConflicts } from '../../services/listings/listingDescriptionConsistency'
import { plainPropertyFieldLabel } from '../../services/listings/listingAdvertPreviewModel'
import { getPropertyCategoryLabel, getPropertyTypeLabel } from '../../lib/propertyTaxonomy'
import { getSpecialistSalesListingSchema } from '../../services/listings/specialistSalesListingSchema'
import './listing-capture-layout.css'

const display = value => value === '' || value === undefined || value === null ? 'Not added' : String(value)
const money = value => value === '' || value === undefined || value === null ? 'Not added' : `R ${Number(value).toLocaleString('en-ZA', { maximumFractionDigits: 2 })}`
const size = (value, unit = 'm²') => display(value) === 'Not added' ? 'Not added' : `${value} ${unit}`
const addressLabels = { show_exact_address: 'Show full street address', complex_only: 'Show complex or estate only', show_exact: 'Show full address', show_full_address: 'Show full address', hide_street_number: 'Contact agent for street address', hide_street_address: 'Hide street address', hide_exact: 'Hide exact address', suburb_only: 'Show suburb only' }
const rowIcons = { Category: Layers, 'Property type': House, 'Saved address': MapPin, 'Public address setting': Eye, Bedrooms: BedDouble, Bathrooms: Bath, 'Floor size': Ruler, 'Land size': Ruler, Photos: ImageIcon, 'Listing title': Tag, Description: FileText, Video, 'Virtual tour': Link2, 'Available from': CalendarDays, 'Lease length': CalendarDays }

function ReviewRows({ rows, className = '' }) {
  return <dl className={`listing-review-rows ${className}`}>{rows.map(([label, value]) => {
    const Icon = rowIcons[label]
    return <div key={label} className={['Saved address', 'Public address setting', 'Description', 'Deposit notes'].includes(label) ? 'listing-review-wide' : ''}>
      <dt>{Icon ? <Icon size={15} aria-hidden="true" /> : null}{label}</dt>
      <dd>{value}</dd>
    </div>
  })}</dl>
}

function ReviewEdit({ title, step, onEdit }) {
  return <button type="button" className="listing-review-edit" onClick={() => onEdit(step)} aria-label={`Edit ${title.toLowerCase()}`}><Pencil size={14} aria-hidden="true" /><span>Edit</span></button>
}

export default function ListingReviewDetails({ form, rental = false, onEdit }) {
  const land = ['land', 'vacant_land'].includes(form.propertyCategory)
  const propertyRows = [
    ['Category', getPropertyCategoryLabel(form.propertyCategory)], ['Property type', getPropertyTypeLabel(form.propertyType)],
    ...(!rental ? [['Retirement accommodation', form.featureFacts?.retirement_accommodation === true ? 'Yes' : form.featureFacts?.retirement_accommodation === false ? 'No' : 'Not captured']] : []),
    ['Saved address', display(form.propertyAddress)], ['Public address setting', addressLabels[form.exactAddressVisibility] || 'Hide street address'],
    ...(!land ? [['Bedrooms', display(form.bedrooms)], ['Bathrooms', display(form.bathrooms)], ['Floor size', size(form.floorSize)]] : []),
    ['Land size', size(form.erfSize)],
  ]
  const priceRows = rental ? [
    ['Rent', money(form.monthlyRent)], ['Frequency', ({ monthly: 'Per month', weekly: 'Per week', daily: 'Per day', annual: 'Per year', per_square_metre: 'Per m²' })[form.rentalPriceFrequency] || 'Not added'],
    ['Deposit', form.depositPolicy === 'no_deposit' ? 'No deposit' : money(form.depositAmount)],
    ...(form.depositRequirement ? [['Deposit notes', display(form.depositRequirement)]] : []),
    ['Available from', display(form.availableFrom)], ['Lease length', form.leasePeriodType === 'month_to_month' ? 'Month to month' : form.leasePeriodType === 'negotiable' ? 'Negotiable' : form.leasePeriodMonths ? `${form.leasePeriodMonths} months` : 'Not added'],
  ] : [['Advertised price', form.priceOnApplication ? 'Price on Application' : money(form.listingPrice || form.estimatedAskingPrice)]]
  const specialistFields = rental ? [] : getSpecialistSalesListingSchema(form.propertyCategory, form.listingType).fields.filter(field => field.key !== 'erfSize')
  const marketingRows = [
    ['Photos', String((rental ? form.galleryImages : form.listingImages)?.length || 0)],
    ['Listing title', display(rental ? form.title : form.listingTitle)], ['Description', display(rental ? form.description : form.listingDescription)],
    ...(form.videoLink ? [['Video', display(form.videoLink)]] : []), ...(form.virtualTourLink ? [['Virtual tour', display(form.virtualTourLink)]] : []),
  ]
  return <div className="listing-review-details" aria-label="Listing review details">
    {getListingDescriptionConflicts(form, rental).map(message => <div key={message} role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm"><p>{message}</p><button type="button" className="underline" onClick={() => onEdit('marketing')}>Review description</button></div>)}
    <section className="listing-review-card">
      <div className="listing-review-card-heading"><h3><span className="listing-review-icon"><House size={19} aria-hidden="true" /></span>Property and address</h3><ReviewEdit title="Property and address" step="property" onEdit={onEdit} /></div>
      <div className="listing-review-property-layout">
        <ReviewRows rows={propertyRows} className="listing-review-property-rows" />
        <div className={`listing-review-price ${rental ? 'is-rental' : ''}`}>
          <div className="listing-review-price-heading"><span><Banknote size={18} aria-hidden="true" />{rental ? 'Rent and deposit' : 'Price'}</span><ReviewEdit title={rental ? 'Rent and deposit' : 'Price'} step={rental ? 'terms' : 'property'} onEdit={onEdit} /></div>
          <ReviewRows rows={priceRows} />
        </div>
      </div>
    </section>
    {specialistFields.length ? <section className="listing-review-card">
      <div className="listing-review-card-heading"><h3><span className="listing-review-icon"><Ruler size={19} aria-hidden="true" /></span>Extra property details</h3><ReviewEdit title="Extra property details" step="features" onEdit={onEdit} /></div>
      <ReviewRows className="listing-review-property-rows" rows={specialistFields.map(field => [plainPropertyFieldLabel(field), field.unit ? size(form[field.key], field.unit === 'ha' ? 'hectares' : field.unit) : typeof form[field.key] === 'boolean' ? (form[field.key] ? 'Yes' : 'No') : display(form[field.key])])} />
    </section> : null}
    <section className="listing-review-card">
      <div className="listing-review-card-heading"><h3><span className="listing-review-icon"><ImageIcon size={19} aria-hidden="true" /></span>Photos and description</h3><ReviewEdit title="Photos and description" step="marketing" onEdit={onEdit} /></div>
      <ReviewRows className="listing-review-marketing-rows" rows={marketingRows} />
    </section>
  </div>
}
