# Buyer Lead Lifecycle Contract

The canonical buyer lead lifecycle is defined in `src/core/leads/buyerLeadLifecycleContract.js`.

## Contract

The stage is the buyer lead's operational position. The lifecycle status is a broader state used for filtering, reporting, and closeout.

| Stage key | Label | Lifecycle status | Meaning |
| --- | --- | --- | --- |
| `enquiry_received` | New Lead | `open` | A buyer enquiry exists but has not yet been worked. |
| `assigned` | Assigned | `open` | The buyer lead has an owner or queue. |
| `first_contact` | Contacted | `open` | First human contact has been logged. |
| `qualified` | Qualified | `open` | Buyer intent, budget, area, and finance readiness have enough structure to act on. |
| `matched` | Matched | `open` | Listings have been suggested, shortlisted, sent, or otherwise linked for the buyer. |
| `viewing_scheduled` | Viewing Scheduled | `open` | A viewing or buyer appointment is scheduled. |
| `viewing_completed` | Viewing Completed | `open` | The buyer has viewed a property or completed the appointment. |
| `offer_draft` | Offer Draft | `open` | An offer has been started or sent to the buyer for completion. |
| `offer_submitted` | Offer Submitted | `open` | The buyer offer is submitted or in agent/seller review. |
| `negotiating` | Negotiating | `open` | The offer is countered or under negotiation. |
| `offer_accepted` | Offer Accepted | `open` | The seller accepted the offer, but transaction conversion is not yet confirmed. |
| `onboarding` | Onboarding | `open` | Buyer onboarding has started or is pending/completed before transaction handoff catches up. |
| `transaction_created` | Transaction Created | `converted` | The accepted offer has a confirmed persisted transaction. |
| `finance` | Finance | `converted` | The converted matter is in bond/cash/hybrid finance work. |
| `transfer` | Transfer | `converted` | The converted matter is in transfer/conveyancing work. |
| `registered` | Registered | `closed` | The converted matter is registered or closed. |
| `nurture` | Nurture | `paused` | The buyer remains known but is not in the active buying motion. |
| `lost` | Lost | `lost` | The buyer lead is lost or archived. |

## Existing Stage Mapping

Current CRM and buyer workflow labels are mapped into the canonical stages:

- `Lead`, `New Lead`, `Canvassing`, `New Prospect` -> `enquiry_received`
- `Assigned`, `Awaiting Assignment`, `Assigned To Agent` -> `assigned`
- `Contacted`, `First Contact Logged` -> `first_contact`
- `Qualified`, `Requirement Created`, `Requirements Captured` -> `qualified`
- `Matched`, `Suggested`, `Shortlisted`, `Sent`, `Viewed`, `Property Sent`, `Listing Sent` -> `matched`
- `Viewing Scheduled`, `Appointment Scheduled`, `Buyer Meeting` -> `viewing_scheduled`
- `Viewing Completed`, `Appointment Completed`, `Viewed Property` -> `viewing_completed`
- `Offer Draft`, `Offer Created`, `Sent To Buyer`, `Buyer Viewed`, `Changes Requested` -> `offer_draft`
- `Offer Submitted`, `Submitted`, `Agent Review`, `Seller Review`, `Sent To Seller`, `Seller Viewed` -> `offer_submitted`
- `Negotiating`, `Countered`, `Buyer Review Counter` -> `negotiating`
- `Offer Accepted`, `Accepted`, `Approved` -> `offer_accepted`
- `Onboarding`, `Onboarding Sent`, `Onboarding Completed`, `Buyer Onboarding Pending` -> `onboarding`
- `Converted To Transaction`, `Deal Created`, `Transaction Created`, `OTP` -> `transaction_created`
- `Finance`, `Bond`, `Bond Submitted`, `Bond Approved` -> `finance`
- `Transfer`, `Attorney`, `Conveyancing` -> `transfer`
- `Registered`, `Registered / Closed`, `Closed` -> `registered`
- `Nurture / Follow-up Later`, `Dormant` -> `nurture`
- `Lost`, `Archived`, `Rejected`, `Declined`, `Withdrawn`, `Expired` -> `lost`

## Operating Boundary

`offer_accepted` is not the same as `transaction_created`. The buyer lead remains open until the accepted-offer conversion produces the persisted transaction receipt. Transaction module work should start from `transaction_created`, not from a raw accepted offer label.
