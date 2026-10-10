// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import RecruitmentApplicantDocuments from '../RecruitmentApplicantDocuments'
import RecruitmentNextAction from '../RecruitmentNextAction'
import { recruitmentSignupRequest } from '../../../services/recruitmentSignupService'
import { getRecruitmentInvitationStatus, sendRecruitmentInvitation } from '../../../services/recruitmentService'
vi.mock('../../../services/recruitmentSignupService', () => ({ recruitmentSignupRequest: vi.fn() }))
vi.mock('../../../services/recruitmentService', () => ({ getRecruitmentInvitationStatus: vi.fn(), sendRecruitmentInvitation: vi.fn() }))
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals() })
const org = '2958d402-368e-43c9-b728-0098e10505f1', id = '22222222-2222-4222-8222-222222222222'
const applicant = { applicationSubmitted: true, emailVerification: 'verified', documents: [], documentsEditable: true }
it('retries the same uploaded file after a lost save response without uploading or attaching it twice', async () => {
  let commits = 0
  const onSaved = vi.fn(), fetcher = vi.fn().mockResolvedValue({ ok: true })
  vi.stubGlobal('fetch', fetcher)
  recruitmentSignupRequest.mockImplementation(async action => {
    if (action === 'prepare_document') return { uploadUrl: 'https://storage.test/signed-upload' }
    if (++commits === 1) throw new Error('Save result uncertain')
    return { saved: true, applicant: { ...applicant, documents: [{ name: 'cv.pdf', type: 'CV', path: 'own-file' }] } }
  })
  render(<RecruitmentApplicantDocuments applicant={applicant} onSaved={onSaved} />)
  fireEvent.change(screen.getByLabelText('Upload CV'), { target: { files: [new File(['%PDF'], 'cv.pdf', { type: 'application/pdf' })] } })
  fireEvent.click(await screen.findByRole('button', { name: 'Retry CV upload' }))
  await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1))
  expect(fetcher).toHaveBeenCalledTimes(1)
  const requests = recruitmentSignupRequest.mock.calls.filter(([action]) => action === 'prepare_document')
  expect(requests).toHaveLength(2)
  expect(requests[1][1].requestId).toBe(requests[0][1].requestId)
  expect(screen.getByText('CV uploaded.')).toBeTruthy()
})
it('requires email verification again after session expiry and makes no upload when access is lost', async () => {
  recruitmentSignupRequest.mockRejectedValue(Object.assign(new Error('Session expired'), { status: 401 }))
  const expired = vi.fn(), fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher)
  render(<RecruitmentApplicantDocuments applicant={applicant} onSessionExpired={expired} />)
  fireEvent.change(screen.getByLabelText('Upload Identity document'), { target: { files: [new File(['%PDF'], 'id.pdf', { type: 'application/pdf' })] } })
  await waitFor(() => expect(expired).toHaveBeenCalledTimes(1))
  expect(fetcher).not.toHaveBeenCalled()
})
it('blocks invalid files, previews and edits after approval', () => {
  const view = render(<RecruitmentApplicantDocuments applicant={applicant} preview />)
  expect(screen.getByLabelText('Upload CV').disabled).toBe(true)
  view.rerender(<RecruitmentApplicantDocuments applicant={{ ...applicant, documentsEditable: false }} />)
  expect(screen.getByLabelText('Upload CV').disabled).toBe(true)
  view.rerender(<RecruitmentApplicantDocuments applicant={applicant} />)
  fireEvent.change(screen.getByLabelText('Upload CV'), { target: { files: [new File(['exe'], 'bad.exe', { type: 'application/exe' })] } })
  expect(screen.getByRole('alert').textContent).toContain('PDF, JPG or PNG')
  expect(recruitmentSignupRequest).not.toHaveBeenCalled()
})
it('keeps contacted leads at receipt and offers the actual email reminder after verified submission', async () => {
  const contact = vi.fn()
  const view = render(<RecruitmentNextAction lead={{ id, status: 'lead_received' }} onContact={contact} />)
  fireEvent.click(screen.getByRole('button', { name: 'Contacted lead' }))
  expect(contact).toHaveBeenCalledTimes(1)
  expect(screen.queryByText('Application Submitted')).toBeNull()
  getRecruitmentInvitationStatus.mockResolvedValue({ referenceStatus: 'prepared', attempt: null })
  sendRecruitmentInvitation.mockResolvedValue({ ok: true, status: 'provider_accepted' })
  view.rerender(<RecruitmentNextAction lead={{ id, status: 'application_submitted', application_submitted_at: '2026-10-10', documents_json: [] }} organisationId={org} />)
  const reminder = await screen.findByRole('button', { name: 'Send reminder to log in and upload documents' })
  fireEvent.click(reminder)
  await waitFor(() => expect(sendRecruitmentInvitation).toHaveBeenCalledWith(org, id, 'documents_reminder', id, expect.objectContaining({ requestId: expect.any(String) })))
  expect(screen.getByRole('button', { name: 'Start application review' }).disabled).toBe(true)
})
it('places review, decision, contract and activation actions in the Next best action container', () => {
  const open = vi.fn()
  const view = render(<RecruitmentNextAction lead={{ id, status: 'under_review', review_status: 'ready_for_approval' }} onOpen={open} />)
  const container = within(screen.getByLabelText('Next best action'))
  for (const [label, target] of [['Open Application','application'],['Approve','approve'],['Reject Application','reject']]) {
    fireEvent.click(container.getByRole('button', { name: label })); expect(open).toHaveBeenLastCalledWith(target)
  }
  view.rerender(<RecruitmentNextAction lead={{ id, status: 'contract_sent' }} onOpen={open} />)
  fireEvent.click(screen.getByRole('button', { name: 'Upload Contract' })); expect(open).toHaveBeenLastCalledWith('signed')
  view.rerender(<RecruitmentNextAction lead={{ id, status: 'contract_signed' }} onOpen={open} />)
  fireEvent.click(screen.getByRole('button', { name: 'Mark as activated' })); expect(open).toHaveBeenLastCalledWith('activation')
})
it('shows Home Seekers document readiness only after proof of address is present as well as the four other requested files',()=>{
  const files=['CV','Identity document','Qualifications','Registration evidence'].map(type=>({type,path:type,name:type+'.pdf'}))
  const view=render(<RecruitmentApplicantDocuments homeSeekers applicant={{...applicant,documents:files,documentsComplete:true}} />)
  expect(screen.queryByText('Your document pack is ready for the recruitment team to review.')).toBeNull()
  expect(screen.getByLabelText('Upload supporting FICA documents / proof of address')).toBeTruthy()
  view.rerender(<RecruitmentApplicantDocuments homeSeekers applicant={{...applicant,documents:[...files,{type:'Other',path:'address',name:'address.pdf'}],documentsComplete:true}} />)
  expect(screen.getByText('Your document pack is ready for the recruitment team to review.')).toBeTruthy()
})
