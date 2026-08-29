import { lazy } from 'react'

// App imports only these lazy entry points, so Sales does not eagerly load rental pages.
export const RentalApplicationsPage = lazy(() => import('../../../pages/rentals/RentalApplicationsPage'))
export const RentalListingCreatePage = lazy(() => import('../../../pages/rentals/RentalListingCreatePage'))
export const RentalListingDetailPage = lazy(() => import('../../../pages/rentals/RentalListingDetailPage'))
export const RentalListingsPage = lazy(() => import('../../../pages/rentals/RentalListingsPage'))
export const RentalTenanciesPage = lazy(() => import('../../../pages/rentals/RentalTenanciesPage'))
