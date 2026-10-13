// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import SellerLeadCreateDialog from '../SellerLeadCreateDialog'
import SellerCaptureDocuments from '../../onboarding/SellerCaptureDocuments'
import { SellerOnboarding } from '../../../pages/SellerOnboarding'
import * as demoLinks from '../../../lib/onboardingDemoLinks'

const store = vi.hoisted(() => ({ listing: null, uploads: [], creates: 0, activities: [] }))
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

beforeEach(() => { store.listing = null; store.uploads = []; store.creates = 0; store.activities = []; vi.spyOn(window, 'scrollTo').mockImplementation(() => {}) })
afterEach(() => { cleanup(); vi.restoreAllMocks() })

function renderDialog(onCreated = vi.fn()) {
  render(<MemoryRouter><SellerLeadCreateDialog organisationId="org-1" actor={{ id: 'agent-1' }} assignedAgent={{ id: 'agent-1' }} source="Referral" onClose={() => {}} onCreated={onCreated} /></MemoryRouter>)
  return onCreated
}

test('agent capture, existing upload and seller link share answers and files without advancing the workflow', async () => {
  const created = renderDialog()
  await screen.findByLabelText('First name', { exact: true })
  fireEvent.change(screen.getByLabelText('First name', { exact: true }), { target: { value: 'Sam' } })
  fireEvent.change(screen.getByLabelText('Email', { exact: true }), { target: { value: 'sam@example.test' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save & Continue', exact: true }))
  await waitFor(() => expect(store.listing.sellerOnboarding.formData.currentStep).toBe(1))
  fireEvent.click(screen.getByRole('button', { name: 'Save & Continue', exact: true }))
  const stage = await screen.findByLabelText('Where are you with this seller?')
  fireEvent.change(stage, { target: { value: 'We already have a signed mandate' } })
  const upload = await screen.findByLabelText('Sam — identity document')
  fireEvent.change(upload, { target: { files: [new File(['identity'], 'identity.pdf', { type: 'application/pdf' })] } })
  await screen.findByText('identity.pdf — Saved, awaiting review')
  expect(store.uploads[0]).toMatchObject({ requirementId: 'request-1', visibility: 'seller_visible', status: 'uploaded', deferMandateSigning: true })
  fireEvent.change(screen.getByLabelText('Signed mandate'), { target: { files: [new File(['mandate'], 'mandate.pdf', { type: 'application/pdf' })] } })
  await screen.findByText('mandate.pdf — Saved, awaiting review')
  expect(store.uploads[1]).toMatchObject({ requirementId: 'request-2', existingSignedEvidence: true, status: 'uploaded', deferMandateSigning: true })
  fireEvent.click(screen.getAllByRole('button', { name: 'Save and finish', exact: true })[0])
  await waitFor(() => expect(created).toHaveBeenCalledTimes(1))
  expect(store.creates).toBe(1)
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
  fireEvent.click(screen.getByRole('button', { name: 'Save and finish later', exact: true }))
  await waitFor(() => expect(created).toHaveBeenCalledTimes(1))
  expect(store.listing.sellerOnboarding.status).toBe('in_progress')
  expect(store.listing.sellerOnboarding.formData.email).toBe('')
  expect(store.listing.sellerOnboarding.formData.propertyCategory).toBe('')
  expect(store.activities).toHaveLength(0)
})


test('the seller document view uses the same file receipts and excludes internal files', async () => {
  store.listing = { id: 'listing-1', sellerOnboarding: { token: 'token-1' } }
  store.uploads = [{ id: 'shared', document_name: 'owner-id.pdf', visibility: 'seller_visible', status: 'uploaded' },
    { id: 'internal', document_name: 'private-agent-notes.pdf', visibility: 'internal', status: 'uploaded' }]
  render(<SellerCaptureDocuments listing={store.listing} token="token-1" />)
  await screen.findByText('owner-id.pdf — Saved, awaiting review')
  expect(screen.queryByText(/private-agent-notes.pdf/)).toBeNull()
})
