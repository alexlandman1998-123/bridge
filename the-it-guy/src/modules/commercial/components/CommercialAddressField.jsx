import AddressAutocomplete from '../../../components/location/AddressAutocomplete'
import { buildManualCommercialAddressValue } from './commercialAddressFieldUtils'

function CommercialAddressField({
  mode = 'full_address',
  value = null,
  onChange,
  onManualInput,
  required = false,
  disabled = false,
  placeholder,
  label,
  description,
  error,
}) {
  const predictionTypes = mode === 'area' ? ['(regions)'] : ['address']
  const resolvedPlaceholder = placeholder || (mode === 'area' ? 'Search suburb, city or node...' : 'Start typing the property address...')

  return (
    <AddressAutocomplete
      value={value}
      onChange={(nextValue) => {
        onChange?.(nextValue ? { ...nextValue, geocodingStatus: 'google_place' } : null)
      }}
      onInputValueChange={(nextText) => {
        onManualInput?.(buildManualCommercialAddressValue(nextText, value))
      }}
      predictionTypes={predictionTypes}
      placeholder={resolvedPlaceholder}
      label={label}
      description={description}
      required={required}
      disabled={disabled}
      error={error}
    />
  )
}

export default CommercialAddressField
