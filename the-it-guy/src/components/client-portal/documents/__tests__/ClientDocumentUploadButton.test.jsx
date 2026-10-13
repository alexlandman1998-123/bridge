// @vitest-environment jsdom
import React from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import ClientDocumentUploadButton from '../ClientDocumentUploadButton.jsx'

afterEach(cleanup)
const file = () => new File(['diagnostic'], 'ID.pdf', { type: 'application/pdf' })
const pick = view => fireEvent.change(view.container.querySelector('input'), { target: { files: [file()] } })

it('shows progress immediately and follows storage/save stages before receipt', async () => {
  let finish, report
  const onUpload = vi.fn((_spec, _file, options) => {
    report = options.onProgress
    return new Promise(resolve => { finish = resolve })
  })
  const view = render(<ClientDocumentUploadButton uploadKey="id" uploadSpec={{ type: 'requirement', requirementKey: 'id' }} onUpload={onUpload} />)
  act(() => pick(view))
  expect(screen.getByRole('progressbar').getAttribute('aria-label')).toBe('Uploading ID.pdf')
  expect(view.container.querySelector('input').disabled).toBe(true)
  act(() => report({ stage: 'saving', message: 'Saving the document securely' }))
  expect(screen.getByRole('progressbar').getAttribute('aria-valuetext')).toBe('Saving the document securely')
  await act(async () => finish({ ok: true, document: { id: 'saved' } }))
  expect(screen.queryByRole('progressbar')).toBeNull()
  expect(screen.getByText('Received and awaiting review by your transaction team.')).toBeTruthy()
})

it('stops progress on failure and allows retry without claiming receipt', async () => {
  const onUpload = vi.fn().mockResolvedValueOnce({ ok: false, error: 'Network unavailable' }).mockResolvedValueOnce({ ok: true })
  const view = render(<ClientDocumentUploadButton uploadKey="id" uploadSpec={{ type: 'requirement', requirementKey: 'id' }} onUpload={onUpload} />)
  await act(async () => pick(view))
  expect(screen.queryByRole('progressbar')).toBeNull()
  expect(screen.getByText('Network unavailable')).toBeTruthy()
  expect(view.container.querySelector('input').disabled).toBe(false)
  await act(async () => pick(view))
  expect(onUpload).toHaveBeenCalledTimes(2)
  expect(screen.getByText('Received and awaiting review by your transaction team.')).toBeTruthy()
})

it('does not leave an indefinite uploading message without a confirmed result', async () => {
  const view = render(<ClientDocumentUploadButton uploadKey="id" uploadSpec={{ type: 'requirement', requirementKey: 'id' }} onUpload={async () => undefined} />)
  await act(async () => pick(view))
  expect(screen.queryByRole('progressbar')).toBeNull()
  expect(screen.getByText(/saved document could not be confirmed/)).toBeTruthy()
  expect(screen.queryByText('Received and awaiting review by your transaction team.')).toBeNull()
})
