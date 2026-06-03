# Phase 1 Lead System Stabilisation Notes

## Current Lead Implementation Found

### Existing tables

- `contacts`: `contact_id`, `organisation_id`, `assigned_agent_id`, `first_name`, `last_name`, `phone`, `email`, `contact_type`, `notes`, `created_at`, `updated_at`.
- `leads`: `lead_id`, `organisation_id`, `branch_id`, `assigned_user_id`, `created_by`, `assigned_agent_id`, `contact_id`, `lead_category`, `lead_direction`, `lead_source`, `stage`, `status`, `priority`, `budget`, `area_interest`, `property_interest`, `seller_property_address`, `estimated_value`, `listing_id`, `mandate_packet_id`, `seller_onboarding_token`, `seller_onboarding_status`, `converted_transaction_id`, `converted_at`, `notes`, timestamps.
- `lead_activities`: `activity_id`, `organisation_id`, `lead_id`, `agent_id`, `activity_type`, `activity_note`, `activity_date`, `outcome`, `created_at`.
- `tasks`: `task_id`, `organisation_id`, `lead_id`, `assigned_agent_id`, `title`, `description`, `due_date`, `status`, `priority`, timestamps.
- `appointments`: supports nullable `lead_id`, `contact_id`, `listing_id`, and `transaction_id`.
- `offers`: supports buyer lead/contact/listing/viewing/transaction links.
- `transactions`: supports `originating_buyer_lead_id`, `buyer_contact_id`, `seller_contact_id`, `listing_id`, and `converted_transaction_id` from leads.

### Existing service functions reused

- `listAgencyCrmLeadContacts`
- `fetchAgencyCrmLeadWorkspace`
- `createAgencyCrmLeadActivity`
- `createAgencyCrmLeadTask`
- `listAppointmentsAsync`
- `listCanonicalOffersForLead`

### Lead stages/statuses found

Source of truth in code is `LEAD_STAGES` from `agencyPipelineService`, plus buyer lifecycle stages from `buyerLifecycleService`.

Active canonical values include:

- `New Lead`
- `Contacted`
- `Qualified`
- `Viewing Scheduled`
- `Viewing Completed`
- `Offer Draft`
- `Offer Submitted`
- `Negotiating`
- `Offer Accepted`
- `Onboarding`
- `Finance`
- `Transfer`
- `Registered`
- `Lost`
- `Onboarding Sent`
- `Onboarding Completed`
- `Appointment Scheduled`
- `Appointment Completed`
- `Mandate Ready`
- `Mandate Generated`
- `Mandate Sent`
- `Mandate Signed`
- `Converted To Listing`
- `Converted to Transaction`
- `Deal Created`
- `Registered / Closed`
- `Nurture / Follow-up Later`

Legacy/local/demo-compatible values found:

- `Lead`
- `Deal Created`
- Mixed case variants around `Converted To Listing` and `Converted to Transaction`.

Conversion triggers today:

- Existing accepted-offer flow can create a transaction and update lead state.
- Existing transaction wizard can create private/developer transactions.
- Existing seller onboarding/listing flows update seller lead stages.
- Phase 1 did not add or change any conversion trigger.

### Lead sources found

Source option function values:

- Inbound buyer: `Property24`, `Private Property`, `Website`, `Facebook Ads`, `Google Ads`, `Referral`, `Walk-in`, `WhatsApp Enquiry`, `Listing Call`, `Signboard`, `Organic Social Media`, `Other`.
- Inbound seller: `Referral`, `Website Valuation Request`, `Facebook Lead Form`, `List My Property Form`, `Walk-in`, `Signboard Call`, `Existing Database`, `Repeat Client`, `WhatsApp Enquiry`, `Other`.
- Outbound buyer: `Old Buyer Database Call`, `Investor Prospecting`, `Database Reactivation`, `Rental Database Outreach`, `WhatsApp Outreach`, `Email Nurturing`, `Buyer Qualification Campaign`, `Previous Enquiry Follow-up`, `Other`.
- Outbound seller: `Cold Call`, `Door Knock`, `Farming`, `Expired Listing`, `Area Prospecting`, `Valuation Campaign`, `Just Sold Campaign`, `Circle Prospecting`, `Referral Follow-up`, `Existing Owner Database`, `Other`.

Quick Create values:

- `Property24`
- `Private Property`
- `Website`
- `Referral`
- `Walk-In`
- `WhatsApp`
- `Facebook`
- `Google`
- `Signboard`
- `Listing Call`
- `Cold Call`
- `Door Knock`
- `Manual Entry`
- `Other / Unknown`

External ingestion status:

- Property24 and Private Property are currently represented as labels, URLs, or imported-link context.
- No Phase 1 evidence of automatic Property24, Private Property, Website, or inbound WhatsApp ingestion being wired as a canonical webhook/inbox.

### Existing routes/components

- `/pipeline/leads` now displays the Phase 1 Agent Leads list.
- `/pipeline/leads/:leadId` now displays the Phase 1 Lead Workspace.
- `/pipeline/calendar` still uses the existing Pipeline calendar surface.
- Quick Create still creates canonical CRM leads through `createAgencyCrmLeadRecord`.
- Listing detail already has listing-specific lead surfaces and links to `/pipeline/leads/:leadId`.

### Duplicate/local/demo paths found

- `agencyPipelineService` still contains local storage fallback collections for contacts, leads, activities, tasks, appointments, and transactions.
- Legacy `Pipeline.jsx` still contains older local/demo lead workspace behaviour.
- `buyers` is separate from `contacts`, and commercial tenants/landlords/requirements are separate from the residential CRM lead/contact model.
- Contact dedupe is not enforced by a unique database constraint on email/phone.

## Phase 1 Implementation Notes

- Added a read-model service at `src/services/agentLeadWorkspaceService.js`.
- Added Agent Leads list/workspace at `src/pages/AgentLeadsPage.jsx`.
- Repointed `/pipeline/leads` and `/pipeline/leads/:leadId` to the new page.
- Cleaned Agent nav to expose `Dashboard`, `Listings`, `Leads`, `Transactions`, and `Calendar`.
- No schema changes.
- No matching logic.
- No new lead entity.
- No transaction creation changes.
- No offer conversion changes.

## Phase 2 Readiness

Recommended insertion point:

- Add `lead_listing_interests` as the many-to-many bridge between `leads` and `private_listings`.
- Own the read/write logic in a new service adjacent to `agentLeadWorkspaceService`, or extend that service after the table exists.
- Display matched listings inside the existing Lead Workspace as a new `Matches` or `Listings` tab.
- Reuse listing search/filter primitives from `privateListingService` and the current `AgentListings` filtering model before introducing scoring.

Blockers before Phase 2:

- Define lead/contact identity resolution rules.
- Decide whether commercial requirements become leads or remain parallel.
- Replace text-only private listing lead references with FK-safe references or a bridge table.
- Decide whether external sources feed a shared enquiry inbox before becoming leads.
