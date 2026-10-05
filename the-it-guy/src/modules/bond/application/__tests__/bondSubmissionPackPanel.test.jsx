// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import BondSubmissionPackPanel, { BondSubmissionPackWorkspace } from '../../../../components/bond/BondSubmissionPackPanel.jsx'
const mocks = vi.hoisted(() => ({ load: vi.fn(), download: vi.fn(), queue: vi.fn(), review: vi.fn() }))
vi.mock('../../../../services/bondSubmissionPackService.js', () => ({ getBondSubmissionPackService: async () => ({ load: mocks.load, download: mocks.download, review: mocks.review }) }))
vi.mock('../../../../lib/api.js', () => ({ fetchBondSubmissionPackQueue: mocks.queue }))
afterEach(() => { cleanup(); vi.resetAllMocks() })
const plan = { submission: { submission_version: 2 }, ready: false, rows: [{ key: 'bank', title: 'Bank statements', status: 'Secure handoff not connected', external: true, included: [] }, { key: 'id', title: 'Identity document', status: 'Approved', included: ['id'] }] }
it('offers three separate downloads with incomplete and statement-handoff guidance', async () => {
  mocks.load.mockResolvedValue(plan); mocks.download.mockResolvedValue('application-signed.pdf')
  render(<BondSubmissionPackPanel transactionId="tx" />)
  fireEvent.click(screen.getByText('Check pack and downloads'))
  await screen.findByText('Signed application PDF')
  expect(screen.getByText(/Incomplete/)).toBeTruthy()
  expect(screen.getByText(/receipt is unverified/)).toBeTruthy()
  fireEvent.click(screen.getByText('Signed application PDF'))
  await screen.findByRole('status')
  expect(mocks.download).toHaveBeenCalledWith('tx', 'application')
  expect(screen.getByText('Supporting documents ZIP')).toBeTruthy()
  expect(screen.getByText('Pack checklist PDF')).toBeTruthy()
})
it('hides download controls when signed-original verification or access fails', async () => {
  mocks.load.mockRejectedValue(new Error('Not accessible'))
  render(<BondSubmissionPackPanel transactionId="tx" />)
  fireEvent.click(screen.getByText('Check pack and downloads'))
  expect((await screen.findByRole('alert')).textContent).toBe('Not accessible')
  expect(screen.queryByText('Signed application PDF')).toBeNull()
})
it('loads current assigned signed applications independently of older export packages', async () => {
  mocks.queue.mockResolvedValue([{ transactionId: 'tx', version: 2, applicantNames: 'Example Buyer' }])
  render(<BondSubmissionPackWorkspace />)
  fireEvent.click(screen.getByText('Load signed applications'))
  await waitFor(() => expect(screen.getByText(/Example Buyer/)).toBeTruthy())
  expect(screen.getByText('Check pack and downloads')).toBeTruthy()
})

it('records explicit consultant review while leaving release blockers visible', async () => {
  const reviewPlan = { ...plan, rows: [], reviewContext: { contextHash: 'hash', review: null }, releaseGate: { blockers: [{ code: 'pilot', message: 'Live pilot pending' }] }, issues: [{ code: 'consultant_review_required', message: 'Consultant review required' }, { code: 'pilot', message: 'Live pilot pending' }], assessment: { label: 'Incomplete', issues: [{ code: 'consultant_review_required' }, { code: 'pilot' }] }, submission: { id: 'sub', submission_version: 2 } }
  mocks.load.mockResolvedValue(reviewPlan)
  mocks.review.mockResolvedValue({ ...reviewPlan, reviewContext: { contextHash: 'hash', review: { current: true } } })
  render(<BondSubmissionPackPanel transactionId="tx" />)
  fireEvent.click(screen.getByText('Check pack and downloads'))
  await screen.findByText('Record consultant review')
  const button = screen.getByText('Record consultant review')
  expect(button.disabled).toBe(true)
  for (const checkbox of screen.getAllByRole('checkbox')) fireEvent.click(checkbox)
  expect(button.disabled).toBe(false)
  fireEvent.click(button)
  await screen.findByText(/Review recorded for this version/)
  expect(mocks.review.mock.calls[0][1]).toMatchObject({ submissionId: 'sub', contextHash: 'hash', checks: { applicationChecked: true, documentsChecked: true, signaturesChecked: true, bankFormsChecked: true } })
  expect(screen.getByText('Live pilot pending')).toBeTruthy()
})
