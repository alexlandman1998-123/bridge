// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import ClientEnquiryHistoryPanel from './ClientEnquiryHistoryPanel'
import { loadClientEnquiryHistory } from '../../services/clientEnquiryHistoryService'
vi.mock('../../services/clientEnquiryHistoryService', () => ({ loadClientEnquiryHistory: vi.fn() }))
afterEach(() => { cleanup(); vi.resetAllMocks() })
const client = { identityId: 'client', organisationId: 'agency' }
const show = () => render(<MemoryRouter><ClientEnquiryHistoryPanel client={client} /></MemoryRouter>)
const row = i => ({ id: String(i), leadId: 'lead', property: `Property ${i}`, source: 'Property24', recordedAt: '2026-10-01T10:00:00Z' })
test('marks repeat enquiries and opens the complete history from Overview', async () => {
  loadClientEnquiryHistory.mockResolvedValue({ available: true, count: 6, repeat: true, enquiries: Array.from({ length: 6 }, (_, i) => row(i)) })
  show()
  await screen.findByText('Repeat enquirer · 6 enquiries')
  expect(screen.queryByText('Property 5')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'View all 6 enquiries' }))
  expect(screen.getByText('Property 5')).toBeTruthy()
  expect(screen.getAllByRole('link', { name: 'Open enquiry' })[0].getAttribute('href')).toBe('/pipeline/leads/lead')
})
test('does not mark a single enquiry as a repeat', async () => {
  loadClientEnquiryHistory.mockResolvedValue({ available: true, count: 1, repeat: false, enquiries: [row(1)] })
  show()
  await screen.findByText('1 enquiry')
  expect(screen.queryByText(/Repeat enquirer/)).toBeNull()
})
test('failed history can be retried without displaying a misleading zero', async () => {
  loadClientEnquiryHistory.mockRejectedValueOnce(new Error('Denied')).mockResolvedValueOnce({ available: true, count: 0, repeat: false, enquiries: [] })
  show()
  await screen.findByRole('alert')
  expect(screen.queryByText('0 enquiries')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
  await screen.findByText('No linked enquiries recorded yet.')
})
