# Buyer Lead Property Link Contract

`lead_listing_interests` is the canonical buyer lead-to-property link.

## Source Of Truth

For buyer leads, property context must be resolved in this order:

1. Active `lead_listing_interests` rows for the lead.
2. The linked `private_listings` rows referenced by those interests.
3. Legacy `leads.listing_id`, `leads.enquired_listing_id`, or workspace listing ids only when no canonical interest exists.

Seller leads are outside this rule. Seller lead-to-listing continuity still uses the listing/seller onboarding relationship until that side is deliberately migrated.

## Reason

One buyer lead can be interested in many properties. A single `leads.listing_id` field cannot safely represent original enquiry property, shortlist, sent property, viewed property, offer property, and converted property at the same time.

## Operational Meaning

- Original enquiry property: `lead_listing_interests.is_original_enquiry = true`.
- Agent-selected shortlist: `is_agent_selected = true`.
- System suggestion: `is_system_suggested = true`.
- Current status: `status`, such as `interested`, `shortlisted`, `sent`, `viewing_scheduled`, `offer_submitted`, or `converted`.

Buyer workspace rows may expose a convenience `listingId`, but for buyer leads that value is derived from the highest-priority `lead_listing_interests` row. It is not the source of truth.
