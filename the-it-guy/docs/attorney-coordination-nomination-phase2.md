# Attorney coordination nomination and allocation — Phase 2

Phase 2 adds the guarded firm-first lifecycle for bond-registration and cancellation lanes without creating separate matter records.

The active transfer attorney on a transaction can nominate an active bond or cancellation firm. The nomination creates a pending attorney assignment with no individual attorney attached. Repeating the same pending nomination is idempotent; a second open firm nomination for the lane is rejected.

The nominated firm's administrator or director must then:

1. accept or decline the nomination;
2. allocate a qualified primary attorney from its own active membership;
3. activate the lane once acceptance and allocation are complete.

The existing `bridge_manage_attorney_firm_allocation` command remains the sole acceptance, allocation and activation boundary. Nomination writes an internal assignment record plus a professionally shared transaction event. Declines and replacements remain in assignment and event history.

Run `npm run test:attorney-coordination-phase2` to verify Phases 0–2 and the complete attorney role suite.
