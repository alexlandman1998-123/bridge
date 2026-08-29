# Arch9 Developments Architecture Audit

Date: 29 August 2026

Scope: repository and migration audit only. No implementation, schema, policy, or application changes were made. The findings describe the code and migration history in this workspace; deployed database drift was not queried, so production/staging policy state must be reconciled before implementation.

## Executive conclusion

Arch9 already has the correct foundation in two important respects: there is one `developments` table, and development sales use the canonical `transactions` table through `development_id` and `unit_id`. The current system can evolve into the target model without rebuilding the development domain.

Meaningful restructuring is nevertheless required around development tenancy and authorization. A development is presently anchored to one `developments.organisation_id`; additional access is user/email based through `development_participants`; organisation-to-organisation partner records exist, but they are not the canonical source of development access. Ownership, operational control, mandate scope, and stakeholder visibility are therefore conflated or represented in separate systems.

The most urgent security conflict is that `bridge_can_manage_development_record()` combines organisation membership and `bridge_has_development_access()`. The latter is satisfied by a `development_participants` row with `can_view = true`. Current portal policies then use this combined helper for writes to `developments`, `development_financials`, `development_documents`, `development_settings`, profiles, and configs. Consequently, a user intended to be a view-only external developer can receive database-level management rights after accepting an invite. Frontend permission gates reduce UI exposure but are not a safe authorization boundary.

Recommended result:

- Preserve `developments`, `units`, `transactions`, development profiles/settings/documents/financials, the organisation membership system, and most of `DevelopmentDetail`.
- Add a canonical organisation-to-development relationship and a separate per-user development access grant.
- Split `can_view_development`, `can_operate_development`, `can_manage_development`, and capability-specific helpers in RLS.
- Backfill the current `organisation_id` owner/operator and `development_participants` data into the new model before changing reads.
- Treat `developments.organisation_id` as a temporary legacy/primary-operator compatibility column, not the future ownership model.
- Converge the parallel `leads` and `developer_leads` paths behind a shared CRM subject/interest model over time; do not create another development lead system.

## 1. Current architecture

### 1.1 Development domain

The canonical development record is `public.developments` in `the-it-guy/sql/schema.sql`. It contains identity, address, lifecycle, developer-company label, total-unit expectations, feature flags, and a nullable `organisation_id` foreign key to `organisations`.

Related development data includes:

- `development_profiles`: descriptive and marketing JSON/content.
- `development_settings`: workflow defaults, stakeholder teams, reservation defaults, and related configuration.
- `development_financials`: projected development-level costs and revenue.
- `development_documents`: development and unit-type assets.
- `development_attorney_configs` and required-closeout documents.
- `development_bond_configs` and required-closeout documents.
- `development_participants`: user/email participants with `role_type`, `can_view`, `can_create_transactions`, and assignment metadata.
- `units`: belongs to one development; phase and unit type are currently text columns, not normalized entities.
- `alteration_requests`, handover/snag-related records, and listing links provide downstream operational context.

There are no first-class `development_phases`, `unit_types`, or `reservations` tables in the audited canonical schema. Phase and type are strings on `units`; reservation state and payment fields live on `transactions`.

### 1.2 Ownership and organisation relationships

Current development ownership/tenancy is expressed primarily by `developments.organisation_id`. Application list queries frequently filter directly by it, including `fetchDevelopmentsData({ organisationId })` in `src/lib/api.js`.

Arch9 also has:

- `organisations`, with organisation/workspace types populated by later migrations and onboarding flows.
- `organisation_users`, the active membership source used by workspace resolution and RLS helpers.
- `organisation_branches`, organisation roles, permissions, custom roles, and workspace invitation infrastructure.
- General partner infrastructure: `organisation_partners` and `partner_invitations`.
- A developer-specific parallel partner domain: `developer_partner_relationships`, `developer_partner_agreements`, and `developer_partner_agreement_terms`, with JSON scope for developments/phases/units.

None of those partner relationship tables is currently the canonical basis for development RLS. There is also no explicit owner/operator relationship on a development. `developer_company` is descriptive text and is not authoritative ownership.

### 1.3 Users, roles, and permissions

The application supports workspace type `developer_company` alongside agency, attorney, and bond workspaces. `organisation_users` is the practical membership model; legacy `profiles.role`, `firms`, and `firm_memberships` still coexist.

Frontend permissions already distinguish development capabilities such as:

- `view_developments`
- `create_developments`
- `edit_developments`
- `delete_developments`
- `manage_units`
- `manage_developer_transactions`
- `view_developer_financials`
- `export_developer_reports`
- `manage_development_team`

Agency principals, managers, team leads, agents, and selected coordinators receive an `AGENCY_DEVELOPMENT_PERMISSIONS` bundle. Developer organisations have owner/director/sales manager/development manager/sales agent/admin/viewer grants. This is a strong reusable frontend authorization catalogue.

The weakness is mismatch between application permissions and database policies: several RLS write policies check broad development access rather than the corresponding capability.

### 1.4 RLS and access

The current development security model has two principal access paths:

1. `bridge_has_development_org_access(development_id)` checks active membership in `developments.organisation_id`.
2. `bridge_has_development_access(development_id)` checks a view-enabled `development_participants` row by `user_id` or matching email, or participation in a transaction within the development.

`bridge_can_manage_development_record(development_id)` then returns true for an admin, organisation member, or anyone satisfying `bridge_has_development_access`.

Later portal RLS applies that helper to both reads and writes for the core development and its financials, participants, profiles, documents, settings, attorney configs, and bond configs. This creates four conflicts:

- View and manage are not separated.
- Transaction participation can indirectly grant development-level access.
- User/email grants do not express organisation responsibility, mandate, or ownership.
- The helper is `SECURITY DEFINER`; although it sets `search_path`, its broad semantic contract makes every policy using it high impact.

The private-listing development policy is narrower for reading but also relies on `development_participants`, not organisation-development relationships. Transactions use the canonical transaction participant/spine access model and can also inherit development access.

### 1.5 Leads and contacts

There are two connected but distinct lead domains:

- `leads` and `contacts` are organisation-owned CRM records. A lead has one `organisation_id`, agent/contact links, listing/enquiry fields, and optional `converted_transaction_id`. There is no direct canonical many-to-many development-interest table for this base lead.
- `developer_leads` is a later developer CRM shell. It has `developer_org_id`, optional `source_agency_org_id`, `source_lead_id`, `primary_development_id`, unit, transaction, ownership/selling/visibility states, separate protected PII, multi-development interests, and activity.

`developer_leads` handles developer-direct CRM and privacy-aware agency handover thoughtfully, but it duplicates lead lifecycle concepts (`status`, assignment, activity, conversion) rather than extending the core organisation lead cleanly. It also requires a developer organisation even when the development is agency-owned and the external developer is only a guest. The development detail page derives a developer organisation from `development.organisation_id` or the current workspace, reinforcing owner/operator ambiguity.

### 1.6 Transactions, buyers, reservations, and commission

The canonical transaction path is already correct:

```text
Development -> Unit -> Transaction -> Buyer / Participants / Finance / Documents / Events
```

`transactions` contains both `development_id` and `unit_id`, one `organisation_id`, a canonical lifecycle/stage, buyer, finance, reservation, transfer, registration, and audit fields. `transaction_participants` provides user/role-level collaboration and granular flags. Development detail and unit detail hydrate and open these transactions rather than creating a separate development-sale engine.

Reservations are embedded in `transactions`; this supports the current flow but cannot represent multiple attempts, expiry history, waitlists, or a reservation preceding transaction creation cleanly.

Commission support exists at organisation/user/transaction level, but no canonical development-agency mandate/commission schedule connects a selling relationship to resulting transactions. Developer partner agreements are a useful start but remain a separate subsystem.

### 1.7 Documents, listings, and activity

- `development_documents` stores development assets; `documents` is transaction-owned.
- `private_listings` now has canonical `development_id` and `unit_id` links, with a trigger enforcing unit/development consistency. Application fallback still infers legacy links from metadata/text.
- Development activity is largely derived from transaction rows. There is no single development event stream spanning settings, inventory, lead, reservation, document, partner, and transaction changes.

### 1.8 Existing developer functionality

The full developer experience is materially present:

- Portfolio `/developments` and `/developments/:developmentId`.
- Development-level overview, units, leads, performance, marketing, listings, and configuration in `DevelopmentDetail.jsx`.
- Canonical transaction/unit workspaces.
- `/developer/leads` and lead detail.
- `/developer/partners` with invitations, agreements, and partner types.
- Developer intelligence pages, dashboard permissions, and developer organisation roles.
- Financial rollups, development financials, documents, marketing, listing syndication, handover, and snag context.

Restricted developer access also exists as an invite flow:

- `/developer/access-invite/:token`
- Edge function `supabase/functions/development-access-invite/index.ts`
- Invite data stored inside `development_settings.stakeholder_teams` JSON.
- Acceptance creates/updates a `development_participants` row and redirects to the full `/developments/:developmentId` page.

This is an access mechanism, not yet a separate restricted Developer Dashboard. The invite token is discovered by paginating all development settings under a service-role client, is stored in JSON rather than a dedicated hashed-token table, and accepted users land in the operational workspace.

### 1.9 Current routes

Core routes relevant to this audit:

```text
/developments
/developments/:developmentId
/developments/:developmentId/transactions/:transactionId
/units
/units/:unitId
/transactions
/developer/leads
/developer/leads/:developerLeadId
/developer/partners
/developer/intelligence/*
/listings/developments
/settings/developments
/m/developments
/m/developments/:developmentId
/developer/access-invite/:token
/developer/partner-invite/:token
/external/:accessToken
/partner-portal/:token
```

The shared `/developments` route is role-gated for developer, agent, attorney, and bond users. It is not experience-specific and is reusable. However, guest developer access uses the same full detail route, and the app-level `RoleRoute` expects a global app role rather than a development-scoped stakeholder persona.

## 2. What already works

- One canonical Development entity already exists.
- Units belong to the canonical development.
- Transactions are canonical and directly linked to development/unit.
- Agencies already receive development permissions in the permission registry.
- Developer organisations, roles, CRM navigation, partner management, and multiple-development UI already exist.
- Development detail already supplies much of the desired Workspace UI and reporting.
- Transaction participants and external token portals demonstrate reusable scoped collaboration patterns.
- Development participants provide a backfillable source for existing individual grants.
- Organisation partnerships and developer-specific partner agreements provide reusable partner/invite/agreement concepts.
- Private listings now have real development/unit foreign keys.
- Developer leads already model multiple development interests, agency attribution, privacy boundaries, and conversion to canonical transactions.
- Development documents and transaction documents are correctly separate contexts.

## 3. Gaps against the target architecture

| Target capability | Classification | Finding |
|---|---|---|
| One shared Development model | Already Supported | One `developments` table powers all roles. |
| Canonical transaction for a unit sale | Already Supported | `transactions.development_id` and `unit_id`; existing lifecycle is reused. |
| Agency Development Workspace | Partially Supported | Agency permissions/routes exist, but list ownership and RLS are still tied to one organisation and the UI is developer-shaped in places. |
| Full Developer Account | Partially Supported | Multi-development, leads, partners, units, transactions, reporting, and roles exist; tenancy/relationship semantics need normalization. |
| Restricted Developer Dashboard | Architectural Conflict | Invite exists, but it grants participant access to the operational route and RLS can allow writes. No dedicated restricted shell/read model. |
| Development owner vs operator | Not Supported | No canonical relationship distinguishes owner, primary operator, selling agency, or mandate scope. |
| Multiple selling agencies | Architectural Conflict | User-level participants and partner JSON scopes are insufficient for safe organisation-level access and responsibility. |
| Developer conversion from guest to subscriber | Partially Supported | Same development can be retained, but no canonical relationship can be upgraded atomically from stakeholder to owner/operator. |
| First-class phases | Not Supported | `units.phase` is free text. |
| First-class unit types | Not Supported | `units.unit_type` and marketing floorplans are text/JSON. |
| Reservation lifecycle | Partially Supported | Reservation fields exist on transactions; no independent/history model. |
| Development-scoped leads | Partially Supported | `developer_leads` has interests; base `leads` does not. Two lead lifecycles coexist. |
| Developer CRM above developments | Already Supported | `developer_leads.developer_org_id` plus interests supports this. |
| Agency CRM lead linked to development | Partially Supported | Agency `leads` can reference listing/source and bridge to developer leads, but lacks a canonical lead-development interest relation. |
| External agents without duplicate agent system | Partially Supported | Participants/partner orgs can represent them, but the access/assignment model is fragmented. |
| Development documents | Already Supported | `development_documents` exists. Audience/capability controls are too coarse. |
| Development financials | Already Supported | Schema/UI exists. RLS separation is unsafe for restricted viewers. |
| Development-wide activity | Not Supported | Activity is fragmented across transaction events and developer lead activity. |
| Per-development organisation access | Not Supported | No canonical organisation-development ACL/relationship drives RLS. |

## 4. Critical architectural issues

### P0: restricted viewers can satisfy write policies

`development-access-invite` writes a view-enabled `development_participants` row. `bridge_has_development_access()` recognizes it. `bridge_can_manage_development_record()` treats that as management. Current policies use the latter for update/delete/insert across sensitive development records. This must be corrected before broad external developer rollout.

### P0: a single `organisation_id` conflates ownership and operation

The field is used for creation, listing/filtering, RLS, dashboard scope, and developer lead organisation inference. In Scenario A it would likely be the agency/operator, while business ownership belongs to the developer. In Scenario B it would be the developer. The same column therefore changes meaning by scenario.

### P1: user participant access cannot model multi-organisation responsibility

Adding every agency user to `development_participants` does not establish an agency mandate, does not inherit/revoke cleanly with agency membership, and cannot safely express primary operator, co-mandate, reporting attribution, or scope by phase/unit.

### P1: lead duplication has already begun

`leads` and `developer_leads` are linked through `source_lead_id`, but both carry status, assignment, activity, conversion, and development interest concepts. The privacy-aware bridge is valuable, yet without a declared canonical CRM subject it risks two diverging workflows and repeated buyer identities.

### P1: external developer guest is modeled as global developer participant

The invited user gets role type `developer` and opens the general development route. There is no explicit guest/stakeholder membership, dashboard entitlement, expiry, per-capability grant, or separation from a full developer customer.

### P1: parallel partner relationship models

`organisation_partners` and `developer_partner_relationships` overlap. Development scope is held in `scope_json`, not normalized and not used by development RLS. Further investment in a third relationship system would worsen fragmentation.

### P2: phases, unit types, and reservations are not durable domain entities

Text/JSON is sufficient for current UI but weak for shared multi-agency inventory, pricing versions, allocation rules, reporting, and reservation concurrency.

### P2: schema and migration drift risk

The monolithic `sql/schema.sql`, standalone SQL packs, and `supabase/migrations` represent different generations. Several application queries contain missing-table/column fallbacks. Implementation must begin with an actual deployed-schema and policy inventory, not by assuming `schema.sql` is authoritative.

## 5. Recommended target architecture

### 5.1 Entity model

```text
Organisation ──< OrganisationUser >── User
      │
      └──< DevelopmentOrganisationRelationship >── Development
                    │                                  │
                    │                                  ├──< DevelopmentPhase
                    │                                  │       └──< UnitType
                    │                                  │               └──< Unit
                    │                                  ├──< LeadDevelopmentInterest >── CRM Lead/Contact
                    │                                  ├──< Reservation >── Unit / Buyer
                    │                                  ├──< DevelopmentDocument
                    │                                  └──< DevelopmentEvent
                    │
                    └── relationship role, mandate, scope, capabilities

User ──< DevelopmentAccessGrant >── Development
          guest/stakeholder exceptions only

Unit ──< Transaction >── Buyer
             ├──< TransactionParticipant >── User / Organisation
             ├── documents / finance / events
             └── originating relationship / agency attribution
```

### 5.2 Owner and operator representation

Use a canonical relationship table rather than owner/operator columns on `developments`:

`development_organisation_relationships`

- `id`
- `development_id`
- `organisation_id`
- `relationship_type`: `developer_owner`, `developer_operator`, `sales_operator`, `agency_mandate`, `joint_mandate`, `external_agency`, `marketing_agency`, `stakeholder`
- `access_level`: `viewer`, `reporting`, `sales`, `operations`, `admin`
- `is_primary_owner`
- `is_primary_operator`
- `mandate_type`: sole/open/joint/referral as applicable
- `status`: invited/active/suspended/ended
- `valid_from`, `valid_until`
- `created_by`, timestamps

Keep ownership and operational control independent. Enforce at most one active primary owner and one primary operator with partial unique indexes, while allowing multiple sales agencies.

Use normalized scope rows later (`development_relationship_scopes`) for phase/unit restrictions rather than relying on `scope_json`. MVP may use whole-development relationships only.

### 5.3 Per-user access

Use `development_access_grants` only for exceptions such as non-subscriber stakeholders. It should reference user, development, granting relationship/organisation, a named access profile, expiry/revocation, and audit metadata. Do not make the guest an `organisation_user` of the agency or force creation of a developer organisation.

Existing `development_participants` should remain for operational role assignment during migration, then narrow to named people/roles rather than tenancy. Organisation membership plus an active relationship should be the normal access path.

### 5.4 Permission and RLS strategy

Create distinct database predicates:

- `can_view_development(id)`
- `can_view_development_financials(id)`
- `can_operate_development(id)`
- `can_manage_development_inventory(id)`
- `can_manage_development_access(id)`
- `can_create_development_transaction(id)`

Each should evaluate:

1. authenticated user;
2. active `organisation_users` membership;
3. active organisation-development relationship;
4. relationship access level/capability;
5. optional active user access grant;
6. explicit record-level assignment where relevant.

Do not grant development-wide access merely because a user participates in one transaction. Transaction RLS should remain transaction-scoped. Do not use global app role or user-editable metadata as the authority. Keep any `SECURITY DEFINER` helper outside the exposed API surface where possible, revoke default `PUBLIC` execute, grant only required roles, fix `search_path`, and test every policy matrix.

Suggested visibility profiles:

- `development_admin`: all development administration/access.
- `sales_operator`: inventory, leads allocated to its organisation, reservations, transactions it operates, approved documents, reporting.
- `owner_reporting`: overview, full inventory/sales/financials/documents/activity; no operational writes unless also operator.
- `external_agency`: allocated stock/leads/transactions and approved collateral only.
- `stakeholder_viewer`: the restricted Developer Dashboard only.

### 5.5 Lead architecture

For MVP, preserve both existing lead tables but declare ownership rules:

- `leads` remains the agency CRM record.
- `developer_leads` remains the developer-organisation CRM record.
- `source_lead_id` is an attribution/handover link, not an invitation to synchronize every field.
- Add a canonical `lead_development_interests` abstraction usable by both sources, or a common read model that projects `developer_lead_development_interests` and agency interests.
- A lead has one operational CRM owner at a time. Cross-organisation visibility is a referral/handover/protected-summary relationship, not shared unrestricted row access.
- Buyer/contact identity should be linked through a durable party/contact identity after consent rather than copied repeatedly.

Later, converge both shells into a common `crm_leads` + `crm_lead_private_details` model with `owner_organisation_id`, interests, assignments, and referrals. That is a later refactor, not an MVP prerequisite.

### 5.6 Transaction architecture

Retain `transactions` as canonical. Add only attribution/context where missing:

- `originating_development_relationship_id` or `selling_organisation_id`
- explicit reservation linkage when reservations become first class
- organisation references on transaction participants/role players, not just names/emails

Development workspaces should query canonical transactions through unit/development links and RLS. No `development_transactions` table is recommended.

### 5.7 Routing and frontend

Fit the existing shared-route architecture rather than duplicating pages:

```text
/developments
/developments/:developmentId/*
  overview
  inventory
  leads
  sales
  transactions
  financials
  documents
  marketing
  activity
  access

/developer/leads
/developer/partners
/developer/reporting

/development-access/:developmentId/*
  overview
  inventory
  sales
  transactions
  financials
  documents
  activity
```

Keep `/developments/:id` as the shared operational Development Workspace for agencies and full developers. Render actions/tabs from resolved development capabilities, not global app role. Build the restricted route with a distinct layout and allowlisted read models; it may reuse presentational cards/tables from `DevelopmentDetail`, but should not mount the operational page and hide controls cosmetically.

## 6. Database changes

### Required for MVP

New tables:

- `development_organisation_relationships`
- `development_access_grants`
- `development_access_invitations` with hashed token, invited email, development, grant profile, issuer, expiry, acceptance/revocation timestamps
- Optional but strongly recommended: `development_relationship_capabilities` if capabilities are not represented by a constrained access profile

Modified tables:

- `developments`: retain `organisation_id` temporarily; document/backfill it as legacy primary operator and stop using it as sole authority.
- `development_participants`: add `organisation_id`/relationship reference if retained for named assignment; stop using `can_view` as write authorization.
- `transactions`: add selling/originating organisation relationship attribution if current participant rows cannot provide an immutable source.
- `developer_leads`: validate `developer_org_id` against an active owner/operator relationship for its development; stop inferring it from current workspace.

Constraints and indexes:

- Unique active `(development_id, organisation_id, relationship_type)` as appropriate.
- Partial unique primary owner/operator indexes.
- Relationship lookup indexes by organisation/status and development/status.
- Grant indexes by user/development/status and email/invite state.
- Relationship validity checks and non-self/compatible relationship constraints.

RLS changes:

- Replace broad `bridge_can_manage_development_record` usage with capability-specific predicates.
- Separate SELECT from INSERT/UPDATE/DELETE for every development child table.
- Give guest grants only explicit SELECT access to allowlisted tables/columns or secure read views/RPCs.
- Ensure financials, lead PII, internal notes, agency attribution details, access tables, and organisation settings have distinct policies.
- Remove transaction-participant-to-development-wide escalation.
- Align listing RLS with organisation relationships and listing ownership.
- Add policy regression tests for all five target scenarios and negative cross-tenant cases.

### Recommended later

- `development_phases`
- `development_unit_types`
- Versioned unit pricing/history
- `reservations` and reservation events/allocations
- `lead_development_interests` or unified CRM lead tables
- `development_events` as an append-only audit/activity stream
- Normalized relationship scopes for phases/units
- Development mandate and commission schedule tables tied to organisation relationships
- A security-invoker reporting/read-model layer for dashboard aggregates

## 7. Frontend changes

### Reuse

- `src/pages/Developments.jsx` portfolio presentation and metrics.
- `src/pages/DevelopmentDetail.jsx` domain sections, after splitting it into tab modules and capability-aware containers.
- `src/pages/Units.jsx` and `src/pages/UnitDetail.jsx` inventory/transaction UI.
- Transaction workspace route loader and canonical transaction pages.
- Developer lead pages/services for full developer organisations.
- Partner presentation and agreement components from `DeveloperPartnersPage.jsx`.
- Existing permission registry concepts, extended with development relationship context.
- Development financial, marketing, document, listing, handover, and performance selectors.

### Change

- Replace `fetchDevelopmentsData` direct `organisation_id` filtering with an accessible-development repository/read model.
- Replace `DevelopmentDetail` owner-org inference with relationship resolution.
- Extract tabs into shared presentational modules: overview, inventory, sales, transactions, financials, documents, activity.
- Add an access resolver that returns development relationship, persona, and capabilities.
- Add a dedicated restricted dashboard layout/route.
- Move invite creation/acceptance away from `development_settings.stakeholder_teams` JSON.
- Remove reliance on global `RoleRoute` for development-scoped guest access.
- Show owner, operator, selling agencies, and mandate state in the operational workspace.
- Add safe organisation-scoped lead filters and attribution.

### Likely files/services to change

- `src/App.jsx`
- `src/pages/Developments.jsx`
- `src/pages/DevelopmentDetail.jsx`
- `src/pages/Units.jsx`
- `src/pages/UnitDetail.jsx`
- `src/pages/DeveloperAccessInvitePage.jsx`
- `src/pages/DeveloperPartnersPage.jsx`
- `src/pages/DeveloperLeadsPage.jsx`
- `src/context/AuthSessionContext.jsx`
- `src/context/OrganisationContext.jsx`
- `src/lib/api.js` and the development API facade
- `src/lib/roles.js`
- `src/auth/permissions/permissionRegistry.js`
- `src/auth/permissions/permissionResolver.js`
- `src/auth/permissions/queryScope.js`
- `src/services/workspaceResolutionService.js`
- `src/services/developerLeadService.js`
- `src/services/developerLeadConversionService.js`
- `src/lib/partnersRepository.js`
- `supabase/functions/development-access-invite/index.ts`
- Development, transaction, listing, lead, document, and storage RLS migrations

## 8. Phased implementation plan

### Phase 0 — reconcile and secure

1. Inventory the deployed schema, functions, grants, RLS policies, and migration history.
2. Add automated access-matrix tests for current organisation members, participants, guests, and unrelated users.
3. Correct the view-to-manage escalation before issuing more external developer invites.
4. Freeze new development relationship concepts in JSON/parallel tables.

### Phase 1 — canonical relationships

1. Add organisation-development relationships, grants, and invitations additively.
2. Backfill `developments.organisation_id` as the active primary operator/legacy owner according to verified business data.
3. Backfill developer/agency partner relationships and participants where mapping is unambiguous.
4. Introduce capability-specific RLS helpers and dual-read diagnostics.
5. Keep old columns and flows active until parity is proven.

### Phase 2 — shared Development Workspace

1. Change portfolio/detail queries to relationship-based access.
2. Make `DevelopmentDetail` capability-driven and extract reusable tab modules.
3. Add owner/operator/agency access administration.
4. Preserve canonical units, listings, transactions, documents, and financials.

### Phase 3 — restricted Developer Dashboard

1. Replace JSON invites with dedicated, expiring, revocable invitations and grants.
2. Build a restricted shell and allowlisted read model.
3. Reuse presentational modules only; prevent operational mutations in both UI and RLS.
4. Add audit logs and access review/revocation.

### Phase 4 — full Developer Account alignment

1. Make the developer organisation relationship authoritative across its portfolio.
2. Align developer CRM interests and transaction attribution with relationships.
3. Convert an existing guest into an organisation member/owner relationship without copying the development.
4. Consolidate developer partner scope into the canonical relationship model while preserving agreements.

### Phase 5 — multi-agency selling and normalized inventory

1. Add multiple agency mandates, allocation/scope, attribution, and commission schedules.
2. Normalize phases and unit types.
3. Introduce first-class reservations with concurrency controls.
4. Add cross-agency reporting with strict row/column visibility.
5. Retire legacy access paths after measured parity and rollback windows.

## 9. Migration risk

High-risk areas:

- Existing users may currently rely on participant access that is broader than intended.
- `organisation_id` may mean developer owner in some developments and agency operator in others; blind backfill would encode the wrong relationship.
- Application fallbacks can hide schema drift and produce different results by environment.
- Tightening RLS may break development detail child queries that currently depend on broad access.
- Transaction access must not be accidentally narrowed for attorneys, bond originators, agents, or clients.
- Developer lead privacy policies must remain intact during relationship changes.
- Legacy listing rows still use inferred links.
- Invite tokens currently embedded in settings JSON need secure, idempotent migration/revocation handling.

Safe migration controls:

- Take a production policy/schema snapshot and row-count/cardinality baseline.
- Classify every existing development's owner and operator explicitly; quarantine ambiguous rows.
- Add tables/functions before changing existing policies.
- Dual-write/dual-read with discrepancy logging for a limited period.
- Backfill in small batches with reversible mapping records.
- Test positive and negative access for each target scenario.
- Roll out read policies before write policies; restrict high-sensitivity financial/PII paths first.
- Retain `organisation_id` and participants through at least one stable release.
- Do not delete or rewrite transactions, units, documents, or lead history.

## 10. Final recommendation

**Can the current architecture evolve into the target model cleanly?**

Yes, at the domain level: the shared Development, Unit, and Transaction foundations are reusable, and substantial developer/agency UI already exists. It cannot reach the target safely through incremental UI additions alone. Development tenancy and authorization require a meaningful relationship-based refactor, and the guest dashboard must be separated from the operational workspace.

```text
Estimated architectural change: HIGH
Recommended approach: PARTIAL REFACTOR
```

Do not rebuild the Development domain and do not introduce agency/developer-specific development tables. Add the missing organisation-development relationship and access-grant layer, split view from manage in RLS, then adapt existing routes and components around resolved capabilities. This preserves the valuable existing work while making agency-managed, developer-direct, shared-dashboard, multi-agency, and later subscription-conversion scenarios safe on the same underlying development record.

## Evidence index

Primary code and schema evidence reviewed:

- `the-it-guy/sql/schema.sql`
- `the-it-guy/sql/bridge_migration_pack_1.sql`
- `the-it-guy/sql/bridge_rls_pack_1_safe.sql`
- `the-it-guy/sql/20260824_private_listing_development_links.sql`
- `supabase/migrations/202606280002_development_financials_rls.sql`
- `supabase/migrations/202606290001_development_insert_org_scope.sql`
- `supabase/migrations/202606290003_remove_open_development_policies.sql`
- `supabase/migrations/202606290016_developer_partner_relationships_phase1.sql`
- `supabase/migrations/202608140007_development_portal_rls_followup.sql`
- `supabase/migrations/20260816092532_developer_leads_phase10_foundation.sql`
- `supabase/migrations/20260827091439_transaction_setup_owner_rls_access.sql`
- `supabase/functions/development-access-invite/index.ts`
- `the-it-guy/src/App.jsx`
- `the-it-guy/src/pages/Developments.jsx`
- `the-it-guy/src/pages/DevelopmentDetail.jsx`
- `the-it-guy/src/pages/Units.jsx`
- `the-it-guy/src/pages/UnitDetail.jsx`
- `the-it-guy/src/pages/DeveloperAccessInvitePage.jsx`
- `the-it-guy/src/pages/DeveloperPartnersPage.jsx`
- `the-it-guy/src/pages/DeveloperLeadsPage.jsx`
- `the-it-guy/src/lib/api.js`
- `the-it-guy/src/services/developerLeadService.js`
- `the-it-guy/src/services/developerLeadConversionService.js`
- `the-it-guy/src/services/workspaceResolutionService.js`
- `the-it-guy/src/auth/permissions/permissionRegistry.js`
- `the-it-guy/src/auth/permissions/permissionResolver.js`
- `the-it-guy/src/lib/roles.js`
