# Physical Signed Upload Phase E

Implemented on 2026-07-31.

## Goal

Turn the Phase D post-signing amendment request into an actionable deep-link handoff from the legal document workspace to Document Builder.

## What Changed

- The workspace now opens Document Builder with `startAddendumFor`, `packetType`, `changeSummary`, and `amendmentReason` query parameters.
- Document Builder parses the handoff once and switches to the correct packet type if needed.
- Document Builder fetches the original packet when it is not already visible in the current document library page.
- The existing addendum starter is reused for the handoff.
- The handoff prefills the addendum with the original packet link and recorded change summary.
- The amendment reason is carried into addendum details.
- Consumed handoff parameters are removed from the URL.

## Safety

- No original mutation happens during the handoff.
- The original packet remains the immutable signed or signing record.
- The new addendum still uses the existing Document Builder readiness checks before generation.
- The handoff does not retrigger downstream OTP or mandate signing/finalization workflows.
