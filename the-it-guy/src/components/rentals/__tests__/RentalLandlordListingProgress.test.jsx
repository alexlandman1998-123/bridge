// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import Progress from '../RentalLandlordListingProgress.jsx'
afterEach(cleanup)
it('shows actual listing and vacancy stages per unit without suggesting supplier publication', () => {
  render(<Progress units={[{ id: 'one', unit_label: 'Flat 1' }, { id: 'two', unit_label: 'Flat 2' }]} listings={[{ id: 'listing', rental_unit_id: 'one', rental_vacancy_id: 'vacancy', listing_status: 'seller_lead', listing_visibility: 'internal' }]} vacancies={[{ id: 'vacancy', unit_id: 'one', status: 'draft' }, { id: 'foreign', unit_id: 'foreign', status: 'applications_open' }]} />)
  const one = screen.getByRole('heading', { name: 'Flat 1' }).closest('article')
  expect(within(one).getByText('Vacancy: Draft')).toBeTruthy()
  const two = screen.getByRole('heading', { name: 'Flat 2' }).closest('article')
  expect(within(two).getByText('Vacancy: Not linked')).toBeTruthy()
  expect(screen.queryByText(/Applications open/)).toBeNull()
  expect(screen.queryByText(/Published/)).toBeNull()
})
it('keeps missing inventory explicit', () => {
  render(<Progress />)
  expect(screen.getByText('No managed units are linked to this property yet.')).toBeTruthy()
})
