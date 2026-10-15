// @vitest-environment jsdom
import React, { createRef, useState } from 'react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import AddressInput from '../AddressInput'
import Field from '../../ui/Field'
import Modal from '../../ui/Modal'
import { selectedAddressFields } from '../addressInputModel'
import { loadGoogleMaps, hasGoogleMapsApiKey } from '../../../lib/googleMaps'

vi.mock('../../../lib/googleMaps', () => ({ loadGoogleMaps: vi.fn(), hasGoogleMapsApiKey: vi.fn() }))
const full = '1547 Bougainvillea Drive, Montana Tuine, Pretoria, 0182, South Africa'
const place = {
  id: 'google-place', formattedAddress: full,
  addressComponents: [
    { longText: '1547', types: ['street_number'] }, { longText: 'Bougainvillea Drive', types: ['route'] },
    { longText: 'Montana Tuine', types: ['sublocality_level_1'] }, { longText: 'Pretoria', types: ['locality'] },
    { longText: 'Gauteng', types: ['administrative_area_level_1'] }, { longText: '0182', types: ['postal_code'] },
    { longText: 'South Africa', types: ['country'] },
  ], location: { lat: -25.68, lng: 28.25 }, fetchFields: vi.fn(async () => {}),
}
const predictions = [{ placePrediction: { placeId: 'google-place', text: { toString: () => full }, mainText: { toString: () => '1547 Bougainvillea Drive' }, secondaryText: { toString: () => 'Montana Tuine, Pretoria' }, toPlace: () => place } }]
const search = vi.fn()
beforeEach(() => {
  vi.clearAllMocks()
  hasGoogleMapsApiKey.mockReturnValue(true)
  search.mockResolvedValue({ suggestions: predictions })
  place.fetchFields.mockResolvedValue(undefined)
  loadGoogleMaps.mockResolvedValue({ maps: { importLibrary: async () => ({ AutocompleteSessionToken: class {}, AutocompleteSuggestion: { fetchAutocompleteSuggestions: search } }) } })
})
afterEach(cleanup)

it('Escape dismisses address suggestions before it can close the containing dialog', async () => {
  const close = vi.fn()
  render(<Modal open title="Property address" onClose={close}><label>Address<AddressInput /></label></Modal>)
  const input = screen.getByRole('combobox', { name: 'Address' })
  fireEvent.focus(input)
  fireEvent.change(input, { target: { value: '1547 Boug' } })
  await screen.findByRole('option', { name: /Bougainvillea/ })
  fireEvent.keyDown(input, { key: 'Escape' })
  expect(screen.queryByRole('option')).toBeNull()
  expect(close).not.toHaveBeenCalled()
  fireEvent.keyDown(input, { key: 'Escape' })
  expect(close).toHaveBeenCalledTimes(1)
})

it('retains manual values, native validation, field names and forwarded refs without loading Maps on mount', () => {
  const ref = createRef()
  render(<label>Office address<AddressInput ref={ref} name="officeAddress" id="office" defaultValue="12 Main Road" required maxLength={500} /></label>)
  const input = screen.getByRole('combobox', { name: /Office address/ })
  expect(ref.current).toBe(input)
  expect(input.id).toBe('office')
  expect(input.required).toBe(true)
  expect(input.maxLength).toBe(500)
  expect(input.value).toBe('12 Main Road')
  expect(loadGoogleMaps).not.toHaveBeenCalled()
  fireEvent.change(input, { target: { value: '14 Other Road' } })
  expect(input.value).toBe('14 Other Road')
})

it('fills the selected street, city and postcode while preserving unrelated owner details and submitting the real field value', async () => {
  const submitted = vi.fn()
  function Capture() {
    const [form, setForm] = useState({ addressLine1: '', city: '', postalCode: '', ownerName: 'Kevin' })
    return <form onSubmit={event => { event.preventDefault(); submitted({ values: Object.fromEntries(new FormData(event.currentTarget)), form }) }}>
      <label>Property address<AddressInput name="propertyAddress" addressFormat="street" value={form.addressLine1} onChange={event => setForm(current => ({ ...current, addressLine1: event.target.value }))} onAddressSelect={address => setForm(current => ({ ...current, ...selectedAddressFields(address) }))} /></label>
      <label>City<input name="city" readOnly value={form.city} /></label><label>Postal code<input name="postalCode" readOnly value={form.postalCode} /></label><button>Save</button>
    </form>
  }
  render(<Capture />)
  const input = screen.getByRole('combobox', { name: /Property address/ })
  fireEvent.focus(input)
  fireEvent.change(input, { target: { value: '1547 Boug' } })
  await screen.findByRole('option', { name: /1547 Bougainvillea/ })
  fireEvent.keyDown(input, { key: 'ArrowDown' })
  fireEvent.keyDown(input, { key: 'Enter' })
  await waitFor(() => expect(input.value).toBe('1547 Bougainvillea Drive'))
  expect(screen.getByLabelText('City').value).toBe('Pretoria')
  expect(screen.getByLabelText('Postal code').value).toBe('0182')
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  expect(submitted).toHaveBeenCalledWith(expect.objectContaining({ values: { propertyAddress: '1547 Bougainvillea Drive', city: 'Pretoria', postalCode: '0182' }, form: expect.objectContaining({ ownerName: 'Kevin', googlePlaceId: 'google-place', latitude: -25.68 }) }))
  expect(search.mock.calls[0][0].sessionToken).toBeTruthy()
})

it('keeps address entry usable when Google cannot load', async () => {
  loadGoogleMaps.mockRejectedValue(new Error('Maps unavailable'))
  const changed = vi.fn()
  render(<AddressInput aria-label="Registered address" onChange={changed} />)
  const input = screen.getByRole('combobox', { name: 'Registered address' })
  fireEvent.focus(input)
  await waitFor(() => expect(loadGoogleMaps).toHaveBeenCalled())
  fireEvent.change(input, { target: { value: 'An address entered manually' } })
  expect(input.disabled).toBe(false)
  expect(changed).toHaveBeenLastCalledWith(expect.objectContaining({ target: expect.objectContaining({ value: 'An address entered manually' }), address: null }))
})

it('routes physical address fields through search while leaving email and postcode controls unchanged', () => {
  hasGoogleMapsApiKey.mockReturnValue(false)
  render(<><Field name="company_registered_address" aria-label="Company address" /><Field name="email_address" aria-label="Email address" type="email" /><Field name="postalCode" aria-label="Postal code" /></>)
  expect(screen.getByRole('combobox', { name: 'Company address' })).toBeTruthy()
  expect(screen.getByRole('textbox', { name: 'Email address' }).type).toBe('email')
  expect(screen.getByRole('textbox', { name: 'Postal code' })).toBeTruthy()
  expect(loadGoogleMaps).not.toHaveBeenCalled()
})

it('does not load Google for disabled address fields', () => {
  render(<AddressInput disabled aria-label="Office address" value="Saved address" />)
  const input = screen.getByRole('combobox', { name: 'Office address' })
  expect(input.disabled).toBe(true)
  expect(loadGoogleMaps).not.toHaveBeenCalled()
})

it('does not let a delayed Google selection replace a newer address typed by the user', async () => {
  let finishDetails
  place.fetchFields.mockImplementation(() => new Promise(resolve => { finishDetails = resolve }))
  const selected = vi.fn()
  render(<AddressInput aria-label="Property address" onAddressSelect={selected} />)
  const input = screen.getByRole('combobox', { name: 'Property address' })
  fireEvent.focus(input)
  fireEvent.change(input, { target: { value: '1547 Boug' } })
  fireEvent.click(await screen.findByRole('option', { name: /Bougainvillea/ }))
  await waitFor(() => expect(finishDetails).toBeTypeOf('function'))
  fireEvent.change(input, { target: { value: '12 New Address' } })
  finishDetails()
  await waitFor(() => expect(input.value).toBe('12 New Address'))
  expect(selected).not.toHaveBeenCalled()
})

it('resets an uncontrolled address when its form is reset', () => {
  render(<form aria-label="Capture"><AddressInput name="address" aria-label="Address" defaultValue="Initial address" /></form>)
  const input = screen.getByRole('combobox', { name: 'Address' })
  fireEvent.change(input, { target: { value: 'Changed address' } })
  fireEvent.reset(screen.getByRole('form', { name: 'Capture' }))
  expect(input.value).toBe('Initial address')
})
