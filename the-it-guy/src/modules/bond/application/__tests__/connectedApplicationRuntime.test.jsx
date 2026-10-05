// @vitest-environment jsdom
import { act, cleanup, render, renderHook, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import ConnectedBuyerBondApplication from '../workspace/ConnectedBuyerBondApplication.jsx'
import { useBondApplicationDocuments } from '../guided/hooks/useBondApplicationDocuments.js'
import { createEmptyBondApplicationState } from '../bondApplicationState.js'
import { resolveBondApplicationDocumentRequirements } from '../documents/index.js'
const mocks = vi.hoisted(() => ({ props: null, load: vi.fn(), save: vi.fn(), reconcile: vi.fn() }))
vi.mock('../../../../lib/clientPortalApi.js', () => ({ fetchBuyerBondApplicationRuntime: mocks.load, saveBuyerBondApplicationRuntimeDraft: mocks.save, reconcileBuyerBondApplicationRuntimeDocuments: mocks.reconcile, uploadBuyerBondApplicationRuntimeDocument: vi.fn(), submitBuyerBondApplicationRuntime: vi.fn(), refreshBuyerBondApplicationRuntimeSubmission: vi.fn(), cancelBuyerBondApplicationRuntimeSubmission: vi.fn(), fetchBuyerBondWetInkSigning: vi.fn().mockResolvedValue({ version: null, uploads: [] }), prepareBuyerBondWetInkSigning: vi.fn(), cancelBuyerBondWetInkSigning: vi.fn(), uploadBuyerBondWetInkSignedCopy: vi.fn(), renderBuyerBondWetInkSigningPdf: vi.fn(), readBuyerBondWetInkOriginal: vi.fn() }))
vi.mock('../guided/GuidedBondApplication.jsx', () => ({ default: (props) => { mocks.props = props; return <p>Connected editor</p> }, DocumentsChecklistScreen: () => <p>Supporting uploads remain available</p> }))
afterEach(() => { cleanup(); vi.clearAllMocks(); mocks.props = null })
const context = { application: { id: 'app', transactionId: 'transaction', revision: 1, status: 'draft' }, transaction: { id: 'transaction' }, draft: {}, requiredDocuments: [], documents: [] }
it('queues overlapping saves using the committed revision and retains the editor seed on refresh', async () => {
  mocks.load.mockResolvedValue(context)
  let completeFirst
  mocks.save.mockImplementationOnce(() => new Promise(resolve => { completeFirst = resolve })).mockResolvedValueOnce({ revision: 3 })
  render(<ConnectedBuyerBondApplication token="buyer-token" />)
  await screen.findByText('Connected editor')
  const seed = mocks.props.portal
  let first, second
  await act(async () => {
    first = mocks.props.saveClientPortalOnboardingDraft({ formData: { bond_application: { value: 1 } } })
    second = mocks.props.saveClientPortalOnboardingDraft({ formData: { bond_application: { value: 2 } } })
  })
  expect(mocks.save).toHaveBeenCalledTimes(1)
  await act(async () => { completeFirst({ revision: 2 }); await first; await second })
  expect(mocks.save.mock.calls.map(([args]) => args.expectedRevision)).toEqual([1, 2])
  mocks.load.mockResolvedValue({ ...context, application: { ...context.application, revision: 3 }, draft: { value: 2 } })
  await act(async () => { await mocks.props.onRefreshDocuments() })
  expect(mocks.props.portal).toBe(seed)
})
it('shows a submitted receipt instead of editable fields', async () => {
  mocks.load.mockResolvedValue({ ...context, application: { ...context.application, status: 'submitted' } })
  render(<ConnectedBuyerBondApplication accessToken="application-token" />)
  await screen.findByText('Your application has been submitted')
  expect(screen.queryByText('Connected editor')).toBeNull()
  expect(mocks.save).not.toHaveBeenCalled()
  expect(screen.getByText('Supporting uploads remain available')).toBeTruthy()
})
it('saves before uploads and uses refreshed evidence while allowing signing before bank documents', async () => {
  const state = createEmptyBondApplicationState()
  const requirements = resolveBondApplicationDocumentRequirements({ applicationState: state }).activeRequirements
  const saved = vi.fn().mockResolvedValue({})
  const upload = vi.fn().mockImplementation(async () => { expect(saved).toHaveBeenCalled(); return { ok: true } })
  const refresh = vi.fn().mockResolvedValue({ requiredDocuments: [], documents: [] })
  const { result } = renderHook(() => useBondApplicationDocuments({ applicationState: state, saveLatestApplication: saved, onUploadRequiredDocument: upload, onRefreshDocuments: refresh }))
  let response
  await act(async () => { response = await result.current.continueToReview() })
  expect(response.ok).toBe(true)
  expect(response.outstandingDocuments.length).toBeGreaterThan(0)
  await act(async () => { await result.current.uploadDocument(requirements[0], new File(['evidence'], 'proof.pdf')) })
  expect(upload).toHaveBeenCalledTimes(1)
  await waitFor(() => expect(result.current.uploadState[requirements[0].key].status).toBe('uploaded'))
})

it('serializes a receipt refresh before a following save, so a stale refresh cannot rewind revision', async () => {
  mocks.load.mockResolvedValueOnce(context)
  let completeRefresh
  mocks.load.mockImplementationOnce(() => new Promise(resolve => { completeRefresh = resolve }))
  mocks.save.mockResolvedValue({ revision: 3 })
  render(<ConnectedBuyerBondApplication token="buyer-token" />)
  await screen.findByText('Connected editor')
  let refreshed, saved
  await act(async () => {
    refreshed = mocks.props.onRefreshDocuments()
    saved = mocks.props.saveClientPortalOnboardingDraft({ formData: { bond_application: {} } })
  })
  expect(mocks.save).not.toHaveBeenCalled()
  await act(async () => { completeRefresh({ ...context, application: { ...context.application, revision: 2 } }); await refreshed; await saved })
  expect(mocks.save.mock.calls[0][0].expectedRevision).toBe(2)
})
it('keeps supporting uploads visible when a status refresh fails', async () => {
  mocks.load.mockResolvedValueOnce({ ...context, application: { ...context.application, status: 'submitted' } }).mockRejectedValueOnce(new Error('Connection interrupted'))
  render(<ConnectedBuyerBondApplication token="buyer-token" />)
  const button = await screen.findByText('Refresh status')
  await act(async () => { button.click() })
  expect((await screen.findByRole('alert')).textContent).toContain('Connection interrupted')
  expect(screen.getByText('Supporting uploads remain available')).toBeTruthy()
})

it('clears the previous application immediately when the secure link changes', async () => {
  mocks.load.mockResolvedValueOnce({ ...context, application: { ...context.application, status: 'submitted' } }).mockImplementationOnce(() => new Promise(() => {}))
  const { rerender } = render(<ConnectedBuyerBondApplication token="first-link" />)
  await screen.findByText('Your application has been submitted')
  rerender(<ConnectedBuyerBondApplication token="second-link" />)
  expect(screen.queryByText('Your application has been submitted')).toBeNull()
  expect(screen.getByText('Loading your application…')).toBeTruthy()
})
