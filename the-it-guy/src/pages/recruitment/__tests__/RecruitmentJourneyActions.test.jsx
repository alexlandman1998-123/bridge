// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import RecruitmentNextAction from '../RecruitmentNextAction'
import { recruitmentDocumentsComplete } from '../recruitmentDocumentsModel'
import { getRecruitmentInvitationStatus, sendRecruitmentInvitation } from '../../../services/recruitmentService'

vi.mock('../../../services/recruitmentService', () => ({
  getRecruitmentInvitationStatus: vi.fn(), sendRecruitmentInvitation: vi.fn(),
}))
afterEach(() => { cleanup(); vi.resetAllMocks() })
const lead = { id: 'lead', status: 'lead_received', documents_json: [] }
const renderAction = (record, props = {}) => render(<RecruitmentNextAction lead={record} organisationId="org" {...props} />)

it('records contact without treating outreach as a submitted application', () => {
  const contact = vi.fn(), review = vi.fn()
  const view = renderAction(lead, { onContact: contact, onStartReview: review })
  fireEvent.click(screen.getByRole('button', { name: 'Contacted lead' }))
  expect(contact).toHaveBeenCalledOnce()
  expect(review).not.toHaveBeenCalled()
  expect(screen.queryByRole('button', { name: /Send reminder/ })).toBeNull()
  view.rerender(<RecruitmentNextAction lead={{ ...lead, contacted_at: '2026-10-10T12:00:00Z' }} onContact={contact} />)
  expect(screen.getByRole('button', { name: 'Contact recorded' }).disabled).toBe(true)
  expect(screen.queryByRole('button', { name: /Start application review/ })).toBeNull()
})

it('sends a document reminder using the saved application identity and records provider acceptance', async () => {
  vi.mocked(getRecruitmentInvitationStatus).mockResolvedValue({ referenceStatus: 'prepared', recipient: 'applicant@example.test', attempt: null })
  vi.mocked(sendRecruitmentInvitation).mockResolvedValue({ ok: true })
  renderAction({ ...lead, status: 'application_submitted' })
  fireEvent.click(await screen.findByRole('button', { name: 'Send reminder to log in and upload documents' }))
  await waitFor(() => expect(sendRecruitmentInvitation).toHaveBeenCalledOnce())
  expect(sendRecruitmentInvitation).toHaveBeenCalledWith('org', 'lead', 'documents_reminder', 'lead', expect.objectContaining({ requestId: expect.any(String), allowDuplicate: false }))
  expect(await screen.findByRole('status')).toHaveProperty('textContent', 'The email provider accepted this invitation. Inbox delivery is not yet confirmed.')
})

it('requires all four document types or saved exceptions before starting review', () => {
  const open = vi.fn(), review = vi.fn()
  const record = { ...lead, status: 'documents_uploaded', documents_json: [{ type: 'CV', name: 'cv.pdf', path: 'org/lead/cv.pdf' }] }
  const view = renderAction(record, { onOpen: open, onStartReview: review })
  fireEvent.click(screen.getByRole('button', { name: 'Upload manually' }))
  expect(open).toHaveBeenCalledWith('documents')
  expect(screen.getByRole('button', { name: 'Start application review' }).disabled).toBe(true)
  view.rerender(<RecruitmentNextAction lead={{ ...record, document_waivers_json: { 'Identity document': 'Pending replacement identity document', Qualifications: 'No qualification document applies', 'Registration evidence': 'New entrant awaiting registration' } }} onStartReview={review} />)
  fireEvent.click(screen.getByRole('button', { name: 'Start application review' }))
  expect(review).toHaveBeenCalledOnce()
})

it('does not treat an empty file receipt as an uploaded required document', () => {
  expect(recruitmentDocumentsComplete({ documents_json: ['CV', 'Identity document', 'Qualifications', 'Registration evidence'].map(type => ({ type, name: `${type}.pdf` })) })).toBe(false)
})

it('provides one review entry action and keeps decisions inside the guided outcome', () => {
  const continueReview = vi.fn(), open = vi.fn()
  renderAction({ ...lead, status: 'under_review', review_status: 'in_progress' }, { onOpen: open, onContinueReview: continueReview, dirty: true })
  expect(screen.getAllByRole('button')).toHaveLength(1)
  fireEvent.click(screen.getByRole('button', { name: 'Continue review' }))
  expect(continueReview).toHaveBeenCalledOnce()
  expect(open).not.toHaveBeenCalled()
})

it.each([
  ['application_approved', 'Upload contract', 'contract'],
  ['contract_sent', 'View contract', 'signed'],
  ['contract_signed', 'Mark as activated', 'activation'],
  ['onboarding_complete', 'Mark as activated', 'activation'],
])('opens the required evidence step from %s instead of advancing immediately', async (status, label, dialog) => {
  vi.mocked(getRecruitmentInvitationStatus).mockResolvedValue({ referenceStatus: 'prepared', attempt: null })
  const open = vi.fn()
  renderAction({ ...lead, status }, { onOpen: open })
  fireEvent.click(screen.getByRole('button', { name: label }))
  expect(open).toHaveBeenCalledWith(dialog)
  expect(sendRecruitmentInvitation).not.toHaveBeenCalled()
  await waitFor(() => expect(screen.getByRole('button', { name: label })).toBeTruthy())
})

it.each(['lead_received', 'documents_uploaded', 'contract_sent', 'contract_signed'])('prevents writes from %s while other edits are unsaved', (status) => {
  renderAction({ ...lead, status, review_status: 'ready_for_approval' }, { dirty: true })
  const writes = screen.getAllByRole('button')
  expect(writes.every(button => button.disabled)).toBe(true)
})

it.each(['closed_lost', 'agent_activated', 'legacy_joined'])('has no further journey actions for %s', status => {
  renderAction({ ...lead, status })
  expect(screen.queryByRole('button')).toBeNull()
})
