// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import BondWetInkSigningPanel from '../guided/BondWetInkSigningPanel.jsx'
import BondWetInkReviewQueue from '../../../../components/bond/BondWetInkReviewQueue.jsx'
const mocks = vi.hoisted(() => ({ queue: vi.fn(), read: vi.fn(), review: vi.fn(), download: vi.fn() }))
vi.mock('../../../../lib/api.js', () => ({ fetchBondWetInkReviewQueue: mocks.queue, readBondWetInkReviewOriginal: mocks.read, reviewBondWetInkSignedCopy: mocks.review }))
vi.mock('../../../../lib/clientPortalApi.js', () => ({ cancelBuyerBondWetInkSigning: vi.fn(), uploadBuyerBondWetInkSignedCopy: vi.fn(), renderBuyerBondWetInkSigningPdf: vi.fn(), readBuyerBondWetInkOriginal: vi.fn() }))
vi.mock('../../../../services/bondWetInkSigningService.js', () => ({ downloadBondSigningBytes: mocks.download }))
const now = new Date().toISOString()
const item = { version: { id: 'version', version: 2, status: 'awaiting_review', created_at: now, snapshot_json: { reviewedVersion: { reference: 'TX-V2' }, signerManifest: [{ participantKey: 'primary', fullName: 'First Buyer', email: 'first@example.test', identityReference: '123' }, { participantKey: 'co', fullName: 'Second Buyer', email: 'second@example.test', identityReference: '456' }] } }, uploads: [{ id: 'upload', file_name: 'signed.pdf', status: 'awaiting_review' }] }
afterEach(() => { cleanup(); vi.clearAllMocks() })
it('shows an awaiting-review upload without claiming it is accepted', () => {
  render(<BondWetInkSigningPanel data={item} credentials={{}} onRefresh={vi.fn()} onCancelled={vi.fn()} />)
  expect(screen.getByRole('status').textContent).toContain('not yet been accepted')
  expect(screen.queryByText('Upload signed copy')).toBeNull()
  expect(screen.getByText('Download original')).toBeTruthy()
})
it('shows rejection feedback and permits a replacement directly here', () => {
  render(<BondWetInkSigningPanel data={{ ...item, version: { ...item.version, status: 'awaiting_upload' }, uploads: [{ ...item.uploads[0], status: 'rejected', feedback: 'Include every page' }] }} credentials={{}} onRefresh={vi.fn()} onCancelled={vi.fn()} />)
  expect(screen.getByRole('alert').textContent).toContain('Include every page')
  expect(screen.getByLabelText('Upload the complete signed application')).toBeTruthy()
})
it('requires an integrity-verified original and every applicant check before acceptance', async () => {
  mocks.queue.mockResolvedValue([item]); mocks.read.mockResolvedValue(new Uint8Array([1])); mocks.review.mockResolvedValue({ status: 'accepted' })
  render(<BondWetInkReviewQueue />)
  const accept = await screen.findByText('Accept signed original')
  expect(accept.disabled).toBe(true)
  await act(async () => { fireEvent.click(screen.getByText('Download original to review')) })
  const checkboxes = screen.getAllByRole('checkbox')
  for (const checkbox of checkboxes.slice(0, 5)) fireEvent.click(checkbox)
  expect(accept.disabled).toBe(true)
  // Every joint signer must have both checks and a valid date. Optional choices
  // remain unchecked unless the reviewer sees express agreement on paper.
  for (const checkbox of [checkboxes[7], checkboxes[8]]) fireEvent.click(checkbox)
  const dates = screen.getAllByLabelText('Date written beside signature')
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Johannesburg', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
  for (const input of dates) fireEvent.change(input, { target: { value: date } })
  expect(accept.disabled).toBe(false)
  await act(async () => { fireEvent.click(accept) })
  expect(mocks.review.mock.calls[0][0].checks.signers).toHaveLength(2)
  expect(mocks.review.mock.calls[0][0].checks.signers.every((signer) => !signer.marketingAccepted)).toBe(true)
})
