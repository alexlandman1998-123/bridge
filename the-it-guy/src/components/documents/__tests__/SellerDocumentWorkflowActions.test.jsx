// @vitest-environment jsdom
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, fireEvent } from '@testing-library/react'
import SellerDocumentWorkflowActions from '../SellerDocumentWorkflowActions.jsx'

afterEach(cleanup)

describe('seller document actions', () => {
  it('offers all three actions before preparation and passes the selected file', () => {
    const onDownload = vi.fn(), onSend = vi.fn(), onUpload = vi.fn()
    render(<SellerDocumentWorkflowActions item={{ label: 'Mandate' }} onDownload={onDownload} onSend={onSend} onUpload={onUpload} />)
    fireEvent.click(screen.getByRole('button', { name: 'Generate and download' }))
    fireEvent.click(screen.getByRole('button', { name: 'Generate and send for online signature' }))
    fireEvent.change(screen.getByLabelText('Upload existing Mandate'), { target: { files: [new File(['signed'], 'mandate.pdf')] } })
    expect(onDownload).toHaveBeenCalledOnce(); expect(onSend).toHaveBeenCalledOnce(); expect(onUpload).toHaveBeenCalledOnce()
  })
  it('keeps a failed send visible and allows a retry of the reviewed copy', () => {
    const onSend = vi.fn()
    render(<SellerDocumentWorkflowActions item={{ label: 'FICA' }} copy={{}} request={{ status: 'revoked', revoke_reason: 'delivery_failed' }} onSend={onSend} />)
    expect(screen.getByRole('status').textContent).toMatch(/failed/)
    fireEvent.click(screen.getByRole('button', { name: 'Retry online signature send' }))
    expect(onSend).toHaveBeenCalledOnce()
  })
  it('protects active signatures and requires review after signing', () => {
    const onReview = vi.fn()
    render(<SellerDocumentWorkflowActions item={{ label: 'Disclosure' }} copy={{}} request={{ status: 'signed', signed_count: 2, signer_count: 2 }} onReview={onReview} />)
    expect(screen.queryByLabelText('Upload existing Disclosure')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Generate and send for online signature' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Review signed copy' }))
    expect(onReview).toHaveBeenCalledOnce()
  })
})
