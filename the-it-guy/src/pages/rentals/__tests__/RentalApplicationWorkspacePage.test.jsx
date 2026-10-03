// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import RentalApplicationWorkspacePage from '../RentalApplicationWorkspacePage.jsx'
const mocks = vi.hoisted(() => ({ list: vi.fn() }))
vi.mock('../../../context/WorkspaceContext', () => ({ useWorkspace: () => ({ workspace: { id: 'org' } }) }))
vi.mock('../../../services/rentals/rentalApplicationRepository.js', () => ({ listPersistedRentalApplications: mocks.list }))
afterEach(cleanup)
it('shows progress from current required evidence rather than stale application metadata', async () => {
  mocks.list.mockResolvedValue([{ id: 'app', status: 'draft', requirements: [{ id: 'r1', subjectId: 'primary', scopeKey: 'application', purpose: 'identity', active: true, mode: 'active', required: true, state: 'missing' }, { id: 'r2', subjectId: 'primary', scopeKey: 'application', purpose: 'proof_of_income', active: true, mode: 'active', required: true, state: 'received', documentId: 'income' }], data: { identity: { firstName: 'Alex', lastName: 'Tenant' }, documents: ['old-id', 'old-income'], requiredDocuments: ['identity', 'proof_of_income'] }, documents: [
    { id: 'old-id', type: 'identity', status: 'accepted', uploaded_at: '2026-01-01' },
    { id: 'new-id', type: 'identity', status: 'rejected', uploaded_at: '2026-02-01' },
    { id: 'income', type: 'proof_of_income', status: 'uploaded' },
    { id: 'extra', type: 'other', status: 'accepted' },
  ] }])
  render(<MemoryRouter><RentalApplicationWorkspacePage /></MemoryRouter>)
  await screen.findByText('Alex Tenant')
  expect(mocks.list).toHaveBeenCalledWith('org', { includeEvidence: true })
  expect(screen.getByText('1 / 2')).toBeTruthy()
})
