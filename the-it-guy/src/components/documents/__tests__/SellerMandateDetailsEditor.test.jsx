// @vitest-environment jsdom
import { useState } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { webcrypto } from 'node:crypto'
import SellerMandateDetailsEditor from '../SellerMandateDetailsEditor.jsx'
import ListingSellerInformationEditor from '../../listings/ListingSellerInformationEditor.jsx'
import { createMandateTermsFixture } from '../../../../scripts/fixtures/seller-mandate-capture.mjs'
import { buildListingSellerProfileFormPatch } from '../../../lib/listingSellerProfileBuilderModel.js'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

test('unknown saved mandate schedules stay visible as a preservation notice without editable fields', () => {
  const initial = { ...createMandateTermsFixture(), mandateCapture: { version: 2, futureSchedule: { value: 'Keep original' } } }
  render(<Editor initial={initial} />)
  expect(screen.getByRole('alert').textContent).toMatch(/saved schedule version this app cannot edit/)
  expect(screen.queryByLabelText('Mandate type')).toBeNull()
  expect(screen.queryByRole('button', { name: 'Capture revised mandate schedules' })).toBeNull()
  expect(saved()).toEqual(initial)
})

test('staff evidence recording requires the checks and invalidates when an agency changes', async () => {
  vi.stubGlobal('crypto', webcrypto)
  render(<Editor initial={createMandateTermsFixture()} />)
  const button = screen.getByRole('button', { name: 'Record checked mandate evidence' })
  expect(button.disabled).toBe(true)
  for (const [label, value] of [['Evidence reviewer', 'Checked by staff'], ['Checked owner / representative authority reference', 'AUTH-001'], ['Completed signed defects disclosure reference', 'MDF-001']]) fireEvent.change(screen.getByLabelText(label), { target: { value } })
  for (const label of ['Authority documents checked', 'Completed signed disclosure checked', 'All contracting business and practitioner FFC records checked']) fireEvent.click(screen.getByLabelText(label))
  expect(button.disabled).toBe(false)
  fireEvent.click(button)
  await waitFor(() => expect(saved().mandateAcceptanceReview.agencySchedulesDigest).toMatch(/^sha256:[a-f0-9]{64}$/))
  expect(saved().mandateAcceptanceReview.reviewedAt).toBeTruthy()
  fireEvent.change(screen.getAllByLabelText('Notice email')[1], { target: { value: 'changed@example.test' } })
  expect(saved().mandateAcceptanceReview.ffcVerified).toBe(false)
  expect(saved().mandateAcceptanceReview.agencySchedulesDigest).toBe('')
  expect(button.disabled).toBe(true)
})

function Editor({ initial = {} }) {
  const [value, setValue] = useState(initial)
  return <><SellerMandateDetailsEditor value={value} ownershipType="individual" onChange={setValue} /><output data-testid="draft">{JSON.stringify(value)}</output></>
}
const saved = () => JSON.parse(screen.getByTestId('draft').textContent)

test('Exclusive is the displayed label; legacy sole aliases remain compatible', () => {
  render(<Editor initial={{ mandateType: 'exclusive_mandate' }} />)
  expect(screen.getByLabelText('Mandate type').value).toBe('sole')
  expect(screen.getByRole('option', { name: 'Exclusive' })).toBeTruthy()
  expect(screen.queryByLabelText('Second agency name')).toBeNull()
  expect(screen.queryByText('Dual commission allocation')).toBeNull()
})

test('a formatted price from an older snapshot displays in the numeric editor', () => {
  render(<Editor initial={{ mandateType: 'sole', askingPrice: 'R 2 450 000.00' }} />)
  expect(screen.getByLabelText('Asking price (Rand)').value).toBe('2450000.00')
})

test('switching to indefinite Open removes its date and switching to Dual requires a fixed period', () => {
  render(<Editor initial={{ ...createMandateTermsFixture(), mandateType: 'open' }} />)
  fireEvent.change(screen.getByLabelText('Open mandate duration'), { target: { value: 'until_cancelled' } })
  expect(screen.queryByLabelText('Mandate end date')).toBeNull()
  expect(saved().endDate).toBe('')
  fireEvent.change(screen.getByLabelText('Mandate type'), { target: { value: 'dual' } })
  expect(screen.getByLabelText('Mandate end date').value).toBe('')
  expect(saved().mandateDuration).toBe('fixed')
  expect(screen.queryByLabelText('Open mandate duration')).toBeNull()
})

test('Dual agency and allocation values survive conditional hiding and explicit clearing', () => {
  render(<Editor initial={createMandateTermsFixture()} />)
  const emails = screen.getAllByLabelText('Notice email')
  fireEvent.change(emails[1], { target: { value: '' } })
  fireEvent.change(screen.getByLabelText('Agency A share (%)'), { target: { value: '40' } })
  fireEvent.change(screen.getByLabelText('Mandate type'), { target: { value: 'sole' } })
  expect(screen.getAllByLabelText('Notice email')).toHaveLength(1)
  expect(screen.queryByLabelText('Agency A share (%)')).toBeNull()
  fireEvent.change(screen.getByLabelText('Mandate type'), { target: { value: 'dual' } })
  expect(screen.getAllByLabelText('Notice email')[1].value).toBe('')
  expect(screen.getByLabelText('Agency A share (%)').value).toBe('40')
  expect(saved().mandateCapture.agencyB.legalName).toBe('Bravo Property (Pty) Ltd')
})

test('starting schedules does not select an allocation, protection default or exclusions', () => {
  render(<Editor initial={{ mandateType: 'dual' }} />)
  fireEvent.click(screen.getByRole('button', { name: 'Capture revised mandate schedules' }))
  expect(saved().mandateCapture.buyerExclusions.status).toBe('')
  expect(saved().mandateCapture.allocation.rule).toBe('')
  expect(saved().protectionPeriod).toBe('')
  expect(screen.getAllByRole('option', { name: 'Not applicable', hidden: true }).length).toBeGreaterThan(0)
})

test('draft expense choices hide unrelated fields and inactive fees stay in the draft', () => {
  render(<Editor initial={createMandateTermsFixture()} />)
  fireEvent.change(screen.getByLabelText('Separately approved expenses status'), { target: { value: 'none' } })
  expect(screen.queryByLabelText('Maximum amount (Rand)')).toBeNull()
  expect(saved().mandateCapture.expenses.status).toBe('none')
  fireEvent.change(screen.getByLabelText('Combined seller commission basis'), { target: { value: 'fixed' } })
  expect(screen.queryByLabelText('Commission percentage')).toBeNull()
  expect(saved().commissionPercentage).toBe('5')
  fireEvent.change(screen.getByLabelText('Fixed commission (Rand)'), { target: { value: '12500' } })
  expect(saved().commissionAmount).toBe('12500')
})

function ListingCapture() {
  const [draft, setDraft] = useState({ branch: 'individual', mandateType: 'open', mandateDuration: 'fixed', expiryDate: '2027-01-04', mandateStartDate: '2026-10-04' })
  return <><ListingSellerInformationEditor draft={draft} onChange={(key, value) => setDraft(previous => ({ ...previous, [key]: value }))} /><output data-testid="draft">{JSON.stringify(buildListingSellerProfileFormPatch(draft))}</output></>
}

test('listing callback mapping actually saves Open duration and schedules together', () => {
  render(<ListingCapture />)
  fireEvent.change(screen.getByLabelText('Open mandate duration'), { target: { value: 'until_cancelled' } })
  fireEvent.click(screen.getByRole('button', { name: 'Capture revised mandate schedules' }))
  fireEvent.change(screen.getByLabelText('Contracting legal name'), { target: { value: 'Captured Agency Legal Name' } })
  fireEvent.change(screen.getByLabelText('Protection period (calendar days; 0 means none)'), { target: { value: '0' } })
  expect(saved().mandateEndDate).toBe('')
  expect(saved().mandateDuration).toBe('until_cancelled')
  expect(saved().protectionPeriodDays).toBe('0')
  expect(saved().mandateCapture.agencyA.legalName).toBe('Captured Agency Legal Name')
})
