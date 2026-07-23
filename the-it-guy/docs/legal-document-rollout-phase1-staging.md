# Legal Document Rollout - Phase 1 Staging Receipt

Phase 1 binds a legal-document release to one explicit staging environment and records an ordered evidence packet for that staging release. It is a local, fail-closed control plane: it prepares and verifies a receipt, but it does not deploy an Edge Function, apply SQL, send email, generate a document, sign anything, start a watchdog, or enable a pilot.

The receipt is intentionally separate from Phase 0. Phase 0 binds the production target and the B1 evidence environment as distinct identities. Phase 1 requires a staging project reference that is exactly the B1 evidence project, and rejects any staging/production identity collision. This prevents the repository's historical ambiguous project label from being used as a deployment target by accident.

## What Phase 1 binds

- The clean, frozen Phase 0 commit, frontend lockfile, and B1 review-manifest digest.
- The exact legal migrations `202607220002` through `202607220012`, then `202607230004`, in dependency order, with one reviewed apply/ledger record per version and a chained predecessor-ledger digest.
- The existing single-migration staging executor: `scripts/supabase-phase6-staging-execution.mjs`, including its pinned `supabase@2.109.1` CLI, exact direct-host target contract, production guard, and application-manifest identity.
- The canonical Edge Function unit, its `_shared` runtime, and `supabase/config.toml`.
- The Vercel/Vite inputs: `vercel.json`, `package.json`, `package-lock.json`, `vite.config.js`, and the frontend source tree. The only accepted build command is Vercel's `npm run build:guarded`.
- An inert rollout posture: pilot disabled, no organisation allowlist, creation paused, scale disabled, and zero Phase 1 fixture writes.

The receipt also makes two important deployment dependencies explicit:

1. The exact 13-function Edge unit, including the canonical finaliser, must have a target-bound deployment record with its sealed source hash. The finaliser's deployment time must precede migration `202607220006`.
2. `generate-final-signed-otp` and `dispatch-final-signed-document` have no explicit `supabase/config.toml` function stanza. Each needs its own staging-targeted JWT/configuration review digest; it must never be assumed from a default.
3. The staging executor's own hard-coded production-ref guard is hashed and must equal the Phase 0 production identity and the application manifest identity. Its target parser enforces `direct_supabase_host_v1`: only `db.<staging-project-ref>.supabase.co:5432/postgres` with one explicit TLS parameter (`sslmode=require`, `verify-ca`, or `verify-full`) is accepted. It rejects non-project references, poolers, alternate ports, duplicate TLS parameters, and URI query overrides. A runner that protects a different project or merely searches a connection URL for a project string is not safe to use, even if a caller supplies a staging URL.
4. The Vite release manifest records the public `supabaseOrigin` compiled into the bundle. A Phase 1 preview must be a generated `*.vercel.app` preview, never a production/custom alias, and its attestation must bind that origin to the exact staging origin.

## Prepare a local receipt

Run from `the-it-guy/` only after Phase 0 is genuinely `FROZEN` from a clean frozen-source commit. This performs no remote operation.

```bash
npm run plan:legal-documents:rollout-phase1 -- \
  --environment=staging \
  --staging-project-ref=<exact-b1-staging-project-ref> \
  --staging-origin=https://<exact-b1-staging-project-ref>.supabase.co \
  --prepared-by=<accountable-person> \
  --reference=<change-ticket>
```

Review the emitted `proposedReceipt`. Only if it reports `STAGING_PLANNED` may it be copied exactly to `config/legal-document-rollout-phase1-staging.json` and committed as a **receipt-only descendant** of the frozen source. The frozen source must also already contain the inert `config/legal-document-rollout-phase4-pilot-activation.json` and `config/legal-document-rollout-phase5-pilot-observation.json` placeholders; no receipt commit may introduce either. The chain is strict: the first descendant changes only the Phase 0 freeze receipt; the Phase 1 receipt may then be committed once as pending and once as evidence-recorded, with no later rewrite. A later Phase 2 acceptance receipt is allowed exactly once, only after both Phase 1 changes, and must be its own single-file commit; Phase 4 is the only permitted receipt after Phase 3, and Phase 5 is the only permitted receipt after Phase 4. Phase 5 is terminal. No merge, source change, revert, rename, deletion, executable-bit change, migration, function, dependency, or deployment-config change is accepted. `STAGING_PLANNED` is not permission to deploy; it only means the local release boundary is coherent.

## Controlled staging sequence

The controlled operator sequence remains outside this local tool and needs its normal staging authority, tested recovery evidence, and no production credentials:

1. Classify every listed legal migration in `docs/supabase-phase-5-application-manifest.json`. The existing executor must see exactly one reviewed row per migration with `apply_original_after_dependency_check` before it can be used.
2. Do not use `supabase db push`, reset, broad repair, a pooler URL, or an inferred/linked target. The existing runner is one migration at a time and accepts only the exact direct staging host, a tested recovery confirmation, and the pinned CLI. For every listed legal version it also requires the committed pending receipt and its exact digest, proves the target/B1 identity, source continuity, migration hash, and predecessor ledger before it invokes the CLI. Run it from the repository root with `--phase1-receipt=the-it-guy/config/legal-document-rollout-phase1-staging.json --phase1-receipt-digest=<pending-receipt-digest>`.
3. Deploy and review the complete Edge Function unit, including retirement stubs and `_shared` code. Record each function name, sealed source hash, the common full deploy-unit hash (all functions, `_shared`, and `supabase/config.toml`), staging target, provider revision, deployment reference, and deployment time. Record separate configuration-review evidence for the two functions without stanzas.
4. Capture a preflight ledger snapshot, then apply and evidence `202607220002` through `202607220005` in order. The first migration binds that preflight snapshot; every later migration binds the preceding ledger record. Every ledger digest must be new. Confirm the canonical finaliser deployment before `202607220006`, then apply and evidence `202607220006` through `202607220012`, followed by `202607230004`, in order. All records must fall after preparation, before evidence recording, and within a single 24-hour window.
5. Build a staging-configured Vercel preview with `npm run build:guarded`. The preview's Vercel deployment metadata must bind its deployment ID to the frozen commit. Then create the public-asset attestation explicitly:

```bash
npm run attest:legal-documents:rollout-phase1-preview -- \
  --url=https://<generated-vercel-preview>.vercel.app \
  --expected-release-id=<frozen-40-character-commit> \
  --expected-supabase-origin=https://<staging-project-ref>.supabase.co \
  --deployment-id=<vercel-deployment-id> \
  --vercel-project-id=<vercel-project-id> \
  --team-id=<optional-vercel-team-id>
```

   Omit `--team-id` for a personal project. Set `VERCEL_TOKEN` only in the command environment; never place it in the receipt, evidence file, or shell history. The attestor makes one read-only authenticated API request and rejects a deployment whose ID, project, generated URL, preview target, READY state, or source SHA does not match. Save the emitted JSON as an evidence artifact.

6. Put the non-secret controlled-execution records into one structured evidence JSON file stored outside the clean release worktree, then use the finalizer rather than hand-editing 11 migrations, 13 functions, preview fields, and the receipt digest. It accepts exactly the recovery reference, preflight digest, ordered migration/function/configuration records, post-deploy digest, accountable reviewers, and timestamp; it derives the provider-bound preview fields and receipt digest from the saved preview attestation. It prints the proposed receipt by default:

```bash
npm run finalize:legal-documents:rollout-phase1 -- \
  --receipt=config/legal-document-rollout-phase1-staging.json \
  --evidence=<controlled-execution-evidence.json> \
  --preview-attestation=<saved-preview-attestation.json>
```

   Review that output. Only then may an explicitly confirmed second invocation replace the canonical receipt:

```bash
npm run finalize:legal-documents:rollout-phase1 -- \
  --receipt=config/legal-document-rollout-phase1-staging.json \
  --evidence=<controlled-execution-evidence.json> \
  --preview-attestation=<saved-preview-attestation.json> \
  --out=config/legal-document-rollout-phase1-staging.json \
  --confirm-write=RECORD_PHASE1_EVIDENCE
```

   Commit that evidence-recorded receipt as the **second and final** permitted Phase 1 receipt change. It expires after 24 hours and must be re-attested rather than rewritten.

The current application manifest deliberately has no reviewed rows for `202607220002`–`202607220012` or `202607230004`, so the verifier currently returns `HOLD` with `P1_LEGAL_MIGRATION_MANIFEST_COVERAGE_MISSING`. That is the intended safety behavior. This Phase 1 implementation does not invent a second SQL migrator or weaken the drift controls.

The existing runner currently names `isdowlnollckzvltkasn` as its protected production reference while the legal B1 evidence has historically used that identity as staging. Once Phase 0 records the actual production reference, Phase 1 will also return `P1_DATABASE_RUNNER_PRODUCTION_GUARD_DRIFT` until the runner is corrected and independently reviewed. Do not work around that block with a linked project, `.env` fallback, or a broad migration command.

## Verify an evidence-recorded receipt

After the separately authorised controlled deployment and review, finalize the second receipt change with the command above, commit it without any source changes, then run:

```bash
npm run verify:legal-documents:rollout-phase1
```

Only `STAGING_EVIDENCE_RECORDED` means that the local receipt is internally complete and still matches the source tree. It deliberately does **not** claim this local verifier independently contacted Supabase or Vercel, so it does not certify production, legal approval, live runtime health, future template/storage drift, pilot activation, or scale-up. Phase 2/live acceptance and Phase 4/5 write-capable smoke controls remain separate, explicitly authorised controls.
