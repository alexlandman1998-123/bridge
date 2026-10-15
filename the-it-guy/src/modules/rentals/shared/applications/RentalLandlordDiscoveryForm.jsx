import RentalLandlordProfileEditor from './RentalLandlordProfileEditor.jsx'
import {
  LANDLORD_PROPERTY_FIELDS,
  LANDLORD_CONDITIONAL_OPTIONS,
  rentalLandlordPropertyFieldVisible,
} from '../../../../services/rentals/rentalLandlordOnboardingModel.js'
import AddressInput from '../../../../components/location/AddressInput'
import { isAddressFieldKey, selectedAddressFields } from '../../../../components/location/addressInputModel'
const title = (value) =>
  value
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (letter) => letter.toUpperCase())
export default function RentalLandlordDiscoveryForm({
  data,
  onChange,
  disabled = false,
  saveState,
  submitted = false,
}) {
  const field = (row, definition, update, prefix = '') => {
    const [key, label = title(key), input] = Array.isArray(definition) ? definition : [definition]
    const options = Array.isArray(input) ? input : LANDLORD_CONDITIONAL_OPTIONS[key]
    return (
    <label key={key} className="grid gap-1 text-sm">
      <span>{label}</span>
      {isAddressFieldKey(key) ? <AddressInput aria-label={`${prefix}${label}`} value={row[key] ?? ''} disabled={disabled} onChange={event => update(key, event.target.value, event.address)} className="min-w-0 rounded-lg border p-2" /> : options ? <select
        aria-label={`${prefix}${label}`}
        value={row[key] ?? ''}
        disabled={disabled}
        onChange={(event) => update(key, event.target.value)}
        className="min-w-0 rounded-lg border p-2"
      ><option value="">Not captured</option>{row[key] && !options.some(([id]) => id === row[key]) ? <option value={row[key]}>{row[key]} (previous answer)</option> : null}{options.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select> : <input
        type={input || 'text'}
        min={input === 'number' ? 0 : undefined}
        max={key === 'ownershipShare' ? 100 : undefined}
        step={input === 'number' ? 'any' : undefined}
        aria-label={`${prefix}${label}`}
        value={row[key] ?? ''}
        disabled={disabled}
        onChange={(event) => update(key, event.target.value)}
        className="min-w-0 rounded-lg border p-2"
      />}
    </label>
    )
  }
  return (
    <div className="space-y-5">
      <RentalLandlordProfileEditor profile={data.profile} portfolio={data.portfolio} publicSource disabled={disabled} submitted={submitted} saveState={saveState} onChange={profile => onChange({ ...data, profile })} />
      {(data.portfolio || []).map((property, index) => (
        <details key={property.id} className="rounded-xl border border-[#dce7f2] bg-white p-4">
          <summary className="cursor-pointer text-sm font-semibold text-[#20364c]">
            Property {index + 1}: {property.title || property.address}
          <span className="ml-2 text-xs font-normal text-[#607387]">{property.address ? 'Address captured' : 'Address needed'}</span>
          </summary>
          <p className="mt-3 text-xs text-slate-600">
            Ask your agent to add or remove a property. Each property has its
            own disclosure and mandate evidence.
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {LANDLORD_PROPERTY_FIELDS.filter(
              (key) => !['id', 'furnished', 'petsAllowed'].includes(key) && rentalLandlordPropertyFieldVisible(key, property),
            ).map((key) =>
              field(
                property,
                key,
                (name, value, address) =>
                  onChange({
                    ...data,
                    portfolio: data.portfolio.map((item) =>
                      item.id === property.id
                        ? { ...item, ...(name === 'address' ? selectedAddressFields(address) : {}), [name]: value }
                        : item,
                    ),
                  }),
                `Property ${index + 1} `,
              ),
            )}
          </div>
        </details>
      ))}
    </div>
  )
}
