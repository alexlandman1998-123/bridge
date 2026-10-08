// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import RentalListingOverview from '../RentalListingOverview.jsx'
import { buildRentalListingOverview } from '../../../services/rentals/rentalListingOverviewModel.js'

afterEach(cleanup)
const detail = { listing: {}, row: {}, channels: [], mediaProgress: [] }
it('shows saved matrix progress despite an unrelated listing-file failure and hides it for failed matrix reads', () => {
  const matrix = { landlords: [], tenants: [{ rows: [{ mode: 'active', required: true, state: 'accepted' }, { mode: 'active', required: true, state: 'missing' }] }], issues: [] }
  const view = render(<RentalListingOverview detail={detail} snapshot={buildRentalListingOverview({ documentMatrix: matrix, issues: ['Documents', 'Document requirements'] })} />)
  expect(screen.getByText('1 of 2 complete')).toBeTruthy()
  expect(screen.getByRole('progressbar', { name: 'Rental document completion' }).getAttribute('aria-valuenow')).toBe('50')
  view.rerender(<RentalListingOverview detail={detail} snapshot={buildRentalListingOverview({ documentMatrix: { ...matrix, issues: ['Landlord unavailable'] } })} />)
  expect(screen.getByText('Document progress could not be loaded.')).toBeTruthy()
  expect(screen.queryByRole('progressbar', { name: 'Rental document completion' })).toBeNull()
})
