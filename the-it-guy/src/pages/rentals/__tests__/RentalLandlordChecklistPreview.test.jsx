// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import RentalLandlordChecklistPreview from '../../../modules/rentals/shared/applications/RentalLandlordChecklistPreview.jsx'
import { listRentalOnboardingRequirements } from '../../../services/rentals/rentalOnboardingRequirementRepository.js'
vi.mock('../../../services/rentals/rentalOnboardingRequirementRepository.js', () => ({ listRentalOnboardingRequirements: vi.fn() }))
afterEach(cleanup)
it('shows saved requirements per property as previews, excluding superseded history', async () => {
  listRentalOnboardingRequirements.mockResolvedValue([{ id: 'r1', active: true, scopeKey: 'property:p1', purpose: 'signed_mandate' }, { id: 'r2', active: true, scopeKey: 'property:p2', purpose: 'right_to_let' }, { id: 'old', active: false, scopeKey: 'identity', purpose: 'trust_founding' }])
  const first = render(<RentalLandlordChecklistPreview leadId="lead" revision="1" portfolio={[{ id: 'p1', title: 'First property' }, { id: 'p2', title: 'Second property' }]} />)
  await screen.findByText('signed mandate')
  expect(listRentalOnboardingRequirements).toHaveBeenCalledWith({ landlordLeadId: 'lead' })
  expect(screen.getByText('First property · Preview')).toBeTruthy()
  expect(screen.getByText('Second property · Preview')).toBeTruthy()
  expect(screen.queryByText('trust founding')).toBeNull()
  listRentalOnboardingRequirements.mockResolvedValue([])
  first.rerender(<RentalLandlordChecklistPreview leadId="lead" revision="2" />)
  await screen.findByText(/resolve the landlord type/)
  expect(screen.queryByText('signed mandate')).toBeNull()
})
it('shows a load failure without displaying a fulfilled or stale preview', async () => {
  listRentalOnboardingRequirements.mockRejectedValue(new Error('Checklist unavailable'))
  render(<RentalLandlordChecklistPreview leadId="other" revision="1" />)
  await screen.findByRole('alert')
  expect(screen.getByText('Checklist unavailable')).toBeTruthy()
  expect(screen.queryByText(/resolve the landlord type/)).toBeNull()
})
