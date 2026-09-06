# Attorney practical release — Phase 10 expansion closeout

Phase 10 verifies execution of every approved Phase 9 wave. Each wave requires separate authorization, exact before/add/after organisation allowlists, a provider receipt, logged flag evaluations, stable default-off targeting, a working kill switch, and its full 24-hour quality window before the next wave.

Wave evidence is recomputed from individual authenticated receipts and must meet the approved action, role, success, propagation, destination and zero-incident bars. An unapproved wave, cohort mismatch, or safety incident returns `ROLLBACK`. General availability also requires proof that the approved target population is covered while monitoring, support, rollback and safe flag defaults remain active.

Run `npm run check:attorney-practical-phase10`. A clean ledger reaches `READY_FOR_GA_APPROVAL`; the accountable owner must approve its exact fingerprint with `ACCEPT_ATTORNEY_GENERAL_AVAILABILITY`. The checker never changes flags, cohorts or production.
