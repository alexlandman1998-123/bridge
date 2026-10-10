// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { buildRentalListingDraftStorageKey } from '../../../services/rentals/rentalWorkspaceScope'
import { buildRentalCanonicalFacts, buildRentalPublicationDraft } from '../../../services/rentals/rentalListingDraftModel'
import RentalListingCreatePage from '../RentalListingCreatePage'

window.scrollTo = vi.fn()

const mocks = vi.hoisted(() => ({ params: {}, create: vi.fn(), activate: vi.fn(async () => {}), update: vi.fn(), navigate: vi.fn(), loadMaps: vi.fn(), load: vi.fn(async () => null), scope: { organisationId: 'org-1', assignedAgentId: 'agent-1', branchId: '' } }))
vi.mock('react-router-dom', async (original) => ({ ...await original(), useNavigate: () => mocks.navigate, useParams: () => mocks.params }))
vi.mock('../../../context/WorkspaceContext', () => ({ useWorkspace: () => ({}) }))
vi.mock('../../../services/rentals/rentalWorkspaceScope', async (original) => ({ ...await original(), resolveRentalWorkspaceScope: () => mocks.scope }))
vi.mock('../../../services/rentals/rentalListingDraftService', () => ({ createRentalListingDraft: mocks.create, activateRentalListing: mocks.activate, updateRentalListingDraft: mocks.update, getRentalListingForAgent: mocks.load }))
vi.mock('../../../services/syndicationChannelAvailabilityService', () => ({ UNAVAILABLE_SYNDICATION_CHANNELS: {}, getSyndicationChannelAvailability: async () => ({ property24: { available: true }, private_property: { available: true }, agency_website: { available: true } }) }))
vi.mock('../../../lib/googleMaps', () => ({ hasGoogleMapsApiKey: () => true, loadGoogleMaps: mocks.loadMaps }))
vi.mock('../../../services/rentals/rentalLeadService', () => ({ listRentalLeads: async () => [] }))
vi.mock('../../../services/rentals/rentalLandlordListingHandoffService', () => ({ linkRentalLandlordLeadToListing: async () => null }))
const DRAFT_KEY = buildRentalListingDraftStorageKey({ organisationId: 'org-1', assignedAgentId: 'agent-1', branchId: '' })
afterEach(() => { mocks.params = {}; mocks.scope = { organisationId: 'org-1', assignedAgentId: 'agent-1', branchId: '' }; cleanup(); vi.clearAllMocks(); mocks.load.mockReset().mockResolvedValue(null); window.localStorage.clear() })

it('activates a new rental after saving without landlord, mandate, deposit or availability capture', async () => {
  window.localStorage.setItem(DRAFT_KEY, JSON.stringify({ activeStep: 'review', form: { propertyAddress: '12 Example Road', monthlyRent: '11000', rentalPriceFrequency: 'monthly' } }))
  mocks.create.mockResolvedValue({ listing: { id: 'listing-1' } })
  render(<MemoryRouter><RentalListingCreatePage /></MemoryRouter>)
  expect(screen.queryByRole('button', { name: /Step.*Landlord/ })).toBeNull()
  fireEvent.click(await screen.findByRole('button', { name: 'Submit & activate' }))
  await waitFor(() => expect(mocks.activate).toHaveBeenCalledWith({ id: 'listing-1' }, expect.objectContaining({ landlordName: '', mandateStatus: 'not_started' }), expect.anything()))
  expect(mocks.create.mock.invocationCallOrder[0]).toBeLessThan(mocks.activate.mock.invocationCallOrder[0])
  expect(mocks.navigate).toHaveBeenCalledWith('/agent/rentals/listings/listing-1/marketing', expect.anything())
})

it('shows channel errors only after Continue in each section', async () => {
  window.localStorage.setItem(DRAFT_KEY, JSON.stringify({ activeStep: 'property', form: { propertyAddress: 'Example Road', monthlyRent: '11000', selectedSyndicationChannels: ['private_property'], description: 'See www.example.test' } }))
  render(<MemoryRouter><RentalListingCreatePage /></MemoryRouter>)
  await waitFor(() => expect(screen.getByRole('combobox', { name: /Property address/i }).value).toBe('Example Road'))
  expect(screen.queryByText('Where to publish')).toBeNull()
  expect(screen.queryByText('Check these fields for your selected channels')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
  const addressIssue = await screen.findByText('Add the street number in Address details.', { exact: false, selector: 'li > span' })
  expect(screen.queryByText('Remove website links from the public description.', { exact: false })).toBeNull()
  fireEvent.click(within(addressIssue.closest('li')).getByRole('button', { name: 'Edit field' }))
  await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText('Street number')))
  expect(screen.getByLabelText('Street number').closest('details').open).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: 'Step 4: Marketing' }))
  expect(screen.queryByText('Remove website links from the public description.', { exact: false })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
  expect(screen.getByText('Remove website links from the public description.', { exact: false, selector: 'li > span' })).toBeTruthy()
  expect(mocks.create).not.toHaveBeenCalled()
})

it('edits, reviews and submits optional video and virtual-tour links', async () => {
  window.localStorage.setItem(DRAFT_KEY, JSON.stringify({ activeStep: 'marketing', form: { landlordName: 'Test Owner', propertyAddress: '12 Example Road', monthlyRent: '11000', rentalPriceFrequency: 'monthly', depositPolicy: 'no_deposit', availableFrom: '2026-10-01', description: 'Rental home' } }))
  mocks.create.mockResolvedValue({ listing: { id: 'listing-1' } })
  render(<MemoryRouter><RentalListingCreatePage /></MemoryRouter>)
  fireEvent.change(await screen.findByLabelText('Video link'), { target: { value: 'https://video.test/watch' } })
  fireEvent.change(screen.getByLabelText('Virtual tour link'), { target: { value: 'https://tour.test/view' } })
  fireEvent.click(screen.getByRole('button', { name: /Review/ }))
  expect(screen.getByText('Video:')).toBeTruthy()
  expect(screen.getByText('Virtual tour:')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Submit & activate' }))
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
  expect(within(categoryGroup).getAllByRole('button')).toHaveLength(6)
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
  fireEvent.click(screen.getByRole('button', { name: /Review/ }))
  fireEvent.click(await screen.findByRole('button', { name: 'Submit & activate' }))
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
  window.localStorage.setItem(DRAFT_KEY + ':edit:listing-1', JSON.stringify({ activeStep: 'landlord', form: { propertyAddress: '12 Example Road', monthlyRent: '11000', rentalPriceFrequency: 'monthly', depositPolicy: 'no_deposit', availableFrom: '2026-10-01', description: 'Rental home' } }))
  mocks.params = { listingId: 'listing-1' }; mocks.load.mockResolvedValue({ id: 'listing-1', listingCategory: 'rental', propertyAddress: '12 Example Road', askingPrice: 11000 }); mocks.update.mockResolvedValue({ listing: { id: 'listing-1' } })
  const view = render(<MemoryRouter initialEntries={['/rentals/listing-1/edit?step=landlord']}><RentalListingCreatePage /></MemoryRouter>)
  fireEvent.click(await screen.findByRole('button', { name: /Trust A trust owns/ }))
  const values = { landlordType: 'trust', landlordName: 'Family Property Trust', landlordPhone: '+27 82 123 4567', landlordEmail: 'trust@example.com', mandateStatus: 'signed_uploaded', marketingApprovalStatus: 'approved', mandateStartDate: '2026-10-02', mandateEndDate: '2027-10-01' }
  const labels = { landlordName: 'Trust name *', landlordPhone: 'Mobile', landlordEmail: 'Email', mandateStatus: 'Rental mandate', marketingApprovalStatus: 'Marketing approval', mandateStartDate: 'Mandate start date', mandateEndDate: 'Mandate end / expiry date' }
  for (const [name, value] of Object.entries(values)) {
    if (name !== 'landlordType') fireEvent.change(screen.getByLabelText(labels[name]), { target: { value } })
  }
  fireEvent.click(screen.getByRole('button', { name: 'Save draft' }))
  expect(JSON.parse(window.localStorage.getItem(DRAFT_KEY + ':edit:listing-1')).form).toMatchObject(values)
  mocks.load.mockResolvedValue({ id: 'listing-1', listingCategory: 'rental', propertyAddress: '12 Example Road', askingPrice: 11000, sellerCanonicalFacts: buildRentalCanonicalFacts({ ...values, propertyAddress: '12 Example Road', monthlyRent: '11000', rentalPriceFrequency: 'monthly' }) })
  view.unmount()
  render(<MemoryRouter initialEntries={['/rentals/listing-1/edit?step=landlord']}><RentalListingCreatePage /></MemoryRouter>)
  await screen.findByRole('button', { name: /Trust A trust owns/ })
  for (const [name, value] of Object.entries(values)) {
    if (name !== 'landlordType') expect(screen.getByLabelText(labels[name]).value).toBe(value)
  }
  fireEvent.click(screen.getByRole('button', { name: /Review/ }))
  fireEvent.click(await screen.findByRole('button', { name: 'Save rental changes' }))
  await waitFor(() => expect(mocks.update).toHaveBeenCalledTimes(1))
  expect(mocks.update.mock.calls[0][1]).toMatchObject(values)
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
  const submit = await screen.findByRole('button', { name: 'Submit & activate' })
  fireEvent.click(submit)
  fireEvent.submit(container.querySelector('form'))
  expect(mocks.create).toHaveBeenCalledTimes(1)
  expect(screen.getByRole('status').textContent).toBe('Saving photos: 1 of 26…')
  expect(screen.getByRole('button', { name: 'Saving rental…' }).disabled).toBe(true)
  rejectSave(Object.assign(new Error('Could not save photos: statement timeout'), { listingId: 'listing-1', galleryImages: [{ id: 'photo-0', url: 'https://storage.example/0.jpg' }] }))
  const retry = await screen.findByRole('button', { name: 'Retry submit & activate' })
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
  const title = await screen.findByLabelText('Ownership / title type')
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
  fireEvent.click(screen.getByRole('button', { name: /Additional property details/ }))
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
  fireEvent.change(screen.getByLabelText('Ownership / title type'), { target: { value: 'Unit' } })
  expect(screen.getByLabelText('Unit number').value).toBe('12B')
  expect(screen.getByLabelText('Complex / building').value).toBe('The Atrium')
  fireEvent.click(within(screen.getByRole('group', { name: 'Property category' })).getByRole('button', { name: 'Industrial' }))
  fireEvent.click(screen.getByRole('button', { name: /Additional property details/ }))
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
  fireEvent.click(await screen.findByRole('button', { name: 'Submit & activate' }))
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
  fireEvent.click(await screen.findByRole('button', { name: 'Submit & activate' }))
  await screen.findByText('Creation response was lost')
  const reserved = mocks.create.mock.calls[0][1].creationId
  expect(reserved).toMatch(/^[0-9a-f-]{36}$/)
  view.unmount()
  render(<MemoryRouter><RentalListingCreatePage /></MemoryRouter>)
  await screen.findByText(/Creation was not confirmed/)
  fireEvent.click(screen.getByRole('button', { name: 'Retry submit & activate' }))
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
  fireEvent.click(screen.getByRole('button', { name: 'Retry submit & activate' }))
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
  expect(screen.getByRole('button', { name: 'Retry submit & activate' }).disabled).toBe(true)
  expect(mocks.create).not.toHaveBeenCalled()
})

it('does not create remotely when browser storage cannot retain the recovery identity', async () => {
  window.localStorage.setItem(DRAFT_KEY, JSON.stringify({ activeStep: 'review', form: recoveryForm }))
  render(<MemoryRouter><RentalListingCreatePage /></MemoryRouter>)
  const submit = await screen.findByRole('button', { name: 'Submit & activate' })
  const storage = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Browser storage unavailable') })
  try {
    fireEvent.click(submit)
    await screen.findByText('Browser storage unavailable')
    expect(mocks.create).not.toHaveBeenCalled()
  } finally { storage.mockRestore() }
})

it('shows publication choices only on the Channels step, keeping selections when going back', async () => {
 window.localStorage.setItem(DRAFT_KEY, JSON.stringify({ activeStep: 'property', form: { selectedSyndicationChannels: ['property24','private_property','agency_website'] } }))
 render(<MemoryRouter><RentalListingCreatePage /></MemoryRouter>)
 await screen.findByText(/Your saved rental draft was restored on this device/ )
 expect(screen.queryByText('Where to publish')).toBeNull()
 expect(screen.queryByText('Check these fields for your selected channels')).toBeNull()
 fireEvent.click(screen.getByRole('button', { name: /Step 5: Syndication/ }))
 expect(screen.getByText('Where to publish')).toBeTruthy()
 expect(screen.getByText('3 external selected')).toBeTruthy()
 expect(screen.queryByText('Check these fields for your selected channels')).toBeNull()
 fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
 expect(screen.getByText('Check these fields for your selected channels')).toBeTruthy()
 expect(mocks.create).not.toHaveBeenCalled()
 fireEvent.click(screen.getByRole('button', { name: /Step 1: Property details/ }))
 expect(screen.queryByText('Where to publish')).toBeNull()
 expect(screen.queryByText('Check these fields for your selected channels')).toBeNull()
})
