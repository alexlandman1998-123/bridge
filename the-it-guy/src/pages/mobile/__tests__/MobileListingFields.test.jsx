// @vitest-environment jsdom
import React from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { MobileDeveloperListingStock, MobileListingReviewFields, MobileListingSellerFields } from '../MobileListingFields.jsx'
import MobileListingProgress from '../MobileListingProgress.jsx'
afterEach(cleanup)
it('developer stock selection includes development, unit, sales assignment and scoped visibility', () => {
  const update = vi.fn(), onSelectUnit = vi.fn()
  render(<MobileDeveloperListingStock form={{ developmentId: 'dev-one', unitId: '', assignedAgentId: 'sales-one', visibility: 'agent' }} update={update} developments={[{ id: 'dev-one', name: 'Oak Court' }]} units={[{ id: 'unit-one', unit_number: '001' }]} agents={[{ userId: 'sales-one', fullName: 'Sales user' }]} branches={[]} onSelectUnit={onSelectUnit} canAssign canAssignAcross />)
  fireEvent.change(screen.getByLabelText('Unit *'), { target: { value: 'unit-one' } })
  expect(onSelectUnit).toHaveBeenCalledWith('unit-one')
  fireEvent.change(screen.getByLabelText('Internal visibility'), { target: { value: 'organisation' } })
  expect(update).toHaveBeenCalledWith('visibility', 'organisation')
  expect(screen.getByLabelText('Assigned sales user')).toBeTruthy()
})
it('seller choices use canonical values and retain decimals and document file selections', () => {
  const update = vi.fn()
  render(<MobileListingSellerFields form={{ sellerType: 'individual', maritalStatus: 'married_anc', commissionType: 'percentage' }} update={update} documentCategories={['FICA']} mandateTypes={[{ value: 'sole', label: 'Exclusive' }]} maritalStatuses={[{ value: '', label: 'Not captured' }, { value: 'married_anc', label: 'Married out of community' }]} complianceMethods={[]} captureSources={[]} />)
  expect(screen.getByLabelText('Marital status').value).toBe('married_anc')
  expect(screen.getByLabelText('Spouse email')).toBeTruthy()
  fireEvent.change(screen.getByLabelText('Commission (%)'), { target: { value: '2.5' } })
  expect(update).toHaveBeenCalledWith('commissionValue', '2.5')
  const file = new File(['sample'], 'fica.pdf', { type: 'application/pdf' })
  fireEvent.change(screen.getByLabelText('Add documents'), { target: { files: [file] } })
  expect(update).toHaveBeenCalledWith('supportingDocumentFiles', [file])
})
it('restored lifecycle statuses remain visible and explicit changes use the existing status handler', () => {
  const onStatusChange = vi.fn()
  render(<MobileListingReviewFields form={{ listingStatus: 'listing_review' }} update={vi.fn()} onStatusChange={onStatusChange} />)
  expect(screen.getByLabelText('Listing status').value).toBe('listing_review')
  fireEvent.change(screen.getByLabelText('Listing status'), { target: { value: 'active' } })
  expect(onStatusChange).toHaveBeenCalledWith('active')
})
it('only visited steps can be revisited before final review', () => {
  const onStepClick = vi.fn()
  render(<MobileListingProgress steps={[{ key: 'seller', label: 'Seller' }, { key: 'property', label: 'Property' }, { key: 'review', label: 'Review' }]} activeIndex={1} maxVisitedStep={1} onStepClick={onStepClick} />)
  expect(screen.getByText('Step 2 of 3')).toBeTruthy()
  expect(screen.getByRole('button', { name: /Review/, hidden: true }).disabled).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: /Seller/, hidden: true }))
  expect(onStepClick).toHaveBeenCalledWith('seller')
})
