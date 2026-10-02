// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import RentalApplicationDetailPage from '../RentalApplicationDetailPage.jsx'
import { getRentalApplicationReview } from '../../../services/rentals/rentalApplicationRepository.js'
vi.mock('../../../context/WorkspaceContext', () => ({ useWorkspace: () => ({ workspace: { id: 'org' } }) }))
vi.mock('../../../services/rentals/rentalApplicationRepository.js', () => ({
  getRentalApplicationReview: vi.fn(), getRentalApplicationTenancyConversion: vi.fn().mockResolvedValue(null), listRentalApplicationEvents: vi.fn().mockResolvedValue([]), listRentalApplicationScreeningChecks: vi.fn().mockResolvedValue([]),
}))
afterEach(cleanup)
it('shows an unprepared tenancy honestly and opens Lease from an approved application’s next step', async () => {
  getRentalApplicationReview.mockResolvedValue({ id:'app',status:'approved',version:10,data:{identity:{firstName:'Alex',lastName:'Tenant'},property:{monthlyRent:11000}},documents:[],consents:[] })
  render(<MemoryRouter initialEntries={['/applications/app']}><Routes><Route path="/applications/:applicationId" element={<RentalApplicationDetailPage />} /></Routes></MemoryRouter>)
  await screen.findByRole('heading',{name:'Alex Tenant'})
  expect(screen.getByText('Not prepared')).toBeTruthy()
  expect(screen.queryByText('Lease signed')).toBeNull()
  fireEvent.click(screen.getByRole('button',{name:'Open next step'}))
  await screen.findByRole('button',{name:'Create tenancy draft'})
})
