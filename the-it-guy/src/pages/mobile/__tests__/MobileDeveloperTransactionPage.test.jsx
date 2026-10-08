// @vitest-environment jsdom
import React from 'react'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import MobileDeveloperTransactionPage from '../MobileDeveloperTransactionPage.jsx'
import { buildDeveloperJourneySnapshot } from '../../../core/transactions/highLevelJourneyAdapter.js'
import { projectSharedMatterJourneyRead } from '../../../services/sharedMatterJourneyReader.js'

const mocks = vi.hoisted(() => ({ workspace: null, organisation: null, read: vi.fn(), documents: vi.fn(), live: vi.fn() }))
vi.mock('../../../context/WorkspaceContext', () => ({ useWorkspace: () => mocks.workspace }))
vi.mock('../../../context/OrganisationContext', () => ({ useOptionalOrganisation: () => mocks.organisation }))
vi.mock('../../../services/mobileDashboardService.js', () => ({ getMobileDeveloperTransactionJourneyAsync: mocks.read, getMobileDeveloperTransactionDocumentsAsync: mocks.documents }))
vi.mock('../../../hooks/useTransactionLiveRefresh.js', () => ({ default: mocks.live }))
vi.mock('../../../components/transaction/MatterConversation', () => ({ default: () => null }))

function savedDetail(id = 'tx-one') {
  const transaction = { id, finance_type: 'Cash' }
  const keys = ['lodgement_ready', 'lodged_at_deeds_office', 'registered']
  const snapshot = projectSharedMatterJourneyRead({ schemaVersion: 1, transactionId: id, revision: 2, planRevision: 2,
    lanes: [{ key: 'transfer', phases: [{ key: 'registration', label: 'Registration', clientLabel: 'Registration', tasks: keys.map((key, index) => ({ key, label: key, clientLabel: key, status: index === 0 ? 'completed' : 'not_started', revision: 2 })) }] }],
  }, { audience: 'developer' })
  return { item: { id, propertyTitle: 'Junoah Estate', title: 'Junoah Estate · Unit 001', unitLabel: 'Unit 001', stage: 'Transfer', location: '99 Leith Road', eyebrow: 'Carmel Reitz', valueRaw: 2190000, developmentId: 'dev-one', nextAction: 'Post-registration closeout' },
    financeType: 'Cash', updatedAt: '2026-10-06', journeyAvailable: true,
    journey: buildDeveloperJourneySnapshot({ transaction, financeType: 'cash', plan: { status: 'active', lanes: [{ laneKey: 'transfer', stepKeys: keys }] }, rollup: { transactionId: id, usedLegacyFallback: false,
      workflows: { sales_otp: { requiredSteps: [{ key: 'signed_otp_received', status: 'completed' }] }, finance_cash: { requiredSteps: [{ key: 'proof_of_funds_reviewed', status: 'completed' }, { key: 'cash_confirmation_approved', status: 'completed' }] } },
      transactionJourneySnapshot: { legalJourney: { status: 'ready', snapshot } },
    } }), documentsAvailable: true, documentSummary: { totalRequired: 2, uploadedCount: 1, missingCount: 1 },
    requiredDocuments: [{ key: 'otp', label: 'Signed OTP', status: 'under_review' }, { key: 'funds', label: 'Proof of funds', status: 'missing' }],
    documents: [{ id: 'file-one', name: 'Signed OTP.pdf', url: 'https://storage.example.test/otp.pdf' }],
  }
}

function bondDetail(status = 'completed', id = 'tx-one', instructionStatus = status) {
  const detail = savedDetail(id)
  const snapshot = projectSharedMatterJourneyRead({ schemaVersion: 1, transactionId: id, revision: 94, planRevision: 94,
    commercialFacts: { version: 1, revision: 94, financeType: 'bond', steps: [
      { workflowKey: 'sales_otp', key: 'signed_otp_received', status: 'completed' },
      { workflowKey: 'finance_bond', key: 'quote_approved', status },
      { workflowKey: 'finance_bond', key: 'instruction_sent', status: instructionStatus },
    ] },
    lanes: [{ key: 'transfer', phases: [{ key: 'instruction', label: 'Instruction', clientLabel: 'Instruction',
      tasks: [{ key: 'instruction_received', label: 'Instruction received', clientLabel: 'Instruction received', status: 'completed_externally', revision: 94 }] }] }],
  }, { audience: 'developer' })
  return { ...detail, financeType: 'Bond', journey: buildDeveloperJourneySnapshot({ transaction: { id, finance_type: 'bond' },
    rollup: { transactionId: id, transactionJourneySnapshot: { legalJourney: { status: 'ready', snapshot } } },
  }) }
}

function liveOptions() { return mocks.live.mock.calls.at(-1)[0] }

beforeEach(() => {
  vi.resetAllMocks()
  mocks.workspace = { role: 'developer', currentWorkspace: { id: 'org-one' } }
  mocks.organisation = { organisation: { id: 'org-one' }, loading: false }
  mocks.read.mockResolvedValue(savedDetail())
  mocks.documents.mockResolvedValue(savedDetail())
  mocks.live.mockReturnValue({ lastErrorMessage: '' })
})
afterEach(cleanup)
function MoveTransaction() {
  const navigate = useNavigate()
  return <button onClick={() => navigate('/mobile/transaction/tx-two')}>Another transaction</button>
}
function WorkspaceRoutes() {
  return <MemoryRouter initialEntries={['/mobile/transaction/tx-one']}><MoveTransaction /><Routes>
    <Route path="/mobile/transaction/:workspaceId" element={<MobileDeveloperTransactionPage />} />
    <Route path="/mobile/transactions" element={<p>Transaction list</p>} />
    <Route path="/mobile/development/:id" element={<p>Development workspace</p>} />
    <Route path="/mobile/home" element={<p>Mobile home</p>} />
  </Routes></MemoryRouter>
}
function setup() { return render(<WorkspaceRoutes />) }

it('opens an intentional workspace with canonical vertical progress and expandable saved legal tasks', async () => {
  const { container } = setup()
  await act(async () => {})
  expect(screen.getByRole('heading', { name: 'Junoah Estate', level: 1 })).toBeTruthy()
  expect(screen.queryByText('Saved transaction details')).toBeNull()
  expect(container.querySelector('.mobile-property-deal-card')).toBeNull()
  expect(screen.getByRole('tab', { name: 'Journey' }).getAttribute('aria-selected')).toBe('true')
  expect(container.querySelector('[data-developer-overview-journey]').getAttribute('data-orientation')).toBe('vertical')
  expect(container.querySelectorAll('[data-milestone]').length).toBe(5)
  expect(container.querySelector('[data-milestone="registration"]').getAttribute('data-milestone-status')).toBe('pending')
  expect(container.querySelector('[data-milestone="transfer"]').getAttribute('aria-current')).toBe('step')
  fireEvent.click(screen.getByText('Registration', { selector: 'summary' }))
  expect(screen.getByText('registered', { selector: 'li > span:first-child' })).toBeTruthy()
  expect(mocks.read).toHaveBeenCalledWith({ workspace: mocks.workspace, organisation: mocks.organisation.organisation, transactionId: 'tx-one' })
  expect(mocks.live.mock.calls[0][0].enabled).toBe(false)
  expect(liveOptions()).toMatchObject({ enabled: true, transactionId: 'tx-one', scopeKey: 'org-one', refreshOnMount: false })
})

it('keeps Journey and Deal details accessible with Documents hidden, and opens the development', async () => {
  setup()
  await act(async () => {})
  const journeyTab = screen.getByRole('tab', { name: 'Journey' })
  fireEvent.keyDown(journeyTab, { key: 'ArrowRight' })
  expect(screen.getByRole('tab', { name: 'Deal details' })).toBe(document.activeElement)
  const details = screen.getByRole('tabpanel', { name: 'Deal details' })
  expect(within(details).getByText('Carmel Reitz')).toBeTruthy()
  expect(within(details).getByText('Cash')).toBeTruthy()
  expect(screen.getAllByRole('tab').map(tab => tab.textContent)).toEqual(['Journey', 'Deal details'])
  expect(screen.queryByRole('tab', { name: 'Documents' })).toBeNull()
  expect(screen.queryByRole('tabpanel', { name: 'Documents' })).toBeNull()
  expect(mocks.documents).not.toHaveBeenCalled()
  fireEvent.keyDown(screen.getByRole('tab', { name: 'Deal details' }), { key: 'ArrowRight' })
  expect(journeyTab).toBe(document.activeElement)
  fireEvent.keyDown(journeyTab, { key: 'End' })
  expect(screen.getByRole('tab', { name: 'Deal details' })).toBe(document.activeElement)
  fireEvent.click(screen.getByRole('button', { name: 'Open development' }))
  expect(screen.getByText('Development workspace')).toBeTruthy()
  expect(mocks.read).toHaveBeenCalledTimes(1)
})

it('hides the previous transaction during navigation and resets to its new journey', async () => {
  setup()
  await act(async () => {})
  fireEvent.click(screen.getByRole('tab', { name: 'Deal details' }))
  let resolve
  mocks.read.mockImplementationOnce(() => new Promise((done) => { resolve = done }))
  fireEvent.click(screen.getByRole('button', { name: 'Another transaction' }))
  expect(screen.queryByRole('heading', { name: 'Junoah Estate' })).toBeNull()
  expect(screen.getByLabelText('Loading transaction')).toBeTruthy()
  await act(async () => resolve({ ...savedDetail('tx-two'), item: { ...savedDetail('tx-two').item, propertyTitle: 'Oak Court' } }))
  expect(screen.getByRole('heading', { name: 'Oak Court' })).toBeTruthy()
  expect(screen.getByRole('tab', { name: 'Journey' }).getAttribute('aria-selected')).toBe('true')
})

it('keeps an unavailable transaction out of the workspace and returns to the list', async () => {
  mocks.read.mockResolvedValue(null)
  setup()
  await act(async () => {})
  expect(screen.getByRole('heading', { name: 'Transaction not found.' })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'All transactions' }))
  expect(screen.getByText('Transaction list')).toBeTruthy()
})

it('shows unknown progress as unavailable and recovers the journey on refresh', async () => {
  const detail = savedDetail()
  mocks.read.mockResolvedValueOnce({ ...detail, journeyAvailable: false, journey: buildDeveloperJourneySnapshot({ transaction: { id: 'tx-one' } }) })
  const { container } = setup()
  await act(async () => {})
  expect(screen.getAllByText('Not available')).toHaveLength(5)
  expect(container.querySelector('[data-complete="true"]')).toBeNull()
  expect(screen.getByText(/Progress could not be loaded/)).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Refresh workspace' }))
  await act(async () => {})
  expect(screen.queryByText(/Progress could not be loaded/)).toBeNull()
  expect(container.querySelector('[data-milestone="otp_signed"]').getAttribute('data-milestone-status')).toBe('complete')
})

it('does not read a developer transaction from an agent workspace', async () => {
  mocks.workspace = { role: 'agent' }
  setup()
  await act(async () => {})
  expect(screen.getByText('Mobile home')).toBeTruthy()
  expect(mocks.read).not.toHaveBeenCalled()
  expect(liveOptions().enabled).toBe(false)
})

it('shows saved backfilled bond outcomes as complete before a legal plan has been confirmed', async () => {
  mocks.read.mockResolvedValue(bondDetail())
  const { container } = setup()
  await act(async () => {})
  const finance = container.querySelector('[data-milestone="finance"]')
  expect(finance.getAttribute('data-milestone-status')).toBe('complete')
  expect(within(finance).getByText('Completed')).toBeTruthy()
  expect(screen.getByText(/Milestones need a confirmed workflow plan/)).toBeTruthy()
})

it('refreshes completed and reopened finance outcomes in the background without resetting the selected tab', async () => {
  mocks.read.mockResolvedValueOnce(bondDetail('not_started'))
  const { container } = setup()
  await act(async () => {})
  const finance = () => container.querySelector('[data-milestone="finance"]').getAttribute('data-milestone-status')
  expect(finance()).toBe('pending')
  fireEvent.click(screen.getByRole('tab', { name: 'Deal details' }))
  await act(async () => {})
  let resolve
  mocks.read.mockImplementationOnce(() => new Promise((done) => { resolve = done }))
  let refresh
  act(() => { refresh = liveOptions().onRefresh() })
  expect(screen.queryByLabelText('Loading transaction')).toBeNull()
  expect(screen.getByRole('tab', { name: 'Deal details' }).getAttribute('aria-selected')).toBe('true')
  await act(async () => { resolve(bondDetail()); expect(await refresh).toBe(true) })
  expect(finance()).toBe('complete')
  expect(screen.getByRole('tab', { name: 'Deal details' }).getAttribute('aria-selected')).toBe('true')
  mocks.read.mockResolvedValueOnce(bondDetail('not_started'))
  await act(async () => { expect(await liveOptions().onRefresh()).toBe(true) })
  expect(finance()).toBe('pending')
})

it('keeps the last completed progress after a failed background read and recovers on the next update', async () => {
  mocks.read.mockResolvedValueOnce(bondDetail())
  const { container } = setup()
  await act(async () => {})
  mocks.read.mockResolvedValueOnce({ ...bondDetail(), journeyAvailable: false })
  await act(async () => { expect(await liveOptions().onRefresh()).toBe(false) })
  expect(container.querySelector('[data-milestone="finance"]').getAttribute('data-milestone-status')).toBe('complete')
  mocks.read.mockRejectedValueOnce(new Error('Network unavailable'))
  await act(async () => { expect(await liveOptions().onRefresh()).toBe(false) })
  expect(container.querySelector('[data-milestone="finance"]').getAttribute('data-milestone-status')).toBe('complete')
  mocks.read.mockResolvedValueOnce(bondDetail('not_started'))
  await act(async () => { expect(await liveOptions().onRefresh()).toBe(true) })
  expect(container.querySelector('[data-milestone="finance"]').getAttribute('data-milestone-status')).toBe('pending')
})

it('ignores a late background update for the previous transaction after navigation', async () => {
  setup()
  await act(async () => {})
  let resolve
  mocks.read.mockImplementationOnce(() => new Promise((done) => { resolve = done }))
  let refresh
  act(() => { refresh = liveOptions().onRefresh() })
  mocks.read.mockResolvedValueOnce({ ...bondDetail('not_started', 'tx-two'), item: { ...bondDetail('not_started', 'tx-two').item, propertyTitle: 'Oak Court' } })
  fireEvent.click(screen.getByRole('button', { name: 'Another transaction' }))
  await act(async () => {})
  expect(screen.getByRole('heading', { name: 'Oak Court' })).toBeTruthy()
  expect(liveOptions()).toMatchObject({ enabled: true, transactionId: 'tx-two' })
  await act(async () => { resolve(bondDetail()); expect(await refresh).toBe(false) })
  expect(screen.getByRole('heading', { name: 'Oak Court' })).toBeTruthy()
  expect(screen.queryByRole('heading', { name: 'Junoah Estate' })).toBeNull()
})

it('does not retain a previous organisation snapshot when its background read finishes late', async () => {
  const view = setup()
  await act(async () => {})
  let resolve
  mocks.read.mockImplementationOnce(() => new Promise((done) => { resolve = done }))
  let refresh
  act(() => { refresh = liveOptions().onRefresh() })
  mocks.workspace = { role: 'developer', currentWorkspace: { id: 'org-two' } }
  mocks.organisation = { organisation: { id: 'org-two' }, loading: false }
  mocks.read.mockResolvedValueOnce(null)
  view.rerender(<WorkspaceRoutes />)
  expect(screen.queryByRole('heading', { name: 'Junoah Estate' })).toBeNull()
  await act(async () => {})
  expect(screen.getByRole('heading', { name: 'Transaction not found.' })).toBeTruthy()
  await act(async () => { resolve(bondDetail()); expect(await refresh).toBe(false) })
  expect(screen.queryByRole('heading', { name: 'Junoah Estate' })).toBeNull()
  expect(liveOptions().enabled).toBe(false)
})

it('removes the workspace if a fresh read says the transaction is no longer available', async () => {
  setup()
  await act(async () => {})
  mocks.read.mockResolvedValueOnce(null)
  await act(async () => { expect(await liveOptions().onRefresh()).toBe(true) })
  expect(screen.getByRole('heading', { name: 'Transaction not found.' })).toBeTruthy()
  expect(liveOptions().enabled).toBe(false)
})

it('keeps an approved bond awaiting instruction in Finance despite transfer preparation', async () => {
  mocks.read.mockResolvedValue({ ...bondDetail('complete', 'tx-one', 'pending'),
    item: { ...savedDetail().item, unitLabel: 'Unit 004', stage: 'Finance', nextAction: 'Await bank instruction' } })
  const { container } = setup()
  await act(async () => {})
  const finance = container.querySelector('[data-milestone="finance"]')
  expect(finance.getAttribute('data-milestone-status')).toBe('in_progress')
  expect(finance.getAttribute('aria-current')).toBe('step')
  expect(container.querySelector('[data-milestone="transfer"]').hasAttribute('aria-current')).toBe(false)
  expect(within(container.querySelector('[data-milestone="transfer"]')).getByText('Pending')).toBeTruthy()
  expect(screen.getByText('Await bank instruction')).toBeTruthy()
  expect(container.querySelectorAll('[aria-current="step"]').length).toBe(1)
})
