# Commission Targets And Levels Implementation

## What Was Built

- Renamed the settings workspace from Commission Structures to Commission while keeping the existing `/settings/commission-structures` route.
- Reworked the settings page into tabs for Overview, Commission Levels, Targets & Trackers, Overrides, and Templates.
- Added reusable commission widgets for overview cards, listing defaults, split levels, referral rules, company targets, agent trackers, progress bars, and status badges.
- Added agent commission levels with split percentages, optional targets, active/default state, and user assignment support.
- Added referral commission rules for same branch, different branch, external agency, buyer introduction, and custom referrals.
- Added a company monthly commission target tracker in settings and the principal dashboard.
- Added an agent personal commission tracker in the agent dashboard.
- Centralised commission calculations in `src/services/commissionService.js`.

## Tables Used

- Existing:
  - `organisation_commission_structures`
  - `organisation_user_commission_profiles`
  - `transaction_commissions`
  - `transactions`
  - `lead_referrals`
  - `referral_commission_events`
- New:
  - `commission_levels`
  - `commission_targets`
  - `referral_commission_rules`
  - `commission_settings_audit`
- Existing profile rows now support `commission_level_id` for level assignment.

## Calculation Rules

- Gross commission comes from `transaction_commissions.gross_commission_amount`, then transaction snapshot fields, then sale price times gross percentage when available.
- Agent commission comes from snapshot amount when present, otherwise `gross_commission * agent_split_percentage`.
- Company commission uses `gross_commission - agent_commission - referral_payouts`.
- Company and branch trackers use retained agency/company commission.
- Agent trackers use agent commission.
- Buckets remain visually separate:
  - Active/open rows default to projected.
  - Accepted OTP, finance, transfer, and related in-flight states are confirmed.
  - Registered/completed rows are due unless marked paid.
  - Paid commission rows are paid.

## Limitations

- Listing category rows are currently MVP defaults backed by the existing default commission structure, not a separate category table.
- Branch targets are supported by the schema and service, but the first UI pass focuses on company and agent tracking.
- Referral payouts are read from existing referral commission fields when available; incomplete referral data safely falls back to zero.
- Payment reconciliation remains outside this phase.

## Future Improvements

- Add persisted per-category listing commission defaults if agencies need category-specific editing beyond the default structure.
- Add branch target editing and branch breakdown names once branch-level commission operations mature.
- Add paid/due workflow controls if final payout reconciliation becomes part of the product.
- Add richer audit browsing inside the Commission workspace.
