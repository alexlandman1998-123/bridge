# Attorney Leads — Phase 11 Versioned Quote Register

Phase 11 adds an internal, auditable fee-quote register to the Attorney Lead workspace. It extends the Lead aggregate without turning Leads into Incoming Instructions and without duplicating the operational Matter model.

## Delivered

- Tenant-bound quotes as child records of Attorney Leads.
- Durable organisation/year quote numbers in the form `AQ-YYYY-000001`.
- Immutable commercial versions: revisions create a new draft rather than overwriting history.
- Separate professional fee, VAT, disbursement, and generated total fields in ZAR.
- Bounded validity dates and internal notes.
- Deliberate Draft → Sent → Accepted or Declined transitions.
- One accepted quote per Lead and automatic supersession of a previously sent version.
- Quote actions recorded in the existing Lead activity history.
- Quote register and actions inside the existing Lead detail drawer.

## Lifecycle boundary

- Sending a quote moves an open Lead to **Quote Sent** and records first contact if necessary.
- Acceptance moves the Lead to **Won**.
- Declining the quote records the reason but leaves the Lead open so another version can be prepared.
- Acceptance never creates a Matter or Incoming Instruction automatically.
- Matter creation remains a separate, confirmed **Convert to Matter** command using the Phase 7 lineage controls.
- Incoming Matters remains exclusively for transaction-context instructions referred through the ARCH9 network.

## Security and integrity

- Quote rows use a composite Lead/organisation foreign key and can only attach to an accessible Attorney Lead.
- Authenticated users receive RLS-filtered read access only; all mutations run through bounded security-definer commands.
- Commands re-check edit authority, tenant membership, current Lead state, conversion lock, amount limits, validity date, transition order, and decline reason.
- Lead and quote row locks serialize decisions; an organisation advisory lock serializes quote numbering.
- Closed or converted Leads cannot receive or progress quotes.
- Expired drafts cannot be sent and expired sent quotes cannot be accepted.

## Deployment gate

1. Apply migrations through `202607160010`.
2. Run `npm run verify:attorney-leads-phase11`.
3. As an authorised Attorney user, create two quote versions for an open staging Lead.
4. Mark one version sent and verify the Lead moves to **Quote Sent**.
5. Send the other version and verify the earlier sent quote becomes **Superseded**.
6. Decline a sent quote and verify a reason is required and recorded in activity history.
7. Send and accept a fresh version; verify the Lead becomes **Won** and no Matter or Incoming Instruction exists.
8. Use the separate confirmed **Convert to Matter** action and verify Phase 7 lineage remains intact.
9. Verify a read-only user can inspect quotes but cannot mutate them.
10. Verify cross-tenant quote reads and commands fail.

## Deferred

- Client-facing PDF/document generation and branded templates.
- Email, SMS, or WhatsApp delivery and delivery telemetry.
- Quote line-item catalogues, discounts, deposits, and tax configuration beyond ZAR VAT totals.
- E-signature or public accept/decline links.
- Automatic expiry sweeps, reminders, analytics, and approval thresholds.
- Reusable quote adapters for Estate Agencies, Bond Originators, and Developers.
