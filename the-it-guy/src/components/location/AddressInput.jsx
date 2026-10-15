import { forwardRef, useEffect, useRef, useState } from 'react'
import AddressAutocomplete from './AddressAutocomplete'

// Keep existing string fields, validation and form submissions while offering
// the same Places search used by listing capture. Structured fields are filled
// by the owning form through onAddressSelect.
const AddressInput = forwardRef(function AddressInput({
  value, defaultValue = '', onChange, onAddressSelect, label, description,
  required = false, disabled = false, readOnly = false, placeholder,
  error, addressFormat = 'formatted', as: _as, rows: _rows, type: _type, addressSearch: _addressSearch, ...inputProps
}, ref) {
  const [uncontrolled, setUncontrolled] = useState(defaultValue)
  const [selected, setSelected] = useState(null)
  const inputRef = useRef(null)
  const current = String(value ?? uncontrolled ?? '')
  useEffect(() => {
    const form = inputRef.current?.form
    if (!form || value !== undefined) return
    const reset = () => { setUncontrolled(defaultValue); setSelected(null) }
    form.addEventListener('reset', reset)
    return () => form.removeEventListener('reset', reset)
  }, [defaultValue, value])
  const emit = (nextValue, address) => {
    setUncontrolled(nextValue)
    const target = { value: nextValue, name: inputProps.name || '', id: inputProps.id || '' }
    onChange?.({ target, currentTarget: target, address, type: 'change' })
  }
  if (readOnly) return <input {...inputProps} ref={ref} value={current} readOnly required={required} disabled={disabled} />
  return <AddressAutocomplete
    value={selected?.formattedAddress === current ? selected : { formattedAddress: current }}
    onChange={address => {
      const nextValue = (addressFormat === 'street' ? address?.streetAddress : address?.formattedAddress) || address?.formattedAddress || ''
      setSelected(address ? { ...address, formattedAddress: nextValue } : null)
      emit(nextValue, address)
      onAddressSelect?.(address)
    }}
    onInputValueChange={nextValue => { setSelected(null); emit(nextValue, null) }}
    inputRef={node => {
      inputRef.current = node
      if (typeof ref === 'function') ref(node)
      else if (ref) ref.current = node
    }}
    inputProps={inputProps}
    label={label} description={description} placeholder={placeholder || 'Search or enter an address'}
    required={required} disabled={disabled} error={error} hideUnavailableMessage
  />
})

export default AddressInput
