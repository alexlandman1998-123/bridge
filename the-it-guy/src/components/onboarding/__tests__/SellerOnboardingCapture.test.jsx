// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { SellerOnboarding, normalizeFormData } from '../../../pages/SellerOnboarding.jsx'
import * as demoLinks from '../../../lib/onboardingDemoLinks.js'
import { buildSellerProfileCanonicalPayload } from '../../../lib/sellerProfileCaptureModel.js'

beforeEach(() => { vi.spyOn(window, 'scrollTo').mockImplementation(() => {}) })

afterEach(() => { cleanup(); vi.restoreAllMocks() })

function capture(props = {}) {
  return render(<MemoryRouter><SellerOnboarding tokenOverride="demo-seller-onboarding" embedded {...props} /></MemoryRouter>)
}

test('embedded agent capture has one working draft action and saves incomplete answers without remote writes', async () => {
  const saved = vi.fn()
  const busy = vi.fn()
  capture({ completionModeOverride: 'agent_assisted', onDraftSaved: saved, onSaveStateChange: busy })
  await screen.findByText('Agent-assisted onboarding.')
  expect(screen.getAllByRole('button', { name: 'Save Draft', exact: true })).toHaveLength(1)
  expect(screen.getByLabelText(/I confirm the seller gave this permission.*I consent/)).toBeTruthy()
  fireEvent.change(screen.getByLabelText('First name', { exact: true }), { target: { value: 'Partial capture' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save Draft', exact: true }))
  await waitFor(() => expect(saved).toHaveBeenCalledTimes(1))
  expect(saved.mock.calls[0][0].sellerOnboarding.formData.sellerFirstName).toBe('Partial capture')
  expect(saved.mock.calls[0][0].sellerOnboarding.status).toBe('in_progress')
  expect(saved.mock.calls[0][0].sellerOnboarding.formData.propertyDisclosure.declarationAccepted).toBe(false)
  expect(busy).toHaveBeenLastCalledWith(false)
})

test('both capture modes expose the same seller identity, FICA and mandate fields', async () => {
  const fields = ['First name', 'Surname', 'Email', 'Phone', 'Date of Birth', 'Nationality', 'Alternative Number',
    'Residential address', 'Tax Number', 'SA Resident', 'Occupation or business activity', 'Source of funds / wealth',
    'Mandate start date', 'Mandate end date']
  for (const completionModeOverride of ['self_service', 'agent_assisted']) {
    capture({ completionModeOverride })
    await screen.findByRole('heading', { name: 'Personal details' })
    for (const label of fields) expect(screen.getAllByLabelText(label, { exact: true })).toHaveLength(1)
    cleanup()
  }
})

test('incomplete answers can advance while remaining an unsubmitted draft', async () => {
  const saved = vi.fn()
  capture({ completionModeOverride: 'agent_assisted', onDraftSaved: saved })
  await screen.findByRole('heading', { name: 'Personal details' })
  fireEvent.click(screen.getByRole('button', { name: 'Save & Continue', exact: true }))
  await waitFor(() => expect(saved).toHaveBeenCalledTimes(1))
  expect(saved.mock.calls[0][0].sellerOnboarding.status).toBe('in_progress')
  expect(saved.mock.calls[0][0].sellerOnboarding.formData.currentStep).toBe(1)
})

test('an existing full-name capture personalises the welcome and shows the assigned agent', async () => {
  const base = demoLinks.getDemoSellerOnboardingListing('demo-seller-onboarding')
  vi.spyOn(demoLinks, 'getDemoSellerOnboardingListing').mockReturnValue({
    ...base, seller: { name: '' }, sellerCanonicalFacts: {}, assignedAgentName: '', assignedAgent: '',
    branding: { ...base.branding, agentName: 'Kevin Croft' },
    sellerOnboarding: { ...base.sellerOnboarding, canonicalFacts: {}, formData: { fullName: 'Beverley Paynter' } },
  })
  render(<MemoryRouter><SellerOnboarding tokenOverride="demo-seller-onboarding" /></MemoryRouter>)
  await screen.findByText('Hi Beverley,')
  expect(screen.getByText('Kevin Croft', { exact: true })).toBeTruthy()
})


const blankCapture = { sellerOnboarding: { status: 'not_started', formData: {
  ownershipDeclarationPending: true, sellerFirstName: '', sellerSurname: '', email: '', phone: '',
  propertyCategory: '', propertyType: '', propertyStructureType: '',
} } }

test('new lead capture uses the same fields, keeps unknown values blank and makes no background writes', async () => {
  const persist = vi.fn(async row => row)
  capture({ captureDraft: blankCapture, completionModeOverride: 'agent_assisted', onCapturePersist: persist })
  await screen.findByLabelText('First name', { exact: true })
  expect(screen.getByLabelText('First name', { exact: true }).value).toBe('')
  expect(screen.getByLabelText('Email', { exact: true }).required).toBe(false)
  fireEvent.change(screen.getByLabelText('First name', { exact: true }), { target: { value: 'Sam' } })
  await new Promise(resolve => setTimeout(resolve, 1800))
  expect(persist).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Save & Continue', exact: true }))
  await waitFor(() => expect(persist).toHaveBeenCalledTimes(1))
  const form = persist.mock.calls[0][0].sellerOnboarding.formData
  expect(form.sellerFirstName).toBe('Sam')
  expect(form.ownershipType).toBe('')
  expect(form.propertyCategory).toBe('')
  expect(form.propertyType).toBe('')
  expect(form.propertyStructureType).toBe('')
})

test('bad entered emails are checked even though empty emails are allowed', async () => {
  const persist = vi.fn()
  capture({ captureDraft: blankCapture, completionModeOverride: 'agent_assisted', onCapturePersist: persist })
  await screen.findByLabelText('Email', { exact: true })
  fireEvent.change(screen.getByLabelText('Email', { exact: true }), { target: { value: 'invalid' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save & Continue', exact: true }))
  await screen.findByRole('alert')
  expect(persist).not.toHaveBeenCalled()
})

test('choosing a person owner type does not assume a single owner', async () => {
  const persist = vi.fn(async row => row)
  capture({ captureDraft: blankCapture, completionModeOverride: 'agent_assisted', onCapturePersist: persist })
  await screen.findByRole('button', { name: /Person or people/ })
  fireEvent.click(screen.getByRole('button', { name: /Person or people/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Save Draft', exact: true }))
  await waitFor(() => expect(persist).toHaveBeenCalledTimes(1))
  const form = persist.mock.calls[0][0].sellerOnboarding.formData
  expect(form.ownerEntityType).toBe('natural_person')
  expect(form.ownerStructureType).toBe('')
  expect(form.ownershipType).toBe('')
  expect(normalizeFormData(persist.mock.calls[0][0]).ownerEntityType).toBe('natural_person')
  expect(normalizeFormData(persist.mock.calls[0][0]).ownerStructureType).toBe('')
})

test('seller-link rehydration keeps the same seller, entity, people and property values', () => {
  const formData = {
    sellerFirstName: 'Sam', sellerSurname: 'Ngwenya', email: 'sam@example.test', phone: '+27820000000',
    ownershipType: 'company', ownerEntityType: 'company', ownerStructureType: 'company',
    companyName: 'Example Company', companyRegistrationNumber: '2026/000001/07', companyRegisteredAddress: '1 Example Road',
    authorisedSignatoryName: 'Sam Ngwenya', authorisedSignatoryCapacity: 'Director', companyAuthorityBasis: 'Resolution',
    companyDirectors: [{ id: 'director-1', name: 'Sam', surname: 'Ngwenya', email: 'sam@example.test', phone: '+27820000000' }],
    propertyCategory: 'residential', propertyType: 'apartment', propertyStructureType: 'sectional_title',
    propertyAddressLine1: '1 Example Road', suburb: 'Example suburb', city: 'Cape Town', province: 'Western Cape', postalCode: '8001',
    schemeName: 'Example Scheme', unitNumber: '2', sectionNumber: '12', ratesTaxes: '850', levies: '1250',
    askingPrice: '2100000', bondStatus: 'unknown', sellingTimeline: '',
  }
  const reopened = normalizeFormData({ sellerOnboarding: { formData }, propertyType: 'House' })
  for (const field of ['sellerFirstName', 'sellerSurname', 'email', 'phone', 'companyName', 'companyRegistrationNumber',
    'companyRegisteredAddress', 'authorisedSignatoryName', 'authorisedSignatoryCapacity', 'companyAuthorityBasis',
    'propertyCategory', 'propertyType', 'propertyStructureType', 'schemeName', 'unitNumber', 'sectionNumber', 'ratesTaxes', 'levies', 'askingPrice']) {
    expect(reopened[field], field).toEqual(formData[field])
  }
  expect(reopened.companyDirectors[0].id).toBe('director-1')
  expect(reopened.companyDirectors[0].email).toBe('sam@example.test')
})


test('seller can save incomplete information from the final step without completion or signing', async () => {
  const saved = vi.fn(), submitted = vi.fn()
  capture({ completionModeOverride: 'agent_assisted', onDraftSaved: saved, onSubmitted: submitted })
  await screen.findByLabelText('First name', { exact: true })
  fireEvent.click(screen.getByRole('button', { name: 'Save & Continue', exact: true }))
  await waitFor(() => expect(saved).toHaveBeenCalledTimes(1))
  fireEvent.click(screen.getByRole('button', { name: 'Save & Continue', exact: true }))
  await screen.findByRole('heading', { name: 'Check your seller file' })
  fireEvent.click(screen.getByRole('button', { name: 'Save available details', exact: true }))
  await screen.findByText('Your details have been saved. Some information is still missing. You can return to this link to add it later.')
  expect(submitted).not.toHaveBeenCalled()
  expect(saved.mock.calls.at(-1)[0].sellerOnboarding.status).toBe('in_progress')
})

test('explicit blanks and zero property amounts survive seller-link rehydration', () => {
  const reopened = normalizeFormData({
    seller: { name: 'Old Owner', email: 'old@example.test' }, propertyType: 'House', askingPrice: 99,
    sellerCanonicalFacts: { seller: { first_name: 'Old', email: 'old@example.test' }, property: { rates_taxes: 99, levies: 99 } },
    sellerOnboarding: { formData: { sellerFirstName: '', sellerSurname: '', email: '', propertyCategory: '', propertyType: '', propertyStructureType: '', ratesTaxes: 0, levies: 0, askingPrice: 0 } },
  })
  for (const field of ['sellerFirstName', 'sellerSurname', 'email', 'propertyCategory', 'propertyType', 'propertyStructureType']) expect(reopened[field], field).toBe('')
  for (const field of ['ratesTaxes', 'levies', 'askingPrice']) expect(reopened[field], field).toBe(0)
})

test('a natural-person entity does not confirm single ownership until the seller chooses its structure', async () => {
  const base = demoLinks.getDemoSellerOnboardingListing('demo-seller-onboarding')
  vi.spyOn(demoLinks, 'getDemoSellerOnboardingListing').mockReturnValue({
    ...base, sellerCanonicalFacts: {}, sellerOnboarding: { ...base.sellerOnboarding,
      canonicalFacts: {}, formData: { sellerFirstName: 'Draft', sellerSurname: 'Seller', ownershipDeclarationPending: true } },
  })
  const saved = vi.fn()
  capture({ completionModeOverride: 'agent_assisted', onDraftSaved: saved })
  await screen.findByRole('heading', { name: 'Who owns this property?' })
  fireEvent.click(screen.getByRole('button', { name: /^Person or people/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Save Draft', exact: true }))
  await waitFor(() => expect(saved).toHaveBeenCalledTimes(1))
  expect(saved.mock.calls[0][0].sellerOnboarding.formData).toMatchObject({
    ownerEntityType: 'natural_person', ownerStructureType: '', ownershipType: '', ownershipRouteConfirmed: false,
  })
  fireEvent.click(screen.getByRole('button', { name: /^Single owner/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Save Draft', exact: true }))
  await waitFor(() => expect(saved).toHaveBeenCalledTimes(2))
  expect(saved.mock.calls[1][0].sellerOnboarding.formData).toMatchObject({
    ownerEntityType: 'natural_person', ownerStructureType: 'individual', ownershipType: 'individual', ownershipRouteConfirmed: true,
  })
  const reopened = normalizeFormData(saved.mock.calls[1][0])
  expect(reopened.ownershipRouteConfirmed).toBe(true)
  expect(buildSellerProfileCanonicalPayload(reopened, {}, { draft: true }).canonicalSellerFacts.seller.ownership_route_confirmed).toBe(true)
})

test.each([
  { ownershipRouteConfirmed: true },
  { ownership_route_confirmed: true },
  { ownershipRouteLocked: true },
  { sellerProfileCaptureSource: 'listing_seller_profile_capture' },
])('confirmed ownership survives stale pending flags on reopening: %j', confirmation => {
  const reopened = normalizeFormData({ sellerOnboarding: { formData: {
    ownershipType: 'individual', ownerEntityType: 'natural_person', ownerStructureType: 'individual',
    ownershipDeclarationPending: true, ownership_declaration_pending: true, ...confirmation,
  } } })
  expect(reopened).toMatchObject({
    ownershipType: 'individual', ownershipRouteConfirmed: true, ownership_route_confirmed: true,
    ownershipDeclarationPending: false, ownership_declaration_pending: false,
  })
})

test('canonical ownership confirmation survives a stale pending form', () => {
  const reopened = normalizeFormData({
    sellerCanonicalFacts: { seller: { owner_entity_type: 'company', owner_structure_type: 'company', ownership_route_confirmed: true } },
    sellerOnboarding: { formData: { ownershipDeclarationPending: true } },
  })
  expect(reopened).toMatchObject({ ownershipType: 'company', ownershipRouteConfirmed: true, ownershipDeclarationPending: false })
})

test('unconfirmed pending defaults and a deliberately cleared structure remain incomplete', () => {
  expect(normalizeFormData({ sellerOnboarding: { formData: {
    ownershipType: 'individual', ownershipDeclarationPending: true,
  } } }).ownershipType).toBe('')
  const reopened = normalizeFormData({
    sellerCanonicalFacts: { seller: { owner_entity_type: 'natural_person', owner_structure_type: 'individual', ownership_route_confirmed: true } },
    sellerOnboarding: { formData: {
      ownerEntityType: 'natural_person', ownerStructureType: '', ownershipType: '',
      ownershipRouteConfirmed: false, ownershipDeclarationPending: true,
    } },
  })
  expect(reopened).toMatchObject({ ownerStructureType: '', ownershipType: '', ownershipRouteConfirmed: false, ownershipDeclarationPending: true })
})

test('review recognises an agent-selected structure despite a stale pending flag', async () => {
  const base = demoLinks.getDemoSellerOnboardingListing('demo-seller-onboarding')
  vi.spyOn(demoLinks, 'getDemoSellerOnboardingListing').mockReturnValue({
    ...base, sellerCanonicalFacts: {}, sellerOnboarding: { ...base.sellerOnboarding, canonicalFacts: {}, formData: {
      ownershipType: 'individual', ownerEntityType: 'natural_person', ownerStructureType: 'individual',
      ownershipRouteLocked: true, ownershipDeclarationPending: true,
    } },
  })
  const saved = vi.fn()
  capture({ completionModeOverride: 'agent_assisted', onDraftSaved: saved })
  await screen.findByRole('heading', { name: 'Who owns this property?' })
  fireEvent.click(screen.getByRole('button', { name: 'Save & Continue', exact: true }))
  await waitFor(() => expect(saved).toHaveBeenCalledTimes(1))
  fireEvent.click(screen.getByRole('button', { name: 'Save & Continue', exact: true }))
  await screen.findByRole('heading', { name: 'Check your seller file' })
  expect(screen.queryByText(/Legal ownership structure/)).toBeNull()
  expect(saved.mock.calls.at(-1)[0].sellerOnboarding.formData).toMatchObject({
    ownershipType: 'individual', ownershipRouteConfirmed: true, ownershipDeclarationPending: false,
  })
})

test('explicit negative property, availability and compliance answers survive reopening and canonical save', () => {
  const falseAnswers = {
    estateOrHoa: false, leviesNotApplicable: false, titleDeedAvailable: false,
    electricalCocAvailable: false, electricFence: false, recentAlterations: false,
    gasInstallation: false, solarInstallation: false, boreholeInstallation: false,
    inverterBattery: false, waterTank: false, plumbingCertificateRequired: false,
    viewingNoticeRequired: false, pool: false,
  }
  const reopened = normalizeFormData({ sellerOnboarding: {
    formData: { ...falseAnswers, propertyCategory: 'residential', propertyStructureType: 'freehold',
      gasGeyser: true, estateName: 'Previously captured estate', features: ['gas_geyser', 'solar', 'borehole', 'inverter_battery', 'water_tank', 'pool'] },
    canonicalFacts: {
      property: { estate_or_hoa: true, levies_not_applicable: true, title_deed_available: true, alterations: { recent: true } },
      compliance: { electrical_coc_available: true, electric_fence: true, gas_installation: true,
        solar_installation: true, borehole_installation: true, inverter_battery: true, water_tank: true, plumbing_certificate_required: true },
      occupancy: { viewing_notice_required: true },
    },
  } })
  expect(reopened).toMatchObject(falseAnswers)
  expect(reopened.features).toEqual([])
  const payload = buildSellerProfileCanonicalPayload(reopened, {}, { draft: true })
  const next = normalizeFormData({ sellerOnboarding: { formData: { ...reopened, ...payload }, canonicalFacts: payload.canonicalSellerFacts } })
  expect(next).toMatchObject(falseAnswers)
  expect(payload.canonicalSellerFacts.property.estate_or_hoa).toBe(false)
  expect(payload.canonicalSellerFacts.compliance.gas_installation).toBe(false)
  expect(payload.canonicalSellerFacts.flow.document_triggers).not.toContain('gas_compliance_certificate')
  expect(payload.canonicalSellerFacts.flow.property_branch).toBe('residential')
})

test('legacy answers still populate an absent current answer, but an explicitly cleared feature list wins', () => {
  const canonicalFacts = { property: { estate_or_hoa: true, title_deed_available: true }, compliance: { solar_installation: true } }
  const legacy = normalizeFormData({ sellerOnboarding: { formData: {}, canonicalFacts } })
  expect(legacy).toMatchObject({ estateOrHoa: true, titleDeedAvailable: true, solarInstallation: true })
  const cleared = normalizeFormData({ sellerOnboarding: { formData: { estate_or_hoa: false, features: [] }, canonicalFacts } })
  expect(cleared.estateOrHoa).toBe(false)
  expect(cleared.solarInstallation).toBe(false)
  expect(cleared.features).toEqual([])
})

test.each([
  { ownershipRouteLocked: false, ownership_route_locked: true },
  { ownershipRouteLocked: 'false' },
  { ownership_route_locked: 'false' },
])('ownership remains editable when the current lock answer is No: %j', flags => {
  const reopened = normalizeFormData({ sellerOnboarding: { formData: flags } })
  expect(reopened.ownershipRouteLocked).toBe(false)
  expect(reopened.ownership_route_locked).toBe(false)
})

test('an agent lock still prevents changing ownership while an explicit unlock allows it', async () => {
  for (const locked of [true, false]) {
    const saved = vi.fn()
    const base = demoLinks.getDemoSellerOnboardingListing('demo-seller-onboarding')
    vi.spyOn(demoLinks, 'getDemoSellerOnboardingListing').mockReturnValue({
      ...base, sellerCanonicalFacts: {}, sellerOnboarding: { ...base.sellerOnboarding, canonicalFacts: {}, formData: {
        ownershipType: 'individual', ownerEntityType: 'natural_person', ownerStructureType: 'individual',
        ownershipRouteLocked: locked, ownership_route_locked: true,
      } },
    })
    capture({ completionModeOverride: 'agent_assisted', onDraftSaved: saved })
    const company = await screen.findByRole('button', { name: /^Company The property/ })
    expect(company.disabled).toBe(locked)
    fireEvent.click(company)
    fireEvent.click(screen.getByRole('button', { name: 'Save Draft', exact: true }))
    await waitFor(() => expect(saved).toHaveBeenCalledTimes(1))
    expect(saved.mock.calls[0][0].sellerOnboarding.formData.ownershipType).toBe(locked ? 'individual' : 'company')
    cleanup()
    vi.restoreAllMocks()
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  }
})
