// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import SellerDocumentReviewActions from '../SellerDocumentReviewActions.jsx'
afterEach(cleanup)
it('reviews the exact current shared file from the row showing awaiting review', () => {
  const review = vi.fn()
  const document = { id: 'shared-file', canonical_requirement_instance_id: 'slot', is_current_evidence: true, status: 'under_review' }
  const item = { id: 'slot', key: 'rates_account', sharedRequirement: true, canonicalRequirementInstanceId: 'slot', status: 'under_review', linkedDocument: document }
  const view = render(<SellerDocumentReviewActions item={item} onReview={review} />)
  fireEvent.click(screen.getByRole('button', { name: 'Approve', exact: true }))
  expect(review).toHaveBeenCalledWith(expect.objectContaining({ item, document, action: 'approve' }))
  view.rerender(<SellerDocumentReviewActions item={{ ...item, linkedDocument: { ...document, is_current_evidence: false } }} onReview={review} />)
  expect(screen.queryByRole('button', { name: 'Approve', exact: true })).toBeNull()
})
it('an inferred display match cannot approve an unlinked file', () => {
  const review = vi.fn()
  render(<SellerDocumentReviewActions item={{ id:'inferred-requirement',key:'id_document',status:'uploaded',linkedDocument:{id:'file',status:'uploaded'} }} onReview={review} />)
  expect(screen.queryByRole('button', { name:'Approve' })).toBeNull()
  expect(screen.getByRole('status').textContent).toMatch(/exact checklist link/)
  expect(review).not.toHaveBeenCalled()
})
it('a persisted link allows review using the original file record', () => {
  const review = vi.fn()
  const document = {id:'file',requirement_id:'requirement',status:'uploaded'}
  render(<SellerDocumentReviewActions item={{ id:'requirement',key:'id_document',status:'uploaded',linkedDocument:document }} onReview={review} />)
  fireEvent.click(screen.getByRole('button', { name:'Start review' }))
  expect(review).toHaveBeenCalledWith(expect.objectContaining({ document,action:'start_review' }))
})

it('signed requests expose row review and checked acceptance', () => {
  const review=vi.fn(), signingRequest={id:'signed-request',status:'signed',version_digest:'sha256:current'}
  render(<SellerDocumentReviewActions item={{key:'signed_fica_declaration'}} signingRequest={signingRequest} onReview={review} requireSignedEvidenceCheck reviewLabel="Review" acceptLabel="Accept" compact />)
  fireEvent.click(screen.getByRole('button',{name:'Review',exact:true}))
  expect(review).toHaveBeenCalledWith(expect.objectContaining({action:'start_review',signingRequest}))
  fireEvent.click(screen.getByRole('button',{name:'Accept',exact:true}))
  expect(screen.getByRole('button',{name:'Accept signed copy'}).disabled).toBe(true)
  fireEvent.click(screen.getByRole('checkbox'))
  fireEvent.click(screen.getByRole('button',{name:'Accept signed copy'}))
  expect(review).toHaveBeenCalledWith(expect.objectContaining({action:'approve',signingRequest}))
})
it('rejection requires a reason and carries the exact signed request', () => {
  const review=vi.fn(),signingRequest={id:'signed-request',status:'signed',version_digest:'sha256:current'}
  render(<SellerDocumentReviewActions item={{key:'signed_fica_declaration'}} signingRequest={signingRequest} onReview={review} reviewLabel="Review" acceptLabel="Accept" compact />)
  fireEvent.click(screen.getByRole('button',{name:'Reject',exact:true}))
  expect(screen.getByRole('button',{name:'Reject and request replacement'}).disabled).toBe(true)
  fireEvent.change(screen.getByLabelText('Why must the seller replace this file?'),{target:{value:'Missing signatory authority.'}})
  fireEvent.click(screen.getByRole('button',{name:'Reject and request replacement'}))
  expect(review).toHaveBeenCalledWith(expect.objectContaining({action:'reject',signingRequest,reason:'Missing signatory authority.'}))
})
it('partial signatures cannot be accepted or rejected as a completed copy', () => {
  render(<SellerDocumentReviewActions item={{key:'signed_fica_declaration'}} signingRequest={{id:'partial',status:'partially_signed'}} onReview={vi.fn()} reviewLabel="Review" acceptLabel="Accept" />)
  expect(screen.queryByRole('button',{name:'Accept'})).toBeNull()
  expect(screen.queryByRole('button',{name:'Reject'})).toBeNull()
})
