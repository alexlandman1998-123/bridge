# Commercial Phase 8 Launch Readiness

Phase 8 proves that Commercial is ready for pilots, demos, broker usage, and support. It does not introduce major new product capability.

## Scope

- Validate end-to-end leasing workflows.
- Validate data integrity across commercial records.
- Validate permissions and portal isolation.
- Validate dashboards, reporting, search, activity, notifications, and mobile readiness.
- Saturate the demo environment with realistic commercial data.
- Document known issues, future enhancements, and deferred features.

## Launch Checklist

| Area | Launch Standard | Status |
| --- | --- | --- |
| End-to-End Workflow Validation | Requirement -> Vacancy -> Deal -> HOT -> Lease completes without manual database intervention. | Ready for QA |
| Data Integrity Audit | Landlords, tenants, properties, vacancies, requirements, deals, HOTs, leases, documents, and activity have no orphan links. | Covered by readiness selector |
| Permissions Audit | Broker, Team Leader, Branch Manager, Organisation Admin, HQ Admin, Landlord Portal, and Tenant Portal boundaries are explicit. | Covered by role matrix |
| Dashboard Validation | Commercial, Manager, Executive, and Broker dashboards avoid NaN values and duplicate counts. | Covered by metric audit |
| Reporting Validation | Pipeline, vacancy, lease, broker, branch, financial, and compliance reports must be cross-checked against source records. | Manual QA required |
| Search Validation | Property, landlord, tenant, vacancy, requirement, deal, HOT, lease, and transaction search routes deep-link correctly. | Manual QA required |
| Activity Validation | Timeline, document, assignment, workflow, portal, and notification activity should not duplicate or omit events. | Covered by data audit plus manual QA |
| Notification Validation | Requests, uploads, assignments, HOT changes, lease changes, portal invites, messages, and renewal alerts trigger once. | Manual QA required |
| Seed Data Saturation | Demo data includes 50+ landlords, 100+ tenants, 50+ properties, 150+ vacancies, 100+ requirements, 75+ deals, 50+ HOTs, and 100+ leases. | Covered by launch seed |
| Demo Environment | Large brokerage, medium brokerage, independent broker, corporate landlord, and corporate tenant scenarios are represented. | Covered by launch seed metadata |
| Executive Demo Mode | Executive views should show GLA, vacancy, pipeline value, lease value, broker performance, branch performance, renewal risk, and compliance. | Ready for QA |
| Performance Testing | Large lists, dashboards, document libraries, activity feeds, filtering, search, and reporting remain usable. | Manual QA required |
| Mobile Validation | Broker, portal, executive dashboard, search, document, and activity workflows remain readable and touch-friendly. | Manual QA required |
| Production Hardening | Missing documents, deleted users, inactive brokers, expired leases, archived properties, invalid assignments, and revoked portal access fail gracefully. | Covered by readiness checklist |
| Support Readiness | Support can inspect record, assignment, document, portal, and notification diagnostics. | Covered by readiness selector |
| Final QA Sign-Off | Build and regression suite pass with no critical blockers. | Must be run before release |

## Demo Data Profile

The Phase 8 launch seed creates a realistic portfolio across:

- Industrial
- Retail
- Office
- Mixed Use
- Logistics
- Business Park
- Warehouse

The seed includes the required demo personas:

- Large brokerage
- Medium brokerage
- Independent broker
- Corporate landlord
- Corporate tenant

## Support Diagnostics

Support should be able to answer the following quickly:

- Which records are orphaned or missing required relationships?
- Which dashboard metrics are unsafe, stale, or non-finite?
- Which workflows have broken handoffs?
- Which document requests are outstanding or overdue?
- Which portal access tokens are active, revoked, expired, or disabled?
- Which records are unassigned or owned by inactive users?

The `buildCommercialLaunchReadinessReport` selector is the support-facing source for these checks.

## Known Issues

- Portal token routes require the Phase 7 portal migration to be applied before real external workspaces can load.
- Production sign-off still requires authenticated browser testing against the deployed Supabase project.
- Existing build output includes known Vite warnings unrelated to Commercial launch readiness; these should be monitored but are not Phase 8 blockers unless they become runtime failures.

## Deferred Features

- Attorney workflows
- Residential transaction engine conversion
- Bond workflows
- E-signature integrations
- Payroll-grade commission accounting
- Advanced renewal automation

## Final Sign-Off Commands

Run these before release:

```bash
npm run test:commercial-phase8
npm run test:commercial-phase7
npm run test:commercial-phase6
npm run test:commercial-phase5
npm run test:commercial-phase4
npm run test:commercial-phase3
npm run test:commercial-mvp
npm run build
```
