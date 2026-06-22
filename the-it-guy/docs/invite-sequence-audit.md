# Partner / Roleplayer Invite Flow Audit

Audit date: 2026-06-22

Scope: current Arch9 / Bridge transaction partner and roleplayer invite flow, with focus on Attorneys and Bond Originators. This is an audit only; no runtime implementation was changed.

## Executive Summary

The codebase already has a solid transaction-scoped invite foundation for two partner classes: Transfer Attorney and Bond Originator. The flow creates a pending transaction invitation, creates or reuses a partner prospect, writes pending `transaction_role_players` and `transaction_participants` rows, emails a token link, and on acceptance grants transaction-only access through `transaction_user_access`.

The main gap is role coverage. The wider transaction model understands `transfer_attorney`, `bond_attorney`, `cancellation_attorney`, `bond_originator`, `developer_contact`, `agent`, and some participant roles, but the transaction partner invitation table and frontend invite service only support `transfer_attorney`, `bond_originator`, `developer`, and `other`. Bond Attorney and Cancellation Attorney can be assigned in other parts of the product, but they cannot currently be invited through the same transaction partner invitation engine.

The organisation model is partially in place. Attorney firms and bond originators can exist as organisations and partner connections, with membership and claim/create flows. However, the transaction invite accept flow does not automatically create or claim an unverified organisation for the invited contact. That is good for the intended model where Jane is invited as an individual and should not automatically become company admin, but the product still needs a clean "link/create/request membership" handoff after invite acceptance.

## Transaction Roleplayers

### Current Storage

Primary transaction roleplayer storage is in Supabase:

- `transaction_role_players`
- `transaction_participants`
- `transaction_attorney_assignments`
- `transaction_user_access`
- `transaction_partner_invitations`
- `partner_prospects`
- `organisation_preferred_partners`
- `partner_connections`

Relevant migrations:

- `supabase/migrations/202605270003_bridge9_transaction_support_tables.sql`
- `supabase/migrations/202605310003_transaction_propagation_rls_hardening.sql`
- `supabase/migrations/202606100008_transaction_partner_invitations_phase1.sql`
- `supabase/migrations/202606100009_partner_prospects_phase2.sql`
- `supabase/migrations/202606100010_organizations_membership_phase3.sql`
- `supabase/migrations/202606100011_partner_connections_phase4.sql`

### Role Type Coverage

`transaction_role_players.role_type` currently supports:

- `bond_originator`
- `bond_attorney`
- `transfer_attorney`
- `cancellation_attorney`
- `developer_contact`
- `agent`
- `other`

`transaction_partner_invitations.role_type` currently supports only:

- `transfer_attorney`
- `bond_originator`
- `developer`
- `other`

`transaction_user_access.access_role` currently supports only:

- `transfer_attorney`
- `bond_originator`
- `developer`
- `other`

`transaction_attorney_assignments` supports attorney-specific assignment types:

- `transfer`
- `bond`
- `transfer_and_bond`
- `cancellation`

The attorney assignment service maps these to:

- `transfer_attorney`
- `bond_attorney`
- `cancellation_attorney`

`Buyer` and `Seller` are not first-class `transaction_role_players.role_type` values. They appear as transaction/client data, participants, onboarding records, and permission roles. `Consultant` exists in bond organisation/hierarchy and participant logic, not as a transaction partner invitation role. `Agent` exists in roleplayer support, but not in the partner invitation role set.

### Linked Entity Model

A transaction roleplayer can be one or more of the following:

- Free-text party: company/name/email/phone on `transaction_role_players`.
- Preferred partner: via `preferred_partner_id` from `organisation_preferred_partners`.
- Connected partner organisation: via partner connection and `partner_organisation_id`.
- Invited partner: via `transaction_partner_invitation_id` and `partner_prospect_id`.
- Accepted user: via `user_id` / `assigned_user_id` and `transaction_user_access`.

The model is transaction-scoped. Partner prospects and partner organisations are reusable directory/network records, but actual workspace access is per transaction.

## Invite Flow

### Current Frontend Service

Primary service:

- `src/services/transactionPartnerInvitationService.js`

Key exports:

- `createTransactionPartnerInvitation`
- `getTransactionPartnerInvitationByToken`
- `acceptTransactionPartnerInvitation`
- `declineTransactionPartnerInvitation`
- `resendTransactionPartnerInvitation`
- `searchPartnerProspects`
- `applyPartnerProspectToTransaction`

Supported invite roles in this service:

- Transfer Attorney
- Bond Originator
- Developer
- Other

Not supported here:

- Bond Attorney
- Cancellation Attorney
- Bond Consultant / Branch / Region scoped consultant
- Buyer / Seller
- Agent

### Current UI Entry Points

Main creation UI:

- `src/components/NewTransactionWizard.jsx`

The wizard supports:

- Transfer Attorney: existing connected partner, reusable prospect, or invite new.
- Bond Originator: existing connected partner, reusable prospect, or invite new.
- Invite-new fields: company, contact, email, phone.
- Reusable prospect selection from Bridge partner prospects.
- Transaction creation followed by partner invite creation.

Acceptance UI:

- `src/pages/TransactionPartnerInvitePage.jsx`
- Route: `/transaction-invite/:token`
- App route in `src/App.jsx`

Older/separate stakeholder accept page:

- `src/pages/StakeholderInviteAccept.jsx`

The stakeholder accept page is separate from the `transaction_partner_invitations` engine and should not be treated as the canonical partner invite flow.

### Database Flow

`createTransactionPartnerInvitation` inserts:

- `transaction_partner_invitations`
- pending `transaction_role_players`
- invited `transaction_participants`
- `partner_prospects` through `bridge_upsert_partner_prospect_for_invitation`

Invitation fields currently include:

- `transaction_id`
- `partner_prospect_id`
- `organisation_id`
- `role_type`
- `company_name`
- `contact_name`
- `email`
- `phone`
- `status`
- `invited_by_user_id`
- `accepted_user_id`
- `invitation_token`
- `expires_at`
- `viewed_at`
- `declined_at`
- `accepted_at`
- `resent_at`
- reminder timestamps
- `metadata`

Token behavior:

- Token is generated client-side as `crypto.randomUUID()`.
- Expiry defaults to 30 days.
- Token lookup RPC is callable by anon and authenticated users.
- Accept requires an authenticated user.
- Decline is callable by anon and authenticated users.
- Accept sets `accepted_at`, `accepted_user_id`, and nulls `invitation_token`, making the link effectively one-off.
- Resend generates a fresh token and 30-day expiry.

### Acceptance RPCs

Primary RPCs in `202606100008_transaction_partner_invitations_phase1.sql`:

- `bridge_get_transaction_partner_invitation(p_token text)`
- `bridge_accept_transaction_partner_invitation(p_token text, p_profile jsonb)`
- `bridge_decline_transaction_partner_invitation(p_token text)`
- `bridge_resend_transaction_partner_invitation(p_invitation_id uuid)`

On acceptance, the RPC:

- Verifies the invite is pending and not expired.
- Checks invited email against the authenticated user email.
- Upserts profile fields.
- Inserts `transaction_user_access`.
- Upserts active `transaction_participants`.
- Updates matching `transaction_role_players` to active.
- Marks the invitation accepted and clears the token.
- Logs a transaction event.

## Attorney Invite Support

### Implemented

The attorney roleplayer and assignment model supports:

- Transfer Attorney
- Bond Attorney
- Cancellation Attorney
- Transfer + Bond assignment type
- Primary attorney, secretary, admin handler
- Firm/member validation through attorney firm membership

Relevant file:

- `src/services/transactionAttorneyAssignments.js`

Transaction detail views understand multiple legal roleplayers:

- `src/pages/AttorneyTransactionDetail.jsx`
- `src/pages/UnitDetail.jsx`

### Partial / Missing

The transaction partner invite engine only supports `transfer_attorney`.

Missing from the invite engine:

- `bond_attorney` in `transaction_partner_invitations.role_type`
- `cancellation_attorney` in `transaction_partner_invitations.role_type`
- Role mapping in `bridge_transaction_partner_invite_role_shape`
- Frontend role constants and labels
- Email labels/copy
- Invite UI fields/actions for Bond Attorney and Cancellation Attorney
- Access role checks in `transaction_user_access`
- Acceptance page alignment for actual invite roles

The accept page currently offers professional role options including Bond Attorney, but that does not change the invite's canonical backend role. The backend role shape still comes from the invitation's `role_type`.

## Bond Originator Invite Support

### Implemented

The transaction invite engine supports `bond_originator`.

The broader bond module supports a richer organisation structure:

- Bond originator organisations
- Regions
- Branches
- Consultants
- Processors
- Compliance users
- Regional and branch managers
- Default region / branch / consultant on bond partners
- Assignment scope and hierarchy-aware filtering

Relevant files:

- `src/services/bondAssignmentService.js`
- `src/services/bondPartnerManagementService.js`
- `src/pages/bond/BondOrganisationPage.jsx`

Preferred/connected partner support exists:

- `src/lib/preferredPartners.js`
- `src/pages/settings/SettingsPreferredPartnersPage.jsx`
- `src/services/partnerNetworkService.js`

### Partial / Missing

The transaction invite flow captures a firm/contact and grants transaction access as `bond_originator`, but it does not currently select:

- Bond organisation branch
- Region
- Consultant
- HQ routing
- Default consultant
- Workload-balanced assignment
- Preferred originator routing rule as part of the invite acceptance itself

Those concepts exist elsewhere, but the transaction invite sequence does not yet unify them.

## Organisation Model

### Current Implementation

Organisations support:

- `agency`
- `attorney_firm`
- `bond_originator`
- `developer`
- `service_provider`

Organisation status supports:

- `active`
- `inactive`
- `pending`
- `suspended`
- `archived`

Membership supports:

- `pending`
- `active`
- `removed`
- `declined`
- `invited`
- `deactivated`

Organisation roles include:

- `owner`
- `admin`
- `member`
- `principal`
- `super_admin`
- `director`
- `partner`
- `viewer`
- `agent`
- `attorney`
- `branch_manager`
- `compliance`
- `consultant`
- `firm_admin`
- `hq_manager`
- `processor`
- `regional_manager`

Relevant service:

- `src/services/organizationService.js`

Relevant migration:

- `supabase/migrations/202606100010_organizations_membership_phase3.sql`

### Important Behavior

`bridge_phase3_create_organization` creates an organisation as `active` and inserts the creator as active owner/principal. This is appropriate for an explicit create-organisation flow, but not for automatic transaction invite acceptance.

`bridge_phase3_request_organization_membership` creates or reopens a pending membership request. This aligns better with an invited individual asking to join an existing firm.

Current transaction invite acceptance does not automatically create or claim an organisation. That means Jane can accept as an individual and receive transaction access without becoming admin of "Jane Attorneys Inc.", which matches the intended model.

### Gap

There is no polished post-accept flow that says:

- "We found a matching firm. Request access?"
- "Create a new firm profile?"
- "Continue as individual for this transaction only?"

This is the recommended next layer rather than automatic admin assignment.

## Partner Prospects And Network

`partner_prospects` is a reusable directory/prospect layer. It is not access by itself.

Supported prospect role categories:

- `attorney`
- `bond_originator`
- `developer`
- `other`

Attorney subtypes collapse into `attorney`, so transfer/bond/cancellation distinction is lost in the prospect category unless stored in metadata or transaction-specific role fields.

`partner_connections` handles organisation-to-organisation relationships:

- Agency to attorney
- Agency to bond originator
- Agency to developer
- Developer to attorney
- Developer to bond originator

These connections support preferred partners and transaction partner connection options, but they are organisation-level relationships, not transaction invite tokens.

## Permissions And RLS

### Transaction Access

Transaction RLS centers on `bridge_can_access_transaction_spine(target_transaction_id)`.

Access can be granted by:

- Internal support/admin transaction scope.
- Transaction owner/assignee/creator.
- Assigned agent email.
- Assigned attorney email.
- Assigned bond originator email.
- Active organisation membership with management or matching branch scope.
- Active `transaction_participants` user or email match.
- Active `transaction_role_players` user or email match.
- Active `transaction_attorney_assignments`.
- Bond application scope.
- `transaction_user_access` inserted by invite acceptance.

Policies apply this function to:

- `transactions`
- `transaction_participants`
- `transaction_role_players`
- `transaction_events`
- `transaction_attorney_assignments`
- `transaction_bond_applications`

### Invitation RLS

`transaction_partner_invitations` policies allow:

- Select when user can access transaction spine, is accepted user, or invited the partner.
- Insert when user can access transaction spine and is the inviter.
- Update when user can access transaction spine or is inviter.

`transaction_user_access` policies allow:

- User can select their own access row.
- Transaction-scoped users can view rows.
- Inserts/updates require transaction spine access.

### Risk

Email-based access checks are intentionally broad to allow legacy participants/roleplayers to see their transaction. This is useful but should be reviewed once roleplayer invites become more powerful. The stricter source of truth should be accepted `transaction_user_access` where possible.

## Email Templates

Primary transaction partner invitation email:

- `supabase/functions/send-email/handlers/transactionPartnerInvitation.ts`
- Routed from `supabase/functions/send-email/index.ts`
- Payload type: `transaction_partner_invitation` or `partner_transaction_invite`

Payload fields:

- `transactionId`
- `to`
- `roleType`
- `roleLabel`
- `companyName`
- `contactName`
- `invitationLink`
- `invitedByOrganisation`
- `partnerProspectId`
- `reusedProspect`

Current role label resolver knows:

- `transfer_attorney` -> Transfer Attorney
- `bond_originator` -> Bond Originator
- `developer` -> Developer
- fallback -> Transaction Partner

The template says the invitation grants access only to the transaction that generated the link and does not grant agency, branch, or organisation visibility.

Missing email-specific support:

- Bond Attorney copy.
- Cancellation Attorney copy.
- Branch/consultant assignment context for bond originators.
- Organisation claim/request membership CTA after acceptance.

## UI Audit

### Implemented

New transaction wizard has a clean invite/reuse experience for:

- Transfer Attorney
- Bond Originator

It supports:

- Existing connected partner
- Reusable prospect
- Invite new
- Validation
- Email send warning
- Result summary with invite link

Transaction acceptance page supports:

- Token lookup
- New user sign-up
- Existing session accept
- Decline
- Clear transaction-only access messaging

Settings/admin surfaces exist for:

- Preferred partners
- Partner prospects
- Organisation profiles/memberships
- Partner connections
- Bond organisation hierarchy

### Partial / Missing

No general "Invite roleplayer" action was found on the transaction detail surface that reuses the same wizard logic for every transaction after creation. The canonical invite creation path is strongest in `NewTransactionWizard.jsx`.

Attorney detail pages can display/select roleplayers for transfer, bond, cancellation, and originator roles, but the UI path for "invite this Bond Attorney" or "invite this Cancellation Attorney" is not integrated with `transaction_partner_invitations`.

The accept page has professional role options that are broader than backend invite support, creating a potential UI/backend mismatch.

## Gap Report

### Already Implemented

- Transaction-scoped invite table.
- Token lookup, accept, decline, resend RPCs.
- 30-day token expiry.
- One-off token clearing on acceptance.
- Transaction-only access grant via `transaction_user_access`.
- Pending roleplayer and invited participant creation.
- Partner prospect reuse/directory layer.
- Transfer Attorney invite flow.
- Bond Originator invite flow.
- Transaction partner email template.
- Organisation model for attorney firms and bond originators.
- Organisation membership and request/review functions.
- Partner connections and preferred partner logic.
- Attorney assignment model for transfer/bond/cancellation.
- Bond hierarchy for HQ/regions/branches/consultants.

### Partial

- Attorney invite support: assignment model is complete, invite engine is transfer-only.
- Bond originator support: transaction invite exists, but branch/region/consultant routing is not part of invite acceptance.
- Organisation model: supports company records and membership, but no guided post-invite claim/link flow.
- Partner prospects: reusable, but attorney subtype granularity is collapsed.
- Transaction detail UI: roleplayer selectors exist, but invite creation is not consistently exposed after transaction creation.

### Missing

- `bond_attorney` and `cancellation_attorney` in `transaction_partner_invitations`.
- `bond_attorney` and `cancellation_attorney` in `transaction_user_access`.
- Invite role shape mapping for bond/cancellation attorneys.
- Frontend service constants for bond/cancellation attorney invites.
- Email copy and labels for bond/cancellation attorney invites.
- Unified invite UI component reusable outside `NewTransactionWizard`.
- Post-accept organisation link/request/create flow.
- Bond originator branch/region/consultant selection during assignment or invite acceptance.
- Consultant-specific invite type.
- Buyer/seller/agent invite support in this partner invite engine.

### Risky / Needs Review

- UI accept page displays professional roles that backend invitation roles do not honor.
- Email-based RLS access can grant visibility before a formal accepted invite in some legacy paths.
- Partner prospect role `attorney` loses transfer/bond/cancellation specificity.
- Organisation create flow makes creator an owner immediately; it should not be called automatically from a transaction invite.
- `transaction_partner_invitations` and `transaction_user_access` role constraints lag behind the richer `transaction_role_players` role set.

## Recommended Follow-Up Phases

### Phase 1: Normalize Role Taxonomy

Update shared constants and database constraints so the invitation engine supports:

- `transfer_attorney`
- `bond_attorney`
- `cancellation_attorney`
- `bond_originator`
- `developer`
- `agent`
- `other`

Keep buyer/seller separate unless the product wants this engine to become a general participant invite engine.

Files/migrations to change later:

- New Supabase migration extending `transaction_partner_invitations.role_type`
- New Supabase migration extending `transaction_user_access.access_role`
- `src/services/transactionPartnerInvitationService.js`
- `supabase/functions/send-email/handlers/transactionPartnerInvitation.ts`
- `src/pages/TransactionPartnerInvitePage.jsx`
- `src/services/__tests__/transactionPartnerInvitationService.test.js`

### Phase 2: Reusable Invite UI Component

Extract the invite-new / existing / prospect picker logic from `NewTransactionWizard.jsx` into a reusable roleplayer invite component.

Use it in:

- `src/components/NewTransactionWizard.jsx`
- `src/pages/AttorneyTransactionDetail.jsx`
- `src/pages/UnitDetail.jsx`

### Phase 3: Attorney Invite Expansion

Wire Bond Attorney and Cancellation Attorney through:

- DB invite constraints
- Role shape mapping
- Participant role/legal role mapping
- Attorney assignment creation/update
- Email labels
- Transaction detail actions

Ensure accepted attorney users receive only the legal lane relevant to the invited role.

### Phase 4: Bond Originator Routing

When selecting or inviting a bond originator, support optional:

- Organisation
- Region
- Branch
- Consultant
- Default route from partner settings
- Workload-balanced fallback

Store this on roleplayer/participant assignment metadata and align with `bondAssignmentService`.

### Phase 5: Organisation Link / Claim Flow

After invite acceptance, show a guided path:

- Continue as individual for this transaction only.
- Request membership in a matching organisation.
- Create a new organisation profile.

Do not automatically make the invited person an organisation owner from transaction invite acceptance.

### Phase 6: RLS Hardening Review

Once partner invites are canonical, review whether email-based transaction access should remain for active roleplayers/participants, or whether accepted `transaction_user_access` should become the preferred path for external professionals.

## File Map For Future Work

Core invite service:

- `src/services/transactionPartnerInvitationService.js`
- `src/services/__tests__/transactionPartnerInvitationService.test.js`

Invite accept UI:

- `src/pages/TransactionPartnerInvitePage.jsx`
- `src/App.jsx`

Creation UI:

- `src/components/NewTransactionWizard.jsx`
- `src/pages/AttorneyTransactionDetail.jsx`
- `src/pages/UnitDetail.jsx`

Attorney assignment:

- `src/services/transactionAttorneyAssignments.js`

Bond assignment / hierarchy:

- `src/services/bondAssignmentService.js`
- `src/services/bondPartnerManagementService.js`
- `src/pages/bond/BondOrganisationPage.jsx`

Organisation and network:

- `src/services/organizationService.js`
- `src/services/partnerNetworkService.js`
- `src/pages/OrganizationWorkspacePage.jsx`
- `src/pages/settings/SettingsPreferredPartnersPage.jsx`
- `src/pages/settings/SettingsPartnerProspectsPage.jsx`

Email:

- `supabase/functions/send-email/index.ts`
- `supabase/functions/send-email/types.ts`
- `supabase/functions/send-email/handlers/transactionPartnerInvitation.ts`

Database:

- `supabase/migrations/202605270003_bridge9_transaction_support_tables.sql`
- `supabase/migrations/202605310003_transaction_propagation_rls_hardening.sql`
- `supabase/migrations/202606100008_transaction_partner_invitations_phase1.sql`
- `supabase/migrations/202606100009_partner_prospects_phase2.sql`
- `supabase/migrations/202606100010_organizations_membership_phase3.sql`
- `supabase/migrations/202606100011_partner_connections_phase4.sql`

