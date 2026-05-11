# Agent Pipeline Refactor Notes

## Scope
Pipeline refinement pass for:
- Pipeline Overview
- Leads
- Buyer/Seller Lead Workspace
- Canvassing
- Calendar audit

Date: 2026-05-11

## Files Changed
- `src/pages/agency/AgencyPipelinePage.jsx`
- `src/pages/PipelineCanvassingPage.jsx`

## KPI Alignment Changes
- Updated top 6 KPI cards in `AgencyPipelinePage` to use a fixed heading zone and anchored metric value.
- Result: numeric values now align consistently even when metric labels wrap to two lines.
- Applied to both Overview and Leads contexts (same card component/section path).

## Overview Analytics Layout Changes
- Principal reporting mode now renders:
  - Full-width `Agent Productivity` table
  - Second row with side-by-side `Lead Sources` and `Appointment Mix`
- `Agent Productivity` table columns:
  - Agent, New Leads, Contacted, Viewings Scheduled, Follow-ups, Converted, Conversion Rate, Last Activity
- Lead source donut + source rows remain data-driven from existing reporting aggregation.
- Appointment mix remains data-driven from appointment-type rows with proportional bars.

## Data Source Audit
### Overview + Reporting
- New Leads / Opportunities / Follow-ups / Overdue / Appointments:
  - Source: `buildPipelineMetrics()` with records from `getAgencyPipelineSnapshot()` + optional Supabase hydration.
- Agent Productivity table:
  - Leads: `records.leads`
  - Tasks: `records.tasks`
  - Activities: `records.leadActivities`
  - Viewings Scheduled: `records.appointments` filtered by viewing-like appointment types
  - Last Activity: latest activity/appointment/update timestamp per agent row
- Lead Sources:
  - Source: `buildPrincipalReporting()` lead source breakdown rows.
- Appointment Mix:
  - Source: `buildPrincipalReporting()` appointment type rows.

### Leads Table
- Lead contact: `records.contacts` via `contactId`
- Interested listing/property: `lead.listingId`, `lead.propertyInterest`, `lead.sellerPropertyAddress`, and linked deal title fallback
- Funnel stage: derived client-side via stage/status mapping helper
- Next step: derived from open tasks (first due) with stage-based fallback
- Assigned agent: lead-level assigned fields
- Last activity: lead activity timestamp with appointment/update fallbacks

### Canvassing
- Source: existing local canvassing store (`localStorage`) keyed by organisation
- Buyer/Seller split:
  - Derived from `prospectType` audience resolver (buyer-like vs seller-like)
- Table data remains real from stored prospects/activities

## Buyer Leads Table Changes
- Removed `Link` column.
- Added columns:
  - Interested Listing
  - Funnel Stage
  - Next Step
  - Assigned Agent
  - Last Activity
  - Actions
- `Contact` column now combines phone + email for clearer scanability.

## Buyer/Seller Lead Workspace Changes
- Removed top KPI cards and lead filters within individual lead workspace route.
- Removed header clutter actions: Call / WhatsApp / Email.
- Added cleaner top context summary panel:
  - Lead type, funnel stage, assigned agent, next step, contact summary, listing/property summary.
- Added horizontal workspace menu:
  - Overview
  - Activity
  - Tasks
  - Appointments
- Tab behavior:
  - `Overview`: lead summary + workflow/linked-record side panel
  - `Activity`: activity log form + timeline
  - `Tasks`: follow-up task form + task list
  - `Appointments`: appointment form + appointment list

## Conversion Workflow Status
- Buyer conversion:
  - Existing flow reused via `handleConvertLeadToDeal` (`Convert to Transaction`).
- Seller conversion:
  - Existing flow reused via `handleCreateListingFromSellerLead` (renamed CTA to `Convert to Listing`).
- Workflow audit outcome:
  - Conversion actions already existed and remain connected to existing service logic.

## Lead Archive / Lost Workflow
- Added `Archive Lead` action from lead table and workspace.
- Added archive confirmation modal with reason + optional notes.
- Archive behavior:
  - Sets lead stage/status to `Lost`
  - Preserves history and appends archive reason to notes
  - Writes activity log entry (`lead_archived:<reason>`)
  - Reloads records, does not delete lead

## Canvassing Changes
- Added Buyer/Seller prospect segmentation control.
- Canvassing table now adapts columns by audience:
  - Buyer: Budget, Area of Interest
  - Seller: Property, Estimated Value
- Added prospect archive/lost workflow:
  - Archive modal with reason + notes
  - Status moved to `Lost`
  - Activity history preserved and logged
- Improved Add Prospect modal spacing/layout:
  - Sectioned cards for Type, Contact, Prospecting Context, Follow-Up Plan
  - Buyer/Seller-aware field placeholders

## Calendar Audit
- Calendar route remained intact in `AgencyPipelinePage`.
- Existing behavior retained:
  - loads appointments
  - supports week/month views
  - uses safe empty states
  - includes no-data fallback messaging in calendar cards and detail areas
- No schema/auth/RLS modifications were introduced.

## Permissions Considerations
- No permission model loosening introduced.
- Existing scope behavior remains:
  - principal can view broader scoped records based on membership logic
  - non-principal records remain agent-scoped through current filtering logic
- Archive and conversion actions use existing client/service pathways and role visibility already present in module.

## Known Gaps / Follow-Ups
- Funnel stage and next-step values are currently client-side derived (not canonical backend fields yet).
- Canvassing still uses local organisation storage (no Supabase canvassing table in this pass).
- Conversion lifecycle can be further hardened with explicit backend status enums for buyer/seller funnels.
- Build emits a pre-existing CSS minify syntax warning from aggregated CSS (`Expected identifier but found "-"`), not introduced by this pass.

## Build Result
- `npm run build` succeeded.

## Targeted Lint Result
- `npx eslint src/pages/agency/AgencyPipelinePage.jsx src/pages/PipelineCanvassingPage.jsx` passed with no reported errors.
