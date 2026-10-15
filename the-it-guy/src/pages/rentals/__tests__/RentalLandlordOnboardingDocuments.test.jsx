// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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
  fireEvent.click(screen.getByRole('button', { name: 'Review', exact: true }))
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

it('uses sales-style category tabs while retaining the exact landlord/property requests and separating supporting evidence from the mandate gate', () => {
  render(<Documents onboarding={{
    ...onboarding,
    requirements: [
      { ...row, id: 'payout', purpose: 'payout_account', mode: 'preview', documentId: null, state: 'missing' },
      { ...row, mode: 'preview' },
      { ...row, id: 'inactive', active: false, scopeKey: 'property:two', purpose: 'scheme_rules' },
      { ...row, id: 'identity', scopeKey: 'identity', subjectId: 'primary', purpose: 'identity', documentId: null, mode: 'active', required: true },
    ],
  }} />)
  expect(screen.getByTestId('landlord-document-workspace')).toBeTruthy()
  expect(screen.getByRole('tablist', { name: 'Landlord document types' })).toBeTruthy()
  expect(screen.getByText('0 of 2 complete')).toBeTruthy()
  expect(screen.getByText(/1 file saved/)).toBeTruthy()
  expect(screen.getByText('Required')).toBeTruthy()
  fireEvent.click(screen.getByRole('tab', { name: /Rental/ }))
  const rental = screen.getByRole('tabpanel')
  expect(within(rental).getByText('Before mandate acceptance')).toBeTruthy()
  expect(within(rental).getByText('Awaiting review')).toBeTruthy()
  expect(within(rental).getByText('First home')).toBeTruthy()
  fireEvent.click(screen.getByRole('tab', { name: /Property Documents/ }))
  expect(screen.getByText('Suggested supporting document')).toBeTruthy()
  expect(screen.getByText('Rental proceeds account confirmation')).toBeTruthy()
  expect(screen.queryByText('Scheme rules and letting permissions')).toBeNull()
})

it('keeps the exact current file actions and disables uploads while submitted', async () => {
  const onOpen = vi.fn()
  const onUpload = vi.fn()
  const { rerender } = render(<Documents onboarding={onboarding} onOpen={onOpen} onUpload={onUpload} />)
  fireEvent.click(screen.getByRole('button', { name: 'Actions for First home: Completed and signed prescribed disclosure' }))
  fireEvent.click(screen.getByRole('button', { name: 'Open Disclosure.pdf' }))
  expect(onOpen).toHaveBeenCalledWith(onboarding.documents[0])
  fireEvent.click(screen.getByRole('button', { name: 'Upload / Request document' }))
  fireEvent.change(screen.getByLabelText('Document requirement'), { target: { value: 'req' } })
  const file = new File(['PDF'], 'Replacement.pdf', { type: 'application/pdf' })
  fireEvent.change(screen.getByLabelText('Upload First home: Completed and signed prescribed disclosure'), { target: { files: [file] } })
  expect(onUpload).toHaveBeenCalledWith(file, row, expect.any(Function))
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  rerender(<Documents onboarding={{ ...onboarding, status: 'submitted' }} onUpload={onUpload} />)
  fireEvent.click(screen.getByRole('button', { name: 'Upload / Request document' }))
  expect(screen.getByLabelText('Upload First home: Completed and signed prescribed disclosure').disabled).toBe(true)
})

it('does not present an expired accepted file as accepted', () => {
  render(<Documents onboarding={{ ...onboarding, requirements: [{ ...row, state: 'accepted', expiresAt: '2020-01-01' }] }} />)
  expect(screen.getByText('Expired')).toBeTruthy()
  expect(screen.queryByText('Accepted')).toBeNull()
})

it('keeps a failed review open and cannot review a changed requirement generation', async () => {
  const onReview = vi.fn().mockResolvedValue(false)
  const { rerender } = render(<Documents onboarding={onboarding} onReview={onReview} />)
  fireEvent.click(screen.getByRole('button', { name: 'Accept', exact: true }))
  fireEvent.change(screen.getByLabelText('First home: Completed and signed prescribed disclosure review note'), { target: { value: 'Checked signed copy' } })
  fireEvent.click(screen.getByLabelText('I checked the prescribed disclosure is completed and signed.'))
  fireEvent.click(screen.getByRole('button', { name: 'Accept evidence' }))
  await waitFor(() => expect(onReview).toHaveBeenCalledOnce())
  expect(screen.getByRole('dialog', { name: 'Accept document' })).toBeTruthy()
  rerender(<Documents onboarding={{ ...onboarding, requirements: [{ ...row, generation: 3, documentId: null }] }} onReview={onReview} />)
  expect(screen.getByText(/This requirement changed/)).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'Accept evidence' })).toBeNull()
  expect(onReview).toHaveBeenCalledTimes(1)
})
