# Attorney role guarded release — Phase 9

## Outcome

Phase 9 closes the attorney-role implementation with a per-firm, evidence-backed release certification. It converts compatibility fields into enforced derived mirrors and records which firms have passed the live Phase 8 integrity gate.

It deliberately does not drop compatibility columns. Historical invitation acceptance functions and external integrations may still reference those columns, and the live Phase 8 audit has not yet been executed in this workspace. Removing them without deployed evidence would be unsafe.

## Derived-only enforcement

Migration `202607180042_attorney_role_release_certification_phase9.sql` adds `NOT VALID` check constraints requiring membership and invitation compatibility roles to equal the value derived from canonical professional role and qualifications.

`NOT VALID` is intentional:

- all new and updated rows are enforced immediately;
- historical rows are not silently rewritten or accepted as clean;
- the Phase 8 view remains responsible for identifying legacy mismatches;
- a later schema-removal migration can validate or remove mirrors only after every rollout population is certified.

Generic Settings normalization now exposes the professional role as the attorney workspace role. The compatibility value is retained only in an explicitly named diagnostic field.

## Certification boundary

The certification RPC:

- requires an authenticated active canonical `firm_admin`;
- scopes every check to one firm;
- refuses an empty integrity population;
- refuses any Phase 8 status other than `healthy`;
- records row counts, status counts, actor, timestamp, gate version, and the fact that compatibility columns were not removed;
- is idempotent per firm and certification version.

Certification does not modify memberships, invitations, qualifications, assignments, or organisation extensions.

## Operations

Deploy migrations through `202607180042`, then preview a firm's decision:

```bash
npm run certify:attorney-role-release -- --firm-id <uuid>
```

Record certification only after reviewing the preview:

```bash
npm run certify:attorney-role-release -- --firm-id <uuid> --confirm
```

Run all local contracts with `npm run verify:attorney-role-release-phase9`.

## Future physical cleanup

Dropping `attorney_firm_members.role`, `attorney_firm_invitations.role`, `organisation_users.attorney_compatibility_role`, or `profiles.attorney_role` requires a separate migration after all intended firms are certified and remaining external consumers have been inventoried. Those fields are non-authoritative after Phase 7 and derived-only after Phase 9.
