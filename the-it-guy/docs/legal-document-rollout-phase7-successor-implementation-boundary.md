# Legal Document Rollout — Phase 7 Successor Implementation Boundary

Phase 7 is a local, non-executable boundary record. It can preserve a reviewed description of what a future, separately authorised implementation would still need to decide. It cannot apply a migration, prepare a release epoch, register a membership, assign a candidate organisation, change a runtime, deploy, generate or email a customer document, activate a cohort, or roll back anything.

No production operation is implemented by this control plane. Its scripts use local files and local Git blobs only; they do not query or mutate Supabase, Vercel, an email provider, a browser, a customer system, a deployment system, or a provider API.

## Immutable lineage

The canonical Phase 0→5 receipt allowlist remains terminal and is not changed by Phase 7:

```text
Phase 0 freeze → Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5 (terminal)
```

Phase 7 takes an explicit committed Phase 6 receipt SHA, never an editable Phase 6 file. The Phase 6 receipt must be a single regular-file receipt amendment whose sole Git parent is exactly the committed Phase 5 receipt named in its source fields. The history reader then proves all of the following from `git cat-file` and Git tree data:

- the direct committed Phase 5 blob has the exact recorded Phase 5 structure and valid manifest digest;
- the frozen Phase 5 package-lock digest matches the `package-lock.json` blob at the declared frozen source commit;
- the Phase 6 receipt declares the same valid lock digest;
- the declared source-to-Phase-5 path is the terminal receipt-only P0→P5 lineage, with no merge, source mutation/revert, extra path, symlink, mode change, or repeated/missing receipt stage; and
- the Phase 6 receipt itself is recorded, write-once, and passes its redacted proposal policy.

Phase 6 is not added to `ROLLOUT_CONTROL_RECEIPT_PATHS`, and Phase 7 does not modify that helper. The direct P6-on-P5 relationship is an explicit immutable parent binding on a dedicated governance ref; it is not permission to extend or relax the terminal P0→P5 rollout-control chain.

## Immutable implementation source

Planning requires a second explicit `--implementation-commit=<40-hex-SHA>`. It must descend from the committed Phase 6 receipt and every commit between them must be linear, regular-file-only, and limited to the declared Phase 7 static-boundary path allowlist. The receipt binds:

- the implementation commit SHA;
- a deterministic digest of every committed implementation diff entry;
- a deterministic committed-tree source digest;
- the Phase 6 migration blob SHA-256 and invariant digest; and
- the unchanged frozen P0→5 package-lock digest.

The scanner reads blobs from that commit, never the working tree. It verifies that the unapplied Phase 6 migration retains the global one-active-epoch, composite scope, current-version, and post-activation chronology invariants. It also rejects any successor epoch/table/RPC reference or dynamic successor-RPC path in Edge functions, frontend/API source, deployment/config files, package scripts, or executable non-reference scripts. A3, Q2, and V2 must remain locally retired before their historical secret-write code.

These checks are source facts only. They do not assert that a migration has been applied anywhere. Phase 7 records the migration exclusively as `unapplied_reference_only`.

## Boundary and scope

The only cohort recorded by Phase 7 is the exact existing Phase 5 organisation and `mandate` plus `otp` packet types. `maxOrganisations` remains `1`. Its inherited existing-cohort UUID is used only for immutable parent binding; there is no candidate ID, candidate inventory, membership ID, epoch ID, customer record, template choice, or runtime target in a Phase 7 receipt.

The sealed change surface is fixed to:

- Phase 6 migration: `unapplied_reference_only`;
- release epoch: `absent_no_epoch_id`;
- membership: `no_candidate_or_membership_assignment`;
- runtime: `no_runtime_hook_or_allowlist_change`;
- deployment: `no_deployment_or_production_activation`;
- customer egress: `no_customer_document_or_email_delivery`; and
- templates: `unchanged`.

Even `IMPLEMENTATION_BOUNDARY_RECORDED` does not authorise a second organisation, scale, epoch preparation, membership registration, runtime/secret/template/source change, migration application, deployment, customer document generation, email, activation, or rollback.

## States and redaction

The canonical receipt begins at `not_recorded`, which correctly verifies as `HOLD`. A generated local plan has `pending_boundary`; it can report `IMPLEMENTATION_BOUNDARY_READY` only when all immutable Git inputs and no-op source facts are valid. It still has pending review evidence. The finalizer alone can produce `implementation_boundary_recorded`, which reports `IMPLEMENTATION_BOUNDARY_RECORDED`.

The finalizer accepts exactly three review objects—architecture, security, and non-activation—each containing only a SHA-256 evidence digest, a strict opaque lower-case actor reference, and a timestamp. It also accepts accountable opaque recorder/reviewer references and a record timestamp. Review material must post-date the Phase 6 record and Phase 7 preparation, and be no more than 30 days old when recorded.

Never place names, email addresses, phone numbers, URLs, credentials, access tokens, headers, candidate IDs, onboarding facts, customer data, raw approval text, raw logs, document bytes, or storage paths in Phase 7 evidence JSON. The receipt contains only the one inherited existing-cohort UUID required for immutable P5/P6 parent binding; it never contains a candidate identifier.

## Plan, review work order, and finalization

All commands below are local-only.

```bash
npm run plan:legal-documents:rollout-phase7 -- \
  --environment=production \
  --phase6-receipt-commit=<committed-phase6-40-hex-sha> \
  --implementation-commit=<sealed-implementation-40-hex-sha> \
  --prepared-by-reference=<opaque_actor_reference> \
  --reference=<CHANGE-123>

npm run work-order:legal-documents:rollout-phase7 -- \
  --plan=<saved-pending-phase7-boundary.json>
```

The work order is a redaction checklist only. It does not contact an approval system or perform an implementation action.

```bash
npm run finalize:legal-documents:rollout-phase7 -- \
  --plan=<saved-pending-phase7-boundary.json> \
  --evidence=<redacted-phase7-evidence.json>
```

Without `--out`, finalization prints a candidate receipt for review. Writing the canonical local placeholder requires explicit confirmation:

```bash
npm run finalize:legal-documents:rollout-phase7 -- \
  --plan=<saved-pending-phase7-boundary.json> \
  --evidence=<redacted-phase7-evidence.json> \
  --out=config/legal-document-rollout-phase7-successor-implementation-boundary.json \
  --confirm-write=RECORD_PHASE7_IMPLEMENTATION_BOUNDARY
```

The write path must already be a regular mode-0644 non-symlink `not_recorded` placeholder. The finalizer obtains a local exclusive lock, rechecks the placeholder, writes a mode-0644 temporary receipt, fsyncs it, and atomically renames it. It refuses a repeated write. A later control may treat the local record as immutable only after an operator has committed it as its own regular receipt-only Git commit; the workspace file alone is never authority.

```bash
npm run test:legal-documents:rollout-phase7
npm run verify:legal-documents:rollout-phase7
```

The current placeholder intentionally returns `HOLD` until a genuine committed Phase 5→6 lineage, separately sealed implementation source commit, and independently approved redacted review record exist. `HOLD` is a stop condition; it is not a request to weaken a boundary or run a production action.
