// @vitest-environment jsdom
import React from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, test } from 'vitest'
import DocumentUploadProgress from '../DocumentUploadProgress.jsx'
import { createDocumentUploadProgress } from '../../../lib/documentUploadLifecycle.js'

afterEach(cleanup)
test('shows the active step without inventing a transfer percentage, then confirms Uploaded', () => {
  const { rerender } = render(<DocumentUploadProgress progress={createDocumentUploadProgress('uploading', '', { fileName: 'mandate.pdf' })} />)
  expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBeNull()
  expect(screen.getByRole('status').textContent).toContain('Uploading · mandate.pdf')
  rerender(<DocumentUploadProgress progress={createDocumentUploadProgress('saving', '', { fileName: 'mandate.pdf' })} />)
  expect(screen.getByRole('progressbar').getAttribute('aria-valuetext')).toContain('Saving')
  rerender(<DocumentUploadProgress progress={createDocumentUploadProgress('complete', 'Uploaded', { fileName: 'mandate.pdf' })} />)
  expect(screen.queryByRole('progressbar')).toBeNull()
  expect(screen.getByRole('status').textContent).toContain('Uploaded · mandate.pdf')
})
test('a pending sync keeps Uploaded visible, while an unconfirmed save asks for attention', () => {
  const { rerender } = render(<DocumentUploadProgress progress={createDocumentUploadProgress('complete', '', { warnings: ['The linked view is still updating.'] })} />)
  expect(screen.getByRole('status').textContent).toContain('Uploaded')
  expect(screen.getByText('The linked view is still updating.')).toBeTruthy()
  rerender(<DocumentUploadProgress progress={createDocumentUploadProgress('failed', 'The save could not be confirmed. Retry checks the saved file.')} />)
  expect(screen.queryByRole('status')).toBeNull()
  expect(screen.getByRole('alert').textContent).toContain('Upload needs attention')
})
