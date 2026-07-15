# Conveyancer Document Templates — Phase C2

## Purpose

C2 generates deterministic correspondence drafts from C1-governed template versions. It resolves matter data and approved clauses into email, letter or portal-message content while retaining exact template provenance.

The executable service is `src/services/attorneyWorkflow/conveyancerCorrespondenceGenerator.js`.

## Generation flow

1. Validate the active A-series matter plan and expected plan identity.
2. Enforce actor and legal-lane authority.
3. Select the applicable, currently effective C1-published correspondence version without crossing organisation boundaries.
4. Stop on an equal-priority routing conflict.
5. Recompute SHA-256 from the loaded subject/body artifact and verify it against the governed version and exact placeholder registry.
6. Resolve and format every governed variable.
7. Insert only the exact approved clause version and hash referenced by the template.
8. Produce an immutable draft, render manifest and audit event.

## Variable sources

- `mapped`: deterministic source paths in the supplied matter context.
- `calculated`: supplied calculated values, governed paths or safe built-ins such as generation date and matter reference.
- `agency_setting`: paths restricted to organisation settings.
- `signing_preset`: paths restricted to signing configuration.
- `manual`: explicitly authorised manual values.
- `approved_clause`: exact clause key, version, hash and approval evidence.

Required missing values block the entire generation. Optional missing values render empty. Dates, money, numbers, booleans, addresses, parties and simple tables use deterministic formatting.

## Safety controls

- Email, letter and portal recipients have channel-specific validation.
- Duplicate recipients are rejected.
- Subject line breaks are removed.
- SHA-256 is recomputed from approved clause text; the exact key, version, hash and approval evidence must match the template reference.
- Unknown artifact placeholders and unknown placeholders inside clause wording fail closed.
- Sensitive resolved values are never copied into the audit event; only their keys are recorded.
- Command IDs support authorised idempotent replay.
- The source plan, templates, assets and value payloads are never mutated.

## Output boundary

Every generated correspondence has `status: draft` and `dispatchAllowed: false`. C2 does not send email, deliver letters, post portal messages, persist records, modify matter actions, create evidence, request signatures or mark an exception resolved.

The existing registry and version schema supports C2, so no database migration is required.
