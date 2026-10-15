import RentalLandlordProfileEditor from '../../modules/rentals/shared/applications/RentalLandlordProfileEditor.jsx'
import Field from '../../components/ui/Field'
import { LANDLORD_CONDITIONAL_OPTIONS, rentalLandlordPropertyFieldVisible } from '../../services/rentals/rentalLandlordOnboardingModel'

const rentalFields = [
  ['ownershipType', 'Ownership / title type', [['freehold', 'Freehold'], ['sectional_title', 'Sectional title'], ['leasehold', 'Leasehold'], ['other', 'Other']]],
  ['serviceType', 'Rental service', LANDLORD_CONDITIONAL_OPTIONS.serviceType],
  ['schemeType', 'Property scheme', LANDLORD_CONDITIONAL_OPTIONS.schemeType],
  ['payoutBeneficiaryType', 'Rental proceeds beneficiary', LANDLORD_CONDITIONAL_OPTIONS.payoutBeneficiaryType],
  ['payoutAccountHolder', 'Proceeds account holder'], ['payoutAccountReference', 'Proceeds account reference'], ['billingResponsibility', 'Billing and meter responsibility'],
]
function DetailField({ definition, value, onChange, prefix = '' }) {
  const [key, label, type] = definition
  return <label className={`grid gap-2 text-sm font-semibold text-[#425970] ${type === 'textarea' ? 'sm:col-span-2' : ''}`}>
    {label}
    {Array.isArray(type) ? <Field as="select" aria-label={`${prefix}${label}`} value={value ?? ''} onChange={(event) => onChange(key, event.target.value)}><option value="">Not captured</option>{value && !type.some(([id]) => id === value) ? <option value={value}>{value} (previous answer)</option> : null}{type.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</Field> : <Field as={type === 'textarea' ? 'textarea' : 'input'} type={type === 'textarea' ? undefined : type || 'text'} aria-label={`${prefix}${label}`} value={value ?? ''} min={type === 'number' ? 0 : undefined} max={key === 'ownershipShare' ? 100 : undefined} onChange={(event) => onChange(key, event.target.value)} />}
  </label>
}
export default function RentalListingLandlordOnboardingEditor({ data, listingId, onChange, disabled }) {
  const property = data.portfolio.find(item => item.listingId === listingId)
  const setProperty = (key, value) => onChange({ ...data, portfolio: data.portfolio.map(item => item.id === property.id ? { ...item, [key]: value } : item) })
  return <div className="min-w-0 space-y-4">
    <RentalLandlordProfileEditor profile={data.profile} portfolio={data.portfolio} disabled={disabled} onChange={profile => onChange({ ...data, profile })} />
    <details className="rounded-xl border border-[#dce7f2] bg-white p-4">
      <summary className="cursor-pointer text-sm font-semibold text-[#20364c]">Rental details for this property</summary>
      <p className="mt-3 text-sm text-[#607387]">{property?.address || 'Address not captured'}</p>
      {property ? <fieldset disabled={disabled} className="mt-4 grid gap-3 sm:grid-cols-2">{rentalFields.filter(([key]) => rentalLandlordPropertyFieldVisible(key, property)).map(definition => <DetailField key={definition[0]} definition={definition} value={property[definition[0]]} onChange={setProperty} />)}</fieldset> : <p role="alert" className="mt-3 text-sm text-red-700">This listing is missing from the landlord’s onboarding portfolio. Refresh before editing.</p>}
    </details>
  </div>
}
