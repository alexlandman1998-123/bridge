// @vitest-environment jsdom
import { fireEvent, render, screen, cleanup } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import BuyerSignedOtpDocuments from '../BuyerSignedOtpDocuments'
afterEach(cleanup)
it('offers upload without a misleading view action when there is no saved file', () => {
  const onUpload = vi.fn()
  render(<BuyerSignedOtpDocuments onUpload={onUpload} onOpen={vi.fn()} />)
  fireEvent.click(screen.getByRole('button', { name: 'Upload signed OTP' }))
  expect(onUpload).toHaveBeenCalledOnce()
  expect(screen.queryByRole('button', { name: 'View signed OTP' })).toBeNull()
})
it('opens the saved document and prevents a second upload while busy', () => {
  const document = { id: 'otp-1', fileName: 'Signed QA OTP.pdf', storagePath: 'buyer/otp.pdf' }
  const onOpen = vi.fn()
  render(<BuyerSignedOtpDocuments documents={[document]} busy onUpload={vi.fn()} onOpen={onOpen} />)
  fireEvent.click(screen.getByRole('button', { name: 'View signed OTP' }))
  expect(onOpen).toHaveBeenCalledWith(document)
  expect(screen.getByRole('button', { name: 'Uploading OTP…' }).disabled).toBe(true)
})
