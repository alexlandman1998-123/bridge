# Developer Leads Phase 10 Foundation

Phase 10 adds the contract and database foundation for developer-module leads.
It is intentionally not a full CRM screen yet. The purpose is to establish the
lead ownership, selling-model, multi-development, reservation, and privacy
rules that later UI/API phases must follow.

## Lead Ownership

Developer leads have two owners:

- `developer`: the developer captured or owns the buyer lead.
- `agency`: an external agency introduced the buyer lead.

Developer leads have three ownership models:

- `developer_direct`: the developer is selling directly.
- `developer_assigned`: the developer owns the lead but assigns it to an agent
  working on the development.
- `agency_introduced`: an agency introduced the buyer and controls buyer
  details until handover.

## Selling Model

- `developer_led`: developer sells directly.
- `agent_led`: the lead is worked by an internal development agent or an
  external agency/agent.

The selling model is independent of who owns the development inventory.

## Visibility

Visibility states are:

- `full`: developer-owned lead details are visible to authorised developer
  workspace members.
- `limited`: agency-fed lead appears as a protected card without buyer PII.
- `consent_pending`: agency-fed lead is awaiting buyer consent/handover.
- `handed_over`: agency-fed buyer details may be revealed to the developer.

Agency-fed limited cards may show only non-sensitive commercial context:

- source agency and agent reference
- development or unit interest
- budget band
- unit type interest
- protected summary
- reservation and lead status

Agency-fed limited cards must not expose:

- buyer name
- buyer email
- buyer phone
- ID/passport values
- private notes
- raw lead payloads

## Multi-Development Support

A developer lead can be:

- unallocated: no development selected yet;
- single-development: one primary development;
- multi-development: multiple development interests.

The database uses `developer_lead_development_interests` for one-to-many
development and optional unit interest. `developer_leads.primary_development_id`
is a convenience pointer only.

## Reservation State

Reservation states are:

- `none`
- `provisional`
- `reserved`
- `expired`
- `converted`

Phase 14 will enforce unit reservation and deposit behaviour. Phase 10 only
defines the states and data contract.

## RLS Contract

The foundation separates protected lead metadata from private buyer details:

- `developer_leads`: no buyer PII, safe for protected agency-fed cards.
- `developer_lead_private_details`: buyer PII and sensitive agency notes.
- `developer_lead_development_interests`: development/unit interest links.
- `developer_lead_activity`: scoped activity/audit records.

RLS must allow developer members to see developer-owned leads and protected
agency-fed lead cards, but must keep agency-fed private details hidden until
`visibility_state = 'handed_over'`.

No Phase 10 script sends onboarding links, mutates live data, or reveals private
agency lead data.
