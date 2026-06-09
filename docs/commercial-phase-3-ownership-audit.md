# Commercial Phase 3 Ownership Audit

## Existing Ownership Fields

All commercial records already carry `organisation_id`, `created_by`, and `updated_by` from the commercial foundation migrations. Phase 3 hierarchy work in the current worktree also adds `branch_id`, `team_id`, and `broker_id` to commercial landlords, tenants, properties, requirements, deals, vacancies, leases, Heads of Terms, documents, document requests, and activity.

## Entity Notes

- Landlords: `organisation_id`, `branch_id`, `team_id`, `broker_id`, `created_by`, `updated_by`.
- Tenants: `organisation_id`, `branch_id`, `team_id`, `broker_id`, `created_by`, `updated_by`.
- Properties: `organisation_id`, `branch_id`, `team_id`, `broker_id`, `created_by`, `updated_by`.
- Vacancies: `organisation_id`, `branch_id`, `team_id`, `broker_id`, legacy `broker_assignment`, `created_by`, `updated_by`.
- Requirements: `organisation_id`, `branch_id`, `team_id`, `broker_id`, legacy `assigned_broker`, `created_by`, `updated_by`.
- Deals: `organisation_id`, `branch_id`, `team_id`, `broker_id`, legacy `assigned_broker`, `created_by`, `updated_by`.
- HOTs: `organisation_id`, `branch_id`, `team_id`, `broker_id`, linked `deal_id`, `tenant_id`, `landlord_id`, `property_id`, `created_by`, `updated_by`.
- Leases: `organisation_id`, `branch_id`, `team_id`, `broker_id`, linked `deal_id`, `tenant_id`, `landlord_id`, `property_id`, `created_by`, `updated_by`.
- Documents and document requests: `organisation_id`, `branch_id`, `team_id`, `broker_id`, linked `entity_type` and `entity_id`, `created_by`, `updated_by`.
- Activity: `organisation_id`, `branch_id`, `team_id`, `broker_id`, linked `entity_type` and `entity_id`, `created_by`.

## Visibility Behaviour

Commercial now resolves an access context from the current organisation membership. Roles are mapped into organisation, branch, team, or broker scope. Organisation scope can see all commercial records in the organisation. Branch scope is branch-aware. Team scope can see records assigned to the current team and records created by the current user. Broker scope is record-owner aware and includes assigned and created records.

## Assignment Behaviour

Commercial already has brokerage overview, brokers, teams, branches, performance, and assignments pages in the worktree. The remaining gaps are reusable assignment controls, clear/reassign behaviour, bulk assignment, and activity events that explicitly describe assignment changes.

## Implementation Direction

Phase 3 should keep `assigned_broker` and `broker_assignment` as compatibility aliases while writing the canonical `broker_id`, `team_id`, and `branch_id`. Assignment events should update commercial records through the existing APIs and write commercial activity for audit/history.
