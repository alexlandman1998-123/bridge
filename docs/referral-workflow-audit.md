# Arch9 Referral & Collaboration Audit

Audit date: 2026-07-05

Scope: static codebase and schema inspection across the Arch9 repository. This is an audit only. No application code, migrations, models, routes or existing functionality were changed.

## Search Coverage

Inspected areas included frontend services, page components, settings modules, API routes, Supabase migrations, nested SQL files, edge functions, partner network code, agency/organisation modules, listing services, lead services, transaction services, bond services, attorney assignment services, CRM activity hooks, permission helpers, notification/email handlers and analytics/attribution services.

Keyword coverage included: assignment, assign, referral, refer, handover, introducing, selling_agent, listing_agent, buyer_agent, co_agent, collaboration, split, commission, ownership, routing, partner, preferred, assigned_to, assigned_by, lead_owner, transfer, delegate, reassign, queue, manual_assignment, override, relationship, partner_connection and preferred_partner.

## Executive Summary

Arch9 already has a strong foundation for assignment, partner routing, transaction role-player selection, partner invitations, partner visibility and bond/legal routing. There is also a newer lead referral ledger with internal, external Arch9 and external invite scopes, including referral client snapshots, agreement records, status events and referral commission tracking.

The main gap is not lack of capability. The gap is that referral and collaboration behavior is distributed across several overlapping domains:

- Lead assignment and SLA ownership live in `leadAssignmentService.js` and `lead_assignment_history`.
- Transaction and queue assignment live in the Phase 6 assignment engine tables and RPCs.
- Lead referrals live in `leadReferralService.js` and `the-it-guy/sql/20260704_lead_referrals.sql`.
- Organisation partner relationships live in both `organisation_partners` and `partner_connections`.
- Older partner referrals live in `partner_referrals`.
- Transaction partner invitations live in `transaction_partner_invitations` and newer canonical `invites`.
- Partner routing rules behave like referral routing, but do not produce referral ledger entries.
- Commission structures cover agent/agency payout and bond referral fees, but not a general multi-party collaboration split ledger.

Overall: Arch9 has a mature routing and assignment platform, but lacks a canonical Referral & Collaboration domain model that can unify internal referrals, external referrals, co-agent listing collaboration, partner routing attribution and commission sharing.

## Existing Functionality

### Internal Lead Assignment

Implementation exists and is functional.

Primary code:

- `the-it-guy/src/services/leadAssignmentService.js`
- `supabase/migrations/202606030006_lead_assignment_routing.sql`
- `the-it-guy/src/pages/AgentLeadsPage.jsx`

Core behavior:

- Leads can be assigned to agents or queues.
- Leads track `assigned_agent_id`, `assigned_user_id`, `assigned_agent_email`, `assigned_queue_id`, `assigned_at`, `first_contacted_at`, `sla_due_at` and `ownership_status`.
- Ownership statuses are `awaiting_assignment`, `assigned`, `contacted`, `working`, `dormant` and `escalated`.
- Assignment queues are `unassigned`, `sales`, `rentals`, `commercial` and `developments`.
- Assignment history is written to `lead_assignment_history`.
- CRM activity is created when assignment happens.
- SLA due dates and escalation detection are implemented.

Current assignment logic:

- Manual assignment to an agent.
- Manual assignment to a queue.
- Reassignment with previous owner/queue captured.
- Auto-assignment based on listing interest, private listing assigned agent and branch agent.
- Queue fallback if no direct agent can be resolved.

Current UI:

- `AgentLeadsPage.jsx` shows lead assignment metrics such as unassigned, assigned, overdue and escalated.
- The same page contains the lead/referral workspace tabs and assignment-aware lead loading.

Missing from this workflow:

- No true lead round-robin assignment was found.
- No territory routing was found for leads.
- No performance-based lead routing was found.
- No accepted/rejected assignment lifecycle for the receiving agent was found.
- Assignment permission logic exists in service code, but is not a dedicated assignment permission table.

### Transaction and Queue Assignment

Implementation exists for transaction-level work assignment.

Primary code and schema:

- `the-it-guy/src/services/assignmentEngineService.js`
- `the-it-guy/src/services/universalAssignmentService.js`
- `supabase/migrations/202606100013_assignment_engine_phase6.sql`

Existing tables:

- `work_queues`
- `assignment_rules`
- `work_queue_items`
- `assignment_events`

Current behavior:

- Queues can be created per organisation, branch and queue type.
- Queue types include transfer matters, bond matters, bond applications, developments, commercial matters and general work.
- Assignment rules support `round_robin`, `region_based`, `branch_based`, `manual_queue`, `manager_assignment` and `capacity_based`.
- Queue items can be assigned and completed through RPCs.
- Assignment events capture assignment, reassignment, completion and SLA warning events.
- Transaction assignment columns exist on `transactions`: assigned organisation, region, branch, user, timestamp and status.

Important caveat:

- This engine is transaction/work-queue focused. It is not currently the canonical engine for lead referrals, listing collaboration or commission-sharing workflows.

### Internal Agent Referrals

Partial implementation exists through the lead referral ledger.

Primary code and schema:

- `the-it-guy/src/services/leadReferralService.js`
- `the-it-guy/sql/20260704_lead_referrals.sql`
- `the-it-guy/src/pages/AgentLeadsPage.jsx`
- `the-it-guy/src/pages/ReferralInvitePage.jsx`
- Route: `/referrals/invite/:token` in `the-it-guy/src/App.jsx`

Supported recipient scopes:

- `internal`
- `external_arch9`
- `external_invite`

Supported statuses:

- `draft`
- `sent`
- `received`
- `accepted`
- `declined`
- `contacted`
- `working`
- `converted`
- `lost`
- `commission_due`
- `paid`
- `cancelled`

Current behavior:

- A user can create a referral from an existing lead/client.
- The referral can target an internal recipient, another Arch9 user/organisation, or an external email invite.
- Client details are snapshotted into `referral_clients`.
- Agreement text and commission split are snapshotted into `referral_agreements`.
- Status changes are tracked in `referral_status_events`.
- External invite tokens are tracked in `referral_invites`.
- Conversion and commission events are tracked in `referral_commission_events`.
- Accepted/declined invite responses are supported through RPCs.

Current UI:

- `AgentLeadsPage.jsx` contains referral tabs:
  - Referrals Received
  - Referrals Given
  - Referral Clients
  - Referral Partners
  - Referral Insights
- `ReferralInvitePage.jsx` allows invited recipients to review the referred client, commission split and agreement, then accept or decline.

Important caveats:

- The lead referral schema is under `the-it-guy/sql/20260704_lead_referrals.sql`, not the top-level `supabase/migrations` folder. Deployment state should be confirmed before relying on it as production schema.
- The referral ledger is not integrated with the assignment engine.
- Internal acceptance/rejection exists as referral status, but not as a first-class assignment handoff lifecycle.
- No dedicated lead referral email handler was found. The system can build invite links, but email delivery for lead referrals appears incomplete.

### External Referrals

Partial implementation exists.

Supported targets:

- Another Arch9 organisation or user through `external_arch9`.
- A non-user/manual contact through `external_invite`.
- External recipient email, company name and agent name are captured.
- Public token-based invite acceptance exists through `/referrals/invite/:token`.

Unsupported or unclear:

- Referrals to another agency are possible if represented as an Arch9 organisation, but not through a unified agency-to-agency referral workflow.
- External consultants and non-users are represented by invite/email metadata, but not as durable partner/contact entities unless another process creates them.
- No evidence was found that external lead referral invites send email automatically.
- External referrals are not connected to partner routing, partner connections or transaction partner invitations.

### Listing Collaboration

Partial implementation exists, but it is mostly sharing, not collaboration.

Primary code and schema:

- `the-it-guy/src/services/partnerListingSharingService.js`
- `the-it-guy/src/pages/AgentListings.jsx`
- `the-it-guy/src/pages/AgentListingDetail.jsx`
- `supabase/migrations/202606060003_bond_partner_profile_listings_phase3.sql`

Existing behavior:

- Partner listing sharing exists through `partner_shared_resources`.
- Listing resources can be shared with accepted partner relationships.
- Shareable resource types include listing, development, lead, application, campaign and report.
- Listing share/unshare RPCs exist:
  - `get_listing_partner_share_options_phase3`
  - `share_partner_listing_phase3`
  - `unshare_partner_listing_phase3`
- Listing ownership has `assigned_agent_id` and `created_by` concepts.
- The listing form has a `coAgents` field in `AgentListings.jsx`.
- `AgentListingDetail.jsx` displays a `coAgentSplit` value if present in captured commission data.

Not currently supported as a canonical workflow:

- Shared listing ownership.
- Co-listing as a structured table.
- Joint mandate participant records.
- Buyer-introducing agent records.
- Listing agent versus selling agent commission allocation.
- Co-agent acceptance/rejection.
- Multi-agent collaboration audit trail.

### Partner Routing

Implementation is strong and behaves like referral routing for partner work, but is not modeled as referrals.

Primary code and schema:

- `the-it-guy/src/services/partnerRoutingResolverService.js`
- `the-it-guy/src/services/universalPartnerRoutingService.js`
- `the-it-guy/src/services/partnerRoutingAdapterService.js`
- `the-it-guy/src/services/bondAssignmentService.js`
- `supabase/migrations/202606010001_partner_routing_rules_phase1.sql`
- `supabase/migrations/202606020001_partner_routing_rules_phase4.sql`

Supported routing targets:

- Bond originator.
- Transfer attorney.
- Bond attorney.
- Cancellation attorney.
- Developer/developer contact.
- Consultant/person-level assignment where partner people exist.

Current behavior:

- Routing rules resolve from user, agent, development, team, branch, region or organisation source scopes.
- Target scopes can include organisation, region, workspace unit and preferred user/person.
- Assignment modes include direct consultant, team queue, organisation queue, manual, fallback queue and round robin.
- Transaction overrides are honored before rule matching.
- Routing validates partner connections and service support.
- Routing can return direct assignments or partner organisation queues.
- Routing decisions can be adapted into transaction role-player selections, bond assignment payloads and attorney assignment payloads.
- Routing events are recorded through partner routing events and security audit events.

Why this is referral-like:

- A source agent/agency context routes work to a partner organisation or person.
- The routed work may generate downstream revenue or partner attribution.
- It has source, target, rule, status and audit characteristics.

Why it is not yet a referral system:

- No referral agreement is created.
- No accepted/rejected referral lifecycle is required.
- No referral fee or commission split is attached by default.
- Routing events are not connected to `lead_referrals` or `partner_referrals`.

### Lead Transfers and Ownership Reallocation

Partial implementation exists, mostly around offboarding and retained assets.

Primary code:

- `the-it-guy/src/services/agentTransferService.js`
- `the-it-guy/src/services/agentOffboardingService.js`
- `the-it-guy/src/services/leadAssignmentService.js`
- `the-it-guy/src/services/universalAssignmentService.js`

Current behavior:

- Lead reassignment is supported.
- Universal assignment has methods and events for reassignment and transfer.
- Agent transfer/offboarding logic can reassign retained business assets.
- Transfer membership transitions are audit-logged.

Important distinction:

- These workflows move ownership or responsibility. They are not modeled as referrals, do not preserve referral economics, and do not require receiving-agent acceptance.

### Commission and Revenue Sharing

Several commission capabilities exist, but not a unified collaboration split ledger.

Primary schema and code:

- `the-it-guy/sql/20260508_agency_commission_structures.sql`
- `the-it-guy/sql/20260508_transaction_commission_snapshot_columns.sql`
- `supabase/migrations/202606040003_bond_revenue_commission_management.sql`
- `the-it-guy/src/services/leadReferralService.js`
- `the-it-guy/src/pages/settings/SettingsCommissionStructuresPage.jsx`
- `the-it-guy/src/pages/Pipeline.jsx`

Existing capabilities:

- Organisation commission structures define listing commission and agent/agency split.
- User commission profiles can assign or override a commission structure per agent.
- `transaction_commissions` stores transaction-level commission snapshots.
- Transactions can store gross commission, agent split, agency split and calculated payout columns.
- Lead referrals store `commission_split_percentage`, `commission_split_basis`, gross commission amount, referral commission amount, commission due/paid status and payment reference.
- Bond revenue management includes `bond_commission_rules`, `bond_commissions`, `bond_referral_fees`, `bond_bonus_awards` and `bond_payouts`.

Missing:

- No general multi-party revenue allocation table.
- No first-class listing split.
- No selling-agent or introducing-agent payout split.
- No co-agent percentage allocation workflow.
- No canonical way to connect partner routing, lead referrals, transaction participants and transaction commissions.

### Audit Trail

Audit coverage is good, but spread across multiple systems.

Existing audit/log tables or streams:

- `lead_assignment_history`
- `assignment_events`
- `referral_status_events`
- `referral_commission_events`
- `security_audit_events`
- transaction partner invitation timestamps and action RPCs
- partner connection accepted/declined/blocked/removed timestamps
- bond payout `audit_trail`
- CRM lead activity records
- activity audit events in service code

Tracked today:

- Assignment timestamps.
- Previous and new assignee/queue for leads.
- Assignment source/reason.
- Referral sent/accepted/declined/converted/lost/paid style events.
- Invite accepted/declined/viewed/resent/expired timestamps for transaction partner invitations.
- Partner routing resolved events.
- Security audit events for sensitive routing/assignment actions.

Gaps:

- No single timeline across referral, assignment, partner invite, role-player and commission events.
- No canonical `accepted_by`/`rejected_by` fields for all referral-like workflows.
- Some audit events are local/in-memory service events before being mirrored to security audit, not always dedicated database rows.

### Notifications

Implementation exists for several adjacent flows, but referral notifications are incomplete.

Existing notification/email-adjacent functionality:

- `supabase/functions/send-email/handlers/transactionPartnerInvitation.ts`
- `supabase/functions/send-email/handlers/organisationPartnerInvitation.ts`
- `supabase/functions/send-email/handlers/leadPropertyShare.ts`
- `supabase/functions/send-email/handlers/bondOriginatorBuyerIntro.ts`
- `supabase/functions/send-email/handlers/transactionRoleplayerIntro.ts`
- `the-it-guy/src/services/appointmentNotificationService.js`
- `the-it-guy/src/services/clientPortalNotificationsService.js`
- `the-it-guy/src/services/bondIntakeNotificationService.js`

Current notification behavior:

- Transaction partner invitations send email.
- Organisation partner invitations send email.
- Bond intake and role-player introduction emails exist.
- Lead assignment creates CRM activity, functioning as an internal notification/activity signal.

Gaps:

- No dedicated lead referral invite email handler was found.
- No consistent notification contract for assignment accepted, assignment rejected, referral accepted, referral declined, reassignment or collaboration events.
- Notification delivery is not tied to a canonical referral/collaboration event bus.

## Partially Implemented Functionality

### Internal Lead Assignment

The foundation is production-shaped, but limited to manual/listing/branch/queue assignment. Round robin, territory and performance routing are represented elsewhere in the assignment engine, but not wired into lead assignment.

### Internal Referrals

The lead referral ledger can represent internal referrals, but it does not yet behave like a canonical handoff workflow across agents, branches and offices. It needs stronger permission handling, notification delivery and assignment/lead ownership integration.

### External Referrals

External invite tokens and acceptance exist, but external recipients are not consistently promoted into partner, contact or organisation records. Email delivery appears incomplete for lead referral invites.

### Listing Collaboration

Partner listing sharing exists. Co-agent and co-agent split data appear in UI/data snapshots, but there is no durable collaboration model for shared ownership, joint mandate participants or introducing-buyer roles.

### Commission Sharing

Lead referrals have referral commission splits. Organisation commissions have agent/agency splits. Bond has referral fees. These are separate models, not one commission-sharing engine.

### Partner Recommendations

Partner routing, preferred partners and partner service support strongly resemble recommendation/referral infrastructure, but recommendation outcomes are not captured as canonical referrals.

## Duplicate Functionality

### Partner Relationship Models

Potential duplicates:

- `organisation_partners`
- `partner_connections`
- `partner_invitations`
- `partner_prospects`
- `organisation_preferred_partners`

Issue:

- These tables all describe some form of partner relationship, invitation, preference or connection.
- `organisation_partners` is heavily used by partner profiles, visibility and shared resources.
- `partner_connections` is the newer directional connection model with accepted/declined/blocked/removed lifecycle.
- Preferred partner settings and routing rules add another preference layer.

Consolidation opportunity:

- Keep a canonical Partner Relationship aggregate and expose compatibility views/adapters for older modules.

### Referral Models

Potential duplicates:

- `lead_referrals`
- `partner_referrals`
- `transaction_partner_invitations`
- partner routing resolved events
- bond referral fees

Issue:

- `lead_referrals` is the richest referral model.
- `partner_referrals` is older organisation-to-organisation referral tracking tied to transactions.
- `transaction_partner_invitations` is invite/role-player access, not commercial referral, but overlaps with external partner referral flows.
- Bond referral fees capture economics but not a unified referral object.

Consolidation opportunity:

- Introduce a canonical Referral record with typed subject, typed source, typed target, lifecycle, economics and audit trail.

### Assignment Models

Potential duplicates:

- Lead assignment columns and `lead_assignment_history`.
- Transaction assignment columns.
- Work queues and assignment events.
- Universal assignment service local events.
- Bond application ownership history.
- Attorney assignment rows.

Issue:

- Each domain has assignment semantics and audit, but there is no shared assignment contract.

Consolidation opportunity:

- Keep domain-specific assignment tables where needed, but publish all assignment changes into a canonical assignment/referral activity stream.

### Invite Models

Potential duplicates:

- `referral_invites`
- `transaction_partner_invitations`
- `partner_invitations`
- canonical `invites`

Issue:

- Token, status, expiry, accept/decline and email semantics repeat across invite systems.

Consolidation opportunity:

- Use canonical `invites` for token lifecycle and let referral, partner and transaction modules own domain-specific payloads.

## Missing Functionality

### Internal Referrals

Missing or incomplete:

- Agent A to Agent B referral as a first-class flow with acceptance.
- Same-branch referral workflow.
- Cross-branch referral workflow.
- Cross-office referral workflow.
- Receiving agent acceptance/rejection with reason.
- Manager approval for cross-branch or cross-office referrals.
- Automatic lead ownership transfer on referral acceptance.
- SLA handoff between referrer and recipient.
- Internal referral notifications.

### Listing Collaboration

Missing:

- Co-listing table.
- Shared listing ownership lifecycle.
- Joint mandate participants.
- Buyer-introducing agent.
- Selling agent versus listing agent split.
- Collaboration agreement and acceptance.
- Listing collaboration activity trail.
- Collaboration-specific permissions.

### External Referrals

Missing:

- Full agency-to-agency referral workflow.
- Durable external consultant/contact model for accepted external referrals.
- Referral agreement signature/approval.
- Email notification handler for lead referral invites.
- Partner network connection creation from accepted referral.
- External referral compliance/consent fields.

### Commission Sharing

Missing:

- General commission allocation table.
- Referral fee payable workflow outside lead referrals and bond fees.
- Multi-party percentage allocation.
- Listing split and selling split.
- Introducing agent attribution.
- Revenue attribution that flows from lead referral to transaction commission.
- Approval workflow for commission split changes.

### Audit Trail

Missing:

- Unified referral/collaboration timeline.
- Canonical comments on referral/assignment acceptance and rejection.
- Consistent `accepted_by`, `rejected_by`, `approved_by` and `cancelled_by` fields across all flows.
- Immutable event stream for referral and collaboration events.

### Notifications

Missing:

- Lead referral sent email.
- Internal referral assignment notification.
- Referral accepted/declined notification.
- Referral conversion notification.
- Commission due/paid notification.
- Listing collaboration invitation notification.
- Reassignment/handover notification.

## Technical Debt

- Referral-adjacent concepts are spread across lead, transaction, partner, bond, attorney, listing and settings modules.
- The richest lead referral schema is stored under `the-it-guy/sql`, while most production migrations are under top-level `supabase/migrations`; deployment status is ambiguous.
- Partner relationship concepts are split between legacy `organisation_partners` and newer `partner_connections`.
- Invite semantics are repeated in referral invites, partner invitations, transaction partner invitations and canonical invites.
- Assignment events are split between lead assignment history, queue assignment events, bond application ownership history, attorney assignments and local universal assignment events.
- Lead assignment has explicit service-level permission logic, while other domains rely on a mix of RLS, permission keys and UI checks.
- Notification behavior is inconsistent: transaction partner invites send email, lead assignments create CRM activity, lead referrals build links but do not appear to send email.
- Commission logic is fragmented between agency commission structures, transaction commission snapshots, lead referral commission events and bond referral fees.
- UI surfaces expose referral/collaboration fragments in several modules without a central Referral & Collaboration workspace.

## Database Audit

| Table | Purpose | Relationships | Indexes | RLS | Used by | Duplicate or unused risk |
| --- | --- | --- | --- | --- | --- | --- |
| `leads` | Lead ownership and assignment target | Agent/user, queue, branch/listing context | Assignment owner, SLA and assigned-at indexes from lead assignment migration | Existing lead RLS plus assignment columns | `leadAssignmentService.js`, `AgentLeadsPage.jsx` | Assignment columns are lead-specific, separate from work queues |
| `lead_assignment_history` | Audit trail for lead assignment/reassignment | Lead, organisation, previous/new agent, previous/new queue, assigned_by | Lead/org indexes | Active organisation member policies | `leadAssignmentService.js` | Not connected to universal assignment events |
| `lead_referrals` | Rich referral ledger for buyer/seller lead referrals | Source org/lead/agent, target org/agent/email, transaction/deal conversion | Source org, target org, source lead, invite token, target email, commission status, follow-up | Source/target member and agent/email policies | `leadReferralService.js`, `AgentLeadsPage.jsx`, `ReferralInvitePage.jsx` | Overlaps with `partner_referrals`; schema location suggests deployment ambiguity |
| `referral_clients` | Client snapshot for a referral | Child of `lead_referrals` | Referral index | Parent referral policies | `leadReferralService.js` | Snapshot can drift from CRM/contact records |
| `referral_agreements` | Agreement and commission split snapshot | Child of `lead_referrals` | Referral index | Parent referral policies | `leadReferralService.js`, invite page | Separate from commission structures |
| `referral_status_events` | Referral lifecycle events | Child of `lead_referrals` | Referral/status indexes | Parent referral policies | `leadReferralService.js` | Not merged into universal activity timeline |
| `referral_invites` | Referral token acceptance lifecycle | Child of `lead_referrals` | Token unique, referral index | Parent referral policies plus token RPCs | `ReferralInvitePage.jsx`, referral RPCs | Overlaps with canonical `invites` and transaction partner invites |
| `referral_commission_events` | Referral commission due/paid/conversion events | Child of `lead_referrals` | Referral/status indexes | Parent referral policies | `leadReferralService.js` | Separate from transaction commission ledger |
| `work_queues` | Transaction/work queue configuration | Organisation, optional branch | Unique active org/branch/type, org status | Phase 6 queue RLS/functions | `assignmentEngineService.js` | Not wired into lead referral/lead assignment |
| `assignment_rules` | Queue assignment rules | Organisation, branch, queue | Queue and organisation active/priority indexes | Phase 6 queue RLS/functions | `assignmentEngineService.js` | Rule types overlap with partner routing rules |
| `work_queue_items` | Items awaiting/assigned/completed in queues | Transaction, role player, queue, assigned user | Transaction/queue/role unique, queue status, user, scope | Phase 6 queue RLS/functions | `assignmentEngineService.js` | Transaction-specific, not lead referral-specific |
| `assignment_events` | Queue assignment event history | Transaction, queue item, queue, assigned/previous user | Transaction, queue, user indexes | Phase 6 queue RLS/functions | `assignmentEngineService.js` | Separate from lead assignment and referral event histories |
| `partner_routing_rules` | Preferred partner/person routing rules | Source org/scope/user/context to target org/scope/user | Scope/priority indexes in routing migrations | Org admin write, scoped read | `partnerRoutingResolverService.js`, settings pages | Referral-like routing without referral ledger |
| `organisation_partners` | Legacy/scoped partner relationship | Organisation pair, relationship status/type/visibility | Pair unique, org status, partner status, later scope indexes | Connected org policies | Partner profile, sharing, attribution, invitations | Overlaps with `partner_connections` |
| `partner_connections` | New directional partner connection model | Source org, target org, relationship type, lifecycle actor/timestamps | Directional pair unique, source/target status | Bridge RPC controlled access | `partnerNetworkService.js`, routing validation | Overlaps with `organisation_partners` |
| `partner_invitations` | Organisation partner invite tokens | Sending org, recipient email/org, token/status | Token and org/email indexes | Org scoped policies | `partnersRepository.js`, email handler | Overlaps with canonical `invites` |
| `partner_referrals` | Older organisation-to-organisation transaction referral | Referring org, referred org, transaction, relationship | Referring/referred/status/date, transaction, relationship | Related org policies | Partner profile/application/revenue summaries | Overlaps with `lead_referrals` |
| `organisation_preferred_partners` | Preferred partner settings | Organisation, partner org, service/role context | Settings indexes | Settings RLS | `settingsApi.js`, preferred partner UI | Preference overlaps with routing rules and partner connection preference flags |
| `partner_shared_resources` | Shares listings/developments/leads/applications/campaigns/reports with partners | `organisation_partners`, resource id/type, shared_by | Relationship/resource indexes and unique resource per relationship | Related org select; listing owner/admin manage | `partnerListingSharingService.js`, partner profile pages | Sharing is not collaboration ownership |
| `transaction_partner_invitations` | Invites external partner contacts into transaction role-player context | Transaction, role type, prospect, token, invited/accepted users | Transaction/status, email/status, expiry | Scoped transaction/org policies and RPCs | `transactionPartnerInvitationService.js`, invite page, wizard/detail UI | Overlaps with referral external invites and canonical invites |
| `transaction_user_access` | Grants transaction access from partner invite | Transaction, user, invitation | Transaction/user indexes | Transaction scoped policies | Transaction partner invite acceptance | Access-only, not referral/collaboration economics |
| `transaction_role_players` | Canonical transaction role-player selections | Transaction, role, organisation/user, partner invite | Role/transaction indexes across migrations | Transaction/member policies | Partner routing, invitations, attorney/bond assignment | Carries roles, not commission allocations |
| `transaction_participants` | Transaction participant access/role records | Transaction, user/email/org, assignment source | Transaction/role indexes across migrations | Transaction/member policies | Invites, participant views, role normalization | Overlaps role concepts with role players |
| `transactions` | Transaction assignment, referral source and commission snapshot columns | Organisation, assigned org/branch/user, partner orgs, commission fields | Assignment scope index and many transaction indexes | Transaction scoped policies | Pipeline, transaction services, assignment engine | Assignment/commission fields are snapshots, not a full ledger |
| `transaction_attorney_assignments` | Transfer/bond/cancellation attorney assignment records | Transaction, firm, contact, attorney/assigned users | Transaction/legal role indexes | Permission/RLS policies | `transactionAttorneyAssignments.js`, `AttorneyAssignmentSection.jsx` | Role assignment, not referral |
| `transaction_bond_applications` | Bond application assignment and routing state | Transaction, consultant/branch/region/rule | Application/routing indexes | Bond workspace policies | Bond application assignment/routing services | Separate assignment history |
| `bond_application_ownership_history` | Bond application ownership audit | Application, previous/new owner, actor | Application/owner indexes | Bond scoped policies | `bondApplicationAssignmentService.js` | Separate from universal assignment events |
| `organisation_commission_structures` | Agency listing commission and agent/agency split settings | Organisation | Organisation active/default, org/name unique | Org member select, admin write | Settings commission page, pipeline commission fallback | Does not model multi-agent splits |
| `organisation_user_commission_profiles` | Per-agent commission profile/override | Organisation user/user/email, commission structure | User/org indexes | Admin write, self/admin select | Settings commission page | Agent/agency split only |
| `transaction_commissions` | Transaction-level commission snapshot | Transaction, organisation, assigned agent | Org/status, org/agent, org/agent-email | Org admin or assigned agent access | Pipeline/API/principal dashboard | One assigned agent, not multiple collaborator allocations |
| `bond_commission_rules` | Bond commission rule configuration | Organisation, applies-to target | Organisation/name/applies unique | Member/admin policies | Bond commission services | Bond-specific |
| `bond_referral_fees` | Bond partner referral fee records | Organisation, application, partner | Organisation/partner/status | Member modify/select policies | Bond revenue services | Economics without general referral record |
| `bond_payouts` | Bond payout workflow and audit trail | Organisation, payee, branch/region | Organisation/payee/status | Member/admin policies | Bond revenue management | Bond-specific payout ledger |
| `attribution_events` | Partner/listing/campaign attribution tracking | Organisation partner relationship, listing/campaign/application | Attribution summary indexes | Related org policies | Partner attribution service | Attribution is not linked to lead referral ledger |
| `application_attribution` | Bond/application attribution summary | Relationship/application/listing/campaign | Relationship/application indexes | Related org policies | Partner attribution service | Parallel revenue attribution model |
| `partner_revenue_attribution` | Partner revenue attribution | Relationship, transaction/application/listing | Relationship/revenue indexes | Related org policies | Partner attribution service | Could feed referral module but currently separate |
| `security_audit_events` | Security and sensitive action audit log | Actor, organisation, action/resource metadata | Actor/org/action/time indexes | Admin/read scoped policies | Audit services, routing/assignment services | Generic but not referral-specific |

## API, Service and Function Audit

### Frontend Services

- `leadAssignmentService.js`: lead assignment, queue assignment, reassignment, auto assignment, SLA status, assignment history, metrics and escalation.
- `assignmentEngineService.js`: work queue dashboard, queue creation, assignment rule upsert, queue item assignment and completion.
- `universalAssignmentService.js`: local/evented universal assignment methods for create, reassign, transfer, remove, return to queue, accept and decline.
- `leadReferralService.js`: referral creation, listing, invite lookup/response, conversion, paid commission, follow-up, lost and status updates.
- `partnerRoutingResolverService.js`: partner routing decision engine.
- `partnerRoutingAdapterService.js`: converts routing decisions into transaction role-player, bond and attorney assignment payloads.
- `partnerNetworkService.js`: partner connection list/search/request/review/preferred/remove.
- `partnersRepository.js`: legacy partner relationships, partner invitations and partner referrals snapshot.
- `partnerListingSharingService.js`: listing share options, share and unshare.
- `transactionPartnerInvitationService.js`: create/list/resend/expire/record transaction partner invitations and send email.
- `transactionAttorneyAssignments.js`: create, update, remove and list attorney assignments.
- `bondAssignmentService.js`: bond workspace, region, unit, consultant, processor, manager and compliance assignments.
- `bondApplicationAssignmentService.js`: bond application ownership, auto assignment, reassignment, preview and history.
- `bondCommissionRulesService.js`, `bondRevenueCommissionService.js`, `bondRevenueManagementService.js`: bond commission/referral fee/payout management.
- `partnerAttributionService.js`: attribution events, campaign/listing/application/revenue summaries.

### Supabase RPCs and Database Functions

Lead referrals:

- `bridge_lookup_referral_invite_by_token`
- `bridge_respond_referral_invite`

Assignment engine:

- `bridge_phase6_create_queue`
- `bridge_phase6_upsert_assignment_rule`
- `bridge_phase6_assign_queue_item`
- `bridge_phase6_complete_queue_item`
- `bridge_phase6_list_queue_dashboard`

Partner listing sharing:

- `get_listing_partner_share_options_phase3`
- `share_partner_listing_phase3`
- `unshare_partner_listing_phase3`

Partner connections:

- `bridge_phase4_list_partner_connections`
- Phase 4 request/review/preferred/remove partner connection functions.

Transaction partner invitations:

- Lookup/respond invitation RPCs from `202606100008_transaction_partner_invitations_phase1.sql`
- Acceptance RPCs from `202606260001_transaction_partner_invite_acceptance_phase2.sql`
- Resend RPCs from `202606260002_transaction_partner_invite_resend_phase3.sql`
- Action/audit RPC from `202606260003_transaction_partner_invite_audit_phase5.sql`
- `bridge_expire_stale_transaction_partner_invitations`

Partner attribution:

- `track_partner_attribution_event_phase6`
- `get_partner_attribution_summary_phase6`
- `get_partner_revenue_summary_phase6`
- `get_campaign_performance_phase6`
- `get_listing_attribution_phase6`

### Edge Functions and Email Handlers

Relevant handlers under `supabase/functions/send-email/handlers`:

- `transactionPartnerInvitation.ts`
- `organisationPartnerInvitation.ts`
- `leadPropertyShare.ts`
- `bondOriginatorBuyerIntro.ts`
- `transactionRoleplayerIntro.ts`
- `bondIntakeNotification.ts`

No dedicated lead referral invite email handler was found.

### REST API Routes

No first-class REST API routes were found for referral or assignment workflows. Relevant frontend code primarily talks to Supabase tables/RPCs and edge email functions.

Existing API files are unrelated or indirect:

- `the-it-guy/api/admin/demo-enquiries.js`
- `the-it-guy/api/admin/mobile-dashboard.js`
- `the-it-guy/api/hq/mission-control.js`
- `the-it-guy/api/public/demo-enquiries.js`
- `the-it-guy/api/public/listings.js`

## UI Audit

### Lead and Referral UI

- `the-it-guy/src/pages/AgentLeadsPage.jsx`
  - Lead assignment metrics.
  - Referral tabs for received/given/clients/partners/insights.
  - Referral creation form.
  - Referral finance actions for conversion and paid commission.
  - Referral operations actions for follow-up and lost status.
- `the-it-guy/src/pages/ReferralInvitePage.jsx`
  - Public token invite review.
  - Accept/decline actions.
- `the-it-guy/src/App.jsx`
  - Route `/referrals/invite/:token`.

### Listing UI

- `the-it-guy/src/pages/AgentListings.jsx`
  - Listing create/edit.
  - `coAgents` field.
  - Partner listing share UI.
- `the-it-guy/src/pages/AgentListingDetail.jsx`
  - Commission split display.
  - Co-agent split display where captured.

### Partner Network and Routing UI

- `the-it-guy/src/pages/settings/SettingsPartnerRoutingRulesPage.jsx`
  - Partner routing rule management.
- `the-it-guy/src/pages/settings/SettingsPreferredPartnersPage.jsx`
  - Preferred partner configuration.
- `the-it-guy/src/pages/settings/SettingsPartnerVisibilityPage.jsx`
  - Partner visibility controls.
- `the-it-guy/src/pages/BondPartnerProfilePage.jsx`
  - Partner profile, shared listings/applications and partner context.
- Partner network screens and repository-backed snapshots use `organisation_partners`, `partner_invitations` and `partner_referrals`.

### Transaction and Partner Invitation UI

- `the-it-guy/src/pages/TransactionPartnerInvitePage.jsx`
  - Public transaction partner invitation acceptance.
- `the-it-guy/src/pages/AttorneyTransactionDetail.jsx`
  - Transaction partner invitation creation/resend.
  - Attorney assignment sections.
- `the-it-guy/src/pages/NewTransactionWizard.jsx`
  - Transaction partner invitation creation from wizard flow.
- `the-it-guy/src/components/attorney/assignments/AttorneyAssignmentSection.jsx`
  - Transfer, bond and cancellation attorney assignment UI.

### Commission UI

- `the-it-guy/src/pages/settings/SettingsCommissionStructuresPage.jsx`
  - Organisation commission structures.
  - Agent commission profile assignments.
- `the-it-guy/src/pages/Pipeline.jsx`
  - Commission snapshot/fallback behavior in deal pipeline.

### Bond UI

- Bond assignment and application ownership are surfaced through bond pages and services, including consultant/processor/manager/compliance assignment concepts.

### Mobile, CRM and Analytics Surfaces

- `the-it-guy/api/admin/mobile-dashboard.js` exists, but no dedicated mobile referral or collaboration workflow was found there.
- CRM activity is used as an internal signal for lead assignment events.
- Partner attribution and revenue analytics exist through partner attribution services and Phase 6 attribution migrations, but they are not connected to the lead referral ledger.

Screenshots were not captured during this static audit. The paths above identify the UI surfaces touching referral, assignment, collaboration or commission behavior.

## Workflow Findings

### 1. Internal Lead Assignment

Current implementation:

- Implemented through `leadAssignmentService.js`.
- Supports manual assignment, queue assignment, reassignment and simple auto assignment.
- Records assignment history and CRM activity.
- Tracks SLA due dates and escalation.

Database tables:

- `leads`
- `lead_assignment_history`

Statuses:

- `awaiting_assignment`
- `assigned`
- `contacted`
- `working`
- `dormant`
- `escalated`

APIs/services:

- `assignLeadToAgent`
- `assignLeadToQueue`
- `reassignLead`
- `autoAssignLead`
- `assignLead`
- `markLeadFirstContacted`
- `listLeadAssignmentHistory`
- `listLeadAssignmentMetrics`
- `identifyEscalatedLeads`
- `flagEscalatedLeads`

UI:

- `AgentLeadsPage.jsx`

Missing pieces:

- True round robin.
- Territory routing.
- Performance routing.
- Receiving-agent accept/reject.
- Unified assignment event stream across all domains.

### 2. Internal Agent Referrals

Current implementation:

- Partially supported through `lead_referrals` with `recipient_scope = internal`.
- Referral ledger supports client, agreement, status and commission event records.

Database tables:

- `lead_referrals`
- `referral_clients`
- `referral_agreements`
- `referral_status_events`
- `referral_invites`
- `referral_commission_events`

UI:

- `AgentLeadsPage.jsx`
- `ReferralInvitePage.jsx` for token invites.

Missing pieces:

- No explicit same-branch/cross-branch/cross-office policy model.
- No automatic branch manager/principal approval.
- No automatic handoff into lead assignment on acceptance.
- No clear notification/email path for internal referral events.

### 3. Listing Collaboration

Current implementation:

- Partner listing sharing exists.
- Co-agent data appears as a UI input/display concept.
- Transaction participant roles include `listing_agent` and `selling_agent`.

Database tables:

- `private_listings`
- `partner_shared_resources`
- `transaction_role_players`
- `transaction_participants`

UI:

- `AgentListings.jsx`
- `AgentListingDetail.jsx`
- `BondPartnerProfilePage.jsx`

Missing pieces:

- No co-listing table.
- No shared ownership.
- No joint mandate participant workflow.
- No introducing buyer workflow.
- No listing collaboration commission allocation.

### 4. External Referrals

Current implementation:

- External referral invite support exists in `leadReferralService.js`.
- Public invite response page exists.
- External Arch9 recipient lookup exists.

Database tables:

- `lead_referrals`
- `referral_invites`
- `referral_status_events`

UI:

- `AgentLeadsPage.jsx`
- `ReferralInvitePage.jsx`

Missing pieces:

- No dedicated lead referral email send handler.
- No conversion of external accepted recipient into partner/contact/organisation relationship.
- No unified external referral approval/compliance workflow.

### 5. Partner Routing

Current implementation:

- Mature routing rules and resolver exist.
- Routing covers bond originators, transfer attorneys, bond attorneys, cancellation attorneys, conveyancers/developer contacts and partner recommendations.
- Routing behaves like work referral but is modeled as assignment/routing.

Database tables:

- `partner_routing_rules`
- `partner_connections`
- `organisation_partners`
- `transaction_role_players`
- `transaction_participants`

UI:

- Settings partner routing and preferred partner pages.
- Transaction/bond/attorney assignment screens.

Missing pieces:

- No referral agreement.
- No acceptance lifecycle for every routed partner.
- No referral fee linkage by default.
- No canonical referral record created from partner routing.

### 6. Lead Transfers

Current implementation:

- Lead reassignment exists.
- Agent transfer/offboarding can reassign retained business assets.
- Universal assignment has transfer/reassignment methods.

Database tables:

- `leads`
- `lead_assignment_history`
- domain asset tables touched by offboarding/transfer services

Missing pieces:

- No referral-preserving transfer mode.
- No recipient accept/reject.
- No canonical handover comment/approval flow.

### 7. Commission Splits

Current implementation:

- Agent/agency commission structures exist.
- Transaction commission snapshots exist.
- Lead referral commission split and referral commission events exist.
- Bond referral fees and payout workflow exist.

Database tables:

- `organisation_commission_structures`
- `organisation_user_commission_profiles`
- `transaction_commissions`
- `lead_referrals`
- `referral_commission_events`
- `bond_referral_fees`
- `bond_payouts`

Missing pieces:

- No universal commission allocation table.
- No listing split.
- No selling-agent/introducing-agent payout split.
- No co-agent percentage workflow.
- No cross-module link from referral to transaction payout ledger.

### 8. Audit Trail

Current implementation:

- Strong but fragmented audit.
- Assignment, referral, invite, routing and security audit systems all exist.

Database tables:

- `lead_assignment_history`
- `assignment_events`
- `referral_status_events`
- `referral_commission_events`
- `security_audit_events`
- transaction partner invitation fields and action logs

Missing pieces:

- Unified referral/collaboration timeline.
- Consistent comments and approval fields.
- One immutable activity stream for all referral-like activity.

### 9. Notifications

Current implementation:

- Partner invitation email exists.
- Transaction partner invitation email exists.
- Lead assignment activity exists as CRM activity.
- Bond and transaction role-player intro email handlers exist.

Missing pieces:

- Lead referral sent email.
- Internal referral notifications.
- Accept/reject/reassign/collaboration notification contract.
- Commission due/paid notifications for referrals.

### 10. Permissions

Current implementation:

- Lead assignment service permits owner/principal/admin/admin staff/branch manager/manager/team lead/developer/platform admin and the assigned owner in some cases.
- Queue assignment uses Phase 6 queue access and management functions.
- Partner routing rules are organisation admin controlled.
- Partner connection review/preference is organisation scoped.
- Commission structures are organisation admin controlled.
- Attorney assignment UI uses permission keys such as create/update/remove attorney assignments.
- Referral RLS allows source/target organisation members and source/target agents/emails.

Permission matrix:

| Action | Principal | Branch Manager | Team Lead | Agent | Assistant | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| Assign lead | Yes | Yes | Yes | Limited | No clear global right | Service-level role gate in `leadAssignmentService.js` |
| Reassign lead | Yes | Yes | Yes | Own/assigned context only | No clear global right | History recorded |
| Transfer retained assets | Yes/admin-style | Likely limited | No clear right | No | No | Offboarding/transfer workflow |
| Create internal referral | Likely yes | Likely yes | Likely yes | Yes if source member/agent | Unclear | Referral RLS is broad source/target membership based |
| Accept referral | Target agent/member or token recipient | Target context | Target context | Yes if recipient | Token only if external | Needs explicit role policy |
| Reject referral | Target agent/member or token recipient | Target context | Target context | Yes if recipient | Token only if external | Needs explicit role policy |
| Configure partner routing | Yes | Possibly if org admin | No unless admin | No | No | Settings/RLS admin oriented |
| Invite transaction partner | Managers/admins and permitted transaction users | Yes where permission granted | Possibly | Possibly transaction-specific | Unclear | UI/service permission checks vary |
| Assign attorney | Yes | Yes where permission granted | Possibly | Limited | No clear right | Permission keys drive UI |
| Configure commission structures | Yes/admin | Possibly if admin | No | No | No | Org admin write policies |
| Configure referral commission split | Referral creator/source member | Referral creator/source member | Referral creator/source member | Yes in current referral UI | Unclear | Needs explicit approval governance |

## Recommended Architecture

### 1. Canonical Referral Aggregate

Create a future canonical `referrals` model that can represent:

- Lead referral.
- Listing collaboration referral.
- Buyer introduction.
- Seller introduction.
- Transaction partner referral.
- Bond/legal partner referral.
- External consultant/non-user referral.

Suggested fields:

- `id`
- `organisation_id`
- `source_type` and `source_id`
- `source_agent_id`
- `target_type` and `target_id`
- `target_email`
- `target_organisation_id`
- `subject_type` and `subject_id`
- `status`
- `recipient_scope`
- `routing_source`
- `assignment_id`
- `agreement_id`
- `commission_allocation_id`
- `created_by`
- `accepted_by`, `accepted_at`
- `declined_by`, `declined_at`, `decline_reason`
- `approved_by`, `approved_at`
- `cancelled_by`, `cancelled_at`
- `metadata`

Recommended statuses:

- `draft`
- `sent`
- `received`
- `accepted`
- `declined`
- `assigned`
- `working`
- `converted`
- `lost`
- `cancelled`
- `commission_due`
- `paid`

### 2. Canonical Referral Participants

Create a participant model rather than overloading source/target columns.

Participant roles:

- Referrer.
- Recipient.
- Lead owner.
- Listing agent.
- Selling agent.
- Introducing agent.
- Co-agent.
- Partner organisation.
- External contact.
- Approver.

This would allow same-branch, cross-branch, cross-office and external referrals without special-case tables.

### 3. Canonical Collaboration Agreement

Unify referral agreements, co-listing agreements and partner collaboration agreements.

Agreement fields:

- Scope.
- Terms.
- Commission basis.
- Effective date.
- Accepted parties.
- Version.
- Document/signature references.

### 4. Commission Allocation Ledger

Introduce a general commission allocation model for any transaction, listing, referral or bond application.

Allocation roles:

- Agency.
- Listing agent.
- Selling agent.
- Introducing agent.
- Referral partner.
- Bond partner.
- Attorney/conveyancer partner where applicable.
- Branch/region/office.

Allocation fields:

- Basis: gross commission, net commission, fixed fee, bond fee, referral fee.
- Percentage.
- Amount.
- Currency.
- Status: projected, approved, due, paid, disputed, waived.
- Approval trail.

This should not replace existing commission tables immediately. It should become the canonical ledger, with adapters from existing transaction/referral/bond records.

### 5. Assignment and Referral Event Stream

Publish all referral-like and assignment-like events into one immutable event stream.

Event types:

- `referral.created`
- `referral.sent`
- `referral.accepted`
- `referral.declined`
- `referral.assigned`
- `referral.converted`
- `referral.lost`
- `assignment.created`
- `assignment.reassigned`
- `assignment.transferred`
- `collaboration.invited`
- `collaboration.accepted`
- `commission.due`
- `commission.paid`

This stream can sit beside `security_audit_events`, not replace it.

### 6. Canonical Invite Contract

Use canonical `invites` for token lifecycle and email delivery.

Domain modules should attach:

- `invite_type`
- `subject_type`
- `subject_id`
- `recipient_role`
- `payload`

Then referral invites, partner invites and transaction partner invites can share expiration, resend, acceptance and audit behavior.

### 7. Adapter-First Migration Path

Recommended consolidation path:

1. Keep existing tables and services stable.
2. Add read adapters that map current referral/assignment/partner invite records into canonical DTOs.
3. Add event publishing from existing services.
4. Introduce new canonical tables behind feature flags.
5. Backfill canonical records from `lead_referrals`, `partner_referrals`, `transaction_partner_invitations`, `partner_routing_rules` decisions and `lead_assignment_history`.
6. Move UI to canonical queries while keeping legacy write paths.
7. Only later consolidate duplicate tables.

## Maturity Assessment

## Referral System Score

Lead Assignment: 8/10

Partner Routing: 9/10

Internal Referrals: 5/10

External Referrals: 5/10

Commission Sharing: 4/10

Listing Collaboration: 3/10

Audit Trail: 8/10

Notifications: 6/10

Permissions: 7/10

Overall: Arch9 has a strong assignment, routing, partner network and audit foundation. The platform now has enough pieces to build a canonical Referral & Collaboration module, but those pieces are fragmented across lead assignment, lead referrals, partner routing, partner invitations, transaction role players, bond revenue and commission settings. The recommended next step is consolidation through adapters and event publishing, not immediate replacement of the existing domain models.
