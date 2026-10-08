// @vitest-environment jsdom
import React from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import DocumentAccessButton from '../DocumentAccessButton.jsx'

const mocks = vi.hoisted(() => ({ sign: vi.fn() }))
vi.mock('../../../lib/transactionWorkspaceApi.js', () => ({ createTransactionDocumentSignedUrl: mocks.sign }))
const document = { id: 'one', name: 'Proof.pdf', file_path: 'tenant/proof.pdf', file_bucket: 'documents', url: 'https://storage/expired' }
let tab
beforeEach(() => {
  vi.resetAllMocks()
  tab = { opener: 'parent', location: { replace: vi.fn() }, close: vi.fn() }
  vi.spyOn(window, 'open').mockReturnValue(tab)
  mocks.sign.mockResolvedValue('https://storage/fresh')
})
afterEach(() => { cleanup(); vi.restoreAllMocks() })
const click = async () => act(async () => fireEvent.click(screen.getByRole('button', { name: 'Download proof' })))
const setup = (value = document) => render(<DocumentAccessButton document={value} download aria-label="Download proof">Download</DocumentAccessButton>)

it('refreshes the link on every click and never opens the expired cached URL', async () => {
  setup(); await click(); await click()
  expect(mocks.sign).toHaveBeenCalledTimes(2)
  expect(mocks.sign).toHaveBeenCalledWith({ filePath: document.file_path, fileBucket: 'documents', filename: 'Proof.pdf', download: true })
  expect(tab.location.replace).toHaveBeenCalledWith('https://storage/fresh')
  expect(tab.opener).toBeNull()
})

it('retains the document and allows retry after an access or network failure', async () => {
  mocks.sign.mockRejectedValueOnce(new Error('Access denied'))
  setup(); await click()
  expect(screen.getByRole('alert').textContent).toBe('Access denied')
  expect(tab.close).toHaveBeenCalledOnce()
  expect(tab.location.replace).not.toHaveBeenCalled()
  await click()
  expect(screen.queryByRole('alert')).toBeNull()
  expect(tab.location.replace).toHaveBeenCalledOnce()
})

it('opens the replacement object after reopening instead of using a previous URL', async () => {
  const view = setup(); await click(); view.unmount()
  setup({ ...document, id: 'two', file_path: 'tenant/replacement.pdf' }); await click()
  expect(mocks.sign.mock.calls[1][0].filePath).toBe('tenant/replacement.pdf')
})

it('suppresses duplicate clicks and closes a late result after replacement', async () => {
  let resolve
  mocks.sign.mockImplementation(() => new Promise((done) => { resolve = done }))
  const view = setup()
  act(() => { fireEvent.click(screen.getByRole('button')); fireEvent.click(screen.getByRole('button')) })
  expect(mocks.sign).toHaveBeenCalledOnce()
  view.rerender(<DocumentAccessButton document={{ ...document, file_path: 'tenant/new.pdf' }} />)
  await act(async () => resolve('https://storage/old'))
  expect(tab.close).toHaveBeenCalledOnce()
  expect(tab.location.replace).not.toHaveBeenCalled()
  expect(screen.getByRole('button').disabled).toBe(false)
})

it('does not navigate after unmounting during signing', async () => {
  let resolve
  mocks.sign.mockImplementation(() => new Promise((done) => { resolve = done }))
  const view = setup(); act(() => fireEvent.click(screen.getByRole('button'))); view.unmount()
  await act(async () => resolve('https://storage/old'))
  expect(tab.close).toHaveBeenCalledOnce()
  expect(tab.location.replace).not.toHaveBeenCalled()
})

it('allows the new document to open while an old request is stalled', async () => {
  let resolve
  mocks.sign.mockImplementationOnce(() => new Promise((done) => { resolve = done }))
  const view = setup(); act(() => fireEvent.click(screen.getByRole('button')))
  const oldTab = tab
  tab = { opener: 'parent', location: { replace: vi.fn() }, close: vi.fn() }
  window.open.mockReturnValue(tab)
  view.rerender(<DocumentAccessButton document={{ ...document, file_path: 'tenant/new.pdf' }} />)
  await act(async () => fireEvent.click(screen.getByRole('button')))
  expect(mocks.sign).toHaveBeenCalledTimes(2)
  expect(tab.location.replace).toHaveBeenCalledWith('https://storage/fresh')
  await act(async () => resolve('https://storage/old'))
  expect(oldTab.close).toHaveBeenCalledOnce()
  expect(oldTab.location.replace).not.toHaveBeenCalled()
})

it('reports blocked popups without making an unnecessary signing request', async () => {
  window.open.mockReturnValue(null)
  setup(); await click()
  expect(screen.getByRole('alert').textContent).toContain('Allow a new tab')
  expect(mocks.sign).not.toHaveBeenCalled()
})

it('rejects unsafe links and missing durable references', async () => {
  mocks.sign.mockResolvedValue('javascript:alert(1)')
  const view = setup(); await click()
  expect(tab.location.replace).not.toHaveBeenCalled()
  expect(screen.getByRole('alert')).toBeTruthy()
  view.rerender(<DocumentAccessButton document={{ url: 'https://storage/expired' }} />)
  expect(screen.queryByRole('button')).toBeNull()
})
