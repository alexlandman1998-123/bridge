# Arch9 MVP deployment runbook

Use this sequence for staging first, then production. It is designed for the MVP operating limit of 100 transactions per month.

1. Capture and reconcile the real staging ledger, then run the Phase 3C preflight from the release-worktree root. Do not deploy if it returns `no_go`:

   ```bash
   npm run mvp:staging:apply-preflight -- \
     --ledger=docs/staging-migration-ledger.json \
     --change-evidence=docs/staging-change-evidence.json \
     --canonical-plan=docs/staging-canonical-migration-plan.json
   ```

2. The named database owner applies only the separately reviewed, forward-only migrations to the confirmed staging environment. Do not use a broad `supabase db push` while the history contains duplicate timestamps. The two MVP migrations, once their release path is cleared, are:

   - `supabase/migrations/202607180046_mvp_atomic_transaction_creation_phase2a.sql`
   - `supabase/migrations/202607190001_mvp_seller_acceptance_canonical_creation_phase1.sql`
3. Verify the deployed RPC without creating data:

   ```bash
   SUPABASE_URL=... SUPABASE_ANON_KEY=... node scripts/mvp-deployment-contract-check.mjs
   ```

4. Create one controlled pilot transaction through the normal accepted-offer path.
5. Verify its persisted spine without mutating it:

   ```bash
   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
   node scripts/mvp-postdeploy-transaction-check.mjs --transaction-id=<uuid>
   ```

6. Run `node scripts/mvp-pilot-session-check.mjs` before accepting the next pilot batch. Keep batches to ten transactions and use the batch audit before progressing further.

If any step fails, pause the rollout. Preserve the transaction id and failure evidence, run release certification, reconcile the issue, and repeat the affected check before resuming.
