# Arch9 MVP deployment runbook

Use this sequence for staging first, then production. It is designed for the MVP operating limit of 100 transactions per month.

1. Run `node scripts/mvp-launch-readiness.mjs`. Do not deploy if it returns `no_go`.
2. Apply `supabase/migrations/202607180046_mvp_atomic_transaction_creation_phase2a.sql` to the target Supabase environment.
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

6. Run `node scripts/mvp-pilot-session-check.mjs` and `node scripts/mvp-pilot-go-no-go.mjs --evidence=path/to/staging-exposure-evidence.json` before accepting the next pilot batch. Keep batches to two transactions and use the batch audit before progressing further.

If any step fails, pause the rollout. Preserve the transaction id and failure evidence, run release certification, reconcile the issue, and repeat the affected check before resuming.
