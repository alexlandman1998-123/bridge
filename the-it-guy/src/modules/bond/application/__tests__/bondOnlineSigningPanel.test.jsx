// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import BondOnlineSigningPanel from '../guided/BondOnlineSigningPanel.jsx'
import { createBondOnlineSigningClient } from '../../../../services/bondOnlineSigningClient.js'
vi.mock('../../../../services/bondWetInkSigningService.js', () => ({ downloadBondSigningBytes: vi.fn() }))
afterEach(cleanup)
const envelope = { id: 'fixed', reference: 'TX-V1', status: 'awaiting_signatures', signerStatus: 'awaiting_signature', completedSigners: 0, requiredSigners: 2 }
it('shows the paper option when online signing has not been enabled', () => {
  render(<BondOnlineSigningPanel availability={{ available: false }} />)
  expect(screen.getByText(/not enabled yet/)).toBeTruthy()
  expect(screen.queryByText('Verify my identity')).toBeNull()
})
it('requires permissions and intent, then handles code failures without declaring completion', async () => {
  const client = { start: vi.fn().mockResolvedValue({ sessionId: 'session', status: 'awaiting_code' }), verify: vi.fn().mockRejectedValue(new Error('Your code expired. Start again.')) }
  render(<BondOnlineSigningPanel availability={{ available: true }} client={client} envelope={envelope} declarations={[{ key: 'required', text: 'Required permission', required: true }, { key: 'marketing', text: 'Optional marketing', required: false }]} />)
  const start = screen.getByText('Verify my identity'); expect(start.disabled).toBe(true)
  fireEvent.click(screen.getByLabelText('Required permission (Required)'))
  fireEvent.click(screen.getByLabelText(/I have reviewed this version/)); expect(start.disabled).toBe(false)
  await act(async () => { fireEvent.click(start) })
  expect(client.start.mock.calls[0][0].consent.marketing).toBeUndefined()
  fireEvent.change(screen.getByLabelText('Verification code'), { target: { value: '123456' } })
  await act(async () => { fireEvent.click(screen.getByText('Verify code')) })
  expect(screen.getByRole('alert').textContent).toContain('expired')
  expect(screen.queryByText('Download signed application')).toBeNull()
})
it('an individual signature still waits for the other joint applicant', () => {
  render(<BondOnlineSigningPanel availability={{ available: true }} client={{}} envelope={{ ...envelope, signerStatus: 'signed', completedSigners: 1 }} />)
  expect(screen.getByRole('status').textContent).toContain('other applicants')
  expect(screen.queryByText('Verify my identity')).toBeNull()
  expect(screen.queryByText('Download signed application')).toBeNull()
})
it('downloads only an available completed original', async () => {
  const client = { download: vi.fn().mockResolvedValue(new Uint8Array([1])) }
  render(<BondOnlineSigningPanel availability={{ available: true }} client={client} envelope={{ ...envelope, status: 'completed', completedSigners: 2, documentAvailable: true }} />)
  await act(async () => { fireEvent.click(screen.getByText('Download signed application')) })
  expect(client.download).toHaveBeenCalledWith({ envelopeId: 'fixed' })
})
it('passes secure credentials in headers and recovers server errors without storing codes', async () => {
  const fetchRequest = vi.fn().mockResolvedValue({ ok: false, json: async () => ({ code: 'verification_expired', error: 'Code expired' }) })
  const client = createBondOnlineSigningClient({ accessToken: 'fixture-access', fetchRequest })
  await expect(client.verify({ envelopeId: 'fixed', sessionId: 'session', code: '123456' })).rejects.toMatchObject({ code: 'verification_expired' })
  const [url, args] = fetchRequest.mock.calls[0]
  expect(url).not.toContain('fixture-access'); expect(args.headers['x-bridge-bond-application-token']).toBe('fixture-access')
  expect(args.cache).toBe('no-store')
})
