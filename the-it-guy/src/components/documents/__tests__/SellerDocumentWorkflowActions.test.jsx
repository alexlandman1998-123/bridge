// @vitest-environment jsdom
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, fireEvent } from '@testing-library/react'
import SellerDocumentWorkflowActions from '../SellerDocumentWorkflowActions.jsx'
import SellerDisclosurePreparation from '../SellerDisclosurePreparation.jsx'
import { PROPERTY_DISCLOSURE_QUESTIONS } from '../../../lib/propertyDisclosure.js'

afterEach(cleanup)

describe('seller document actions', () => {
  it('offers generate, signature send and signed upload for an untouched disclosure draft', () => {
    render(<SellerDocumentWorkflowActions item={{ key: 'signed_disclosure_form', label: 'Disclosure', canUpload: true, uploaded: true, linkedDocument: { artifactStage: 'review_draft', isGeneratedDraft: true, generatedHtml: '<article>Draft</article>' } }} />)
    expect(screen.getByRole('status').textContent).not.toMatch(/Uploaded/)
    expect(screen.getByRole('button', { name: 'Generate and download' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Generate and send for signature' })).toBeTruthy()
    expect(screen.getByLabelText('Upload manually Disclosure')).toBeTruthy()
  })
  it('offers all three actions before preparation and passes the selected file', () => {
    const onDownload = vi.fn(), onSend = vi.fn(), onUpload = vi.fn()
    render(<SellerDocumentWorkflowActions item={{ label: 'Mandate' }} onDownload={onDownload} onSend={onSend} onUpload={onUpload} />)
    fireEvent.click(screen.getByRole('button', { name: 'Generate and download' }))
    fireEvent.click(screen.getByRole('button', { name: 'Generate and send for signature' }))
    fireEvent.change(screen.getByLabelText('Upload manually Mandate'), { target: { files: [new File(['signed'], 'mandate.pdf')] } })
    expect(onDownload).toHaveBeenCalledOnce(); expect(onSend).toHaveBeenCalledOnce(); expect(onUpload).toHaveBeenCalledOnce()
  })
  it('keeps a failed send visible and allows a retry of the reviewed copy', () => {
    const onSend = vi.fn()
    render(<SellerDocumentWorkflowActions item={{ label: 'FICA' }} copy={{}} request={{ status: 'revoked', revoke_reason: 'delivery_failed' }} onSend={onSend} />)
    expect(screen.getByRole('status').textContent).toMatch(/failed/)
    fireEvent.click(screen.getByRole('button', { name: 'Retry signature send' }))
    expect(onSend).toHaveBeenCalledOnce()
  })
  it('protects active signatures and requires review after signing', () => {
    const onReview = vi.fn()
    render(<SellerDocumentWorkflowActions item={{ label: 'Disclosure' }} copy={{}} request={{ status: 'signed', signed_count: 2, signer_count: 2 }} onReview={onReview} />)
    expect(screen.queryByLabelText('Upload manually Disclosure')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Generate and send for signature' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Review signed copy' }))
    expect(onReview).toHaveBeenCalledOnce()
  })
})

describe('separate disclosure preparation', () => {
  it('captures answers without collecting seller attestation and honours the disabled state', () => {
    const onChange = vi.fn()
    const { rerender } = render(<SellerDisclosurePreparation disclosure={{}} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'Question 1: Yes' }))
    const captured = onChange.mock.calls[0][0]
    expect(captured.responses[PROPERTY_DISCLOSURE_QUESTIONS[0].key].answer).toBe('yes')
    expect(captured.signature).toBeFalsy()
    expect(captured.signedAt).toBeFalsy()
    expect(screen.queryByLabelText(/Signature name/i)).toBeNull()
    rerender(<SellerDisclosurePreparation disclosure={captured} onChange={onChange} disabled />)
    expect(screen.getByRole('button', { name: 'Question 1: No' }).closest('fieldset').disabled).toBe(true)
    expect(onChange).toHaveBeenCalledTimes(1)
  })
})

it('lead file actions omit version references and protect active signed copies', () => {
  const download=vi.fn()
  render(<SellerDocumentWorkflowActions filesOnly item={{label:'FICA'}} copy={{versionId:'long-document-version-id'}} request={{status:'signed',version_id:'long-document-version-id'}} onDownload={download} />)
  fireEvent.click(screen.getByRole('button',{name:'Download',exact:true}))
  expect(download).toHaveBeenCalledOnce()
  expect(screen.getByLabelText('Upload manually FICA').disabled).toBe(true)
  expect(screen.queryByText(/Document version/)).toBeNull()
  expect(screen.queryByText('long-document-version-id')).toBeNull()
  expect(screen.queryByRole('button',{name:/Review|Refresh|send/i})).toBeNull()
})
it('rejected online copies can be replaced without erasing old signatures', () => {
  render(<SellerDocumentWorkflowActions filesOnly item={{label:'FICA'}} copy={{}} request={{status:'revoked',revoke_reason:'agent_review_rejected: Missing authority'}} />)
  expect(screen.getByLabelText('Upload manually FICA').disabled).toBe(false)
})
