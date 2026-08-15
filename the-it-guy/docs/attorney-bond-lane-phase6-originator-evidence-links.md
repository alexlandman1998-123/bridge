# Bond Lane Phase 6 Originator Evidence Links

Phase 6 gives attorneys direct navigation to the bond originator source workspace while keeping the attorney-side originator panels read-only.

## Evidence Links

Attorney-side originator panels now support deep links for:

- Application intake: `review-application`
- Documents: `request-docs`
- Bank feedback: `update-bank-feedback`
- Offers: `capture-offer`
- Buyer decision: `record-buyer-decision`
- Grant: `record-grant-received`
- Signed grant: `record-grant-signed`
- Attorney instruction: `send-attorney-instruction`
- Activity: `monitor-registration`

Each link routes to `/bond/files/:transactionId` with `tab` and `action` query parameters that the bond file already understands.

## Runtime Behavior

- `BondOriginatorAgentProgressView` can open exact originator documents, bank workflow, finance, and activity links.
- `BondOriginatorAttorneyHandoffView` can open the instruction source, grant source, signed-grant source, and originator activity.
- Direct grant document buttons still open the linked document URL when available.
- If no deep link is provided, existing local callbacks still work.

## Boundary

The attorney can inspect the originator source record, but mutation remains governed by the bond originator workspace.

## Phase 7 Candidate

Run full scenario coverage across buyer/legal structures and finance combinations:

- natural person
- married buyers
- multiple buyers
- company buyer
- trust buyer
- cash transaction
- bond transaction
- seller existing bond with cancellation lane

## Verification

Run:

```bash
node scripts/verify-attorney-bond-lane-phase6.mjs
```
