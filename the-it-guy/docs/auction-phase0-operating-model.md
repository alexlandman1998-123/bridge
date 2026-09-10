# Auction MVP — Phase 0 operating model

## Decision and scope

The first release is an **internal, auctioneer-assisted property auction** workflow. It supports agency staff running a live or on-site auction; it does not let members of the public place bids directly in the product.

Each auction belongs to one organisation and is linked to one existing `private_listings` record. The listing's `on_auction` marker remains a marketing classification only. An auction record, its bidder registrations, bids and outcome are the operational source of truth.

### In scope

- Staff create, schedule, edit, publish, pause and close a property auction.
- Staff register and approve bidders, allocate bidder numbers, and record bids during a live auction.
- The system keeps an immutable bid ledger and identifies the current high bid.
- Staff record a sold, reserve-not-met, withdrawn or passed outcome and hand a successful sale to the existing transaction workflow.
- Agency staff can view organisation-scoped auction records, documents and activity.

### Explicitly out of scope

- Public catalogue pages, self-service registration or online bidding.
- Identity/KYC verification automation, payment/deposit collection, escrow or refunds.
- Automated contract acceptance, settlement, transfer or commission calculation.
- Proxy bidding, maximum bids, anti-sniping extensions, multi-lot auctions and bid cancellation by ordinary users.
- Legal advice or a replacement for the agency's conditions of sale, bidder agreement, auction rules or regulatory process.

## Lifecycle and transition rules

```text
draft → registration_open → bidding_open ⇄ paused → closed → sold | reserve_not_met | passed
  └──────────────────────────────────────────────────────────→ withdrawn
```

| Status | Meaning | Allowed actions |
| --- | --- | --- |
| `draft` | Staff are preparing the auction; it is not available for bidder registration. | Edit, publish registration, withdraw. |
| `registration_open` | Bidder registration is available to staff until the configured cut-off. | Register/approve/reject bidders, edit permitted operational fields, open bidding, pause/withdraw. |
| `bidding_open` | Auctioneer is accepting bids. | Record valid bids, pause, close. No material auction-rule edits. |
| `paused` | Bidding is temporarily stopped. | Resume bidding, close, withdraw. No bids accepted. |
| `closed` | Bidding has ended; staff must record an outcome. | Record sold/reserve-not-met/passed outcome. No bids accepted. |
| `sold` | A winning bidder and final price have been confirmed. | Create/link transaction and view audit record. |
| `reserve_not_met` | Bidding closed without meeting the reserve. | Record notes; any later negotiated sale is handled as a separate controlled action. |
| `passed` | No accepted sale outcome was recorded. | Record notes; no bids or winner changes. |
| `withdrawn` | Agency withdrew the auction before final outcome. | View audit record only. |

Rules that apply in every state:

- Only the server may change lifecycle status or accept a bid.
- `bidding_open` is permitted only after an opening price, positive increment, scheduled time, linked listing and authorised auctioneer are present.
- A bid is valid only while the auction is `bidding_open`, the bidder is approved, and its amount is at least the current valid minimum.
- The current valid minimum is the opening price before the first bid, otherwise current high bid plus the configured increment.
- A bid may never be edited or deleted. Corrections require a privileged compensating audit action; they do not rewrite history.
- A closed or terminal auction cannot accept bids or change winner/final price without an explicit privileged reopening process, recorded in the audit log.
- The reserve amount is confidential by default. The staff display may show whether it has been met; bidder-facing exposure is outside this MVP.

## Role matrix

The application permission model should resolve the following auction capabilities independently of page visibility. Organisation scope is mandatory for all reads and writes.

| Capability | Principal / organisation admin | Authorised auction manager | Auction clerk | General agent | Bidder |
| --- | --- | --- | --- | --- | --- |
| View organisation auctions | Yes | Yes | Yes | Yes | No product access in MVP |
| Create/edit draft or registration auction | Yes | Yes | No | No | — |
| Publish, pause, withdraw, open or close bidding | Yes | Yes | No | No | — |
| Register, approve, reject or withdraw bidder | Yes | Yes | Yes | No | — |
| Record a bid | Yes | Yes | Yes, when assigned | No | — |
| View bidder PII/documents | Yes | Yes | Assigned auctions only | No | — |
| View bid history/current high bid | Yes | Yes | Assigned auctions only | Read-only summary | — |
| Record final outcome and initiate transaction handoff | Yes | Yes | No | No | — |
| Reopen/correct a terminal auction | Yes, with reason | No | No | No | — |

`Authorised auction manager` and `auction clerk` are capabilities to add to the existing role/permission layer; they should not be inferred merely because a person can view listings. Until those capabilities exist, the initial pilot may restrict auction operations to organisation admins.

## Required operating data

### Auction setup

- Organisation and linked listing.
- Title/address snapshot and primary image, derived from the listing for display.
- Auctioneer and optional assigned clerk.
- Start time, registration close time, timezone and venue/on-site flag.
- Guide price (optional display), reserve price (restricted), opening price and minimum increment.
- Deposit terms, auction terms/conditions reference, and required document links.

### Bidder registration

- Full name or legal entity name, contact details and internal bidder number.
- Registration status: `pending`, `approved`, `rejected`, `withdrawn`.
- Registration evidence/conditions-of-sale acknowledgement references, if required by the agency process.
- Approval/rejection actor, timestamp and note.

### Bid and outcome

- Bid amount, bidder, accepted timestamp, user who recorded it and source (`auctioneer_console` for MVP).
- Current high bid/current high bidder derived from the bid ledger, never typed as the sole record.
- Outcome, final price, winner, reserve-met flag, closeout note, closer, closed timestamp, and created transaction reference once handed off.

## Security, integrity and audit requirements

- Every auction, bidder and bid row is organisation-scoped and protected by row-level security.
- Client applications receive read models only; status transitions, bidder approval, bid acceptance and closeout are database RPCs or server actions.
- Bid acceptance runs in one transaction with a row lock on the auction so concurrent clerks cannot accept two bids against the same current amount.
- The audit log records setup changes, lifecycle transitions, bidder approvals/rejections, every bid, closeout, and privileged correction/reopen actions with actor and timestamp.
- Bidder PII and registration documents are available only to authorised auction staff; normal listing viewers must not receive them.
- The server—not browser clocks—enforces registration and auction timing in `Africa/Johannesburg` unless the auction explicitly stores another timezone.

## Phase 0 sign-off checklist

Phase 1 may begin only when the business owner confirms all of the following:

- [ ] Staff-recorded live bidding, not public online bidding, is the MVP operating model.
- [ ] The lifecycle and terminal outcomes above match the agency process.
- [ ] A business owner has defined who may be auction manager and auction clerk for the pilot.
- [ ] Opening-price, increment, reserve-visibility and registration-cut-off rules are approved.
- [ ] The required bidder-registration evidence, deposit terms and conditions-of-sale references are supplied by the agency/legal owner.
- [ ] The closeout-to-transaction handoff owner and minimum handoff data are agreed.
- [ ] Pilot organisation(s), auctioneer(s) and success criteria are named.

## Definition of ready for Phase 1

The approved Phase 0 artefact is this document with the sign-off checklist completed. Phase 1 must then deliver a migration and tests proving: organisation isolation; authorised write paths; immutable bids; valid lifecycle transitions; and safe concurrent bid acceptance.
