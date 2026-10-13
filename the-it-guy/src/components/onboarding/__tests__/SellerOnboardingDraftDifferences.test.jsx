// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
vi.mock('../../../services/listings/sellerOnboardingDraftReviewService.js', () => ({acceptSellerOnboardingDraftAnswer:vi.fn()}))
import { acceptSellerOnboardingDraftAnswer } from '../../../services/listings/sellerOnboardingDraftReviewService.js'
import SellerOnboardingAgentReviewPanel from '../SellerOnboardingAgentReviewPanel.jsx'
import { buildSellerOnboardingReviewChecklist } from '../../../core/documents/sellerOnboardingReview.js'

afterEach(cleanup)
beforeEach(() => vi.clearAllMocks())
const listing = {id:'listing',sellerOnboarding:{id:'onboarding',status:'completed',updatedAt:'2026-10-13T10:00:00Z',
  draftComparison:{differences:[{key:'bedrooms',label:'Bedrooms',draftValue:5,sellerValue:4,status:'pending'}]}}}
const checklist = buildSellerOnboardingReviewChecklist({listing})

it('shows the saved original draft and seller answer, blocks approval, and saves acceptance', async () => {
  const saved = vi.fn()
  acceptSellerOnboardingDraftAnswer.mockResolvedValue({id:'onboarding',draft_comparison_json:{}})
  render(<SellerOnboardingAgentReviewPanel checklist={checklist} listing={listing} onDifferenceSaved={saved} />)
  expect(checklist.ready).toBe(false)
  expect(checklist.missing).toContain('Review the bedrooms difference from the listing draft')
  expect(screen.getByText('Agent’s draft')).toBeTruthy()
  expect(screen.getByText('5')).toBeTruthy()
  expect(screen.getByText('4')).toBeTruthy()
  fireEvent.click(screen.getByRole('button',{name:'Accept seller’s answer for bedrooms'}))
  await waitFor(() => expect(saved).toHaveBeenCalledWith({id:'onboarding',draft_comparison_json:{}}))
  expect(acceptSellerOnboardingDraftAnswer).toHaveBeenCalledWith({listing,key:'bedrooms'})
})

it('requests clarification with both values, without accepting the answer', async () => {
  const request = vi.fn().mockResolvedValue(true)
  render(<SellerOnboardingAgentReviewPanel checklist={checklist} listing={listing} onDifferenceSaved={vi.fn()} onRequestCorrection={request} />)
  fireEvent.click(screen.getByRole('button',{name:'Request clarification for bedrooms'}))
  await waitFor(() => expect(request).toHaveBeenCalledWith('Please confirm bedrooms: the listing draft says 5, and your onboarding says 4.'))
  expect(acceptSellerOnboardingDraftAnswer).not.toHaveBeenCalled()
})

it('keeps a failed or stale acceptance unresolved and exposes the recovery message', async () => {
  const saved = vi.fn()
  const reload = vi.fn().mockResolvedValue(true)
  acceptSellerOnboardingDraftAnswer.mockRejectedValue(new Error('The seller details changed. Reload and review the latest answer before accepting it.'))
  render(<SellerOnboardingAgentReviewPanel checklist={checklist} listing={listing} onDifferenceSaved={saved} onReload={reload} />)
  fireEvent.click(screen.getByRole('button',{name:'Accept seller’s answer for bedrooms'}))
  await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/Reload and review/))
  expect(saved).not.toHaveBeenCalled()
  expect(checklist.draftComparison.pending).toHaveLength(1)
  fireEvent.click(screen.getByRole('button',{name:'Load latest seller details'}))
  await waitFor(() => expect(reload).toHaveBeenCalledTimes(1))
})

it('waits for resubmission and shows accepted answers without repeating controls', () => {
  const waiting = { ...checklist,draftComparison:{...checklist.draftComparison,awaitingResubmission:true} }
  const {rerender} = render(<SellerOnboardingAgentReviewPanel checklist={waiting} listing={listing} onDifferenceSaved={vi.fn()} onRequestCorrection={vi.fn()} />)
  expect(screen.getByRole('button',{name:'Accept seller’s answer for bedrooms'}).disabled).toBe(true)
  expect(screen.getByText(/Waiting for the seller to resubmit/)).toBeTruthy()
  rerender(<SellerOnboardingAgentReviewPanel checklist={{...checklist,draftComparison:{differences:[{...listing.sellerOnboarding.draftComparison.differences[0],status:'accepted'}]}}} listing={listing} />)
  expect(screen.getByText('Seller’s answer accepted')).toBeTruthy()
  expect(screen.queryByRole('button',{name:'Accept seller’s answer for bedrooms'})).toBeNull()
})
