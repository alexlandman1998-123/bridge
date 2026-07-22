# Supabase Phase 3 — Attorney Accounting

## Outcome

Phase 3 has been implemented and verified on the dedicated Supabase staging project `vaszuxjeoajeuhlcnzzf`.

- Target: staging only
- Production project `isdowlnollckzvltkasn`: not changed
- Planned attorney-accounting migrations: 8
- Staging ledger entries confirmed: 8/8
- Corrective prerequisite repairs: 1
- Evidence files: 9
- Attorney-accounting contract tests: 15 passed, 0 failed

The implementation provides an operational matter-accounting surface for attorney workflows. It is explicitly not a statutory trust-accounting ledger.

## Applied migration chain

| Version | Capability | Result |
| --- | --- | --- |
| `202607180025` | Canonical accounting model prerequisite | Reconstructed because the ledger entry existed but its tables were absent |
| `202607180026` | Party account backfill | Applied and verified |
| `202607180027` | Client portal account read model | Corrective partial-live application verified and recorded |
| `202607180028` | Client proof upload | Applied and verified |
| `202607180029` | Proof reconciliation uniqueness | Applied and verified |
| `202607180030` | Portal account activity updates | Applied and verified |
| `202607180031` | Published payment instructions | Applied and verified |
| `202607180035` | Financial document requests | Applied and verified |
| `202607180036` | Client request submission checklist | Applied and verified |

## Canonical accounting foundation

The following database objects are live:

- `matter_financial_accounts`
- `matter_financial_documents`
- `matter_financial_entries`
- `matter_financial_account_events`
- `matter_financial_document_requests`
- `matter_financial_account_balances`

All five tables have RLS enabled with fourteen scoped policies in total. Anonymous roles have no direct privileges on the tables or balance view. Authenticated privileges are limited to the operations required by each workflow; delete access is not granted.

## Participant account backfill

The backfill created an account shell for each eligible buyer or seller participant without importing financial values.

- Eligible participant accounts: 318
- Bootstrap audit events: 318
- Non-zero opening balances: 0
- Imported financial documents: 0
- Imported financial entries: 0
- Incorrect amount-backfill policies: 0

The participant synchronisation function is idempotent, the database trigger is enabled, and direct execution is restricted to the service role.

## Portal and accounting controls

Verified behaviour includes:

- Missing portal tokens return an empty read model or are rejected for write operations.
- Invalid portal tokens are rejected.
- Valid tokens can access only the requested buyer or seller account scope.
- Proof uploads create a published evidence document and client-visible audit event but do not post a payment entry.
- A unique partial index prevents the same client proof from being posted more than once.
- Internal account events and internal/cancelled requests are excluded from the client portal.
- Payment instructions remain hidden until explicitly published.
- Request uploads link the created document, advance the request to `awaiting_review`, and create a client-visible event.
- Generic requested document types such as statements are preserved.

All write-path behaviour probes ran in transactions that were rolled back. Final persistent counts remain:

| Object | Rows |
| --- | ---: |
| Accounts | 318 |
| Bootstrap events | 318 |
| Financial documents | 0 |
| Financial entries | 0 |
| Document requests | 0 |

## Defects corrected during staging rehearsal

1. `202607180025_attorney_accounting_phase1_1_canonical_model.sql`
   - Removed two extra closing parentheses that made the table DDL invalid.
   - Added explicit least-privilege function and table grants.
2. `202607180026_attorney_accounting_phase1_2_party_account_backfill.sql`
   - Added the missing alias for the preferred-assignment table-function result.
   - Added explicit least-privilege helper-function grants.
3. `202607180027_attorney_accounting_phase3_1_client_portal_accounts.sql`
   - Confirmed the three existing shared request helpers matched the canonical definitions.
   - Restored only the missing portal account read outcome and verified token scoping.
4. Supabase default privileges
   - Removed unintended direct anonymous table privileges and re-granted only the required authenticated operations.

## Production promotion requirements

Phase 3 is ready for a controlled production rehearsal/promotion, but has not been promoted by this implementation.

Before production:

1. Confirm a recoverable production backup and rollback owner.
2. Check whether production also records `202607180025` while missing its canonical objects.
3. Use the corrected canonical migration files rather than the original invalid DDL.
4. Record the number of eligible buyer/seller participants before the amount-free account backfill.
5. Confirm that no legacy invoice, payment, balance, or closeout amount is imported.
6. Verify RLS, the fourteen policies, and the absence of direct anonymous table privileges.
7. Run token-scoped portal and rollback-only write-path checks before recording each ledger entry.
