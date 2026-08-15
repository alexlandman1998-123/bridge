# Bond Lane Phase 1 Journey Map

Phase 1 establishes context only. It does not change action buttons, persistence, or attorney workflow behavior.

## Ownership Split

The bond lane has two distinct journeys:

- **Bond originator** owns buyer finance intake through bank submission, quotes, grant acceptance, signed grant, and attorney instruction.
- **Bond attorney** owns the conveyancing bond-registration lane after attorney instruction is received.

The handoff point is explicit:

`bond_originator.instruction_sent` -> `bond_attorney.bond_instruction_received`

## Bond Originator Journey

1. **Application Intake**
   Application shell and applicant context are opened.

2. **Applicant Documents**
   Buyer finance documents and applicant details are collected and reviewed.

3. **Bank Submission**
   The application pack is submitted to selected banks and feedback is tracked.

4. **Bank Quotes and Buyer Decision**
   Quotes or bank outcomes are captured and the buyer accepts the preferred offer.

5. **Grant and Attorney Instruction**
   The grant is received, signed, submitted, and the attorney instruction is issued.

## Bond Attorney Journey

1. **Instruction and Bank Detail Capture**
   Bond instruction, bank details, reference, and approval context are captured.

2. **Bank Conditions**
   Bank requirements are reviewed, assigned, and resolved.

3. **Bond Documents and Signing**
   Bond documents are prepared, buyer signing is scheduled, signed documents are returned, and bank approval to lodge is obtained.

4. **Guarantees**
   Guarantees are issued to the transfer attorney and wording is accepted.

5. **Lodgement, Registration, Close-Out**
   Bond lodgement readiness is confirmed, bond is lodged with transfer, registered, and closed out.

## Required Handoffs

- **Originator to bond attorney:** signed grant, bond instruction, bank reference.
- **Bond attorney to transfer attorney:** guarantee letter and wording acceptance.
- **Bond attorney to lodgement coordination:** approval to lodge and bond lodgement pack.

## Phase 1 Gaps To Inspect In Phase 2

- Whether the bond attorney workspace has action buttons equivalent to the transfer workspace.
- Whether originator bank feedback, quotes, grant, and instruction actions are command-backed.
- Whether guarantee issuance and transfer-attorney acceptance are actionable from both lanes.
- Whether bond attorney completion is evidence-gated without making the journey sticky.
- Whether cash transactions hide bond-originator and bond-attorney lanes while hybrid/bond transactions activate them.

## Verification

Run:

```bash
node scripts/verify-attorney-bond-lane-phase1.mjs
```
