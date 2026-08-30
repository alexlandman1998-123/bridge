# Rentals Phase 50 — operational testing gate

Phase 50 is a controlled end-to-end test of the internal Rentals workflow. It does not enable listing portals, syndication, accounting integrations, or Sales functionality.

## Automated gate

From `the-it-guy/`, run:

```bash
npm run test:rentals-phase50
```

This runs the existing Rentals foundations through applicant journey tests, then verifies that the production operational surface, key RPC clients, reconciliation repair, and external-integration boundary remain present.

## Manual smoke run

Use a dedicated non-production organisation and a disposable property/unit. Do not run this against a live tenancy or a real payment.

1. Create a draft vacancy, add internal marketing details/media, and confirm no external publishing control appears.
2. Create or progress a test application, complete screening and a decision, then convert it to a tenancy.
3. Prepare a lease, record signing, satisfy move-in readiness, complete the incoming inspection, and activate the tenancy.
4. In the tenancy workspace, generate a charge, record a uniquely referenced test payment, allocate it, and confirm the balance and activity ledger update. Request (then separately approve) a test adjustment only if two authorised test users are available.
5. Confirm the collections page shows the tenancy when it has an outstanding charge; queue/suppress a reminder only on the disposable tenancy.
6. Using an authenticated test client (not a service key), create, triage, quote, and complete a test maintenance request. Confirm the maintenance queue shows its SLA state. Maintenance UI wiring is intentionally outside this phase.
7. Using the same authenticated test client, create an inspection template, schedule an inspection, start it, record an item, and complete it. Field-inspection UI wiring is intentionally outside this phase.
8. Stage a small, deliberately invalid financial-import row and confirm it stops before posting; then stage/approve/post a valid disposable test row.
9. Sign in as a second test user without property access and confirm the tenancy, finance, maintenance, and inspection records are not visible or actionable.

## Pass criteria

- Every step gives a clear success or validation error; no silent failure or stuck loading state.
- No duplicate receipt is created for the same payment reference.
- Financial records are immutable after posting; correction/reversal follows the approval path.
- The second test user cannot cross the property/branch boundary.
- The operation is visible in the tenancy activity/audit surface where applicable.

Record the tenancy ID, two test user IDs, the test payment reference, and screenshots of any failure before cleaning up the disposable test data.
