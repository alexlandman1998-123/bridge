// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { buildRentalListingDraftStorageKey } from '../../../services/rentals/rentalWorkspaceScope'
import { buildRentalCanonicalFacts, buildRentalPublicationDraft } from '../../../services/rentals/rentalListingDraftModel'
import RentalListingCreatePage from '../RentalListingCreatePage'

window.scrollTo = vi.fn()

const mocks = vi.hoisted(() => ({ params: {}, create: vi.fn(), progress: vi.fn(async () => { throw new Error('Cloud saving unavailable in this recovery fixture') }), activate: vi.fn(async () => {}), update: vi.fn(), navigate: vi.fn(), loadMaps: vi.fn(), load: vi.fn(async () => null), scope: { organisationId: 'org-1', assignedAgentId: 'agent-1', branchId: '' } }))
vi.mock('react-router-dom', async (original) => ({ ...await original(), useNavigate: () => mocks.navigate, useParams: () => mocks.params }))
vi.mock('../../../context/WorkspaceContext', () => ({ useWorkspace: () => ({}) }))
vi.mock('../../../services/rentals/rentalWorkspaceScope', async (original) => ({ ...await original(), resolveRentalWorkspaceScope: () => mocks.scope }))
vi.mock('../../../services/rentals/rentalListingDraftService', () => ({ createRentalListingDraft: mocks.create, saveRentalListingProgress: mocks.progress, activateRentalListing: mocks.activate, updateRentalListingDraft: mocks.update, getRentalListingForAgent: mocks.load }))
vi.mock('../../../services/syndicationChannelAvailabilityService', () => ({ UNAVAILABLE_SYNDICATION_CHANNELS: {}, getSyndicationChannelAvailability: async () => ({ property24: { available: true }, private_property: { available: true }, agency_website: { available: true } }) }))
vi.mock('../../../lib/googleMaps', () => ({ hasGoogleMapsApiKey: () => true, loadGoogleMaps: mocks.loadMaps }))
vi.mock('../../../services/rentals/rentalLeadService', () => ({ listRentalLeads: async () => [] }))
vi.mock('../../../services/rentals/rentalLandlordListingHandoffService', () => ({ linkRentalLandlordLeadToListing: async () => null }))
const DRAFT_KEY = buildRentalListingDraftStorageKey({ organisationId: 'org-1', assignedAgentId: 'agent-1', branchId: '' })
afterEach(() => { mocks.params = {}; mocks.scope = { organisationId: 'org-1', assignedAgentId: 'agent-1', branchId: '' }; cleanup(); vi.clearAllMocks(); mocks.load.mockReset().mockResolvedValue(null); mocks.progress.mockReset().mockRejectedValue(new Error('Cloud saving unavailable in this recovery fixture')); window.localStorage.clear() })

it('activates a new rental after saving without landlord, mandate, deposit or availability capture', async () => {
  window.localStorage.setItem(DRAFT_KEY, JSON.stringify({ activeStep: 'review', form: { propertyAddress: '12 Example Road', monthlyRent: '11000', rentalPriceFrequency: 'monthly' } }))
  mocks.create.mockResolvedValue({ listing: { id: 'listing-1' } })
  render(<MemoryRouter><RentalListingCreatePage /></MemoryRouter>)
  expect(screen.queryByRole('button', { name: /Step.*Landlord/ })).toBeNull()
  fireEvent.click(await screen.findByRole('button', { name: /^(Save listing|Retry save listing)$/ }))
  await waitFor(() => expect(mocks.activate).toHaveBeenCalledWith({ id: 'listing-1' }, expect.objectContaining({ landlordName: '', mandateStatus: 'not_started' }), expect.anything()))
  expect(mocks.create.mock.invocationCallOrder[0]).toBeLessThan(mocks.activate.mock.invocationCallOrder[0])
  expect(mocks.navigate).toHaveBeenCalledWith('/agent/rentals/listings/listing-1/marketing', expect.anything())
})

it('opens the saved rental with a separate advertising warning after an unconfirmed queue response', async () => {
  window.localStorage.setItem(DRAFT_KEY, JSON.stringify({ activeStep: 'review', form: { propertyAddress: '12 Example Road', monthlyRent: '11000' } }))
  mocks.create.mockResolvedValue({ listing: { id: 'saved-rental' } })
  mocks.activate.mockResolvedValueOnce({ listingId: 'saved-rental', publicationError: 'Connection lost' })
  render(<MemoryRouter><RentalListingCreatePage /></MemoryRouter>)
  fireEvent.click(await screen.findByRole('button', { name: /^(Save listing|Retry save listing)$/ }))
  await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith('/agent/rentals/listings/saved-rental/marketing', expect.objectContaining({ state: expect.objectContaining({ rentalListingPublicationError: 'Connection lost' }) })))
  expect(mocks.create).toHaveBeenCalledTimes(1)
  expect(screen.queryByText(/Could not confirm saving to Listings/)).toBeNull()
})

it('retains the confirmed details receipt when activation fails and retries the same rental', async () => {
  window.localStorage.setItem(DRAFT_KEY, JSON.stringify({ activeStep: 'review', form: { propertyAddress: '12 Example Road', monthlyRent: '11000' } }))
  mocks.create.mockResolvedValue({ listing: { id: 'saved-rental', updatedAt: '2026-10-11T09:00:00Z', listingMedia: [{ id: 'saved-photo', media_type: 'image', file_url: 'https://storage.test/saved-photo.jpg', is_cover: true }] } })
  mocks.activate.mockRejectedValueOnce(new Error('Activation unavailable'))
  render(<MemoryRouter><RentalListingCreatePage /></MemoryRouter>)
  fireEvent.click(await screen.findByRole('button', { name: /^(Save listing|Retry save listing)$/ }))
  await screen.findByText('Activation unavailable')
  expect(screen.getByText(/Your rental details are saved/)).toBeTruthy()
  expect(screen.queryByText(/Could not confirm saving to Listings/)).toBeNull()
  expect(mocks.navigate).not.toHaveBeenCalled()
  mocks.update.mockResolvedValue({ listing: { id: 'saved-rental' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save listing', exact: true }))
  await waitFor(() => expect(mocks.update).toHaveBeenCalledWith('saved-rental', expect.anything(), expect.anything()))
  expect(mocks.update.mock.calls.at(-1)[1]).toMatchObject({ expectedUpdatedAt: '2026-10-11T09:00:00Z', coverImageId: 'saved-photo', galleryImages: [expect.objectContaining({ url: 'https://storage.test/saved-photo.jpg' })] })
  expect(mocks.update.mock.calls.at(-1)[1].galleryImages[0].file).toBeFalsy()
  expect(mocks.create).toHaveBeenCalledTimes(1)
})

it('offers an early checklist and focuses the address correction without saving', async () => {
  window.localStorage.setItem(DRAFT_KEY, JSON.stringify({ activeStep: 'property', form: { propertyAddress: 'Example Road', monthlyRent: '11000', selectedSyndicationChannels: ['private_property'], description: 'See www.example.test' } }))
  render(<MemoryRouter><RentalListingCreatePage /></MemoryRouter>)
  await waitFor(() => expect(screen.getByRole('combobox', { name: /Property address/i }).value).toBe('Example Road'))
  expect(screen.queryByRole('heading', { name: 'Where to advertise' })).toBeNull()
  const checklist = screen.getByRole('region', { name: 'Listing completion checklist' })
  expect(checklist.querySelector('details').open).toBe(false)
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
  expect(checklist.querySelector('details').open).toBe(true)
  const addressIssue = screen.getByText('Add the street number in Address details.', { exact: false })
  fireEvent.click(within(addressIssue.closest('li')).getByRole('button', { name: 'Edit street number' }))
  await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText('Street number')))
  expect(screen.getByLabelText('Street number').closest('details').open).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: 'Step 4: Photos & description' }))
  expect(screen.getByText('Remove website links from the public description.', { exact: false })).toBeTruthy()
  expect(mocks.create).not.toHaveBeenCalled()
})

it('edits, reviews and submits optional video and virtual-tour links', async () => {
  window.localStorage.setItem(DRAFT_KEY, JSON.stringify({ activeStep: 'marketing', form: { landlordName: 'Test Owner', propertyAddress: '12 Example Road', monthlyRent: '11000', rentalPriceFrequency: 'monthly', depositPolicy: 'no_deposit', availableFrom: '2026-10-01', description: 'Rental home' } }))
  mocks.create.mockResolvedValue({ listing: { id: 'listing-1' } })
  render(<MemoryRouter><RentalListingCreatePage /></MemoryRouter>)
  fireEvent.change(await screen.findByLabelText('Video link'), { target: { value: 'https://video.test/watch' } })
  fireEvent.change(screen.getByLabelText('Virtual tour link'), { target: { value: 'https://tour.test/view' } })
  fireEvent.click(screen.getByRole('button', { name: /Step.*Check & (publish|save)/ }))
  expect(screen.getByText('Video')).toBeTruthy()
  expect(screen.getByText('Virtual tour')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: /^(Save listing|Retry save listing)$/ }))
  await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1))
  expect(mocks.create.mock.calls[0][0]).toMatchObject({ videoLink: 'https://video.test/watch', virtualTourLink: 'https://tour.test/view' })
})



it('searches and selects an address, wires property cards and neutral counters, and restores the saved fields', async () => {
  const address = '81 Wild Avenue, Newlands, Pretoria, South Africa'
  const predictions = vi.fn((request, callback) => callback([{ description: address, place_id: 'place-81' }], 'OK'))
  const details = vi.fn((request, callback) => callback({ formatted_address: address, place_id: 'place-81', geometry: { location: { lat: () => -25.79, lng: () => 28.29 } }, address_components: [['81', 'street_number'], ['Wild Avenue', 'route'], ['Newlands', 'sublocality'], ['Pretoria', 'locality'], ['Gauteng', 'administrative_area_level_1'], ['0081', 'postal_code']].map(([long_name, type]) => ({ long_name, types: [type] })) }, 'OK'))
  mocks.loadMaps.mockResolvedValue({ maps: { places: { AutocompleteService: class { getPlacePredictions = predictions }, PlacesService: class { getDetails = details }, AutocompleteSessionToken: class {}, PlacesServiceStatus: { OK: 'OK', ZERO_RESULTS: 'ZERO_RESULTS' } } } })
  window.localStorage.setItem(DRAFT_KEY, JSON.stringify({ activeStep: 'property', form: { landlordName: 'Test Owner', propertyAddress: 'Old address', streetNumber: '999', streetName: 'Old Road', suburb: 'Old Suburb', monthlyRent: '11000', rentalPriceFrequency: 'monthly', depositPolicy: 'no_deposit', availableFrom: '2026-10-01', description: 'Rental home' } }))
  mocks.create.mockResolvedValue({ listing: { id: 'listing-1' } })
  const view = render(<MemoryRouter><RentalListingCreatePage /></MemoryRouter>)
  const categoryGroup = await screen.findByRole('group', { name: 'Property category' })
  expect(within(categoryGroup).getAllByRole('button')).toHaveLength(7)
  expect(screen.queryByText('Step 2 of 6')).toBeNull()
  expect(screen.queryByText('Add the property details.')).toBeNull()
  fireEvent.click(within(screen.getByRole('group', { name: 'Retirement accommodation' })).getByRole('button', { name: 'Yes' }))
  fireEvent.click(within(categoryGroup).getByRole('button', { name: 'Industrial' }))
  fireEvent.change(screen.getByLabelText('Property type'), { target: { value: 'Warehouse' } })
  const increase = screen.getByRole('button', { name: 'Increase Bedrooms' })
  expect(increase.hasAttribute('data-rental-control')).toBe(true)
  fireEvent.click(increase)
  fireEvent.click(increase)
  fireEvent.click(screen.getByRole('button', { name: 'Decrease Bedrooms' }))
  const search = screen.getByRole('combobox', { name: /Property address/i })
  fireEvent.focus(search)
  await waitFor(() => expect(mocks.loadMaps).toHaveBeenCalled())
  fireEvent.change(search, { target: { value: '81 Wild' } })
  await waitFor(() => {
    fireEvent.click(screen.getByRole('option', { name: address }))
    expect(details).toHaveBeenCalled()
  })
  await waitFor(() => expect(screen.getByRole('combobox', { name: /Property address/i }).value).toBe(address))
  expect(predictions.mock.calls[0][0]).toMatchObject({ componentRestrictions: { country: 'za' }, types: ['address'] })
  expect(details.mock.calls[0][0].placeId).toBe('place-81')
  const values = { propertyCategory: 'industrial', propertyType: 'Warehouse', retirementAccommodation: 'yes', bedrooms: '1', propertyAddress: address, streetNumber: '81', streetName: 'Wild Avenue', suburb: 'Newlands', city: 'Pretoria', province: 'Gauteng', postalCode: '0081', latitude: -25.79, longitude: 28.29, googlePlaceId: 'place-81' }
  fireEvent.click(screen.getByRole('button', { name: 'Save draft' }))
  expect(JSON.parse(window.localStorage.getItem(DRAFT_KEY)).form).toMatchObject(values)
  view.unmount()
  render(<MemoryRouter><RentalListingCreatePage /></MemoryRouter>)
  await waitFor(() => expect(screen.getByRole('button', { name: 'Industrial' }).getAttribute('aria-pressed')).toBe('true'))
  expect(screen.getByLabelText('Property type').value).toBe('Warehouse')
  expect(screen.queryByRole('group', { name: 'Retirement accommodation' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: /Step.*Check & (publish|save)/ }))
  fireEvent.click(await screen.findByRole('button', { name: /^(Save listing|Retry save listing)$/ }))
  await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1))
  expect(mocks.create.mock.calls[0][0]).toMatchObject(values)
})

it('clears saved address components and location when the address search is cleared', async () => {
  window.localStorage.setItem(DRAFT_KEY, JSON.stringify({ activeStep: 'property', form: { propertyAddress: 'Old address', streetNumber: '999', streetName: 'Old Road', suburb: 'Old Suburb', city: 'Old City', postalCode: '1234', latitude: -25, longitude: 28, googlePlaceId: 'old-place' } }))
  render(<MemoryRouter><RentalListingCreatePage /></MemoryRouter>)
  fireEvent.click(await screen.findByRole('button', { name: 'Clear address' }))
  fireEvent.click(screen.getByRole('button', { name: 'Save draft' }))
  expect(JSON.parse(window.localStorage.getItem(DRAFT_KEY)).form).toMatchObject({ propertyAddress: '', streetNumber: '', streetName: '', suburb: '', city: '', province: '', postalCode: '', latitude: '', longitude: '', googlePlaceId: '' })
})

it('keeps landlord and mandate capture available when editing a saved rental', async () => {
  mocks.params = { listingId: 'listing-1' }; mocks.load.mockResolvedValue({ id: 'listing-1', listingCategory: 'rental', propertyAddress: '12 Example Road', askingPrice: 11000 }); mocks.update.mockResolvedValue({ listing: { id: 'listing-1' } })
  const view = render(<MemoryRouter initialEntries={['/rentals/listing-1/edit?step=landlord']}><RentalListingCreatePage /></MemoryRouter>)
  fireEvent.click(await screen.findByRole('button', { name: /Trust A trust owns/ }))
  const values = { landlordType: 'trust', landlordName: 'Family Property Trust', landlordPhone: '+27 82 123 4567', landlordEmail: 'trust@example.com', mandateStatus: 'signed_uploaded', marketingApprovalStatus: 'approved', mandateStartDate: '2026-10-02', mandateEndDate: '2027-10-01' }
  const labels = { landlordName: 'Trust name (optional)', landlordPhone: 'Mobile', landlordEmail: 'Email', mandateStatus: 'Rental mandate', marketingApprovalStatus: 'Marketing approval', mandateStartDate: 'Mandate start date', mandateEndDate: 'Mandate end / expiry date' }
  for (const [name, value] of Object.entries(values)) {
    if (name !== 'landlordType') fireEvent.change(screen.getByLabelText(labels[name]), { target: { value } })
  }
  fireEvent.click(screen.getByRole('button', { name: 'Save draft' }))
  expect(JSON.parse(window.localStorage.getItem(DRAFT_KEY + ':edit:listing-1')).form).toMatchObject(values)
  view.unmount()
  render(<MemoryRouter initialEntries={['/rentals/listing-1/edit?step=landlord']}><RentalListingCreatePage /></MemoryRouter>)
  await screen.findByRole('button', { name: /Trust A trust owns/ })
  for (const [name, value] of Object.entries(values)) {
    if (name !== 'landlordType') expect(screen.getByLabelText(labels[name]).value).toBe(value)
  }
  fireEvent.click(screen.getByRole('button', { name: /Step.*Check & (publish|save)/ }))
  fireEvent.click(await screen.findByRole('button', { name: 'Save rental changes' }))
  await waitFor(() => expect(mocks.update).toHaveBeenCalledTimes(1))
  expect(mocks.update.mock.calls[0][1]).toMatchObject(values)
  expect(mocks.activate).not.toHaveBeenCalled()
  expect(mocks.navigate).toHaveBeenCalledWith('/agent/rentals/listings/listing-1/marketing', expect.objectContaining({ state: expect.objectContaining({ rentalListingChangesNotSent: true }) }))
})

it('shows photo progress, prevents duplicate submissions, and retries the existing draft after upload failure', async () => {
  window.localStorage.setItem(DRAFT_KEY, JSON.stringify({ activeStep: 'review', form: { landlordName: 'Test Owner', propertyAddress: '12 Example Road', monthlyRent: '11000', rentalPriceFrequency: 'monthly', depositPolicy: 'no_deposit', availableFrom: '2026-10-01', description: 'Rental home' } }))
  let rejectSave
  mocks.create.mockImplementation((form, context) => {
    context.onListingCreated('listing-1')
    context.onUploadProgress({ completed: 1, total: 26 })
    return new Promise((resolve, reject) => { rejectSave = reject })
  })
  mocks.update.mockResolvedValue({ listing: { id: 'listing-1' } })
  const { container } = render(<MemoryRouter><RentalListingCreatePage /></MemoryRouter>)
  const submit = await screen.findByRole('button', { name: /^(Save listing|Retry save listing)$/ })
  fireEvent.click(submit)
  fireEvent.submit(container.querySelector('form'))
  expect(mocks.create).toHaveBeenCalledTimes(1)
  expect(screen.getAllByRole('status').map(node => node.textContent).find(text => text.startsWith('Saving photos:'))).toBe('Saving photos: 1 of 26…')
  expect(screen.getByRole('button', { name: 'Saving rental…' }).disabled).toBe(true)
  rejectSave(Object.assign(new Error('Could not save photos: statement timeout'), { listingId: 'listing-1', galleryImages: [{ id: 'photo-0', url: 'https://storage.example/0.jpg' }] }))
  const retry = await screen.findByRole('button', { name: 'Retry save listing' })
  fireEvent.click(retry)
  await waitFor(() => expect(mocks.update).toHaveBeenCalled())
  expect(mocks.create).toHaveBeenCalledTimes(1)
  expect(mocks.update.mock.calls[0][0]).toBe('listing-1')
  expect(mocks.update.mock.calls[0][1].galleryImages[0].url).toBe('https://storage.example/0.jpg')
  await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith('/agent/rentals/listings/listing-1/marketing', expect.any(Object)))
})

it('asks documented category questions, filters property types, and retains hidden answers across category/title changes', async () => {
  window.localStorage.setItem(DRAFT_KEY, JSON.stringify({ activeStep: 'property', form: {} }))
  render(<MemoryRouter><RentalListingCreatePage /></MemoryRouter>)
  const title = await screen.findByLabelText('Ownership type')
  expect(screen.queryByLabelText('Unit number')).toBeNull()
  fireEvent.change(title, { target: { value: 'Unit' } })
  fireEvent.change(screen.getByLabelText('Unit number'), { target: { value: '12B' } })
  fireEvent.change(screen.getByLabelText('Complex / building'), { target: { value: 'The Atrium' } })
  fireEvent.change(title, { target: { value: 'Erf' } })
  expect(screen.queryByLabelText('Unit number')).toBeNull()
  fireEvent.click(within(screen.getByRole('group', { name: 'Property category' })).getByRole('button', { name: 'Industrial' }))
  expect(screen.getByLabelText('Property type').value).toBe('Warehouse')
  expect(within(screen.getByLabelText('Property type')).queryByRole('option', { name: 'Apartment' })).toBeNull()
  expect(screen.queryByLabelText('Pool')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: /Step.*Extra details/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Open Warehouse & loading' }))
  fireEvent.change(screen.getByLabelText('Truck access'), { target: { value: 'Superlink' } })
  fireEvent.change(screen.getByLabelText('Roller shutter doors'), { target: { value: '0' } })
  fireEvent.click(screen.getByRole('button', { name: 'Done' }))
  fireEvent.click(screen.getByRole('button', { name: 'Open Business premises' }))
  fireEvent.click(within(screen.getByRole('group', { name: 'Multi tenanted' })).getByRole('button', { name: 'No' }))
  fireEvent.click(screen.getByRole('button', { name: 'Done' }))
  fireEvent.click(screen.getByRole('button', { name: 'Step 1: Property details' }))
  fireEvent.click(within(screen.getByRole('group', { name: 'Property category' })).getByRole('button', { name: 'Residential' }))
  expect(screen.queryByLabelText('Truck access')).toBeNull()
  fireEvent.change(screen.getByLabelText('Ownership type'), { target: { value: 'Unit' } })
  expect(screen.getByLabelText('Unit number').value).toBe('12B')
  expect(screen.getByLabelText('Complex / building').value).toBe('The Atrium')
  fireEvent.click(within(screen.getByRole('group', { name: 'Property category' })).getByRole('button', { name: 'Industrial' }))
  fireEvent.click(screen.getByRole('button', { name: /Step.*Extra details/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Open Warehouse & loading' }))
  expect(screen.getByLabelText('Truck access').value).toBe('Superlink')
  expect(screen.getByLabelText('Roller shutter doors').value).toBe('0')
  fireEvent.click(screen.getByRole('button', { name: 'Done' }))
  fireEvent.click(screen.getByRole('button', { name: 'Open Business premises' }))
  expect(within(screen.getByRole('group', { name: 'Multi tenanted' })).getByRole('button', { name: 'No' }).getAttribute('aria-pressed')).toBe('true')
})

it('does not restore an unscoped legacy draft into the selected organisation', async () => {
  window.localStorage.setItem('arch9:rental-listing:create-draft', JSON.stringify({ activeStep: 'marketing', form: { landlordName: 'Other agency owner' } }))
  render(<MemoryRouter><RentalListingCreatePage /></MemoryRouter>)
  expect(screen.queryByText('Your saved rental draft was restored for this browser session.')).toBeNull()
  expect((await screen.findByRole('combobox', { name: /Property address/i })).value).toBe('')
  expect(window.localStorage.getItem('arch9:rental-listing:create-draft')).toContain('Other agency owner')
})

it('resets the editor on organisation switch and restores only that organisation draft', async () => {
  window.localStorage.setItem(DRAFT_KEY, JSON.stringify({ activeStep: 'landlord', form: { propertyAddress: 'First agency property', landlordName: 'First agency owner' } }))
  const secondKey = buildRentalListingDraftStorageKey({ ...mocks.scope, organisationId: 'org-2' })
  window.localStorage.setItem(secondKey, JSON.stringify({ activeStep: 'landlord', form: { propertyAddress: 'Second agency property', landlordName: 'Second agency owner' } }))
  const view = render(<MemoryRouter><RentalListingCreatePage /></MemoryRouter>)
  expect((await screen.findByRole('combobox', { name: /Property address/i })).value).toBe('First agency property')
  mocks.scope = { ...mocks.scope, organisationId: 'org-2' }
  view.rerender(<MemoryRouter><RentalListingCreatePage /></MemoryRouter>)
  expect((await screen.findByRole('combobox', { name: /Property address/i })).value).toBe('Second agency property')
  fireEvent.click(screen.getByRole('button', { name: 'Save draft' }))
  expect(JSON.parse(window.localStorage.getItem(DRAFT_KEY)).form.landlordName).toBe('First agency owner')
})

it('does not navigate back to the previous organisation when an earlier creation finishes', async () => {
  let finish
  window.localStorage.setItem(DRAFT_KEY, JSON.stringify({ activeStep: 'review', form: { landlordName: 'First agency owner', propertyAddress: '12 Example Road', monthlyRent: '11000', rentalPriceFrequency: 'monthly', depositPolicy: 'no_deposit', availableFrom: '2026-10-01', description: 'Rental home' } }))
  mocks.create.mockImplementation(() => new Promise(resolve => { finish = resolve }))
  const view = render(<MemoryRouter><RentalListingCreatePage /></MemoryRouter>)
  fireEvent.click(await screen.findByRole('button', { name: /^(Save listing|Retry save listing)$/ }))
  await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1))
  mocks.scope = { ...mocks.scope, organisationId: 'org-2' }
  view.rerender(<MemoryRouter><RentalListingCreatePage /></MemoryRouter>)
  await waitFor(() => expect(screen.getByRole('combobox', { name: /Property address/i }).value).toBe(''))
  await act(async () => finish({ listing: { id: 'old-agency-listing' } }))
  expect(mocks.navigate).not.toHaveBeenCalled()
})

const recoveryId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const recoveryForm = { landlordName: 'Test Owner', propertyAddress: '12 Example Road', monthlyRent: '11000', rentalPriceFrequency: 'monthly', depositPolicy: 'no_deposit', availableFrom: '2026-10-01', description: 'Rental home' }

it('persists the reservation before creating and reuses it after a lost response and refresh', async () => {
  window.localStorage.setItem(DRAFT_KEY, JSON.stringify({ activeStep: 'review', form: recoveryForm }))
  mocks.create.mockImplementation(async (_, context) => {
    expect(JSON.parse(window.localStorage.getItem(DRAFT_KEY)).creationId).toBe(context.creationId)
    throw new Error('Creation response was lost')
  })
  const view = render(<MemoryRouter><RentalListingCreatePage /></MemoryRouter>)
  fireEvent.click(await screen.findByRole('button', { name: /^(Save listing|Retry save listing)$/ }))
  await screen.findByText('Creation response was lost')
  const reserved = mocks.create.mock.calls[0][1].creationId
  expect(reserved).toMatch(/^[0-9a-f-]{36}$/)
  view.unmount()
  render(<MemoryRouter><RentalListingCreatePage /></MemoryRouter>)
  await screen.findByText(/Creation was not confirmed/)
  fireEvent.click(screen.getByRole('button', { name: 'Retry save listing' }))
  await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(2))
  expect(mocks.create.mock.calls[1][1].creationId).toBe(reserved)
})

it('recovers the saved rental and its photos after refresh without creating another rental', async () => {
  window.localStorage.setItem(DRAFT_KEY, JSON.stringify({ activeStep: 'review', creationId: recoveryId, pendingListingId: recoveryId, form: { ...recoveryForm, galleryImages: [] } }))
  const row = { id: recoveryId, listingCategory: 'rental', organisationId: 'org-1', assignedAgentId: 'agent-1',
    updatedAt: '2026-10-04T00:00:00Z', description: recoveryForm.description, sellerCanonicalFacts: buildRentalCanonicalFacts(recoveryForm),
    listingPublicationData: buildRentalPublicationDraft(recoveryForm),
    listingMedia: [{ id: 'saved-photo', media_type: 'image', file_url: 'https://photos.test/saved.jpg', is_cover: true, sort_order: 0 }] }
  mocks.load.mockResolvedValue(row)
  mocks.update.mockResolvedValue({ listing: row })
  render(<MemoryRouter><RentalListingCreatePage /></MemoryRouter>)
  await screen.findByText(/Your existing rental was recovered/)
  fireEvent.click(screen.getByRole('button', { name: 'Retry save listing' }))
  await waitFor(() => expect(mocks.update).toHaveBeenCalledTimes(1))
  expect(mocks.create).not.toHaveBeenCalled()
  expect(mocks.update.mock.calls[0][0]).toBe(recoveryId)
  expect(mocks.update.mock.calls[0][1].galleryImages).toEqual([expect.objectContaining({ id: 'saved-photo', url: 'https://photos.test/saved.jpg' })])
  await waitFor(() => expect(mocks.navigate).toHaveBeenCalled())
  expect(window.localStorage.getItem(DRAFT_KEY)).toBeNull()
})

it('blocks creation if the existing reservation cannot be verified', async () => {
  window.localStorage.setItem(DRAFT_KEY, JSON.stringify({ activeStep: 'review', creationId: recoveryId, form: recoveryForm }))
  mocks.load.mockRejectedValue(new Error('Unable to verify session'))
  render(<MemoryRouter><RentalListingCreatePage /></MemoryRouter>)
  await screen.findByText('Unable to verify session')
  expect(screen.getByRole('button', { name: 'Retry save listing' }).disabled).toBe(true)
  expect(mocks.create).not.toHaveBeenCalled()
})

it('does not create remotely when browser storage cannot retain the recovery identity', async () => {
  window.localStorage.setItem(DRAFT_KEY, JSON.stringify({ activeStep: 'review', form: recoveryForm }))
  render(<MemoryRouter><RentalListingCreatePage /></MemoryRouter>)
  const submit = await screen.findByRole('button', { name: /^(Save listing|Retry save listing)$/ })
  const storage = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Browser storage unavailable') })
  try {
    fireEvent.click(submit)
    await screen.findByText('Browser storage unavailable')
    expect(mocks.create).not.toHaveBeenCalled()
  } finally { storage.mockRestore() }
})

it('offers early publication choices and keeps selections on the advertising step', async () => {
 window.localStorage.setItem(DRAFT_KEY, JSON.stringify({ activeStep: 'property', form: { selectedSyndicationChannels: ['property24','private_property','agency_website'] } }))
 render(<MemoryRouter><RentalListingCreatePage /></MemoryRouter>)
 await screen.findByText(/Your saved rental draft was restored on this device/ )
 expect(screen.queryByRole('heading', { name: 'Where to advertise' })).toBeNull()
 expect(screen.queryByText('Check these details')).toBeNull()
 fireEvent.click(screen.getByRole('button', { name: /Step 5: Where to advertise/ }))
 expect(screen.getByRole('heading', { name: 'Where to advertise' })).toBeTruthy()
 expect(screen.getByText('3 websites selected')).toBeTruthy()
 expect(screen.queryByText('Check these details')).toBeNull()
 fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
 expect(screen.getByRole('region', { name: 'Listing completion checklist' }).querySelector('details').open).toBe(true)
 expect(mocks.create).not.toHaveBeenCalled()
 fireEvent.click(screen.getByRole('button', { name: /Step 1: Property details/ }))
 expect(screen.queryByRole('heading', { name: 'Where to advertise' })).toBeNull()
 expect(screen.queryByText('Check these details')).toBeNull()
})

it('distinguishes unanswered rooms, explicit studio zero and half bathrooms through draft recovery', async () => {
 const view = render(<MemoryRouter><RentalListingCreatePage /></MemoryRouter>)
 const bedrooms = await screen.findByRole('spinbutton', { name: 'Bedrooms', exact: true })
 expect(bedrooms.value).toBe('')
 expect(bedrooms.placeholder).toBe('Not added')
 fireEvent.click(screen.getByRole('button', { name: 'Studio? Set bedrooms to 0' }))
 fireEvent.change(screen.getByRole('spinbutton', { name: 'Bathrooms', exact: true }), { target: { value: '1.5' } })
 fireEvent.click(screen.getByRole('button', { name: 'Save draft' }))
 view.unmount()
 render(<MemoryRouter><RentalListingCreatePage /></MemoryRouter>)
 expect((await screen.findByRole('spinbutton', { name: 'Bedrooms', exact: true })).value).toBe('0')
 expect(screen.getByRole('spinbutton', { name: 'Bathrooms', exact: true }).value).toBe('1.5')
 fireEvent.change(screen.getByRole('spinbutton', { name: 'Bathrooms', exact: true }), { target: { value: '' } })
 fireEvent.click(screen.getByRole('button', { name: 'Save draft' }))
 expect(JSON.parse(localStorage.getItem(DRAFT_KEY)).form.bathrooms).toBe('')
})

it('corrects an invalid room count in its collapsed property section', async () => {
 localStorage.setItem(DRAFT_KEY, JSON.stringify({ activeStep: 'review', form: { propertyAddress: '12 Example Road', monthlyRent: '11000', studies: '1.5' } }))
 render(<MemoryRouter><RentalListingCreatePage /></MemoryRouter>)
 fireEvent.click(await screen.findByRole('button', { name: /^(Save listing|Retry save listing)$/ }))
 fireEvent.click(await screen.findByRole('button', { name: /Edit studies/i }))
 const input = screen.getByRole('spinbutton', { name: 'Studies', exact: true })
 await waitFor(() => expect(document.activeElement).toBe(input))
 expect(input.closest('details').open).toBe(true)
 expect(screen.getAllByText('Enter a valid studies.', { exact: false })).toHaveLength(1)
 fireEvent.change(input, { target: { value: '1' } })
 expect(screen.queryByText('Enter a valid studies.', { exact: false })).toBeNull()
 expect(mocks.create).not.toHaveBeenCalled()
})
it('opens and reopens the exact optional question from its correction button', async () => {
 localStorage.setItem(DRAFT_KEY, JSON.stringify({ activeStep: 'review', form: { propertyCategory: 'industrial', propertyType: 'Warehouse', propertyAddress: '12 Example Road', monthlyRent: '11000', rentalPortalFacts: { 'commercialInfo.rollerShutterDoors': -1 } } }))
 render(<MemoryRouter><RentalListingCreatePage /></MemoryRouter>)
 fireEvent.click(await screen.findByRole('button', { name: /^(Save listing|Retry save listing)$/ }))
 fireEvent.click(await screen.findByRole('button', { name: /Edit Roller shutter doors/i }))
 let input = await screen.findByRole('spinbutton', { name: 'Roller shutter doors' })
 await waitFor(() => expect(document.activeElement).toBe(input))
 fireEvent.click(screen.getByRole('button', { name: 'Done' }))
 fireEvent.click(screen.getByRole('button', { name: /Edit Roller shutter doors/i }))
 input = await screen.findByRole('spinbutton', { name: 'Roller shutter doors' })
 await waitFor(() => expect(document.activeElement).toBe(input))
 fireEvent.change(input, { target: { value: '2' } })
 expect(screen.queryByText('Enter a valid roller shutter doors.', { exact: false })).toBeNull()
 expect(mocks.create).not.toHaveBeenCalled()
})


it('retains the last typed address when leaving immediately before photo recovery runs', async () => {
 mocks.loadMaps.mockResolvedValue(null)
 window.localStorage.setItem(DRAFT_KEY, JSON.stringify({ activeStep: 'property', form: { propertyAddress: '12 Previous Road' } }))
 const view = render(<MemoryRouter><RentalListingCreatePage /></MemoryRouter>)
 const address = await screen.findByRole('combobox', { name: /Property address/i })
 await waitFor(() => expect(address.value).toBe('12 Previous Road'))
 fireEvent.change(address, { target: { value: '99 Latest Road' } })
 view.unmount()
 render(<MemoryRouter><RentalListingCreatePage /></MemoryRouter>)
 await waitFor(() => expect(screen.getByRole('combobox', { name: /Property address/i }).value).toBe('99 Latest Road'))
})

it('automatically recovers unsaved rental edits without pretending the server saved them', async () => {
 mocks.loadMaps.mockResolvedValue(null)
 mocks.params = { listingId: 'listing-1' }
 mocks.load.mockResolvedValue({ id: 'listing-1', listingCategory: 'rental', propertyAddress: '12 Saved Road', askingPrice: 11000, updatedAt: '2026-10-11T10:00:00Z' })
 const view = render(<MemoryRouter><RentalListingCreatePage /></MemoryRouter>)
 const address = await screen.findByRole('combobox', { name: /Property address/i })
 fireEvent.change(address, { target: { value: '99 Unsaved Road' } })
 view.unmount()
 render(<MemoryRouter><RentalListingCreatePage /></MemoryRouter>)
 await waitFor(() => expect(screen.getByRole('combobox', { name: /Property address/i }).value).toBe('99 Unsaved Road'))
 expect(mocks.update).not.toHaveBeenCalled()
})

it('requires a review choice for a competing edit and preserves newer untouched values', async () => {
 mocks.loadMaps.mockResolvedValue(null)
 mocks.params = { listingId: 'listing-1' }
 mocks.load.mockResolvedValue({ id: 'listing-1', listingCategory: 'rental', propertyAddress: '12 Saved Road', askingPrice: 11000, updatedAt: '2026-10-11T10:00:00Z' })
 const view = render(<MemoryRouter><RentalListingCreatePage /></MemoryRouter>)
 fireEvent.change(await screen.findByRole('combobox', { name: /Property address/i }), { target: { value: '99 My Draft Road' } })
 view.unmount()
 mocks.load.mockResolvedValue({ id: 'listing-1', listingCategory: 'rental', propertyAddress: '22 Other Agent Road', askingPrice: 15000, updatedAt: '2026-10-11T11:00:00Z' })
 render(<MemoryRouter><RentalListingCreatePage /></MemoryRouter>)
 const review = await screen.findByRole('button', { name: 'Review my draft changes' })
 expect(screen.getByRole('combobox', { name: /Property address/i }).value).toBe('22 Other Agent Road')
 expect(mocks.update).not.toHaveBeenCalled()
 fireEvent.click(review)
 expect(screen.getByRole('combobox', { name: /Property address/i }).value).toBe('99 My Draft Road')
 fireEvent.click(screen.getByRole('button', { name: /Step.*Rent & deposit/ }))
 expect(screen.getByLabelText(/Rental amount/).value).toBe('15000')
 expect(mocks.update).not.toHaveBeenCalled()
})


it('does not acknowledge a draft when only the older browser fallback can be written', async () => {
 mocks.loadMaps.mockResolvedValue(null)
 window.localStorage.setItem(DRAFT_KEY, JSON.stringify({ activeStep: 'property', form: { propertyAddress: '12 Previous Road' } }))
 const original = Storage.prototype.setItem
 const storage = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (key, value) {
  if (key.startsWith('arch9:listing-recovery:v2:')) throw new Error('New recovery receipt cannot fit')
  return original.call(this, key, value)
 })
 try {
  render(<MemoryRouter><RentalListingCreatePage /></MemoryRouter>)
  const address = await screen.findByRole('combobox', { name: /Property address/i })
  fireEvent.change(address, { target: { value: '99 Latest Road' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save draft' }))
  expect(await screen.findByText('New recovery receipt cannot fit')).toBeTruthy()
  expect(screen.queryByText(/Draft saved on this device/)).toBeNull()
  expect(address.value).toBe('99 Latest Road')
  expect(mocks.create).not.toHaveBeenCalled()
 } finally { storage.mockRestore() }
})


function cloudDraft(form, step = 'property') {
 return { id: 'listing-1', listingCategory: 'rental', listingStatus: 'seller_lead', updatedAt: '2026-10-11T12:00:00Z', organisationId: mocks.scope.organisationId, assignedAgentId: mocks.scope.assignedAgentId,
  sellerCanonicalFacts: { ...buildRentalCanonicalFacts(form), rentalCaptureDraft: { version: 1, step, form } }, listingPublicationData: { ...buildRentalPublicationDraft(form), status: 'Draft' } }
}

it('waits for confirmed saving and prevents duplicate draft requests without publishing', async () => {
 let finish
 mocks.progress.mockImplementation(() => new Promise(resolve => { finish = resolve }))
 render(<MemoryRouter><RentalListingCreatePage /></MemoryRouter>)
 const address = await screen.findByRole('combobox', { name: /Property address/i })
 fireEvent.change(address, { target: { value: '42 Unfinished Road' } })
 const save = screen.getByRole('button', { name: 'Save draft' })
 fireEvent.click(save); fireEvent.click(save)
 expect(mocks.progress).toHaveBeenCalledTimes(1)
 expect(screen.getByText('Saving to Listings…')).toBeTruthy()
 expect(screen.queryByText(/^Saved to Listings at/)).toBeNull()
 expect(mocks.progress.mock.calls[0][0].monthlyRent).toBe('')
 const form = mocks.progress.mock.calls[0][0]
 await act(async () => finish({ listing: cloudDraft(form) }))
 expect(await screen.findByText(/^Saved to Listings at/)).toBeTruthy()
 expect(screen.getByText(/Draft saved to Listings. Nothing was published/)).toBeTruthy()
 expect(mocks.activate).not.toHaveBeenCalled()
 expect(mocks.create).not.toHaveBeenCalled()
 expect(screen.getByRole('button', { name: 'Back to Listings' })).toBeTruthy()
})

it('reopens an unfinished cloud draft without device storage and publishes only on the final action', async () => {
 mocks.params = { listingId: 'listing-1' }
 const saved = cloudDraft({ propertyAddress: '42 Unfinished Road', propertyCategory: 'industrial', propertyType: 'Warehouse', monthlyRent: '', bedrooms: '', selectedSyndicationChannels: [] }, 'terms')
 mocks.load.mockResolvedValue(saved)
 mocks.update.mockResolvedValue({ listing: { ...saved, sellerCanonicalFacts: buildRentalCanonicalFacts({ propertyAddress: '42 Unfinished Road', monthlyRent: '14000' }) } })
 render(<MemoryRouter><RentalListingCreatePage /></MemoryRouter>)
 expect(await screen.findByRole('heading', { name: 'Continue rental draft' })).toBeTruthy()
 const rent = await screen.findByLabelText(/Rental amount/)
 expect(rent.value).toBe('')
 expect(screen.queryByRole('button', { name: 'Save rental changes' })).toBeNull()
 expect(mocks.activate).not.toHaveBeenCalled()
 fireEvent.change(rent, { target: { value: '14000' } })
 fireEvent.click(screen.getByRole('button', { name: /Step.*Check & publish/ }))
 fireEvent.click(screen.getByRole('button', { name: 'Save listing' }))
 await waitFor(() => expect(mocks.update).toHaveBeenCalledTimes(1))
 await waitFor(() => expect(mocks.activate).toHaveBeenCalledTimes(1))
})

it('keeps input and shows failed saving without claiming a cloud draft exists', async () => {
 mocks.progress.mockRejectedValue(new Error('Network connection lost'))
 render(<MemoryRouter><RentalListingCreatePage /></MemoryRouter>)
 const address = await screen.findByRole('combobox', { name: /Property address/i })
 fireEvent.change(address, { target: { value: '42 Keep My Work Road' } })
 fireEvent.click(screen.getByRole('button', { name: 'Save draft' }))
 expect(await screen.findByText('Network connection lost')).toBeTruthy()
 expect(screen.getByText(/Could not confirm saving to Listings/)).toBeTruthy()
 expect(screen.queryByText(/^Saved to Listings at/)).toBeNull()
 expect(address.value).toBe('42 Keep My Work Road')
 expect(mocks.activate).not.toHaveBeenCalled()
})


it('retains the first created revision across a failed draft upload and retry', async () => {
 const revision = '2026-10-11T11:30:00Z'
 mocks.progress.mockImplementation(async (_form, context) => {
  context.onListingCreated('listing-1', { updatedAt: revision })
  throw Object.assign(new Error('Photo upload interrupted'), { listingId: 'listing-1' })
 })
 render(<MemoryRouter><RentalListingCreatePage /></MemoryRouter>)
 await screen.findByRole('combobox', { name: /Property address/i })
 fireEvent.click(screen.getByRole('button', { name: 'Save draft' }))
 await screen.findByText('Photo upload interrupted')
 expect(JSON.parse(localStorage.getItem(DRAFT_KEY)).form.expectedUpdatedAt).toBe(revision)
 fireEvent.click(screen.getByRole('button', { name: 'Save draft' }))
 await waitFor(() => expect(mocks.progress).toHaveBeenCalledTimes(2))
 expect(mocks.progress.mock.calls[1][1].listingId).toBe('listing-1')
 expect(mocks.progress.mock.calls[1][0].expectedUpdatedAt).toBe(revision)
 expect(mocks.activate).not.toHaveBeenCalled()
})


it('lets a new rental correct invalid restored optional landlord data without requiring owner details', async () => {
 window.localStorage.setItem(DRAFT_KEY, JSON.stringify({ activeStep: 'review', form: { ...recoveryForm, landlordEmail: 'bad-email', landlordName: '' } }))
 render(<MemoryRouter><RentalListingCreatePage /></MemoryRouter>)
 const correction = await screen.findByRole('button', { name: 'Edit landlord email' })
 fireEvent.click(correction)
 const input = await screen.findByRole('textbox', { name: 'Email', exact: true })
 await waitFor(() => expect(document.activeElement).toBe(input))
 fireEvent.change(input, { target: { value: '' } })
 expect(screen.queryByText('Enter a valid landlord email address.')).toBeNull()
 expect(screen.getByRole('textbox', { name: /Full name/ }).required).toBe(false)
 fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
 expect(screen.getByRole('combobox', { name: /Property address/ })).toBeTruthy()
 expect(mocks.create).not.toHaveBeenCalled()
})
