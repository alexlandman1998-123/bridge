import { getPropertyCategoryLabel, getPropertyTypeLabel } from '../../lib/propertyTaxonomy'
import { getSpecialistSalesListingSchema } from '../../services/listings/specialistSalesListingSchema'

const display = value => value === '' || value === undefined || value === null ? 'Not added' : String(value)
const money = value => value === '' || value === undefined || value === null ? 'Not added' : `R ${Number(value).toLocaleString('en-ZA', { maximumFractionDigits: 2 })}`
const size = (value, unit = 'm²') => display(value) === 'Not added' ? 'Not added' : `${value} ${unit}`
const addressLabels = { show_exact_address: 'Show full street address', complex_only: 'Show complex or estate only', show_exact: 'Show full address', show_full_address: 'Show full address', hide_street_number: 'Contact agent for street address', hide_street_address: 'Hide street address', hide_exact: 'Hide exact address', suburb_only: 'Show suburb only' }

export default function ListingReviewDetails({ form, rental = false, onEdit }) {
  const land = ['land', 'vacant_land'].includes(form.propertyCategory)
  const sections = [
    { title: 'Property and address', step: 'property', rows: [
      ['Category', getPropertyCategoryLabel(form.propertyCategory)], ['Property type', getPropertyTypeLabel(form.propertyType)],
      ['Saved address', display(form.propertyAddress)], ['Public address setting', addressLabels[form.exactAddressVisibility] || 'Hide street address'],
      ...(!land ? [['Bedrooms', display(form.bedrooms)], ['Bathrooms', display(form.bathrooms)], ['Floor size', size(form.floorSize)]] : []),
      ['Land size', size(form.erfSize)],
    ] },
    { title: rental ? 'Rent and deposit' : 'Price', step: rental ? 'terms' : 'property', rows: rental ? [
      ['Rent', money(form.monthlyRent)], ['Frequency', ({ monthly: 'Per month', weekly: 'Per week', daily: 'Per day', annual: 'Per year', per_square_metre: 'Per m²' })[form.rentalPriceFrequency] || 'Not added'],
      ['Deposit', form.depositPolicy === 'no_deposit' ? 'No deposit' : money(form.depositAmount)],
      ['Deposit notes', display(form.depositRequirement)], ['Available from', display(form.availableFrom)], ['Lease length', form.leasePeriodType === 'month_to_month' ? 'Month to month' : form.leasePeriodType === 'negotiable' ? 'Negotiable' : form.leasePeriodMonths ? `${form.leasePeriodMonths} months` : 'Not added'],
    ] : [['Advertised price', form.priceOnApplication ? 'Price on Application' : money(form.listingPrice || form.estimatedAskingPrice)]] },
    ...(!rental && getSpecialistSalesListingSchema(form.propertyCategory, form.listingType).fields.length ? [{ title: 'Extra property details', step: 'marketing', rows: getSpecialistSalesListingSchema(form.propertyCategory, form.listingType).fields.filter(field => field.key !== 'erfSize').map(field => [field.label, field.unit ? size(form[field.key], field.unit) : typeof form[field.key] === 'boolean' ? (form[field.key] ? 'Yes' : 'No') : display(form[field.key])]) }] : []),
    { title: 'Photos and description', step: 'marketing', rows: [
      ['Photos', String((rental ? form.galleryImages : form.listingImages)?.length || 0)],
      ['Listing title', display(rental ? form.title : form.listingTitle)], ['Description', display(rental ? form.description : form.listingDescription)],
      ['Video', display(form.videoLink)], ['Virtual tour', display(form.virtualTourLink)],
    ] },
  ]
  return <div className="grid min-w-0 gap-4 md:grid-cols-2" aria-label="Listing review details">
    {sections.map(section => <section key={section.title} className="min-w-0 rounded-xl border border-[#dbe6f2] bg-[#fbfdff] p-4">
      <div className="flex items-start justify-between gap-3"><h3 className="font-semibold">{section.title}</h3><button type="button" className="shrink-0 text-sm underline" onClick={() => onEdit(section.step)}>Edit {section.title.toLowerCase()}</button></div>
      <dl className="mt-3 grid gap-3 text-sm">{section.rows.map(([label, value]) => <div key={label}><dt className="font-semibold text-[#18324b]">{label}</dt><dd className="m-0 whitespace-pre-wrap break-words text-[#607387]">{value}</dd></div>)}</dl>
    </section>)}
  </div>
}
