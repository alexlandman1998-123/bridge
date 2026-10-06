// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import SellerDocumentReviewActions from '../SellerDocumentReviewActions.jsx'
afterEach(cleanup)
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
