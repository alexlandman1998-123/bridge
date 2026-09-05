# Rentals Phase 0 — Reconciliation and Scope Lock

Generated: 2026-09-05T10:59:12.389Z

## Decision

`PHASE_0_RECONCILED` — this is a read-only implementation phase. It reconciles the current codebase, locks ownership boundaries, and adds a regression gate. It does not alter production data or business workflow behaviour.

## Guard checks

| Check | Status | Detail |
| --- | --- | --- |
| rental_workspace_guard | PASS | Rental workspace guard is present in App routing. |
| rental_routes_are_scoped | PASS | 10 protected rental routes are registered. |
| rental_feature_flags | PASS | Rental module availability is centrally gated. |
| rental_scope_contract | PASS | Organisation, branch, department and assigned-user scope is modeled. |
| rental_listing_projection_marker | PASS | Rental listing projection remains explicitly marked in shared listings. |
| sales_and_rentals_navigation_are_separate | PASS | Sidebar selects Rentals navigation through the business workspace boundary. |
| baseline_performance_tooling_exists | PASS | Existing performance baseline tooling is available for the next phase. |
| core_rental_sql_inventory | PASS | 9/9 core rental tables are present in the repository SQL inventory. |
| rental_domain_contract | PASS | Canonical Rentals ownership and transition contract is present. |
| rental_lead_and_mandate_foundation | PASS | Rental lead and landlord-mandate foundations are present for the subsequent CRM phase. |

## Current implementation inventory

### Protected rental routes

- `/agent/rentals/dashboard`
- `/agent/rentals/tenancies`
- `/agent/rentals/pipeline/leads`
- `/agent/rentals/pipeline/applications`
- `/agent/rentals/pipeline/calendar`
- `/agent/rentals/listings`
- `/agent/rentals/portfolio`
- `/agent/rentals/vacancies`
- `/agent/rentals/maintenance`
- `/agent/rentals/inspections`

### Rental source files

- `the-it-guy/src/lib/__tests__/rentalOperatingModeNavigation.test.js`
- `the-it-guy/src/modules/rentals/__tests__/rentalModuleBoundary.test.js`
- `the-it-guy/src/modules/rentals/shared/api/rentalModuleApi.js`
- `the-it-guy/src/modules/rentals/shared/applications/RentalApplicationDecisionPanel.jsx`
- `the-it-guy/src/modules/rentals/shared/applications/RentalApplicationScreeningPanel.jsx`
- `the-it-guy/src/modules/rentals/shared/applications/RentalApplicationTenancyConversionPanel.jsx`
- `the-it-guy/src/modules/rentals/shared/events/__tests__/rentalEventOutbox.test.js`
- `the-it-guy/src/modules/rentals/shared/events/rentalEventOutbox.js`
- `the-it-guy/src/modules/rentals/shared/evidence/RentalPropertyEvidencePanel.jsx`
- `the-it-guy/src/modules/rentals/shared/landlords/RentalLandlordMandatePanel.jsx`
- `the-it-guy/src/modules/rentals/shared/observability/__tests__/rentalPerformanceTelemetry.test.js`
- `the-it-guy/src/modules/rentals/shared/observability/rentalPerformanceTelemetry.js`
- `the-it-guy/src/modules/rentals/shared/parties/RentalPartySelector.jsx`
- `the-it-guy/src/modules/rentals/shared/parties/__tests__/rentalPartyRelationships.test.js`
- `the-it-guy/src/modules/rentals/shared/parties/rentalPartyRelationships.js`
- `the-it-guy/src/modules/rentals/shared/permissions/__tests__/rentalCapabilities.test.js`
- `the-it-guy/src/modules/rentals/shared/permissions/rentalCapabilities.js`
- `the-it-guy/src/modules/rentals/shared/units/RentalUnitsPanel.jsx`
- `the-it-guy/src/modules/rentals/shared/vacancies/RentalApplicationInvitePanel.jsx`
- `the-it-guy/src/modules/rentals/shared/vacancies/RentalVacancyMarketingPanel.jsx`
- `the-it-guy/src/modules/rentals/shell/RentalModuleBoundary.jsx`
- `the-it-guy/src/modules/rentals/shell/rentalModuleRegistry.js`
- `the-it-guy/src/modules/rentals/shell/rentalRouteLoaders.js`
- `the-it-guy/src/pages/rentals/RentalApplicantJourneyPage.jsx`
- `the-it-guy/src/pages/rentals/RentalApplicationDetailPage.jsx`
- `the-it-guy/src/pages/rentals/RentalApplicationWorkspacePage.jsx`
- `the-it-guy/src/pages/rentals/RentalApplicationsPage.jsx`
- `the-it-guy/src/pages/rentals/RentalCalendarPage.jsx`
- `the-it-guy/src/pages/rentals/RentalDashboardPage.jsx`
- `the-it-guy/src/pages/rentals/RentalFinancialReconciliationPage.jsx`
- `the-it-guy/src/pages/rentals/RentalInspectionExecutionPage.jsx`
- `the-it-guy/src/pages/rentals/RentalInspectionFollowUpPage.jsx`
- `the-it-guy/src/pages/rentals/RentalInspectionsPage.jsx`
- `the-it-guy/src/pages/rentals/RentalLeadsPage.jsx`
- `the-it-guy/src/pages/rentals/RentalListingCreatePage.jsx`
- `the-it-guy/src/pages/rentals/RentalListingDetailPage.jsx`
- `the-it-guy/src/pages/rentals/RentalListingsPage.jsx`
- `the-it-guy/src/pages/rentals/RentalMaintenanceExecutionPage.jsx`
- `the-it-guy/src/pages/rentals/RentalMaintenancePage.jsx`
- `the-it-guy/src/pages/rentals/RentalMaintenanceQuotesPage.jsx`
- `the-it-guy/src/pages/rentals/RentalManagementPage.jsx`
- `the-it-guy/src/pages/rentals/RentalMoveOutPage.jsx`
- `the-it-guy/src/pages/rentals/RentalNotificationsPage.jsx`
- `the-it-guy/src/pages/rentals/RentalOperationsDashboardPage.jsx`
- `the-it-guy/src/pages/rentals/RentalPilotExecutionPage.jsx`
- `the-it-guy/src/pages/rentals/RentalPilotLaunchPage.jsx`
- `the-it-guy/src/pages/rentals/RentalPilotReadinessPage.jsx`
- `the-it-guy/src/pages/rentals/RentalPilotReviewsPage.jsx`
- `the-it-guy/src/pages/rentals/RentalPortfolioDetailPage.jsx`
- `the-it-guy/src/pages/rentals/RentalPortfoliosPage.jsx`
- `the-it-guy/src/pages/rentals/RentalPropertiesPage.jsx`
- `the-it-guy/src/pages/rentals/RentalPropertyDetailPage.jsx`
- `the-it-guy/src/pages/rentals/RentalRemindersPage.jsx`
- `the-it-guy/src/pages/rentals/RentalReportsPage.jsx`
- `the-it-guy/src/pages/rentals/RentalRolloutControlsPage.jsx`
- `the-it-guy/src/pages/rentals/RentalScreeningPage.jsx`
- `the-it-guy/src/pages/rentals/RentalTenanciesPage.jsx`
- `the-it-guy/src/pages/rentals/RentalTenancyClosurePage.jsx`
- `the-it-guy/src/pages/rentals/RentalTenancyDetailPage.jsx`
- `the-it-guy/src/pages/rentals/RentalVacanciesPage.jsx`
- `the-it-guy/src/pages/rentals/RentalVacancyCreatePage.jsx`
- `the-it-guy/src/pages/rentals/RentalVacancyDetailPage.jsx`
- `the-it-guy/src/pages/rentals/RentalViewingsPage.jsx`
- `the-it-guy/src/pages/rentals/ShortTermRentalCalendarPage.jsx`
- `the-it-guy/src/pages/rentals/ShortTermRentalDashboardPage.jsx`
- `the-it-guy/src/pages/rentals/ShortTermRentalInventoryPage.jsx`
- `the-it-guy/src/services/rentals/__tests__/rentalApplicantAccessModel.test.js`
- `the-it-guy/src/services/rentals/__tests__/rentalApplicationDraftModel.test.js`
- `the-it-guy/src/services/rentals/__tests__/rentalApplicationModel.test.js`
- `the-it-guy/src/services/rentals/__tests__/rentalCalendarModel.test.js`
- `the-it-guy/src/services/rentals/__tests__/rentalDashboardModel.test.js`
- `the-it-guy/src/services/rentals/__tests__/rentalDomainContract.test.js`
- `the-it-guy/src/services/rentals/__tests__/rentalEvidenceModel.test.js`
- `the-it-guy/src/services/rentals/__tests__/rentalLandlordMandateModel.test.js`
- `the-it-guy/src/services/rentals/__tests__/rentalLeadClassificationModel.test.js`
- `the-it-guy/src/services/rentals/__tests__/rentalLeadPipelineModel.test.js`
- `the-it-guy/src/services/rentals/__tests__/rentalLeaseWorkflowModel.test.js`
- `the-it-guy/src/services/rentals/__tests__/rentalManagementModel.test.js`
- `the-it-guy/src/services/rentals/__tests__/rentalOperationsDashboardModel.test.js`
- `the-it-guy/src/services/rentals/__tests__/rentalPortfolioModel.test.js`
- `the-it-guy/src/services/rentals/__tests__/rentalPropertyModel.test.js`
- `the-it-guy/src/services/rentals/__tests__/rentalShortTermBookingModel.test.js`
- `the-it-guy/src/services/rentals/__tests__/rentalShortTermInventoryModel.test.js`
- `the-it-guy/src/services/rentals/__tests__/rentalShortTermOperationsModel.test.js`
- `the-it-guy/src/services/rentals/__tests__/rentalUnitModel.test.js`
- `the-it-guy/src/services/rentals/__tests__/rentalVacancyMarketingModel.test.js`
- `the-it-guy/src/services/rentals/__tests__/rentalVacancyModel.test.js`
- `the-it-guy/src/services/rentals/__tests__/rentalViewingModel.test.js`
- `the-it-guy/src/services/rentals/__tests__/shortTermRentalFoundation.test.js`
- `the-it-guy/src/services/rentals/rentalApplicantAccessModel.js`
- `the-it-guy/src/services/rentals/rentalApplicationDraftModel.js`
- `the-it-guy/src/services/rentals/rentalApplicationDraftService.js`
- `the-it-guy/src/services/rentals/rentalApplicationModel.js`
- `the-it-guy/src/services/rentals/rentalApplicationRepository.js`
- `the-it-guy/src/services/rentals/rentalCalendarModel.js`
- `the-it-guy/src/services/rentals/rentalDashboardModel.js`
- `the-it-guy/src/services/rentals/rentalDomainContract.js`
- `the-it-guy/src/services/rentals/rentalEvidenceModel.js`
- `the-it-guy/src/services/rentals/rentalEvidenceRepository.js`
- `the-it-guy/src/services/rentals/rentalFinancialReconciliationRepository.js`
- `the-it-guy/src/services/rentals/rentalGoldenPathAcceptance.js`
- `the-it-guy/src/services/rentals/rentalInspectionRepository.js`
- `the-it-guy/src/services/rentals/rentalLandlordMandateModel.js`
- `the-it-guy/src/services/rentals/rentalLandlordMandateRepository.js`
- `the-it-guy/src/services/rentals/rentalLeadClassificationModel.js`
- `the-it-guy/src/services/rentals/rentalLeadPipelineModel.js`
- `the-it-guy/src/services/rentals/rentalLeadService.js`
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
- `the-it-guy/src/services/rentals/rentalMaintenanceRepository.js`
- `the-it-guy/src/services/rentals/rentalManagementModel.js`
- `the-it-guy/src/services/rentals/rentalManagementService.js`
- `the-it-guy/src/services/rentals/rentalModuleAvailability.js`
- `the-it-guy/src/services/rentals/rentalMoveOutRepository.js`
- `the-it-guy/src/services/rentals/rentalNotificationRepository.js`
- `the-it-guy/src/services/rentals/rentalOperationsDashboardModel.js`
- `the-it-guy/src/services/rentals/rentalOperationsDashboardRepository.js`
- `the-it-guy/src/services/rentals/rentalPilotExecutionRepository.js`
- `the-it-guy/src/services/rentals/rentalPilotLaunchRepository.js`
- `the-it-guy/src/services/rentals/rentalPilotReadinessRepository.js`
- `the-it-guy/src/services/rentals/rentalPilotReviewRepository.js`
- `the-it-guy/src/services/rentals/rentalPortfolioModel.js`
- `the-it-guy/src/services/rentals/rentalPortfolioRepository.js`
- `the-it-guy/src/services/rentals/rentalProperty24Phase5AcceptanceModel.js`
- `the-it-guy/src/services/rentals/rentalProperty24Phase6CutoverModel.js`
- `the-it-guy/src/services/rentals/rentalProperty24VettingPhase0Model.js`
- `the-it-guy/src/services/rentals/rentalPropertyModel.js`
- `the-it-guy/src/services/rentals/rentalPropertyRepository.js`
- `the-it-guy/src/services/rentals/rentalReminderRepository.js`
- `the-it-guy/src/services/rentals/rentalReportingRepository.js`
- `the-it-guy/src/services/rentals/rentalRlsMatrix.js`
- `the-it-guy/src/services/rentals/rentalRolloutControlRepository.js`
- `the-it-guy/src/services/rentals/rentalScreeningRepository.js`
- `the-it-guy/src/services/rentals/rentalShortTermBookingModel.js`
- `the-it-guy/src/services/rentals/rentalShortTermBookingRepository.js`
- `the-it-guy/src/services/rentals/rentalShortTermInventoryModel.js`
- `the-it-guy/src/services/rentals/rentalShortTermInventoryRepository.js`
- `the-it-guy/src/services/rentals/rentalShortTermOperationsModel.js`
- `the-it-guy/src/services/rentals/rentalShortTermRatePlanRepository.js`
- `the-it-guy/src/services/rentals/rentalShortTermTurnoverRepository.js`
- `the-it-guy/src/services/rentals/rentalTenancyClosureRepository.js`
- `the-it-guy/src/services/rentals/rentalUnitModel.js`
- `the-it-guy/src/services/rentals/rentalUnitRepository.js`
- `the-it-guy/src/services/rentals/rentalVacancyMarketingModel.js`
- `the-it-guy/src/services/rentals/rentalVacancyMarketingRepository.js`
- `the-it-guy/src/services/rentals/rentalVacancyModel.js`
- `the-it-guy/src/services/rentals/rentalVacancyRepository.js`
- `the-it-guy/src/services/rentals/rentalViewingModel.js`
- `the-it-guy/src/services/rentals/rentalViewingService.js`
- `the-it-guy/src/services/rentals/rentalWorkspaceScope.js`
- `the-it-guy/src/services/rentals/shortTermRentalCalendarModel.js`
- `the-it-guy/src/services/rentals/shortTermRentalDashboardModel.js`
- `the-it-guy/src/services/rentals/shortTermRentalFoundation.js`

### Rental services

- `the-it-guy/src/services/rentals/__tests__/rentalApplicantAccessModel.test.js`
- `the-it-guy/src/services/rentals/__tests__/rentalApplicationDraftModel.test.js`
- `the-it-guy/src/services/rentals/__tests__/rentalApplicationModel.test.js`
- `the-it-guy/src/services/rentals/__tests__/rentalCalendarModel.test.js`
- `the-it-guy/src/services/rentals/__tests__/rentalDashboardModel.test.js`
- `the-it-guy/src/services/rentals/__tests__/rentalDomainContract.test.js`
- `the-it-guy/src/services/rentals/__tests__/rentalEvidenceModel.test.js`
- `the-it-guy/src/services/rentals/__tests__/rentalLandlordMandateModel.test.js`
- `the-it-guy/src/services/rentals/__tests__/rentalLeadClassificationModel.test.js`
- `the-it-guy/src/services/rentals/__tests__/rentalLeadPipelineModel.test.js`
- `the-it-guy/src/services/rentals/__tests__/rentalLeaseWorkflowModel.test.js`
- `the-it-guy/src/services/rentals/__tests__/rentalManagementModel.test.js`
- `the-it-guy/src/services/rentals/__tests__/rentalOperationsDashboardModel.test.js`
- `the-it-guy/src/services/rentals/__tests__/rentalPortfolioModel.test.js`
- `the-it-guy/src/services/rentals/__tests__/rentalPropertyModel.test.js`
- `the-it-guy/src/services/rentals/__tests__/rentalShortTermBookingModel.test.js`
- `the-it-guy/src/services/rentals/__tests__/rentalShortTermInventoryModel.test.js`
- `the-it-guy/src/services/rentals/__tests__/rentalShortTermOperationsModel.test.js`
- `the-it-guy/src/services/rentals/__tests__/rentalUnitModel.test.js`
- `the-it-guy/src/services/rentals/__tests__/rentalVacancyMarketingModel.test.js`
- `the-it-guy/src/services/rentals/__tests__/rentalVacancyModel.test.js`
- `the-it-guy/src/services/rentals/__tests__/rentalViewingModel.test.js`
- `the-it-guy/src/services/rentals/__tests__/shortTermRentalFoundation.test.js`
- `the-it-guy/src/services/rentals/rentalApplicantAccessModel.js`
- `the-it-guy/src/services/rentals/rentalApplicationDraftModel.js`
- `the-it-guy/src/services/rentals/rentalApplicationDraftService.js`
- `the-it-guy/src/services/rentals/rentalApplicationModel.js`
- `the-it-guy/src/services/rentals/rentalApplicationRepository.js`
- `the-it-guy/src/services/rentals/rentalCalendarModel.js`
- `the-it-guy/src/services/rentals/rentalDashboardModel.js`
- `the-it-guy/src/services/rentals/rentalDomainContract.js`
- `the-it-guy/src/services/rentals/rentalEvidenceModel.js`
- `the-it-guy/src/services/rentals/rentalEvidenceRepository.js`
- `the-it-guy/src/services/rentals/rentalFinancialReconciliationRepository.js`
- `the-it-guy/src/services/rentals/rentalGoldenPathAcceptance.js`
- `the-it-guy/src/services/rentals/rentalInspectionRepository.js`
- `the-it-guy/src/services/rentals/rentalLandlordMandateModel.js`
- `the-it-guy/src/services/rentals/rentalLandlordMandateRepository.js`
- `the-it-guy/src/services/rentals/rentalLeadClassificationModel.js`
- `the-it-guy/src/services/rentals/rentalLeadPipelineModel.js`
- `the-it-guy/src/services/rentals/rentalLeadService.js`
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
- `the-it-guy/src/services/rentals/rentalMaintenanceRepository.js`
- `the-it-guy/src/services/rentals/rentalManagementModel.js`
- `the-it-guy/src/services/rentals/rentalManagementService.js`
- `the-it-guy/src/services/rentals/rentalModuleAvailability.js`
- `the-it-guy/src/services/rentals/rentalMoveOutRepository.js`
- `the-it-guy/src/services/rentals/rentalNotificationRepository.js`
- `the-it-guy/src/services/rentals/rentalOperationsDashboardModel.js`
- `the-it-guy/src/services/rentals/rentalOperationsDashboardRepository.js`
- `the-it-guy/src/services/rentals/rentalPilotExecutionRepository.js`
- `the-it-guy/src/services/rentals/rentalPilotLaunchRepository.js`
- `the-it-guy/src/services/rentals/rentalPilotReadinessRepository.js`
- `the-it-guy/src/services/rentals/rentalPilotReviewRepository.js`
- `the-it-guy/src/services/rentals/rentalPortfolioModel.js`
- `the-it-guy/src/services/rentals/rentalPortfolioRepository.js`
- `the-it-guy/src/services/rentals/rentalProperty24Phase5AcceptanceModel.js`
- `the-it-guy/src/services/rentals/rentalProperty24Phase6CutoverModel.js`
- `the-it-guy/src/services/rentals/rentalProperty24VettingPhase0Model.js`
- `the-it-guy/src/services/rentals/rentalPropertyModel.js`
- `the-it-guy/src/services/rentals/rentalPropertyRepository.js`
- `the-it-guy/src/services/rentals/rentalReminderRepository.js`
- `the-it-guy/src/services/rentals/rentalReportingRepository.js`
- `the-it-guy/src/services/rentals/rentalRlsMatrix.js`
- `the-it-guy/src/services/rentals/rentalRolloutControlRepository.js`
- `the-it-guy/src/services/rentals/rentalScreeningRepository.js`
- `the-it-guy/src/services/rentals/rentalShortTermBookingModel.js`
- `the-it-guy/src/services/rentals/rentalShortTermBookingRepository.js`
- `the-it-guy/src/services/rentals/rentalShortTermInventoryModel.js`
- `the-it-guy/src/services/rentals/rentalShortTermInventoryRepository.js`
- `the-it-guy/src/services/rentals/rentalShortTermOperationsModel.js`
- `the-it-guy/src/services/rentals/rentalShortTermRatePlanRepository.js`
- `the-it-guy/src/services/rentals/rentalShortTermTurnoverRepository.js`
- `the-it-guy/src/services/rentals/rentalTenancyClosureRepository.js`
- `the-it-guy/src/services/rentals/rentalUnitModel.js`
- `the-it-guy/src/services/rentals/rentalUnitRepository.js`
- `the-it-guy/src/services/rentals/rentalVacancyMarketingModel.js`
- `the-it-guy/src/services/rentals/rentalVacancyMarketingRepository.js`
- `the-it-guy/src/services/rentals/rentalVacancyModel.js`
- `the-it-guy/src/services/rentals/rentalVacancyRepository.js`
- `the-it-guy/src/services/rentals/rentalViewingModel.js`
- `the-it-guy/src/services/rentals/rentalViewingService.js`
- `the-it-guy/src/services/rentals/rentalWorkspaceScope.js`
- `the-it-guy/src/services/rentals/shortTermRentalCalendarModel.js`
- `the-it-guy/src/services/rentals/shortTermRentalDashboardModel.js`
- `the-it-guy/src/services/rentals/shortTermRentalFoundation.js`

### Core database entities

| Entity | Inventory status | SQL source |
| --- | --- | --- |
| `rental_portfolios` | Present in SQL artifact inventory | `the-it-guy/sql/20260829_rental_portfolio_foundation.sql` |
| `rental_properties` | Present in SQL artifact inventory | `the-it-guy/sql/20260829_rental_property_foundation.sql` |
| `rental_units` | Present in SQL artifact inventory | `the-it-guy/sql/20260829_rental_unit_foundation.sql` |
| `rental_property_landlords` | Present in SQL artifact inventory | `the-it-guy/sql/20260829_rental_landlord_mandate_foundation.sql` |
| `rental_property_mandates` | Present in SQL artifact inventory | `the-it-guy/sql/20260829_rental_landlord_mandate_foundation.sql` |
| `rental_vacancies` | Present in SQL artifact inventory | `the-it-guy/sql/20260829_rental_vacancy_foundation.sql` |
| `rental_applications` | Present in SQL artifact inventory | `the-it-guy/sql/20260829_rental_applications_and_applicant_access.sql` |
| `rental_tenancies` | Present in SQL artifact inventory | `the-it-guy/sql/20260829_rental_application_tenancy_conversion.sql` |
| `rental_leases` | Present in SQL artifact inventory | `the-it-guy/sql/20260829_rental_application_tenancy_conversion.sql` |

## Canonical ownership boundary

| Concern | System of record | Boundary |
| --- | --- | --- |
| Canonical people and organisations | Platform CRM | Landlord, applicant and tenant remain role relationships; no duplicate contact master. |
| Property, unit, vacancy, application, screening, lease, tenancy | Arch9 Rentals | Rentals owns the operational lifecycle. |
| Marketing listing | Shared Listings | A rental listing is a vacancy projection marked `listing_category:rental`; it is never the occupancy source of truth. |
| Rental payments, trust accounting, reconciliation and payouts | External financial system, currently unintegrated | Do not treat Arch9's operational financial records as a trust-accounting ledger. |
| Maintenance and inspections | Arch9 Rentals | Continue as a rental-owned workflow; benchmark externally without coupling to an unverified integration. |

## Integration status

| Candidate | Status | Phase 0 decision |
| --- | --- | --- |
| PayProp | not_integrated | No credentials, client, webhook, or data synchronisation is present. A future integration requires a separate contract and sandbox proof. |
| WeConnectU / RedRabbit | not_integrated | No client, webhook, or data synchronisation is present. Treat it as an operational benchmark until a separate integration assessment is approved. |

## Confirmed capability state

| Capability | Current state | Phase 0 conclusion |
| --- | --- | --- |
| Rental leads | implemented_foundation | Existing implementation is a starting point, not a replacement CRM. |
| Landlord and mandate | implemented_foundation | Relationship and mandate records exist; guided acquisition remains a later workflow phase. |
| Applicant applications | implemented_foundation | Application and applicant-link foundations exist. |
| Tenant and landlord portals | access_model_and_rollout_controls_only | Portal access model/rollout flags exist, but no production rental portal route is claimed by this phase. |
| Finance | operational_records_only_no_external_finance_integration | Operational records exist; trust accounting and PayProp synchronisation are out of scope. |

## Sales protection contract

- Do not change Sales route behaviour, default queries, lead-category semantics, or status enums to accommodate Rentals.
- Keep rental marketing projections explicitly marked `listing_category:rental`.
- Do not alter shared RLS without both Sales and Rentals policy tests.
- Keep Rentals lazy-loaded and outside the initial Sales bundle.
- Do not introduce a finance integration or financial source-of-truth change in a CRM phase.
- Run the following checks before every next phase.

- `npm run test:sales-listing-workspace-phase3`
- `npm run test:rental-listing-workspace-phase4`
- `npm run test:performance-phase0`
- `npm run test:performance-budget`
- `npm run build`

## Next phase

Proceed to the Rental CRM data-contract phase: rental lead classification, landlord/tenant roles, stage definitions, import contract, and transition rules.
