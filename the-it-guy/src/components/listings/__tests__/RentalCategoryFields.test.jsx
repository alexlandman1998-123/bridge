// @vitest-environment jsdom
import { useState } from 'react'
import { afterEach, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import RentalCategoryFields from '../RentalCategoryFields'
import { RENTAL_LISTING_INITIAL_FORM } from '../../../services/rentals/rentalListingDraftModel.js'
import { rentalFeatureCaptureFields, rentalFeatureGroup, restoreRentalFeatureSelections } from '../../../services/rentals/rentalFeatureCaptureModel.js'
import { captureRentalPortalFacts } from '../../../services/rentals/rentalPortalFieldContract.js'
afterEach(cleanup)
function Host() {
  const [form, setForm] = useState({ ...RENTAL_LISTING_INITIAL_FORM })
  return <RentalCategoryFields form={form} onChange={(key, value) => setForm((current) => ({ ...current, [key]: value }))} />
}
it('captures Yes, No and clearing in a security dialog and retains answers when reopened', () => {
  render(<Host />)
  fireEvent.click(screen.getByRole('button', { name: 'Open Security' }))
  const question = within(screen.getByRole('group', { name: 'Alarm' }))
  expect(question.queryByRole('combobox')).toBeNull()
  fireEvent.click(question.getByRole('button', { name: 'Yes' }))
  expect(question.getByRole('button', { name: 'Yes' }).getAttribute('aria-pressed')).toBe('true')
  fireEvent.click(question.getByRole('button', { name: 'No' }))
  fireEvent.keyDown(document, { key: 'Escape' })
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(screen.getByRole('button', { name: 'Open Security' }).textContent).toContain('1 of')
  fireEvent.click(screen.getByRole('button', { name: 'Open Security' }))
  const reopened = within(screen.getByRole('group', { name: 'Alarm' }))
  expect(reopened.getByRole('button', { name: 'No' }).getAttribute('aria-pressed')).toBe('true')
  fireEvent.click(reopened.getByRole('button', { name: 'Clear' }))
  expect(reopened.getByText('Not answered')).toBeTruthy()
})
it('gives pet permission its own card and maps Yes, No and subject to approval from one policy', () => {
  render(<Host />)
  fireEvent.click(screen.getByRole('button', { name: 'Open Pet friendly' }))
  expect(screen.getByRole('dialog', { name: 'Pet friendly' })).toBeTruthy()
  expect(screen.getByText('Subject to approval')).toBeTruthy()
  for (const [policy, expected] of [['allowed', true], ['not_allowed', false], ['subject_to_approval', null]]) {
    expect(captureRentalPortalFacts({ ...RENTAL_LISTING_INITIAL_FORM, petsPolicy: policy, rentalPortalFacts: { 'feature.pet_friendly': true } })['feature.pet_friendly']).toBe(expected)
  }
})
it('consolidates groups, excludes duplicate editable count/presence questions and retains legacy selections without resurrecting No', () => {
  const fields = rentalFeatureCaptureFields(RENTAL_LISTING_INITIAL_FORM)
  expect(new Set(fields.map((field) => field.key)).size).toBe(fields.length)
  expect(new Set(fields.map((field) => field.label)).size).toBe(fields.length)
  expect(fields.some((field) => ['feature.study', 'feature.kitchen', 'propertyFeatures.parking.carport'].includes(field.key))).toBe(false)
  expect(fields.some((field) => field.formKey === 'bedrooms')).toBe(false)
  expect(new Set(fields.map(rentalFeatureGroup)).has('Rooms and facilities')).toBe(false)
  const migrated = restoreRentalFeatureSelections({ ...RENTAL_LISTING_INITIAL_FORM, selectedFeatures: ['Open-plan living', 'Alarm'], rentalPortalFacts: { 'feature.alarm': false } })
  expect(migrated.rentalPortalFacts['feature.open_plan_living']).toBe(true)
  expect(migrated.rentalPortalFacts['feature.alarm']).toBe(false)
  expect(captureRentalPortalFacts({ ...RENTAL_LISTING_INITIAL_FORM, rentalPortalFacts: { 'feature.study': true, 'commercialInfo.availabilityDate': '2027-03-02' } })).toMatchObject({ 'feature.study': null, 'commercialInfo.availabilityDate': null })
  expect(captureRentalPortalFacts({ ...RENTAL_LISTING_INITIAL_FORM, kitchens: '0', studies: '2', carports: '0' })).toMatchObject({ 'feature.kitchen': false, 'feature.study': true, 'propertyFeatures.parking.carport': false })
})
