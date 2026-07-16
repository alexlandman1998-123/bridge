# Conveyancer information governance — G2

G2 consumes G1 identities, actors, policy binding and audit events to answer who may view, edit, approve, download, export, share or dispose of sensitive matter information—and why.

## Delivered

- Internal, confidential, privileged, personal, special-personal, financial and restricted classifications.
- Multiple classifications per record; access must satisfy every applicable classification.
- Active firm and matter membership, branch and team scope.
- Role/action boundaries for attorneys, secretaries, accounts, compliance and managers.
- Ethical walls by user, role or team, with explicit allow entries.
- Resource-specific access grants.
- Temporary, bounded delegation that inherits only actions the delegator could perform.
- Leave substitution that cannot approve, export, share or dispose.
- View-only break-glass access with an independent manager or supervising-attorney approval, incident reference and strict expiry.
- Export prohibition, attorney-only export and mandatory watermark obligations.
- Retention-period and legal-hold disposal blocks.
- Deterministic access-decision fingerprints and common G1 audit evidence for allowed and denied access.
- A complete action matrix suitable as input to RLS policies and application gates.

## Important boundary

The G2 matrix is explicitly advisory to the database. Supabase RLS remains authoritative and must independently enforce tenant, firm and matter isolation. G2 exists so application decisions, future policies and RLS tests use the same explainable contract; it is not a client-side substitute for RLS.

Run G1 and G2 together:

```sh
npm run test:conveyancer-practice-g2
```

G2 adds no database migration.
