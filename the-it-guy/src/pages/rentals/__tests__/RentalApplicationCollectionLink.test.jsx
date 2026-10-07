// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import RentalApplicationCollectionLink from '../../../modules/rentals/shared/applications/RentalApplicationCollectionLink.jsx'
import { createPersistedRentalApplicantAccess, revokePersistedRentalApplicantAccess } from '../../../services/rentals/rentalApplicationRepository.js'
vi.mock('../../../context/WorkspaceContext', () => ({ useWorkspace: () => ({ profile: { id: 'agent' }, workspace: { id: 'org' } }) }))
vi.mock('../../../services/rentals/rentalApplicationRepository.js', () => ({ createPersistedRentalApplicantAccess: vi.fn(), revokePersistedRentalApplicantAccess: vi.fn() }))
afterEach(() => { cleanup(); vi.resetAllMocks() })
it('creates, copies and revokes a later document link without reopening submitted answers', async () => {
  const copy = vi.fn().mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: copy } })
  createPersistedRentalApplicantAccess.mockResolvedValue({ id: 'access', token: 'private-token', expiresAt: '2099-01-01' })
  revokePersistedRentalApplicantAccess.mockResolvedValue(undefined)
  render(<RentalApplicationCollectionLink application={{ id: 'application', status: 'submitted' }} />)
  fireEvent.click(screen.getByRole('button', { name: 'Create document upload link' }))
  const field = await screen.findByLabelText('Document upload link')
  expect(field.readOnly).toBe(true)
  expect(createPersistedRentalApplicantAccess).toHaveBeenCalledWith('application', { createdBy: 'agent' })
  fireEvent.click(screen.getByRole('button', { name: 'Copy upload link' }))
  await screen.findByText('Link copied. Share it with the applicant.')
  expect(copy).toHaveBeenCalledWith(field.value)
  fireEvent.click(screen.getByRole('button', { name: 'Revoke this link' }))
  await screen.findByText('This upload link has been revoked.')
  expect(revokePersistedRentalApplicantAccess).toHaveBeenCalledWith('access')
  expect(screen.queryByLabelText('Document upload link')).toBeNull()
})
it('shows a failed link creation and hides collection after a final decision', async () => {
  createPersistedRentalApplicantAccess.mockRejectedValue(new Error('Workspace access denied'))
  const view = render(<RentalApplicationCollectionLink application={{ id: 'application', status: 'under_review' }} />)
  fireEvent.click(screen.getByRole('button', { name: 'Create document upload link' }))
  expect((await screen.findByRole('alert')).textContent).toBe('Workspace access denied')
  view.rerender(<RentalApplicationCollectionLink application={{ id: 'application', status: 'approved' }} />)
  expect(screen.queryByRole('button')).toBeNull()
})
it('creates a link scoped to the selected additional applicant', async () => {
  createPersistedRentalApplicantAccess.mockResolvedValue({ id:'access',token:'private-person-token',expiresAt:'2099-01-01' })
  render(<RentalApplicationCollectionLink application={{ id:'application',status:'submitted',data:{people:[{id:'joint',firstName:'Joint',lastName:'Tenant'}]} }} />)
  fireEvent.change(screen.getByLabelText('Link recipient'),{target:{value:'joint'}})
  fireEvent.click(screen.getByRole('button',{name:'Create document upload link'}))
  await screen.findByLabelText('Document upload link')
  expect(createPersistedRentalApplicantAccess).toHaveBeenCalledWith('application',{createdBy:'agent',subjectId:'joint'})
})
