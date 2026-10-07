// @vitest-environment jsdom
import React from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import DeveloperLeadDocuments from '../DeveloperLeadDocuments.jsx'

const mocks = vi.hoisted(() => ({ read: vi.fn(), save: vi.fn(), live: vi.fn() }))
vi.mock('../../../services/documents/developerLeadDocumentsService.js', () => ({ fetchDeveloperLeadDocuments: mocks.read, uploadDeveloperLeadDocument: mocks.save }))
vi.mock('../../../hooks/useTransactionLiveRefresh.js', () => ({ default: mocks.live }))
const ready = (documents = []) => ({ state: 'ready', transactionId: 'tx-one', requirements: [{ id: 'req-one', title: 'Buyer ID', status: 'pending', canUpload: true }], documents })
const savedFile = { id: 'file-one', name: 'Buyer ID.pdf', url: 'https://storage.example.test/id.pdf', canonical_requirement_instance_id: 'req-one', status: 'uploaded' }
const setup = (id = 'lead-one') => render(<DeveloperLeadDocuments key={id} developerOrgId="org-one" developerLeadId={id} />)
beforeEach(() => { vi.resetAllMocks(); mocks.read.mockResolvedValue(ready()); mocks.save.mockResolvedValue(savedFile); mocks.live.mockReturnValue({ lastErrorMessage: '' }) })
afterEach(cleanup)
function choose() {
  fireEvent.change(screen.getByRole('combobox', { name: 'Document type' }), { target: { value: 'req-one' } })
  fireEvent.change(screen.getByLabelText('Choose buyer document file'), { target: { files: [new File(['buyer evidence'], 'Buyer ID.pdf', { type: 'application/pdf' })] } })
}

it('shows awaiting onboarding without offering an upload', async () => {
  mocks.read.mockResolvedValue({ state: 'awaiting_onboarding', transactionId: '', documents: [], requirements: [] })
  setup(); await act(async () => {})
  expect(screen.getByRole('heading', { name: 'Awaiting onboarding' })).toBeTruthy()
  expect(screen.queryByRole('form', { name: 'Upload buyer document' })).toBeNull()
  expect(mocks.live.mock.calls.at(-1)[0].enabled).toBe(false)
})

it('uploads to the linked transaction and reads the same file after reopening the workspace', async () => {
  const view = setup(); await act(async () => {})
  choose()
  mocks.read.mockResolvedValue({ ...ready([savedFile]), requirements: [{ ...ready().requirements[0], status: 'under_review' }] })
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Upload document' })))
  expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ developerOrgId: 'org-one', developerLeadId: 'lead-one', transactionId: 'tx-one', requirementId: 'req-one', file: expect.any(File) }))
  expect(screen.getByText('Document saved to the linked transaction. Awaiting review.')).toBeTruthy()
  expect(screen.getByRole('link', { name: 'Open Buyer ID.pdf' }).getAttribute('href')).toBe(savedFile.url)
  expect(screen.queryByText('Approved')).toBeNull()
  expect(screen.getByRole('button', { name: 'Upload document' }).disabled).toBe(true)
  view.unmount(); setup(); await act(async () => {})
  expect(screen.getByRole('link', { name: 'Open Buyer ID.pdf' })).toBeTruthy()
})

it('prevents concurrent uploads and leaves the selected file available after a failed save', async () => {
  let reject
  mocks.save.mockImplementationOnce(() => new Promise((_, fail) => { reject = fail }))
  setup(); await act(async () => {}); choose()
  const button = screen.getByRole('button', { name: 'Upload document' })
  act(() => { fireEvent.click(button); fireEvent.click(button) })
  expect(mocks.save).toHaveBeenCalledTimes(1)
  expect(screen.getByRole('button', { name: 'Uploading…' }).disabled).toBe(true)
  await act(async () => reject(new Error('Unable to save document')))
  expect(screen.getByRole('alert').textContent).toContain('Unable to save document')
  expect(screen.getByRole('button', { name: 'Upload document' }).disabled).toBe(false)
  expect(screen.queryByText('Document saved to the linked transaction. Awaiting review.')).toBeNull()
})

it('retains a confirmed saved file if checklist refresh fails and retries only the read', async () => {
  setup(); await act(async () => {}); choose()
  mocks.read.mockRejectedValueOnce(new Error('Network unavailable'))
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Upload document' })))
  expect(screen.getByRole('alert').textContent).toContain('Your document was saved')
  expect(screen.getByRole('link', { name: 'Open Buyer ID.pdf' })).toBeTruthy()
  mocks.read.mockResolvedValue(ready([savedFile]))
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Retry refresh' })))
  expect(screen.queryByRole('alert')).toBeNull()
  expect(mocks.save).toHaveBeenCalledTimes(1)
})

it('refreshes external changes and removes old documents when access is revoked', async () => {
  setup(); await act(async () => {})
  mocks.read.mockResolvedValueOnce(ready([savedFile]))
  await act(async () => { expect(await mocks.live.mock.calls.at(-1)[0].onRefresh()).toBe(true) })
  expect(screen.getByRole('link', { name: 'Open Buyer ID.pdf' })).toBeTruthy()
  mocks.read.mockRejectedValueOnce(Object.assign(new Error('This lead is no longer available'), { code: 'lead_documents_access_denied' }))
  await act(async () => { expect(await mocks.live.mock.calls.at(-1)[0].onRefresh()).toBe(false) })
  expect(screen.queryByRole('link', { name: 'Open Buyer ID.pdf' })).toBeNull()
  expect(screen.queryByRole('form')).toBeNull()
})

it('ignores a late upload response after switching to a different lead', async () => {
  let resolve
  mocks.save.mockImplementationOnce(() => new Promise((finish) => { resolve = finish }))
  const view = setup(); await act(async () => {}); choose()
  act(() => fireEvent.click(screen.getByRole('button', { name: 'Upload document' })))
  mocks.read.mockResolvedValue({ state: 'awaiting_onboarding', transactionId: '', documents: [], requirements: [] })
  view.rerender(<DeveloperLeadDocuments key="lead-two" developerOrgId="org-two" developerLeadId="lead-two" />)
  await act(async () => resolve(savedFile))
  expect(screen.getByRole('heading', { name: 'Awaiting onboarding' })).toBeTruthy()
  expect(screen.queryByRole('link', { name: 'Open Buyer ID.pdf' })).toBeNull()
  expect(screen.queryByText('Document saved to the linked transaction. Awaiting review.')).toBeNull()
})

it('never opens an unsafe document URL and keeps protected leads out of upload controls', async () => {
  mocks.read.mockResolvedValueOnce(ready([{ ...savedFile, url: 'javascript:alert(1)' }]))
  const view = setup(); await act(async () => {})
  expect(screen.queryByRole('link')).toBeNull()
  expect(screen.getByText('Preview unavailable')).toBeTruthy()
  view.unmount()
  mocks.read.mockResolvedValue({ state: 'protected', transactionId: '', documents: [], requirements: [] })
  setup(); await act(async () => {})
  expect(screen.getByRole('heading', { name: 'Awaiting agency handover' })).toBeTruthy()
  expect(screen.queryByRole('form')).toBeNull()
})
