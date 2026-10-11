// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { loadDocumentTypeSuggestions } from '../../../services/documents/documentTypeSuggestionService.js'
import DocumentRequirementManager from '../DocumentRequirementManager.jsx'
import { executeDocumentRequirementCommand, prepareDocumentRequirementUpload, uploadDocumentRequirementFile } from '../../../services/documents/documentRequirementCommandService.js'
import { readDocumentRequirementContext } from '../../../services/documents/documentRequirementReadService.js'
import { requirementAddContext, requirementRecoveryKey, retainRequirementCommand } from '../../../services/documents/documentRequirementCommandRecovery.js'

vi.mock('../../../services/documents/documentRequirementCommandService.js', () => ({ executeDocumentRequirementCommand: vi.fn(), prepareDocumentRequirementUpload: vi.fn(), uploadDocumentRequirementFile: vi.fn() }))
vi.mock('../../../services/documents/documentTypeSuggestionService.js', async importOriginal => ({ ...(await importOriginal()), loadDocumentTypeSuggestions: vi.fn() }))
const watchers = vi.hoisted(() => ({ refresh: null }))
vi.mock('../../../services/documents/documentRequirementReadService.js', () => ({ readDocumentRequirementContext: vi.fn(), watchDocumentRequirementContext: refresh => { watchers.refresh = refresh; return () => {} } }))
const client = { supabaseUrl: 'https://test.invalid', auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'actor' } } })) } }
const props = { client, contextType: 'seller_lead', contextId: 'lead', party: 'seller' }
const row = { id: 'requirement', custom_label: 'Title deed', context_type: 'transaction', context_id: 'transaction', transaction_id: 'transaction', requested_from_role: 'seller', command_revision: 7, status: 'pending' }
const saved = { saved: true, requirement: row }
const key = requirementRecoveryKey(client, 'actor', 'seller_lead', 'lead')
beforeEach(() => {
  vi.clearAllMocks()
  loadDocumentTypeSuggestions.mockResolvedValue([{ key: 'seller_divorce_decree', display_label: 'Divorce decree', description: 'Divorce papers and court order' }])
  client.auth.getUser.mockResolvedValue({ data: { user: { id: 'actor' } } })
  localStorage.clear()
  readDocumentRequirementContext.mockResolvedValue({ requirements: [row], documents: [] })
  executeDocumentRequirementCommand.mockResolvedValue(saved)
  uploadDocumentRequirementFile.mockResolvedValue(saved)
})
afterEach(cleanup)
async function open() {
  render(<DocumentRequirementManager {...props} />)
  fireEvent.click(screen.getByText('Manage document requirements'))
  await waitFor(() => expect(screen.getByLabelText('New document name').disabled).toBe(false))
}

test('adds a named seller requirement to the handed-over transaction and clears confirmed recovery', async () => {
  await open()
  fireEvent.change(screen.getByLabelText('New document name'), { target: { value: 'SARS correspondence' } })
  fireEvent.click(screen.getByRole('radio', { name: /Create a custom document/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Add requirement' }))
  await screen.findByText(/Document change saved/)
  const command = executeDocumentRequirementCommand.mock.calls[0][1]
  expect(command).toMatchObject({ action: 'add', contextType: 'transaction', contextId: 'transaction', payload: { party: 'seller', label: 'SARS correspondence' } })
  expect(localStorage.getItem(key)).toBeNull()
})

test('retains an unconfirmed command across remount and retries the identical envelope', async () => {
  executeDocumentRequirementCommand.mockRejectedValueOnce({ code: 'document_save_unconfirmed', message: 'Connection interrupted' })
  await open()
  fireEvent.change(screen.getByLabelText('New document name'), { target: { value: 'Divorce papers' } })
  fireEvent.click(screen.getByRole('radio', { name: /Create a custom document/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Add requirement' }))
  await screen.findByText('Connection interrupted')
  const retained = JSON.parse(localStorage.getItem(key))
  cleanup()
  render(<DocumentRequirementManager {...props} />)
  fireEvent.click(screen.getByText('Manage document requirements'))
  const retry = await screen.findByRole('button', { name: 'Retry unfinished change' })
  fireEvent.click(retry)
  await screen.findByText(/Document change saved/)
  expect(executeDocumentRequirementCommand.mock.calls[1][1]).toEqual(retained)
  expect(localStorage.getItem(key)).toBeNull()
})

test('remove uses the selected revision and a stale rejection refreshes without automatic resubmission', async () => {
  executeDocumentRequirementCommand.mockRejectedValueOnce({ code: '40001' })
  await open()
  fireEvent.change(screen.getByLabelText('Existing requirement'), { target: { value: row.id } })
  fireEvent.change(screen.getByLabelText('Reason for removing this requirement'), { target: { value: 'Not relevant to this sale' } })
  fireEvent.click(screen.getByRole('button', { name: 'Remove requirement' }))
  await screen.findByText(/changed while you were working/)
  expect(executeDocumentRequirementCommand.mock.calls[0][1]).toMatchObject({ action: 'remove', requirementId: row.id, expectedRevision: 7, payload: { reason: 'Not relevant to this sale' } })
  expect(executeDocumentRequirementCommand).toHaveBeenCalledTimes(1)
  expect(readDocumentRequirementContext).toHaveBeenCalledTimes(2)
  expect(localStorage.getItem(key)).toBeNull()
})

test('removed requirements expose restore without an upload control', async () => {
  readDocumentRequirementContext.mockResolvedValue({ requirements: [{ ...row, applicability_override: 'removed', status: 'not_applicable' }], documents: [] })
  await open()
  fireEvent.change(screen.getByLabelText('Existing requirement'), { target: { value: row.id } })
  expect(screen.queryByRole('button', { name: 'Upload file' })).toBeNull()
  fireEvent.change(screen.getByLabelText('Reason for restoring this requirement'), { target: { value: 'Needed again' } })
  fireEvent.click(screen.getByRole('button', { name: 'Restore requirement' }))
  await screen.findByText(/Document change saved/)
  expect(executeDocumentRequirementCommand.mock.calls[0][1]).toMatchObject({ action: 'restore', expectedRevision: 7 })
})

test('replacement retains the current evidence identity and selected file', async () => {
  readDocumentRequirementContext.mockResolvedValue({ requirements: [{ ...row, latest_upload_id: 'previous' }], documents: [] })
  const command = { commandId: 'upload', action: 'upload', contextId: 'transaction', payload: {} }
  prepareDocumentRequirementUpload.mockResolvedValue(command)
  await open()
  fireEvent.change(screen.getByLabelText('Existing requirement'), { target: { value: row.id } })
  const file = new File(['content'], 'papers.pdf', { type: 'application/pdf' })
  fireEvent.change(screen.getByLabelText('Replacement file'), { target: { files: [file] } })
  fireEvent.click(screen.getByRole('button', { name: 'Replace file' }))
  await screen.findByText(/Document change saved/)
  expect(prepareDocumentRequirementUpload.mock.calls[0]).toEqual([file, expect.objectContaining({ replacesUploadId: 'previous', expectedRevision: 7, actorId: 'actor' })])
  expect(uploadDocumentRequirementFile).toHaveBeenCalledWith(client, command, file)
})

test('recovery is account scoped and cannot overwrite an unfinished command', () => {
  expect(key).not.toBe(requirementRecoveryKey(client, 'someone-else', 'seller_lead', 'lead'))
  const command = { commandId: 'first', action: 'add', contextId: 'transaction', payload: {} }
  retainRequirementCommand(localStorage, key, command)
  expect(() => retainRequirementCommand(localStorage, key, { ...command, commandId: 'second' })).toThrow(/unfinished/)
  expect(requirementAddContext({ requirements: [row, { transaction_id: 'another' }] }, 'seller_lead', 'lead')).toBeNull()
})

test('a custom requirement can reuse an authoritative person scope without matching names', async () => {
  readDocumentRequirementContext.mockResolvedValue({ requirements: [{ ...row, subject_kind: 'person', subject_id: 'contact' }], documents: [] })
  await open()
  fireEvent.change(screen.getByLabelText('New document name'), { target: { value: 'Divorce papers' } })
  fireEvent.change(screen.getByLabelText('Applies to'), { target: { value: row.id } })
  fireEvent.click(screen.getByRole('radio', { name: /Create a custom document/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Add requirement' }))
  await screen.findByText(/Document change saved/)
  expect(executeDocumentRequirementCommand.mock.calls[0][1].payload).toEqual({ label: 'Divorce papers', party: 'seller', subjectKind: 'person', subjectId: 'contact' })
})

test('switching contexts discards form selection and loads the new context recovery', async () => {
  const view = render(<DocumentRequirementManager {...props} />)
  fireEvent.click(screen.getByText('Manage document requirements'))
  await waitFor(() => expect(screen.getByLabelText('New document name').disabled).toBe(false))
  fireEvent.change(screen.getByLabelText('New document name'), { target: { value: 'Previous lead' } })
  view.rerender(<DocumentRequirementManager {...props} contextId="other-lead" />)
  fireEvent.click(screen.getByText('Manage document requirements'))
  await waitFor(() => expect(screen.getByLabelText('New document name').disabled).toBe(false))
  expect(screen.getByLabelText('New document name').value).toBe('')
})

test('unavailable recovery storage blocks the write before the network call', async () => {
  await open()
  const storage = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Storage unavailable') })
  try {
    fireEvent.change(screen.getByLabelText('New document name'), { target: { value: 'Additional papers' } })
    fireEvent.click(screen.getByRole('radio', { name: /Create a custom document/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Add requirement' }))
    await screen.findByText('Storage unavailable')
    expect(executeDocumentRequirementCommand).not.toHaveBeenCalled()
  } finally { storage.mockRestore() }
})

test('an account switch removes the old account recovery details from the open view', async () => {
  let authChanged
  client.auth.onAuthStateChange = callback => { authChanged = callback; return { data: { subscription: { unsubscribe() {} } } } }
  retainRequirementCommand(localStorage, key, { commandId: 'unfinished', action: 'add', contextId: 'transaction', payload: { label: 'Sensitive papers' } })
  try {
    render(<DocumentRequirementManager {...props} />)
    fireEvent.click(screen.getByText('Manage document requirements'))
    await screen.findByText('Add: Sensitive papers')
    client.auth.getUser.mockResolvedValue({ data: { user: { id: 'other-account' } } })
    readDocumentRequirementContext.mockResolvedValue({ requirements: [], documents: [] })
    act(() => authChanged('SIGNED_IN', { user: { id: 'other-account' } }))
    await waitFor(() => expect(screen.getByLabelText('New document name').disabled).toBe(false))
    expect(screen.queryByText('Add: Sensitive papers')).toBeNull()
    expect(localStorage.getItem(key)).not.toBeNull()
    expect(executeDocumentRequirementCommand).not.toHaveBeenCalled()
  } finally { delete client.auth.onAuthStateChange }
})

test('a shared context version change refreshes the surrounding transaction document view', async () => {
  const onChange = vi.fn()
  readDocumentRequirementContext.mockResolvedValue({ requirements: [row], documents: [], version: 1 })
  render(<DocumentRequirementManager {...props} onChange={onChange} />)
  fireEvent.click(screen.getByText('Manage document requirements'))
  await waitFor(() => expect(screen.getByLabelText('New document name').disabled).toBe(false))
  readDocumentRequirementContext.mockResolvedValue({ requirements: [{ ...row, applicability_override: 'removed', status: 'not_applicable' }], documents: [], version: 2 })
  await act(async () => { await watchers.refresh() })
  expect(onChange).toHaveBeenCalledTimes(1)
  expect(screen.getByRole('option', { name: /Title deed.*Removed/ })).toBeTruthy()
})


test('typing suggests catalogue types and an explicit selection sends the definition without a custom label', async () => {
  await open()
  fireEvent.change(screen.getByLabelText('New document name'), { target: { value: 'divorce' } })
  expect(screen.getByRole('button', { name: 'Add requirement' }).disabled).toBe(true)
  fireEvent.click(await screen.findByRole('radio', { name: /Divorce decree/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Add requirement' }))
  await screen.findByText(/Document change saved/)
  expect(executeDocumentRequirementCommand.mock.calls[0][1].payload).toEqual({ party: 'seller', definitionKey: 'seller_divorce_decree' })
})

test('editing the name clears a previous catalogue selection', async () => {
  await open()
  fireEvent.change(screen.getByLabelText('New document name'), { target: { value: 'divorce' } })
  fireEvent.click(await screen.findByRole('radio', { name: /Divorce decree/ }))
  fireEvent.change(screen.getByLabelText('New document name'), { target: { value: 'SARS letter' } })
  expect(screen.getByRole('button', { name: 'Add requirement' }).disabled).toBe(true)
  expect(screen.queryByRole('radio', { name: /Divorce decree/ })).toBeNull()
})

test('catalogue failure explains the limitation and still permits an explicit custom request', async () => {
  loadDocumentTypeSuggestions.mockRejectedValue(new Error('Offline'))
  await open()
  fireEvent.change(screen.getByLabelText('New document name'), { target: { value: 'Court correspondence' } })
  await screen.findByText(/Existing types could not be loaded/)
  fireEvent.click(screen.getByRole('radio', { name: /Create a custom document/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Add requirement' }))
  await screen.findByText(/Document change saved/)
  expect(executeDocumentRequirementCommand.mock.calls[0][1].payload).toEqual({ party: 'seller', label: 'Court correspondence' })
})


test('switching requested party clears the type and ignores late suggestions for the previous party', async () => {
  let resolveSeller
  loadDocumentTypeSuggestions.mockImplementation((_client, party) => party === 'seller'
    ? new Promise(resolve => { resolveSeller = resolve })
    : Promise.resolve([{ key: 'buyer_identity', display_label: 'Buyer identity', description: '' }]))
  render(<DocumentRequirementManager {...props} party={undefined} />)
  fireEvent.click(screen.getByText('Manage document requirements'))
  await waitFor(() => expect(screen.getByLabelText('New document name').disabled).toBe(false))
  fireEvent.change(screen.getByLabelText('New document name'), { target: { value: 'identity' } })
  fireEvent.click(screen.getByRole('radio', { name: /Create a custom document/ }))
  fireEvent.change(screen.getByLabelText('Requested from'), { target: { value: 'buyer' } })
  expect(screen.getByRole('button', { name: 'Add requirement' }).disabled).toBe(true)
  await screen.findByRole('radio', { name: 'Buyer identity' })
  await act(async () => resolveSeller([{ key: 'seller_identity', display_label: 'Seller identity' }]))
  expect(screen.queryByRole('radio', { name: 'Seller identity' })).toBeNull()
  fireEvent.click(screen.getByRole('radio', { name: 'Buyer identity' }))
  fireEvent.click(screen.getByRole('button', { name: 'Add requirement' }))
  await screen.findByText(/Document change saved/)
  expect(executeDocumentRequirementCommand.mock.calls[0][1].payload).toEqual({ party: 'buyer', definitionKey: 'buyer_identity' })
})

test('existing custom request blocks a duplicate and opens its upload without queuing an email', async () => {
  readDocumentRequirementContext.mockResolvedValue({ requirements: [{ ...row, custom_label: 'SARS letter' }], documents: [] })
  await open()
  fireEvent.change(screen.getByLabelText('New document name'), { target: { value: '  SARS   LETTER  ' } })
  fireEvent.click(screen.getByRole('radio', { name: /Create a custom document/ }))
  expect(screen.getByRole('button', { name: 'Add requirement' }).disabled).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: 'Upload to this request' }))
  expect(screen.getByLabelText('Existing requirement').value).toBe(row.id)
  expect(screen.getByLabelText('Upload file')).toBeTruthy()
  expect(executeDocumentRequirementCommand).not.toHaveBeenCalled()
  const upload = { commandId: 'reuse-upload', action: 'upload', requirementId: row.id, contextType: row.context_type, contextId: row.context_id, payload: {} }
  prepareDocumentRequirementUpload.mockResolvedValueOnce(upload)
  const file = new File(['letter'], 'sars.pdf', { type: 'application/pdf' })
  fireEvent.change(screen.getByLabelText('Upload file'), { target: { files: [file] } })
  fireEvent.click(screen.getByRole('button', { name: 'Upload file' }))
  await screen.findByText(/Document change saved/)
  expect(prepareDocumentRequirementUpload).toHaveBeenLastCalledWith(file, expect.objectContaining({ requirementId: row.id, expectedRevision: row.command_revision }))
  expect(uploadDocumentRequirementFile).toHaveBeenLastCalledWith(client, upload, file)
  expect(executeDocumentRequirementCommand).not.toHaveBeenCalled()
})

test('removed catalogue match offers restoration rather than another request', async () => {
  readDocumentRequirementContext.mockResolvedValue({ requirements: [{ ...row, custom_label: null, document_definition_key: 'seller_divorce_decree', applicability_override: 'removed', status: 'not_applicable' }], documents: [] })
  await open()
  fireEvent.change(screen.getByLabelText('New document name'), { target: { value: 'divorce' } })
  fireEvent.click(await screen.findByRole('radio', { name: /Divorce decree/ }))
  expect(screen.getByRole('button', { name: 'Add requirement' }).disabled).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: 'Review and restore request' }))
  expect(screen.getByLabelText('Reason for restoring this requirement')).toBeTruthy()
  expect(screen.queryByLabelText('Upload file')).toBeNull()
  expect(executeDocumentRequirementCommand).not.toHaveBeenCalled()
})

test('duplicate detected at save time refreshes and clears the failed command for reuse', async () => {
  executeDocumentRequirementCommand.mockRejectedValueOnce({ code: 'P0001', message: 'This document is already requested for this subject.' })
  await open()
  readDocumentRequirementContext.mockResolvedValue({ requirements: [{ ...row, custom_label: 'SARS letter' }], documents: [] })
  fireEvent.change(screen.getByLabelText('New document name'), { target: { value: 'SARS letter' } })
  fireEvent.click(screen.getByRole('radio', { name: /Create a custom document/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Add requirement' }))
  await screen.findByText('This document is already requested for this subject.')
  expect(localStorage.getItem(key)).toBeNull()
  expect(screen.getByRole('button', { name: 'Upload to this request' })).toBeTruthy()
  expect(executeDocumentRequirementCommand).toHaveBeenCalledTimes(1)
})
