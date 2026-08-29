# Rentals Phase 0 Baseline

Generated: 2026-08-29T17:28:57.701Z

## Decision

`PHASE_0_READY_FOR_DOMAIN_CONTRACT` — this report is read-only. It documents current boundaries and must pass before a Rentals schema or workflow phase begins.

## Guard checks

| Check | Status | Detail |
| --- | --- | --- |
| rental_workspace_guard | PASS | Rental workspace guard is present in App routing. |
| rental_routes_are_scoped | PASS | 6 protected rental routes are registered. |
| rental_feature_flags | PASS | Rental module availability is centrally gated. |
| rental_scope_contract | PASS | Organisation, branch, department and assigned-user scope is modeled. |
| rental_listing_projection_marker | PASS | Rental listing projection remains explicitly marked in shared listings. |
| sales_and_rentals_navigation_are_separate | PASS | Sidebar selects Rentals navigation through the business workspace boundary. |
| baseline_performance_tooling_exists | PASS | Existing performance baseline tooling is available for the next phase. |

## Existing Rental Surfaces

### Routes

- `/agent/rentals/dashboard`
- `/agent/rentals/tenancies`
- `/agent/rentals/pipeline/leads`
- `/agent/rentals/pipeline/applications`
- `/agent/rentals/pipeline/calendar`
- `/agent/rentals/listings`

### Source files

- `the-it-guy/src/pages/rentals/RentalApplicationsPage.jsx`
- `the-it-guy/src/pages/rentals/RentalListingCreatePage.jsx`
- `the-it-guy/src/pages/rentals/RentalListingDetailPage.jsx`
- `the-it-guy/src/pages/rentals/RentalListingsPage.jsx`
- `the-it-guy/src/pages/rentals/RentalTenanciesPage.jsx`
- `the-it-guy/src/services/rentals/rentalApplicationDraftModel.js`
- `the-it-guy/src/services/rentals/rentalApplicationDraftService.js`
- `the-it-guy/src/services/rentals/rentalLeaseWorkflowModel.js`
- `the-it-guy/src/services/rentals/rentalLeaseWorkflowService.js`
- `the-it-guy/src/services/rentals/rentalListingArchitecture.js`
- `the-it-guy/src/services/rentals/rentalListingCreateFlowModel.js`
- `the-it-guy/src/services/rentals/rentalListingDetailModel.js`
- `the-it-guy/src/services/rentals/rentalListingDraftModel.js`
- `the-it-guy/src/services/rentals/rentalListingDraftService.js`
- `the-it-guy/src/services/rentals/rentalListingEditModel.js`
- `the-it-guy/src/services/rentals/rentalListingIndexModel.js`
- `the-it-guy/src/services/rentals/rentalListingOperationalReportModel.js`
- `the-it-guy/src/services/rentals/rentalListingProperty24FieldComparisonModel.js`
- `the-it-guy/src/services/rentals/rentalListingProperty24PublishModel.js`
- `the-it-guy/src/services/rentals/rentalListingProperty24ReadinessModel.js`
- `the-it-guy/src/services/rentals/rentalListingReleaseGateModel.js`
- `the-it-guy/src/services/rentals/rentalModuleAvailability.js`
- `the-it-guy/src/services/rentals/rentalWorkspaceScope.js`

### Existing services

- `the-it-guy/src/services/rentals/rentalApplicationDraftModel.js`
- `the-it-guy/src/services/rentals/rentalApplicationDraftService.js`
- `the-it-guy/src/services/rentals/rentalLeaseWorkflowModel.js`
- `the-it-guy/src/services/rentals/rentalLeaseWorkflowService.js`
- `the-it-guy/src/services/rentals/rentalListingArchitecture.js`
- `the-it-guy/src/services/rentals/rentalListingCreateFlowModel.js`
- `the-it-guy/src/services/rentals/rentalListingDetailModel.js`
- `the-it-guy/src/services/rentals/rentalListingDraftModel.js`
- `the-it-guy/src/services/rentals/rentalListingDraftService.js`
- `the-it-guy/src/services/rentals/rentalListingEditModel.js`
- `the-it-guy/src/services/rentals/rentalListingIndexModel.js`
- `the-it-guy/src/services/rentals/rentalListingOperationalReportModel.js`
- `the-it-guy/src/services/rentals/rentalListingProperty24FieldComparisonModel.js`
- `the-it-guy/src/services/rentals/rentalListingProperty24PublishModel.js`
- `the-it-guy/src/services/rentals/rentalListingProperty24ReadinessModel.js`
- `the-it-guy/src/services/rentals/rentalListingReleaseGateModel.js`
- `the-it-guy/src/services/rentals/rentalModuleAvailability.js`
- `the-it-guy/src/services/rentals/rentalWorkspaceScope.js`

## Shared Infrastructure To Reuse

- Workspace guard and feature flags: `RentalWorkspaceGuard` and `resolveRentalModuleAvailability`.
- Scope contract: `resolveRentalWorkspaceScope`.
- Marketing projection: `private_listings` with `listing_category:rental`.
- Listing media, syndication, documents, activity, contacts/clients, notifications and permissions through adapters.

## Confirmed Gaps

- Durable Portfolio → Property → Unit → Vacancy → Application → Tenancy tables are not present in the app migration inventory.
- Rental navigation currently reuses broad Sales-era permissions.
- Dashboard, rental leads and calendar are placeholders.
- Collections, maintenance, inspections, renewals and portals are not implemented as rental-owned domains.

## Sales Protection Contract

- Do not change Sales route behavior, default queries or status semantics.
- Keep rental listing projection explicitly marked `listing_category:rental`.
- Do not alter shared RLS without both Sales and Rentals policy tests.
- Keep Rentals lazy-loaded and outside the initial Sales bundle.
- Run the following checks before every next phase.

- `npm run test:sales-listing-workspace-phase3`
- `npm run test:rental-listing-workspace-phase4`
- `npm run test:performance-phase0`
- `npm run test:performance-budget`
- `npm run build`

## Database Migration Inventory

Migration files inspected: 736

Rental-specific migration files found: 0

- None found

## Next Phase

Proceed to Phase 1 only after reviewing this baseline and agreeing the canonical domain contract.
