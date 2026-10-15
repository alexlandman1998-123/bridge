// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import RentalDocumentUploadControl from '../RentalDocumentUploadControl.jsx'
import { createDocumentUploadProgress } from '../../../lib/documentUploadLifecycle.js'
afterEach(cleanup)
it('shows the Sales stages, blocks repeated selection and retries the retained files', async () => {
  let fail
  const onUpload = vi.fn(async (files, report) => {
    report(createDocumentUploadProgress('uploading', '', { fileName: files[0].name }))
    await new Promise((_resolve, reject) => { fail = reject })
  })
  render(<RentalDocumentUploadControl title="Identity" onUpload={onUpload} />)
  const file = new File(['PDF'], 'Identity.pdf', { type: 'application/pdf' })
  const input = screen.getByLabelText('Upload Identity')
  fireEvent.change(input, { target: { files: [file] } })
  fireEvent.change(input, { target: { files: [file] } })
  expect(onUpload).toHaveBeenCalledTimes(1)
  expect(input.disabled).toBe(true)
  expect(screen.getByRole('progressbar').getAttribute('aria-valuetext')).toContain('secure storage')
  await act(async () => { fail(new Error('Connection lost. Retry this file.')) })
  expect(screen.getByRole('alert').textContent).toContain('Upload needs attention')
  onUpload.mockImplementation(async (files, report) => { report(createDocumentUploadProgress('complete', '', { fileName: files[0].name })); return true })
  fireEvent.click(screen.getByRole('button', { name: 'Retry upload' }))
  await screen.findByText('Uploaded · Identity.pdf')
  expect(onUpload.mock.calls[1][0][0]).toBe(file)
  expect(screen.queryByRole('progressbar')).toBeNull()
})
it('keeps a confirmed upload visible when a later checklist refresh fails', async () => {
  render(<RentalDocumentUploadControl title="Identity" onUpload={async (_files, report) => { report(createDocumentUploadProgress('complete', '', { fileName: 'Saved.pdf' })); return false }} />)
  fireEvent.change(screen.getByLabelText('Upload Identity'), { target: { files: [new File(['PDF'], 'Saved.pdf', { type: 'application/pdf' })] } })
  await screen.findByRole('button', { name: 'Retry upload' })
  expect(screen.getByText('Uploaded · Saved.pdf')).toBeTruthy()
  expect(screen.queryByRole('alert')).toBeNull()
})
