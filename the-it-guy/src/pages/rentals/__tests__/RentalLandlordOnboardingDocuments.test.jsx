// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import Documents from '../../../modules/rentals/shared/applications/RentalLandlordOnboardingDocuments.jsx'
afterEach(cleanup)
const data = {
  profile: { name: 'Owner' },
  portfolio: [
    { id: 'one', title: 'First home' },
    { id: 'two', title: 'Second home' },
  ],
}
const row = {
  id: 'req',
  active: true,
  subjectId: 'property',
  scopeKey: 'property:one',
  purpose: 'property_disclosure',
  generation: 2,
  state: 'received',
  documentId: 'doc',
}
const onboarding = {
  status: 'draft',
  data,
  requirements: [
    row,
    {
      ...row,
      id: 'other',
      scopeKey: 'property:two',
      documentId: null,
      state: 'missing',
    },
  ],
  documents: [
    { id: 'doc', file_name: 'Disclosure.pdf' },
    { id: 'old', file_name: 'Old accepted.pdf', status: 'accepted' },
  ],
}
it('reviews the exact property file and requires an explicit signed disclosure confirmation', () => {
  const review = vi.fn()
  render(<Documents onboarding={onboarding} onReview={review} />)
  expect(screen.getAllByText('Not uploaded')).toHaveLength(1)
  expect(screen.queryByText(/Old accepted/)).toBeNull()
  fireEvent.change(
    screen.getByLabelText(
      'First home: Completed and signed prescribed disclosure review note',
    ),
    { target: { value: 'Signed prescribed form checked' } },
  )
  expect(screen.getByRole('button', { name: 'Accept evidence' }).disabled).toBe(
    true,
  )
  fireEvent.click(
    screen.getByLabelText(
      'I checked the prescribed disclosure is completed and signed.',
    ),
  )
  fireEvent.click(screen.getByRole('button', { name: 'Accept evidence' }))
  expect(review).toHaveBeenCalledWith(onboarding.documents[0], {
    status: 'accepted',
    note: 'Signed prescribed form checked',
    completedSigned: true,
  })
})
it('does not show an older accepted document as current after a generation changes', () => {
  render(
    <Documents
      onboarding={{
        ...onboarding,
        requirements: [
          { ...row, generation: 3, documentId: null, state: 'missing' },
        ],
      }}
    />,
  )
  expect(screen.getByText('Not uploaded')).toBeTruthy()
  expect(screen.queryByText(/Disclosure.pdf/)).toBeNull()
})
