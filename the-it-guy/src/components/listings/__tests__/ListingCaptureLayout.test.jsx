// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import ListingCaptureLayout from '../ListingCaptureLayout'
import { buildListingAdvertPreview } from '../../../services/listings/listingAdvertPreviewModel'

afterEach(cleanup)

it('updates the preview from current text, explicit clearing and the selected cover without saving', () => {
  const onEdit = vi.fn()
  const form = { propertyType: 'house', listingTitle: 'Garden home', listingPrice: '1250000', estimatedAskingPrice: '900000', listingDescription: 'Two sunny rooms', listingImages: [{ id: 'one', url: 'blob:one' }, { id: 'two', url: 'blob:two' }], coverImageId: 'two' }
  const view = render(<ListingCaptureLayout form={form} onEdit={onEdit}><input aria-label="Capture" /></ListingCaptureLayout>)
  fireEvent.click(screen.getByRole('button', { name: 'Show draft preview' }))
  const preview = within(screen.getByRole('complementary', { name: 'Draft advert preview' }))
  expect(preview.getByText('Garden home')).toBeTruthy()
  expect(preview.getByText('R 1 250 000')).toBeTruthy()
  expect(preview.getByAltText('Selected cover photo').getAttribute('src')).toBe('blob:two')
  view.rerender(<ListingCaptureLayout form={{ ...form, listingTitle: '', listingPrice: '', listingDescription: '' }} onEdit={onEdit}><input aria-label="Capture" /></ListingCaptureLayout>)
  expect(preview.queryByText('Garden home')).toBeNull()
  expect(preview.getByText('Add the price')).toBeTruthy()
  expect(preview.getByText('Add a description to see it here.')).toBeTruthy()
  expect(onEdit).not.toHaveBeenCalled()
})

it.each(['monthly', 'weekly', 'daily', 'annual', 'per_square_metre'])('shows rental units and deposit separately for %s', frequency => {
  const model = buildListingAdvertPreview({ monthlyRent: '12500.75', rentalPriceFrequency: frequency, depositAmount: '25001.5' }, true)
  const suffix = { monthly: 'per month', weekly: 'per week', daily: 'per day', annual: 'per year', per_square_metre: 'per m²' }[frequency]
  expect(model.price.replaceAll('\u00a0', ' ')).toBe(`R 12 500,75 ${suffix}`)
  expect(model.deposit.replaceAll('\u00a0', ' ')).toBe('R 25 001,5')
})

it.each(['suburb_only', 'hide_exact', 'hide_street_address', 'hide_street_number', 'complex_only', undefined])('protects a private address and contacts for %s', visibility => {
  const model = buildListingAdvertPreview({ propertyAddress: '99 Private Road, Unit 123', streetNumber: '99', streetName: 'Private Road', suburb: 'Sandton', city: 'Johannesburg', complexName: 'The Estate', unitNumber: '123', exactAddressVisibility: visibility, landlordName: 'Secret Owner', landlordEmail: 'secret@example.test' }, true)
  expect(model.location).not.toMatch(/99|123/)
  expect(JSON.stringify(model)).not.toMatch(/Secret Owner|secret@example/)
})

it('shows the full entered address only when chosen and a safe placeholder for free-typed hidden addresses', () => {
  expect(buildListingAdvertPreview({ propertyAddress: '99 Private Road', exactAddressVisibility: 'show_exact_address' }).location).toBe('99 Private Road')
  expect(buildListingAdvertPreview({ propertyAddress: '99 Private Road' }).location).toBe('Add a suburb or city')
})

it('shows category measurements with units and hides stale room counts on business premises and land', () => {
  const model = buildListingAdvertPreview({ propertyCategory: 'industrial', bedrooms: '5', warehouseOrFactoryArea: '2200.5', yardSize: '900.5' })
  expect(model.facts).toEqual([{ label: 'Warehouse / factory area', value: '2200.5 m²' }, { label: 'Yard size', value: '900.5 m²' }])
  const land = buildListingAdvertPreview({ propertyCategory: 'vacant_land', bedrooms: '2', floorSize: '50', erfSize: '500.5' })
  expect(land.facts).toEqual([{ label: 'Land size', value: '500.5 m²' }])
  expect(buildListingAdvertPreview({ propertyCategory: 'agricultural', farmSize: '42.5' }).facts).toContainEqual({ label: 'Farm size', value: '42.5 hectares' })
})

it('previews legacy rentals in the general listing editor with their monthly rent, photos and text', () => {
  const model = buildListingAdvertPreview({ listingType: 'rental', listingPrice: '25000', listingTitle: 'Warehouse to let', listingDescription: 'Truck access', listingImages: [{ id: 'cover', url: 'blob:warehouse' }] }, true)
  expect(model.price.replaceAll('\u00a0', ' ')).toBe('R 25 000 per month')
  expect(model).toMatchObject({ title: 'Warehouse to let', description: 'Truck access', coverUrl: 'blob:warehouse', photoCount: 1 })
})

it('keeps zero bedrooms, fractional bathrooms, POA and malformed price values distinct', () => {
  expect(buildListingAdvertPreview({ bedrooms: '0', bathrooms: '1.5', priceOnApplication: true, listingPrice: '1500000' })).toMatchObject({ price: 'Price on application', facts: [{ label: 'Bedrooms', value: '0' }, { label: 'Bathrooms', value: '1.5' }] })
  expect(buildListingAdvertPreview({ listingPrice: 'oops' }).price).toBe('Add the price')
})

it('lets agents navigate from the preview with buttons that cannot submit the form', () => {
  const onEdit = vi.fn()
  render(<ListingCaptureLayout form={{}} rental onEdit={onEdit} />)
  fireEvent.click(screen.getByRole('button', { name: 'Show draft preview' }))
  const button = screen.getByRole('button', { name: 'Change rent' })
  expect(button.type).toBe('button')
  fireEvent.click(button)
  expect(onEdit).toHaveBeenCalledWith('terms')
  expect(screen.getByText(/Each website may display it differently/)).toBeTruthy()
})

it('keeps the streamlined sales preview read-only without helper copy or stage shortcuts', () => {
 render(<ListingCaptureLayout streamlined form={{ listingTitle: 'Garden home' }} onEdit={vi.fn()} />)
 fireEvent.click(screen.getByRole('button', { name: 'Show draft preview' }))
 expect(screen.getByText('Garden home')).toBeTruthy()
 expect(screen.queryByText(/Updates as you type/)).toBeNull()
 expect(screen.queryByRole('button', { name: /Change property details/ })).toBeNull()
 expect(screen.queryByRole('button', { name: /Change price/ })).toBeNull()
 expect(screen.queryByRole('button', { name: /Change photos/ })).toBeNull()
})
