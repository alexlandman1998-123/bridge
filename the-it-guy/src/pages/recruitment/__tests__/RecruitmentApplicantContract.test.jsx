// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import RecruitmentApplicantContract from '../RecruitmentApplicantContract'
import { recruitmentSignupRequest } from '../../../services/recruitmentSignupService'
vi.mock('../../../services/recruitmentSignupService', () => ({ recruitmentSignupRequest: vi.fn() }))
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.clearAllMocks(); vi.unstubAllGlobals() })
const contract = { version: 1, name: 'Agreement.pdf', canUpload: true, verified: false, returns: [] }
function pdf(name = 'Signed.pdf') { const file = new File(['%PDF-signed'], name, { type: 'application/pdf' }); file.slice = () => ({ arrayBuffer: async () => new TextEncoder().encode('%PDF-').buffer }); return file }
function open(value = contract) { const onSaved = vi.fn(), onSessionExpired = vi.fn(); render(<RecruitmentApplicantContract contract={value} endpoint="/api/recruitment/applicant-profile" onSaved={onSaved} onSessionExpired={onSessionExpired} />); return { onSaved, onSessionExpired } }
it('presents download, sign and return, and asks for an explicit upload after choosing the PDF', async () => {
  const saved = { contract: { ...contract, returns: [{ id: 'returned', name: 'Signed.pdf' }] } }
  recruitmentSignupRequest.mockImplementation(async action => action === 'prepare_contract_return' ? { uploadUrl: 'https://storage.test/upload' } : { saved: true, applicant: saved })
  const put = vi.fn().mockResolvedValue({ ok: true }); vi.stubGlobal('fetch', put)
  const f = open(), file = pdf()
  expect(screen.getByRole('button', { name: 'Upload signed copy' }).disabled).toBe(true)
  fireEvent.change(screen.getByLabelText('Choose signed contract PDF'), { target: { files: [file] } })
  expect(recruitmentSignupRequest).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Upload signed copy' }))
  await waitFor(() => expect(f.onSaved).toHaveBeenCalledWith(saved))
  const [prepare, commit] = recruitmentSignupRequest.mock.calls
  expect(prepare[0]).toBe('prepare_contract_return'); expect(commit[0]).toBe('commit_contract_return')
  expect(prepare[1].requestId).toBe(commit[1].requestId)
  expect(commit[1].document).toEqual({ name: 'Signed.pdf', size: file.size, mimeType: 'application/pdf' })
  expect(put).toHaveBeenCalledWith('https://storage.test/upload', expect.objectContaining({ method: 'PUT', body: file }))
})
it('recovers a lost finalisation response with the same request and without uploading the PDF twice', async () => {
  let commits = 0
  recruitmentSignupRequest.mockImplementation(async action => { if (action === 'prepare_contract_return') return { uploadUrl: 'https://storage.test/upload' }; if (++commits === 1) throw new Error('Connection lost'); return { saved: true, applicant: { contract } } })
  const put = vi.fn().mockResolvedValue({ ok: true }); vi.stubGlobal('fetch', put)
  const f = open(); fireEvent.change(screen.getByLabelText('Choose signed contract PDF'), { target: { files: [pdf()] } }); fireEvent.click(screen.getByRole('button', { name: 'Upload signed copy' }))
  await screen.findByRole('alert'); fireEvent.click(screen.getByRole('button', { name: 'Retry signed copy' }))
  await waitFor(() => expect(f.onSaved).toHaveBeenCalled())
  expect(put).toHaveBeenCalledTimes(1)
  expect(new Set(recruitmentSignupRequest.mock.calls.map(([, args]) => args.requestId)).size).toBe(1)
})
it('uses only registered contract identifiers for downloads and handles an expired session', async () => {
  recruitmentSignupRequest.mockRejectedValue(Object.assign(new Error('Log in again'), { status: 401 }))
  const f = open(); fireEvent.click(screen.getByRole('button', { name: 'Download contract' }))
  await screen.findByRole('alert'); expect(f.onSessionExpired).toHaveBeenCalled()
  expect(recruitmentSignupRequest).toHaveBeenCalledWith('download_contract', { returnId: undefined }, expect.objectContaining({ endpoint: '/api/recruitment/applicant-profile' }))
})
it('shows the returned copy and locks further uploads after agency verification', () => {
  open({ ...contract, verified: true, canUpload: false, returns: [{ id: 'returned', name: 'Signed.pdf' }] })
  expect(screen.getByRole('button', { name: 'Download your signed copy' })).toBeTruthy()
  expect(screen.queryByLabelText('Choose signed contract PDF')).toBeNull()
  expect(screen.getByText('Our team has verified your signed contract.')).toBeTruthy()
})
