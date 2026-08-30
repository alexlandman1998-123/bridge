import { lazy } from 'react'

// App imports only these lazy entry points, so Sales does not eagerly load rental pages.
export const RentalApplicationsPage = lazy(() => import('../../../pages/rentals/RentalApplicationsPage'))
export const RentalListingCreatePage = lazy(() => import('../../../pages/rentals/RentalListingCreatePage'))
export const RentalListingDetailPage = lazy(() => import('../../../pages/rentals/RentalListingDetailPage'))
export const RentalListingsPage = lazy(() => import('../../../pages/rentals/RentalListingsPage'))
export const RentalPropertiesPage = lazy(() => import('../../../pages/rentals/RentalPropertiesPage'))
export const RentalPropertyDetailPage = lazy(() => import('../../../pages/rentals/RentalPropertyDetailPage'))
export const RentalPortfoliosPage = lazy(() => import('../../../pages/rentals/RentalPortfoliosPage'))
export const RentalPortfolioDetailPage = lazy(() => import('../../../pages/rentals/RentalPortfolioDetailPage'))
export const RentalTenanciesPage = lazy(() => import('../../../pages/rentals/RentalTenanciesPage'))
export const RentalVacanciesPage = lazy(() => import('../../../pages/rentals/RentalVacanciesPage'))
export const RentalVacancyCreatePage = lazy(() => import('../../../pages/rentals/RentalVacancyCreatePage'))
export const RentalVacancyDetailPage = lazy(() => import('../../../pages/rentals/RentalVacancyDetailPage'))
export const RentalOperationsDashboardPage = lazy(() => import('../../../pages/rentals/RentalOperationsDashboardPage'))
export const RentalCollectionsPage = lazy(() => import('../../../pages/rentals/RentalCollectionsPage'))
export const RentalFinancialImportsPage = lazy(() => import('../../../pages/rentals/RentalFinancialImportsPage'))
