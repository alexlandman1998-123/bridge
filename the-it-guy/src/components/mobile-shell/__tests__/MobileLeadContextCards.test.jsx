// @vitest-environment jsdom
import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import MobileLeadContextCards from '../MobileLeadContextCards.jsx'
import { getPrivateListing, getPrivateListingCoverImageUrls } from '../../../services/privateListingService.js'
import { getMobileBuyerQualification } from '../../../services/mobileLeadContextModel.js'
import { buildBuyerIntakeNotes } from '../../../services/buyerIntakeModel.js'

vi.mock('../../../services/privateListingService.js', () => ({ getPrivateListing: vi.fn(), getPrivateListingCoverImageUrls: vi.fn() }))
afterEach(() => { cleanup(); vi.resetAllMocks() })
const lead = { leadId: 'one', enquiredListingId: 'listing', enquiredPropertyAddress: 'Original enquiry address', stage: 'Qualified' }
const notes = buildBuyerIntakeNotes({ qualification: { qualifiedAt: '2026-10-20T09:00:00Z', answers: {
  budget: 'R 2m – R 3m', areaInterest: 'Waverley', moveTimeframe: '1-3 months', financeType: 'Bond', subjectToFinance: 'Yes', depositAvailable: 'R 400 000', preApprovalStatus: 'Pre-approved', propertyToSell: 'No', propertyNeed: '3 bedrooms', additionalNotes: 'A garden is essential.\nNear schools.',
} }, viewing: { respondedAt: '2026-10-20T09:00:00Z', availabilityWindows: ['Friday, 10:00'], attendeeNotes: 'Two adults' } })

it('shows the actual linked listing first, then qualification, and opens all saved desktop answers', async () => {
  getPrivateListing.mockResolvedValue({ id: 'listing', organisationId: 'agency', propertyAddress: '12 Long Street', suburb: 'Waverley', city: 'Pretoria', askingPrice: 2500000 })
  getPrivateListingCoverImageUrls.mockResolvedValue({ listing: 'https://example.com/cover.jpg' })
  render(<MobileLeadContextCards lead={{ ...lead, notes }} organisationId="agency" contact={{ firstName: 'Sarah' }} />)
  expect(await screen.findByRole('img', { name: '12 Long Street' })).toHaveProperty('src', 'https://example.com/cover.jpg')
  const track = screen.getByRole('region', { name: 'Enquiry and buyer qualification' })
  expect(track.children[0].getAttribute('aria-label')).toBe('Enquired listing')
  expect(track.children[1].tagName).toBe('BUTTON')
  expect(screen.getByText(/2.*500.*000/)).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: /Submitted Buyer qualification/ }))
  const dialog = screen.getByRole('dialog', { name: 'Buyer qualification' })
  for (const answer of ['R 2m – R 3m', 'Waverley', '1-3 months', 'Bond', 'Yes', 'R 400 000', 'Pre-approved', 'No', '3 bedrooms']) {
    expect(within(dialog).getByText(answer)).toBeTruthy()
  }
  expect(within(dialog).getByText(/A garden is essential/).textContent).toContain('\nNear schools.')
  expect(within(dialog).getByText('Friday, 10:00')).toBeTruthy()
  expect(within(dialog).getByText('Two adults')).toBeTruthy()
  fireEvent.keyDown(document, { key: 'Escape' })
  expect(screen.queryByRole('dialog')).toBeNull()
})

it('does not invent a submission from lead stage, budget or area alone', () => {
  const qualification = getMobileBuyerQualification({ stage: 'Qualified', budget: 2000000, areaInterest: 'Waverley' })
  expect(qualification.status).toBe('Not submitted')
  expect(qualification.rows.every(row => row.value === 'Not captured')).toBe(true)
})

it('reads legacy qualification answers and gives canonical answers precedence', () => {
  const legacy = '[Buyer qualification]\nBudget: Under R 1m\nPreferred areas: Old area\nCall notes: First line\nSecond line\n[/Buyer qualification]'
  const qualification = getMobileBuyerQualification({ notes: `${legacy}\n${buildBuyerIntakeNotes({ qualification: { answers: { areaInterest: 'New area', financeType: 'Cash' } } })}` })
  expect(qualification.rows.find(row => row.key === 'areaInterest').value).toBe('New area')
  expect(qualification.rows.find(row => row.key === 'budget').value).toBe('Under R 1m')
  expect(qualification.rows.find(row => row.key === 'additionalNotes').value).toBe('First line\nSecond line')
  expect(qualification.rows.some(row => row.key === 'preApprovalStatus')).toBe(false)
})

it('keeps enquiry details and qualification usable when listing loading fails, and retries', async () => {
  getPrivateListing.mockRejectedValueOnce(new Error('Unavailable')).mockResolvedValueOnce({ organisationId: 'agency', propertyAddress: '12 Long Street' })
  getPrivateListingCoverImageUrls.mockResolvedValue({})
  render(<MobileLeadContextCards lead={lead} organisationId="agency" />)
  fireEvent.click(await screen.findByRole('button', { name: 'Retry listing details' }))
  expect(await screen.findByRole('heading', { name: '12 Long Street' })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: /Not submitted Buyer qualification/ }))
  expect(screen.getByRole('dialog')).toBeTruthy()
})

it('rejects a linked listing outside the current organisation before loading its cover', async () => {
  getPrivateListing.mockResolvedValue({ organisationId: 'another-agency', propertyAddress: 'Other agency listing' })
  render(<MobileLeadContextCards lead={lead} organisationId="agency" />)
  await screen.findByRole('button', { name: 'Retry listing details' })
  expect(screen.queryByText('Other agency listing')).toBeNull()
  expect(getPrivateListingCoverImageUrls).not.toHaveBeenCalled()
})

it('has useful empty states without inventing a listing image or price', () => {
  render(<MobileLeadContextCards lead={{ leadId: 'one' }} organisationId="agency" />)
  expect(screen.getByText('Cover image unavailable')).toBeTruthy()
  expect(screen.getByText('Price not available')).toBeTruthy()
  expect(getPrivateListing).not.toHaveBeenCalled()
})

it('ignores a late listing response after the lead changes', async () => {
  let resolveOld
  getPrivateListing.mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve })).mockResolvedValueOnce({ organisationId: 'agency', propertyAddress: 'Current listing' })
  getPrivateListingCoverImageUrls.mockResolvedValue({})
  const view = render(<MobileLeadContextCards lead={lead} organisationId="agency" />)
  view.rerender(<MobileLeadContextCards lead={{ ...lead, enquiredListingId: 'new-listing' }} organisationId="agency" />)
  await screen.findByRole('heading', { name: 'Current listing' })
  resolveOld({ organisationId: 'agency', propertyAddress: 'Old listing' })
  await waitFor(() => expect(screen.queryByRole('heading', { name: 'Old listing' })).toBeNull())
})

it('shows tenant qualification answers from the rental intake instead of buyer questions', async () => {
  render(<MobileLeadContextCards lead={{ leadId: 'tenant', rawEnquiryPayload: { arch9RentalLead: true, classification: 'rental', role: 'tenant', qualification: { monthlyBudget: 13500, desiredArea: 'Waverley', occupationDate: '2026-11-01', employmentStatus: 'Employed', screeningConsent: 'Yes', submittedAt: '2026-10-20T09:00:00Z' } } }} organisationId="agency" />)
  fireEvent.click(screen.getByRole('button', { name: /Submitted Tenant qualification/ }))
  const dialog = screen.getByRole('dialog', { name: 'Tenant qualification' })
  expect(within(dialog).getByText('Monthly budget')).toBeTruthy()
  expect(within(dialog).getByText('13500')).toBeTruthy()
  expect(within(dialog).getByText('Employed')).toBeTruthy()
  expect(within(dialog).queryByText('Cash or bond')).toBeNull()
})
