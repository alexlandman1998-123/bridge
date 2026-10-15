// @vitest-environment jsdom
import { useState } from 'react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import SellerLeadCreateDialog from '../SellerLeadCreateDialog'
import SellerCaptureDocuments from '../../onboarding/SellerCaptureDocuments'
import { SellerOnboarding } from '../../../pages/SellerOnboarding'
import * as demoLinks from '../../../lib/onboardingDemoLinks'
import { createAgencyCrmLeadRecord } from '../../../lib/agencyCrmRepository'
import { getPrivateListing, persistSellerProfileOnboardingFormData, syncPrivateListingRequirements, updateSellerOnboardingProgress } from '../../../services/privateListingService'
import { removeLeadCollaborator } from '../../../services/leadCollaboratorService'
import { updateAgencyCrmLeadRecord } from '../../../lib/agencyCrmRepository'
import { hasGoogleMapsApiKey, loadGoogleMaps } from '../../../lib/googleMaps'

vi.mock('../../../lib/googleMaps', () => ({ hasGoogleMapsApiKey: vi.fn(() => false), loadGoogleMaps: vi.fn() }))

const store = vi.hoisted(() => ({ listing: null, uploads: [], creates: 0, activities: [], collaborators: [] }))
vi.mock('../../../services/leadCollaboratorService', () => ({
  addLeadCollaborator: vi.fn(async payload => { store.collaborators.push(payload); return payload }),
  removeLeadCollaborator: vi.fn(async () => true),
}))
vi.mock('../../../lib/agencyCrmRepository', async importOriginal => ({ ...await importOriginal(),
  createAgencyCrmLeadRecord: vi.fn(async (org, payload) => { store.creates++; return { leadId: payload.leadId, contactId: payload.contact.contactId } }),
  updateAgencyCrmLeadRecord: vi.fn(async () => ({})),
  updateAgencyCrmContactRecord: vi.fn(async () => ({})),
  createAgencyCrmLeadActivity: vi.fn(async (org, id, payload) => { store.activities.push(payload) }),
}))
vi.mock('../../../services/privateListingService', async importOriginal => ({ ...await importOriginal(),
  createPrivateListing: vi.fn(async () => ({ listing: { id: 'listing-1', listingStatus: 'seller_lead' } })),
  persistSellerProfileOnboardingFormData: vi.fn(async payload => {
    const row = { id: 'onboarding-1', token: payload.token, status: payload.status, form_data: structuredClone(payload.formData) }
    store.listing = { id: 'listing-1', sellerOnboarding: { ...row, formData: row.form_data } }
    return row
  }),
  updateSellerOnboardingProgress: vi.fn(async (token, payload) => {
    store.listing = { ...store.listing, sellerOnboarding: { ...store.listing.sellerOnboarding, token, status: payload.status, formData: structuredClone(payload.formData) } }
    return { listing: store.listing }
  }),
  getSellerOnboardingByToken: vi.fn(async () => ({ listing: { ...store.listing, documents: store.uploads, documentRequirements: [{ id: 'request-1', requirement_key: 'identity_document', requirement_name: 'Sam — identity document', requirement_group: 'seller', status: 'missing' }, { id: 'request-2', requirement_key: 'signed_mandate', requirement_name: 'Signed mandate', status: 'missing' }] } })),
  getPrivateListing: vi.fn(async () => ({ ...store.listing, documents: store.uploads, documentRequirements: [{ id: 'request-1', requirement_key: 'identity_document', requirement_name: 'Sam — identity document', requirement_group: 'seller', status: 'missing' }, { id: 'request-2', requirement_key: 'signed_mandate', requirement_name: 'Signed mandate', status: 'missing' }] })),
  syncPrivateListingRequirements: vi.fn(async () => ({})),
  uploadPrivateListingDocument: vi.fn(async (id, file, options) => {
    store.uploads.push({ id: `file-${store.uploads.length + 1}`, document_name: file.name, status: options.status, ...options })
  }),
}))

beforeEach(() => { vi.clearAllMocks(); hasGoogleMapsApiKey.mockReturnValue(false); store.listing = null; store.uploads = []; store.creates = 0; store.activities = []; store.collaborators = []; vi.spyOn(window, 'scrollTo').mockImplementation(() => {}) })
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks() })

function renderDialog(onCreated = vi.fn(), props = {}) {
  render(<MemoryRouter><SellerLeadCreateDialog organisationId="org-1" actor={{ id: 'agent-1' }} assignedAgent={{ id: 'agent-1' }} source="Referral" onClose={() => {}} onCreated={onCreated} {...props} /></MemoryRouter>)
  return onCreated
}

async function pauseTyping(milliseconds = 1000) {
  await act(async () => { await vi.advanceTimersByTimeAsync(milliseconds) })
}

async function selectGoogleAddress(input) {
  const full = '1547 Bougainvillea Drive, Montana Tuine, Pretoria, Gauteng, 0182'
  hasGoogleMapsApiKey.mockReturnValue(true)
  const place = { id: 'fixture-place', formattedAddress: full, fetchFields: async () => {},
    addressComponents: [['1547', 'street_number'], ['Bougainvillea Drive', 'route'], ['Montana Tuine', 'sublocality_level_1'],
      ['Pretoria', 'locality'], ['Gauteng', 'administrative_area_level_1'], ['0182', 'postal_code'], ['South Africa', 'country']]
      .map(([longText, type]) => ({ longText, types: [type] })),
  }
  loadGoogleMaps.mockResolvedValue({ maps: { importLibrary: async () => ({ AutocompleteSessionToken: class {},
    AutocompleteSuggestion: { fetchAutocompleteSuggestions: async () => ({ suggestions: [{ placePrediction: {
      placeId: place.id, text: { toString: () => full }, toPlace: () => place,
    } }] }) },
  }) } })
  fireEvent.focus(input)
  fireEvent.change(input, { target: { value: '1547 Boug' } })
  fireEvent.click(await screen.findByRole('option', { name: /Bougainvillea/ }))
  await waitFor(() => expect(input.value).toContain('Bougainvillea Drive'))
}

test('Google selection in lead details fills the shared property address and persists it with the lead', async () => {
  const created = renderDialog()
  await screen.findByLabelText('First name', { exact: true })
  fireEvent.change(screen.getByLabelText('First name', { exact: true }), { target: { value: 'Sam' } })
  await selectGoogleAddress(screen.getByLabelText('Address', { exact: true }))
  fireEvent.click(screen.getByRole('tab', { name: 'Property details', exact: true }))
  expect(screen.getByLabelText('Address line 1', { exact: true }).value).toBe('1547 Bougainvillea Drive')
  expect(screen.getByLabelText('Suburb', { exact: true }).value).toBe('Montana Tuine')
  expect(screen.getByLabelText('City', { exact: true }).value).toBe('Pretoria')
  expect(screen.getByLabelText('Postal Code', { exact: true }).value).toBe('0182')
  await waitFor(() => expect(screen.getByRole('button', { name: 'Save lead', exact: true }).disabled).toBe(false))
  fireEvent.click(screen.getByRole('button', { name: 'Save lead', exact: true }))
  await waitFor(() => expect(created).toHaveBeenCalledTimes(1))
  expect(store.listing.sellerOnboarding.formData).toMatchObject({ sellerFirstName: 'Sam', propertyAddressLine1: '1547 Bougainvillea Drive',
    city: 'Pretoria', suburb: 'Montana Tuine', province: 'Gauteng', postalCode: '0182',
    propertyAddressDetails: { placeId: 'fixture-place', source: 'google_places' },
  })
  expect(store.creates).toBe(1)
})

test('property search offers Google suggestions and clearing the lead address removes the selected place', async () => {
  renderDialog()
  await screen.findByLabelText('First name', { exact: true })
  fireEvent.click(screen.getByRole('tab', { name: 'Property details', exact: true }))
  await selectGoogleAddress(screen.getByLabelText('Search address', { exact: true }))
  expect(screen.getByLabelText('City', { exact: true }).value).toBe('Pretoria')
  fireEvent.click(screen.getByRole('tab', { name: 'Lead details', exact: true }))
  fireEvent.change(screen.getByLabelText('Address', { exact: true }), { target: { value: '' } })
  expect(screen.getByLabelText('Address', { exact: true }).value).toBe('')
  await waitFor(() => expect(screen.getByRole('button', { name: 'Save lead', exact: true }).disabled).toBe(false))
  fireEvent.click(screen.getByRole('button', { name: 'Save lead', exact: true }))
  await waitFor(() => expect(store.listing?.sellerOnboarding.formData.propertyAddress).toBe(''))
  expect(store.listing.sellerOnboarding.formData).toMatchObject({ propertyAddressLine1: '', city: '', suburb: '', postalCode: '',
    propertyAddressDetails: { placeId: '' },
  })
})

test('typing autosaves one seller lead and further edits and clears update that same record', async () => {
  const created = renderDialog()
  await screen.findByLabelText('First name', { exact: true })
  vi.useFakeTimers()
  await pauseTyping(2000)
  expect(store.creates).toBe(0)
  fireEvent.change(screen.getByLabelText('First name', { exact: true }), { target: { value: 'S' } })
  await pauseTyping(400)
  fireEvent.change(screen.getByLabelText('First name', { exact: true }), { target: { value: 'Sam' } })
  await pauseTyping(400)
  expect(store.creates).toBe(0)
  await pauseTyping()
  expect(store.creates).toBe(1)
  expect(store.listing.sellerOnboarding.formData.sellerFirstName).toBe('Sam')
  expect(screen.getByText(/^Saved /)).toBeTruthy()
  expect(created).not.toHaveBeenCalled()
  fireEvent.change(screen.getByLabelText('First name', { exact: true }), { target: { value: '' } })
  fireEvent.click(screen.getByRole('tab', { name: 'Property details', exact: true }))
  fireEvent.change(screen.getByLabelText('City', { exact: true }), { target: { value: 'Cape Town' } })
  await pauseTyping()
  expect(store.creates).toBe(1)
  expect(store.listing.sellerOnboarding.formData).toMatchObject({ sellerFirstName: '', city: 'Cape Town' })
  expect(store.listing.sellerOnboarding.status).toBe('in_progress')
  const saves = updateSellerOnboardingProgress.mock.calls.length
  await pauseTyping(3000)
  expect(updateSellerOnboardingProgress).toHaveBeenCalledTimes(saves)
})

test('typing during a slow autosave stays editable and the newer answers are saved next', async () => {
  renderDialog()
  await screen.findByLabelText('First name', { exact: true })
  let completeSave
  persistSellerProfileOnboardingFormData.mockImplementationOnce(payload => new Promise(resolve => { completeSave = () => {
    const row = { id: 'onboarding-1', token: payload.token, status: payload.status, form_data: structuredClone(payload.formData) }
    store.listing = { id: 'listing-1', sellerOnboarding: { ...row, formData: row.form_data } }
    resolve(row)
  } }))
  vi.useFakeTimers()
  fireEvent.change(screen.getByLabelText('First name', { exact: true }), { target: { value: 'Sam' } })
  await pauseTyping()
  expect(screen.getByLabelText('First name', { exact: true }).matches(':disabled')).toBe(false)
  expect(screen.getByRole('tab', { name: 'Owner details', exact: true }).disabled).toBe(false)
  fireEvent.change(screen.getByLabelText('First name', { exact: true }), { target: { value: 'Samuel' } })
  await act(async () => { await completeSave() })
  expect(screen.getByLabelText('First name', { exact: true }).value).toBe('Samuel')
  await pauseTyping()
  expect(store.listing.sellerOnboarding.formData.sellerFirstName).toBe('Samuel')
  expect(store.creates).toBe(1)
})

test('closing flushes the latest answers before returning to the lead list', async () => {
  const closed = vi.fn()
  renderDialog(undefined, { onClose: closed })
  await screen.findByLabelText('First name', { exact: true })
  fireEvent.change(screen.getByLabelText('First name', { exact: true }), { target: { value: 'Sam' } })
  fireEvent.click(screen.getByRole('button', { name: 'Close dialog', exact: true }))
  expect(closed).not.toHaveBeenCalled()
  await waitFor(() => expect(closed).toHaveBeenCalledTimes(1))
  expect(store.listing.sellerOnboarding.formData.sellerFirstName).toBe('Sam')
})

test('closing during an in-flight save waits for the latest queued answers', async () => {
  const closed = vi.fn()
  renderDialog(undefined, { onClose: closed })
  await screen.findByLabelText('First name', { exact: true })
  let completeSave
  persistSellerProfileOnboardingFormData.mockImplementationOnce(payload => new Promise(resolve => { completeSave = () => {
    const row = { id: 'onboarding-1', token: payload.token, status: payload.status, form_data: structuredClone(payload.formData) }
    store.listing = { id: 'listing-1', sellerOnboarding: { ...row, formData: row.form_data } }
    resolve(row)
  } }))
  vi.useFakeTimers()
  fireEvent.change(screen.getByLabelText('First name', { exact: true }), { target: { value: 'Sam' } })
  await pauseTyping()
  fireEvent.change(screen.getByLabelText('First name', { exact: true }), { target: { value: 'Samuel' } })
  fireEvent.click(screen.getByRole('button', { name: 'Close dialog', exact: true }))
  await pauseTyping(0)
  expect(closed).not.toHaveBeenCalled()
  await act(async () => { completeSave() })
  await pauseTyping(0)
  expect(closed).toHaveBeenCalledTimes(1)
  expect(store.listing.sellerOnboarding.formData.sellerFirstName).toBe('Samuel')
  expect(store.creates).toBe(1)
})

test('closing an untouched form does not create an empty lead', async () => {
  const closed = vi.fn()
  renderDialog(undefined, { onClose: closed })
  await screen.findByLabelText('First name', { exact: true })
  vi.useFakeTimers()
  for (const tab of ['Owner details', 'Property details', 'Documents', 'Lead details']) {
    fireEvent.click(screen.getByRole('tab', { name: tab, exact: true }))
    await pauseTyping()
  }
  fireEvent.click(screen.getByRole('button', { name: 'Close dialog', exact: true }))
  await pauseTyping(0)
  expect(closed).toHaveBeenCalledTimes(1)
  expect(store.creates).toBe(0)
})

test('finishing capture freezes inputs until the latest answers are confirmed', async () => {
  const created = renderDialog()
  await screen.findByLabelText('First name', { exact: true })
  let completeSave
  persistSellerProfileOnboardingFormData.mockImplementationOnce(payload => new Promise(resolve => { completeSave = () => {
    const row = { id: 'onboarding-1', token: payload.token, status: payload.status, form_data: structuredClone(payload.formData) }
    store.listing = { id: 'listing-1', sellerOnboarding: { ...row, formData: row.form_data } }
    resolve(row)
  } }))
  vi.useFakeTimers()
  fireEvent.change(screen.getByLabelText('First name', { exact: true }), { target: { value: 'Sam' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save lead', exact: true }))
  await pauseTyping(0)
  expect(screen.getByLabelText('First name', { exact: true }).matches(':disabled')).toBe(true)
  expect(screen.queryByRole('button', { name: 'Close dialog', exact: true })).toBeNull()
  expect(created).not.toHaveBeenCalled()
  await act(async () => { completeSave() })
  expect(created).toHaveBeenCalledTimes(1)
})

test('offline typing stays pending and saves when the connection returns', async () => {
  renderDialog()
  await screen.findByLabelText('First name', { exact: true })
  const connection = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
  vi.useFakeTimers()
  fireEvent(window, new Event('offline'))
  fireEvent.change(screen.getByLabelText('First name', { exact: true }), { target: { value: 'Sam' } })
  await pauseTyping(2000)
  expect(store.creates).toBe(0)
  expect(screen.getByText('Offline - draft pending')).toBeTruthy()
  connection.mockReturnValue(true)
  fireEvent(window, new Event('online'))
  await pauseTyping()
  expect(store.listing.sellerOnboarding.formData.sellerFirstName).toBe('Sam')
  expect(screen.getByText(/^Saved /)).toBeTruthy()
})

test('a hidden page flushes pending typing without waiting for the debounce', async () => {
  renderDialog()
  await screen.findByLabelText('First name', { exact: true })
  vi.useFakeTimers()
  fireEvent.change(screen.getByLabelText('First name', { exact: true }), { target: { value: 'Sam' } })
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
  fireEvent(document, new Event('visibilitychange'))
  await pauseTyping(0)
  expect(store.listing.sellerOnboarding.formData.sellerFirstName).toBe('Sam')
  expect(store.creates).toBe(1)
})

test('an autosave failure shows unsaved status, avoids a retry loop and keeps a failed close open', async () => {
  const closed = vi.fn()
  renderDialog(undefined, { onClose: closed })
  await screen.findByLabelText('First name', { exact: true })
  persistSellerProfileOnboardingFormData.mockRejectedValueOnce(new Error('Connection failed'))
  vi.useFakeTimers()
  fireEvent.change(screen.getByLabelText('First name', { exact: true }), { target: { value: 'Sam' } })
  await pauseTyping()
  expect(screen.getByText('Draft not saved')).toBeTruthy()
  expect(screen.getByRole('alert').textContent).toContain('Connection failed')
  await pauseTyping(3000)
  expect(persistSellerProfileOnboardingFormData).toHaveBeenCalledTimes(1)
  persistSellerProfileOnboardingFormData.mockRejectedValueOnce(new Error('Still disconnected'))
  fireEvent.click(screen.getByRole('button', { name: 'Close dialog', exact: true }))
  await pauseTyping(0)
  expect(closed).not.toHaveBeenCalled()
  expect(screen.getByLabelText('First name', { exact: true }).value).toBe('Sam')
  fireEvent.click(screen.getByRole('button', { name: 'Save lead', exact: true }))
  await pauseTyping(0)
  expect(store.listing.sellerOnboarding.formData.sellerFirstName).toBe('Sam')
  expect(store.creates).toBe(1)
})

test('reverting an answer after a partial save failure persists the deliberate clear', async () => {
  renderDialog()
  await screen.findByLabelText('First name', { exact: true })
  vi.useFakeTimers()
  fireEvent.change(screen.getByLabelText('First name', { exact: true }), { target: { value: 'Sam' } })
  await pauseTyping()
  fireEvent.click(screen.getByRole('tab', { name: 'Property details', exact: true }))
  updateAgencyCrmLeadRecord.mockRejectedValueOnce(new Error('Summary unavailable'))
  fireEvent.change(screen.getByLabelText('City', { exact: true }), { target: { value: 'Cape Town' } })
  await pauseTyping()
  expect(screen.getByText('Draft not saved')).toBeTruthy()
  expect(store.listing.sellerOnboarding.formData.city).toBe('Cape Town')
  fireEvent.change(screen.getByLabelText('City', { exact: true }), { target: { value: '' } })
  await pauseTyping()
  expect(store.listing.sellerOnboarding.formData.city).toBe('')
  expect(screen.getByText(/^Saved /)).toBeTruthy()
  expect(store.creates).toBe(1)
})

test('source, progress and additional-agent edits autosave after the first profile save', async () => {
  const primary = { id: 'agent-1', userId: 'user-1', name: 'Primary Agent' }
  const second = { id: 'agent-2', userId: 'user-2', name: 'Supporting Agent' }
  const created = vi.fn()
  render(<MemoryRouter><SourceDialog onCreated={created} agents={[primary, second]} assignedAgent={primary} /></MemoryRouter>)
  await screen.findByLabelText('First name', { exact: true })
  vi.useFakeTimers()
  fireEvent.change(screen.getByLabelText('First name', { exact: true }), { target: { value: 'Sam' } })
  await pauseTyping()
  fireEvent.change(screen.getByLabelText('Source', { exact: true }), { target: { value: 'Website' } })
  fireEvent.click(screen.getByText('Seller progress (optional)', { exact: true }))
  await pauseTyping(0)
  fireEvent.change(screen.getByLabelText('Where are you with this seller?'), { target: { value: 'We already have a signed mandate' } })
  fireEvent.click(screen.getByText('Additional agents', { exact: true }))
  await pauseTyping(0)
  fireEvent.click(screen.getByRole('checkbox', { name: /Supporting Agent/ }))
  await pauseTyping()
  expect(updateAgencyCrmLeadRecord).toHaveBeenLastCalledWith('org-1', expect.any(String), expect.objectContaining({ leadSource: 'Website' }))
  expect(store.activities).toHaveLength(1)
  expect(store.collaborators).toHaveLength(1)
  fireEvent.click(screen.getByRole('checkbox', { name: /Supporting Agent/ }))
  await pauseTyping()
  expect(removeLeadCollaborator).toHaveBeenCalledTimes(1)
  expect(store.activities).toHaveLength(1)
  expect(created).not.toHaveBeenCalled()
  expect(store.creates).toBe(1)
})

test('agent capture, existing upload and seller link share answers and files without advancing the workflow', async () => {
  const created = renderDialog()
  await screen.findByLabelText('First name', { exact: true })
  fireEvent.change(screen.getByLabelText('First name', { exact: true }), { target: { value: 'Sam' } })
  fireEvent.change(screen.getByLabelText('Email', { exact: true }), { target: { value: 'sam@example.test' } })
  fireEvent.click(screen.getByText('Seller progress (optional)', { exact: true }))
  const stage = await screen.findByLabelText('Where are you with this seller?')
  fireEvent.change(stage, { target: { value: 'We already have a signed mandate' } })
  fireEvent.click(screen.getByRole('tab', { name: 'Documents', exact: true }))
  expect(screen.queryByLabelText('Where are you with this seller?')).toBeNull()
  expect(screen.queryByRole('heading', { name: 'Documents you already have' })).toBeNull()
  expect(store.creates).toBe(0)
  fireEvent.click(screen.getByRole('button', { name: 'Save details to add documents', exact: true }))
  await waitFor(() => expect(store.listing.sellerOnboarding.formData.currentStep).toBe(2))
  const upload = await screen.findByLabelText('Sam — identity document')
  fireEvent.change(upload, { target: { files: [new File(['identity'], 'identity.pdf', { type: 'application/pdf' })] } })
  await screen.findByText('identity.pdf', { exact: true })
  expect(store.uploads[0]).toMatchObject({ requirementId: 'request-1', visibility: 'seller_visible', status: 'uploaded', deferMandateSigning: true })
  fireEvent.change(screen.getByLabelText('Signed mandate'), { target: { files: [new File(['mandate'], 'mandate.pdf', { type: 'application/pdf' })] } })
  await screen.findByText('mandate.pdf', { exact: true })
  expect(store.uploads[1]).toMatchObject({ requirementId: 'request-2', existingSignedEvidence: true, status: 'uploaded', deferMandateSigning: true })
  fireEvent.click(screen.getByRole('button', { name: 'Save lead', exact: true }))
  await waitFor(() => expect(created).toHaveBeenCalledTimes(1))
  expect(store.creates).toBe(1)
  expect(updateSellerOnboardingProgress).not.toHaveBeenCalled()
  expect(store.listing.sellerOnboarding.status).toBe('in_progress')
  expect(store.listing.sellerOnboarding.formData.sellerFirstName).toBe('Sam')
  expect(store.activities).toHaveLength(1)
  expect(store.activities[0].outcome).toBe('We already have a signed mandate')
  expect(store.listing).not.toHaveProperty('mandateStatus', 'signed')
  cleanup()
  vi.spyOn(demoLinks, 'getDemoSellerOnboardingListing').mockReturnValue(store.listing)
  render(<MemoryRouter><SellerOnboarding embedded tokenOverride="demo-seller-onboarding" /></MemoryRouter>)
  await screen.findByLabelText('First name', { exact: true })
  expect(screen.getByLabelText('First name', { exact: true }).value).toBe('Sam')
  expect(screen.getByLabelText('Email', { exact: true }).value).toBe('sam@example.test')
})

test('an agent can finish immediately with no seller or property information', async () => {
  const created = renderDialog()
  await screen.findByLabelText('First name', { exact: true })
  fireEvent.click(screen.getByRole('button', { name: 'Save lead', exact: true }))
  await waitFor(() => expect(created).toHaveBeenCalledTimes(1))
  expect(store.listing.sellerOnboarding.status).toBe('in_progress')
  expect(store.listing.sellerOnboarding.formData.email).toBe('')
  expect(store.listing.sellerOnboarding.formData.propertyCategory).toBe('')
  expect(store.activities).toHaveLength(0)
  expect(syncPrivateListingRequirements).not.toHaveBeenCalled()
})

test('the opening tab contains only the six lead fields and optional details are available through tabs', async () => {
  renderDialog(undefined, { sourceOptions: [] })
  await screen.findByLabelText('First name', { exact: true })
  const panel = screen.getByRole('tabpanel', { name: 'Lead details', exact: true })
  for (const label of ['First name', 'Surname', 'Phone', 'Email', 'Address', 'Source']) {
    expect(within(panel).getByLabelText(label, { exact: true })).toBeTruthy()
  }
  expect(panel.querySelectorAll('input, select, textarea')).toHaveLength(6)
  expect(screen.queryByText('Agent-assisted onboarding.')).toBeNull()
  expect(screen.queryByRole('heading', { name: 'Who owns this property?' })).toBeNull()
  expect(screen.queryByLabelText('Tax Number', { exact: true })).toBeNull()
  for (const label of ['Lead details', 'Owner details', 'Property details', 'Documents']) {
    expect(screen.getByRole('tab', { name: label, exact: true })).toBeTruthy()
  }
  expect(store.creates).toBe(0)
})

test('switching tabs keeps contact, address, owner and property answers in the same saved seller record', async () => {
  const created = renderDialog()
  await screen.findByLabelText('First name', { exact: true })
  fireEvent.change(screen.getByLabelText('First name', { exact: true }), { target: { value: 'Sam' } })
  fireEvent.change(screen.getByLabelText('Surname', { exact: true }), { target: { value: 'Ngwenya' } })
  fireEvent.change(screen.getByLabelText('Phone', { exact: true }), { target: { value: '+27820000000' } })
  fireEvent.change(screen.getByLabelText('Address', { exact: true }), { target: { value: '1 Example Road' } })
  fireEvent.click(screen.getByRole('tab', { name: 'Owner details', exact: true }))
  fireEvent.change(screen.getByLabelText('Tax Number', { exact: true }), { target: { value: '1234567890' } })
  fireEvent.click(screen.getByRole('tab', { name: 'Property details', exact: true }))
  expect(screen.queryByRole('heading', { name: 'Tell us about the property' })).toBeNull()
  expect(screen.queryByText('We start with category, then branch into the right property, address, and document questions.')).toBeNull()
  expect(screen.getByLabelText('Address line 1', { exact: true }).value).toBe('1 Example Road')
  fireEvent.change(screen.getByLabelText('City', { exact: true }), { target: { value: 'Cape Town' } })
  expect(store.creates).toBe(0)
  fireEvent.click(screen.getByRole('tab', { name: 'Lead details', exact: true }))
  expect(screen.getByLabelText('First name', { exact: true }).value).toBe('Sam')
  fireEvent.click(screen.getByRole('tab', { name: 'Owner details', exact: true }))
  expect(screen.getByLabelText('Tax Number', { exact: true }).value).toBe('1234567890')
  fireEvent.click(screen.getByRole('button', { name: 'Save lead', exact: true }))
  await waitFor(() => expect(created).toHaveBeenCalledTimes(1))
  expect(store.creates).toBe(1)
  expect(store.listing.sellerOnboarding.status).toBe('in_progress')
  expect(store.listing.sellerOnboarding.formData).toMatchObject({
    sellerFirstName: 'Sam', sellerSurname: 'Ngwenya', phone: '+27820000000',
    propertyAddressLine1: '1 Example Road', city: 'Cape Town', sellerTaxNumber: '1234567890',
    ownershipType: '', propertyCategory: '',
  })
})

test('tabs support arrow-key navigation and incomplete email errors keep the modal open', async () => {
  const created = renderDialog()
  await screen.findByLabelText('Email', { exact: true })
  fireEvent.change(screen.getByLabelText('Email', { exact: true }), { target: { value: 'invalid' } })
  fireEvent.keyDown(screen.getByRole('tab', { name: 'Lead details', exact: true }), { key: 'ArrowRight' })
  const ownerTab = screen.getByRole('tab', { name: 'Owner details', exact: true })
  expect(ownerTab.getAttribute('aria-selected')).toBe('true')
  expect(document.activeElement).toBe(ownerTab)
  fireEvent.keyDown(ownerTab, { key: 'Home' })
  expect(screen.getByLabelText('Email', { exact: true }).value).toBe('invalid')
  fireEvent.click(screen.getByRole('button', { name: 'Save lead', exact: true }))
  await screen.findByRole('alert')
  expect(store.creates).toBe(0)
  expect(created).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('tab', { name: 'Documents', exact: true }))
  fireEvent.click(screen.getByRole('button', { name: 'Save details to add documents', exact: true }))
  await screen.findByRole('alert')
  expect(store.creates).toBe(0)
})

function SourceDialog({ onCreated, ...props }) {
  const [source, setSource] = useState('Referral')
  return <SellerLeadCreateDialog organisationId="org-1" actor={{ id: 'agent-1' }} assignedAgent={{ id: 'agent-1' }}
    source={source} onSourceChange={setSource} sourceOptions={['Referral', 'Website']}
    metadataControls={<label>Priority<input defaultValue="Medium" /></label>}
    onClose={() => {}} onCreated={onCreated} {...props} />
}

test('source is a dropdown and assignment metadata stays in lead details', async () => {
  const created = vi.fn()
  render(<MemoryRouter><SourceDialog onCreated={created} /></MemoryRouter>)
  const source = await screen.findByLabelText('Source', { exact: true })
  expect(source.tagName).toBe('SELECT')
  expect(screen.getByLabelText('Priority', { exact: true }).value).toBe('Medium')
  fireEvent.change(source, { target: { value: 'Website' } })
  fireEvent.click(screen.getByRole('tab', { name: 'Owner details', exact: true }))
  expect(screen.queryByLabelText('Priority', { exact: true })).toBeNull()
  fireEvent.click(screen.getByRole('tab', { name: 'Lead details', exact: true }))
  expect(screen.getByLabelText('Source', { exact: true }).value).toBe('Website')
  fireEvent.click(screen.getByRole('button', { name: 'Save lead', exact: true }))
  await waitFor(() => expect(created).toHaveBeenCalledTimes(1))
  expect(createAgencyCrmLeadRecord).toHaveBeenLastCalledWith('org-1', expect.objectContaining({ leadSource: 'Website', stage: 'New Lead' }), expect.objectContaining({ notifyAgent: false }))
})

test('lead details selects a primary agent and additional agents using the existing lead team', async () => {
  const created = vi.fn()
  const primary = { id: 'agent-1', userId: 'user-1', name: 'Primary Agent', email: 'primary@example.test' }
  const second = { id: 'agent-2', userId: 'user-2', name: 'Supporting Agent', email: 'support@example.test' }
  renderDialog(created, { assignedAgent: primary, agents: [primary, second] })
  await screen.findByLabelText('First name', { exact: true })
  expect(screen.getByRole('group', { name: 'Primary agent', exact: true })).toBeTruthy()
  fireEvent.click(screen.getByText('Additional agents', { exact: true }))
  const additional = await screen.findByRole('checkbox', { name: /Supporting Agent/ })
  fireEvent.click(additional)
  fireEvent.click(screen.getByRole('tab', { name: 'Owner details', exact: true }))
  expect(screen.queryByRole('group', { name: 'Primary agent', exact: true })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Save lead', exact: true }))
  await waitFor(() => expect(created).toHaveBeenCalledTimes(1))
  expect(createAgencyCrmLeadRecord).toHaveBeenLastCalledWith('org-1', expect.objectContaining({ assignedAgent: primary }), expect.objectContaining({ notifyAgent: false }))
  expect(store.collaborators).toEqual([{ organisationId: 'org-1', leadId: expect.any(String), userId: 'user-2' }])
  expect(created.mock.calls[0][0].lead.collaboratorAgentIds).toEqual(['user-2'])
})

test('owner details reuses the lead contact and removes agent consent and repeated onboarding instructions', async () => {
  const created = renderDialog()
  await screen.findByLabelText('First name', { exact: true })
  fireEvent.change(screen.getByLabelText('First name', { exact: true }), { target: { value: 'Sam' } })
  fireEvent.change(screen.getByLabelText('Surname', { exact: true }), { target: { value: 'Ngwenya' } })
  fireEvent.change(screen.getByLabelText('Email', { exact: true }), { target: { value: 'sam@example.test' } })
  fireEvent.change(screen.getByLabelText('Phone', { exact: true }), { target: { value: '+27820000000' } })
  fireEvent.click(screen.getByRole('tab', { name: 'Owner details', exact: true }))
  expect(screen.getByText('Sam Ngwenya', { exact: true })).toBeTruthy()
  expect(screen.queryByLabelText('First name', { exact: true })).toBeNull()
  expect(screen.queryByLabelText('Email', { exact: true })).toBeNull()
  expect(screen.queryByText('About you', { exact: false })).toBeNull()
  expect(screen.queryByRole('heading', { name: 'Tell us about yourself' })).toBeNull()
  expect(screen.queryByText('Not sure who owns it? Leave this blank and continue.')).toBeNull()
  expect(screen.queryByText('The next questions follow the owner type and structure you selected.')).toBeNull()
  expect(screen.queryByRole('heading', { name: 'Permissions and declaration' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: /^Person or people/ }))
  fireEvent.click(screen.getByRole('button', { name: /^Multiple owners/i }))
  fireEvent.click(screen.getByLabelText('Use lead contact details for Owner 1', { exact: true }))
  expect(screen.getAllByLabelText('First name', { exact: true })).toHaveLength(1)
  expect(screen.getAllByLabelText('Email (optional)', { exact: true })).toHaveLength(1)
  expect(screen.queryByText('Repeatable owner record')).toBeNull()
  expect(screen.queryByLabelText('Consent to sell', { exact: true })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Edit contact', exact: true }))
  fireEvent.change(screen.getByLabelText('Surname', { exact: true }), { target: { value: 'Updated' } })
  fireEvent.click(screen.getByRole('tab', { name: 'Owner details', exact: true }))
  expect(screen.getByText('Sam Updated', { exact: true })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Save lead', exact: true }))
  await waitFor(() => expect(created).toHaveBeenCalledTimes(1))
  const form = store.listing.sellerOnboarding.formData
  expect(form.multipleOwners[0]).toMatchObject({ name: 'Sam', surname: 'Updated', email: 'sam@example.test', phone: '+27820000000' })
  expect(Object.values(form.sellerOnboardingConsents).every(value => !value.accepted)).toBe(true)
  expect(form.propertyDisclosure.declarationAccepted).toBe(false)
  expect(store.listing.sellerOnboarding.status).toBe('in_progress')
})


test('the seller document view uses the same file receipts and excludes internal files', async () => {
  store.listing = { id: 'listing-1', sellerOnboarding: { token: 'token-1' } }
  store.uploads = [{ id: 'shared', document_name: 'owner-id.pdf', visibility: 'seller_visible', status: 'uploaded' },
    { id: 'internal', document_name: 'private-agent-notes.pdf', visibility: 'internal', status: 'uploaded' }]
  render(<SellerCaptureDocuments listing={store.listing} token="token-1" />)
  await screen.findByText('owner-id.pdf — Saved, awaiting review')
  expect(screen.queryByText(/private-agent-notes.pdf/)).toBeNull()
})

test('a prepared document checklist opens without fetching the same listing again', async () => {
  const listing = { id: 'listing-1', sellerOnboarding: { token: 'token-1' }, documents: [],
    documentRequirements: [{ id: 'request-1', requirement_name: 'Identity document', status: 'missing' }] }
  render(<SellerCaptureDocuments compact listing={listing} token="token-1" initialListing={listing} onUpload={vi.fn()} />)
  expect(screen.getByLabelText('Identity document', { exact: true })).toBeTruthy()
  expect(getPrivateListing).not.toHaveBeenCalled()
  expect(screen.queryByText(/Uploads are optional/)).toBeNull()
})

test('editing owner answers requires the document checklist to use those saved answers', async () => {
  renderDialog()
  await screen.findByLabelText('First name', { exact: true })
  fireEvent.click(screen.getByRole('tab', { name: 'Documents', exact: true }))
  fireEvent.click(screen.getByRole('button', { name: 'Save details to add documents', exact: true }))
  await screen.findByLabelText('Sam — identity document', { exact: true })
  fireEvent.click(screen.getByRole('tab', { name: 'Owner details', exact: true }))
  fireEvent.change(screen.getByLabelText('Tax Number', { exact: true }), { target: { value: '1234567890' } })
  fireEvent.click(screen.getByRole('tab', { name: 'Documents', exact: true }))
  expect(screen.queryByLabelText('Sam — identity document', { exact: true })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Save details to add documents', exact: true }))
  await screen.findByLabelText('Sam — identity document', { exact: true })
  expect(store.creates).toBe(1)
  expect(updateSellerOnboardingProgress).toHaveBeenCalledTimes(1)
  expect(syncPrivateListingRequirements).toHaveBeenCalledTimes(2)
  expect(store.listing.sellerOnboarding.formData.sellerTaxNumber).toBe('1234567890')
})
