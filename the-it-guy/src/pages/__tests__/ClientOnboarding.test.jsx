// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import ClientOnboarding, { normalizeDetailsState, sanitizeClientFormData } from '../ClientOnboarding.jsx'
import { getDemoBuyerOnboardingPayload } from '../../lib/onboardingDemoLinks.js'
import { hydrateBuyerOnboardingCapture } from '../../core/transactions/buyerOnboardingCapture.js'
import { getBuyerFicaDeclarationSigners } from '../../core/documents/buyerFicaDeclarationSigning.js'
import { deriveOnboardingConfiguration, validateOnboardingSubmission } from '../../lib/purchaserPersonas.js'

const api = vi.hoisted(() => ({ load: vi.fn(), save: vi.fn(), submit: vi.fn() }))
vi.mock('../../domains/transactions/contactRead.js', () => ({
  fetchClientOnboardingByToken: api.load, saveClientOnboardingDraft: api.save,
  submitClientOnboarding: api.submit, resolveOnboardingWhatsAppContacts: () => [],
}))
vi.mock('../../domains/onboarding/tokenApi.js', () => ({
  fetchClientOnboardingByToken: api.load, saveClientOnboardingDraft: api.save,
  submitClientOnboarding: api.submit, resolveOnboardingWhatsAppContacts: () => [],
}))

beforeEach(() => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
  api.load.mockReset(); api.save.mockReset(); api.submit.mockReset()
})
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

function buyerFile({ purchasers, ...overrides } = {}) {
  const base = getDemoBuyerOnboardingPayload()
  const primary = { ...base.formData.purchasers[0], number_of_dependants: 0, monthly_credit_commitments: 0,
    marital_status: 'single', marital_regime: '', ...overrides }
  const formData = { purchaser_type: 'individual', purchaser_entity_type: 'individual', natural_person_purchase_mode: purchasers ? 'co_purchasing' : 'individual',
    purchase_finance_type: 'cash', purchasers: purchasers || [primary],
    finance: { proof_of_funds_available: 'yes', source_of_funds: 'savings', cash_funds_confirmed: 'yes' } }
  return { ...base, formData, transaction: { ...base.transaction, finance_type: 'cash', cash_amount: base.transaction.purchase_price, bond_amount: 0 } }
}

async function openDetails(file) {
  api.load.mockResolvedValue(file)
  render(<MemoryRouter initialEntries={['/client/onboarding/audit-token']}><Routes>
    <Route path="/client/onboarding/:token" element={<ClientOnboarding />} />
  </Routes></MemoryRouter>)
  fireEvent.click(await screen.findByRole('button', { name: /Start buyer onboarding/i }))
  fireEvent.click(screen.getByRole('button', { name: 'Next Step', exact: true }))
  fireEvent.click(screen.getByRole('button', { name: 'Next Step', exact: true }))
  await screen.findByRole('heading', { name: 'Purchaser 1 Details' })
}

test.each([3, 4, 6])('all %i saved purchasers survive hydration, editing, draft serialization and reopening', count => {
  const primary = buyerFile().formData.purchasers[0]
  const share = Math.floor(100 / count)
  const shares = Array.from({ length: count }, (_, index) => index === count - 1 ? 100 - share * (count - 1) : share)
  const purchasers = shares.map((ownership_share, index) => ({ ...primary, first_name: `Person ${index + 1}`, ownership_share, consent_to_purchase: 'yes' }))
  const file = buyerFile({ purchasers })
  const hydrated = hydrateBuyerOnboardingCapture(file.formData, { profile: file.formData, revision: { profileVersion: 1 }, buyerId: 'buyer' })
  const state = normalizeDetailsState(hydrated, { purchaserEntityType: 'individual', financeType: 'cash' })
  state.purchasers[2].tax_number = '9988776655'
  const saved = sanitizeClientFormData({ ...hydrated, purchasers: state.purchasers }, { purchaserType: 'individual', financeType: 'cash', fundingSources: [] })
  const reopened = normalizeDetailsState(JSON.parse(JSON.stringify(saved)), { purchaserEntityType: 'individual', financeType: 'cash' })
  expect(reopened.purchasers.map(person => person.first_name)).toEqual(purchasers.map(person => person.first_name))
  expect(reopened.purchasers[2].tax_number).toBe('9988776655')
  expect(reopened.purchasers.map(person => person.ownership_share)).toEqual(shares)
  expect(getBuyerFicaDeclarationSigners({ purchasers: reopened.purchasers })).toHaveLength(count)
  const configuration = deriveOnboardingConfiguration(saved, { transaction: file.transaction })
  expect(configuration.parties.filter(party => party.purchaser).map(party => party.name)).toEqual(purchasers.map(person => `${person.first_name} Khumalo`))
  const conflictingMode = deriveOnboardingConfiguration({ ...saved, natural_person_purchase_mode: 'individual' }, { transaction: file.transaction })
  expect(conflictingMode.parties.filter(party => party.purchaser)).toHaveLength(count)
  expect(() => validateOnboardingSubmission(saved, { transaction: file.transaction })).not.toThrow()
})

test('saved numeric zeros populate the inputs and pass the details step without retyping', async () => {
  const file = buyerFile()
  await openDetails(file)
  const card = within(screen.getByRole('heading', { name: 'Purchaser 1 Details' }).closest('article'))
  expect(card.getByLabelText(/Number of Dependants/).value).toBe('0')
  expect(card.getByLabelText(/Monthly Credit Commitments/).value).toBe('0')
  fireEvent.click(screen.getByRole('button', { name: 'Next Step', exact: true }))
  await screen.findByRole('heading', { name: 'Buyer FICA Declaration' })
  expect(screen.queryByText('Number of Dependants is required.')).toBeNull()
})

test('out-of-community spouse contact stays optional through the real details-step validation', async () => {
  await openDetails(buyerFile({ marital_status: 'married', marital_regime: 'out_of_community',
    spouse_full_name: 'Pat Buyer', spouse_identity_number: '9001015009087', spouse_is_co_purchaser: 'no', spouse_email: '', spouse_phone: '' }))
  fireEvent.click(screen.getByRole('button', { name: 'Next Step', exact: true }))
  await screen.findByRole('heading', { name: 'Buyer FICA Declaration' })
})

test('third saved purchaser is editable on desktop and retained by the real draft save', async () => {
  const primary = buyerFile().formData.purchasers[0]
  let persisted = buyerFile({ purchasers: [30, 30, 40].map((share, index) => ({ ...primary, first_name: `Person ${index + 1}`, ownership_share: share, consent_to_purchase: 'yes' })) })
  api.save.mockImplementation(async ({ formData }) => { persisted = { ...persisted, formData }; api.load.mockResolvedValue(persisted) })
  await openDetails(persisted)
  fireEvent.click(screen.getAllByRole('button', { name: /Individual Purchaser/ }).at(-1))
  expect(screen.getByText(/Keep co-purchasing selected so every saved purchaser is retained/)).toBeTruthy()
  const third = within(screen.getByRole('heading', { name: 'Purchaser 3 Details' }).closest('article'))
  fireEvent.change(third.getByLabelText(/Tax Number/), { target: { value: '9988776655' } })
  fireEvent.click(screen.getByRole('button', { name: /Save.*Draft/i }))
  await waitFor(() => expect(api.save).toHaveBeenCalledTimes(1))
  expect(api.save.mock.calls[0][0].formData.purchasers).toHaveLength(3)
  expect(api.save.mock.calls[0][0].formData.purchasers[2].tax_number).toBe('9988776655')
  await waitFor(() => expect(screen.getByRole('heading', { name: 'Purchaser 3 Details' })).toBeTruthy())
  expect(within(screen.getByRole('heading', { name: 'Purchaser 3 Details' }).closest('article')).getByLabelText(/Tax Number/).value).toBe('9988776655')
  fireEvent.click(screen.getByRole('button', { name: 'Next Step', exact: true }))
  await screen.findByRole('heading', { name: 'Buyer FICA Declaration' })
  fireEvent.click(screen.getByRole('checkbox', { name: /I accept this FICA declaration/ }))
  const signatures = screen.getAllByRole('textbox', { name: /Type your full name as your signature/ })
  expect(signatures).toHaveLength(3)
  signatures.forEach((input, index) => fireEvent.change(input, { target: { value: `Person ${index + 1} Khumalo` } }))
  fireEvent.click(screen.getByRole('button', { name: 'Next Step', exact: true }))
  expect(await screen.findByText('30% / 30% / 40%')).toBeTruthy()
  expect(screen.getByText('Person 3 Khumalo')).toBeTruthy()
  expect(api.submit).not.toHaveBeenCalled()
})
