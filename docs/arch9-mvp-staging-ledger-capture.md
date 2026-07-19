# Arch9 MVP staging ledger capture

Run this only from the dedicated release worktree after confirming the staging project reference. It reads the linked database ledger and writes non-secret evidence used by the Phase 3 gate.

```bash
supabase link --project-ref <confirmed-staging-project-ref>
npm run mvp:staging-ledger:capture -- \
  --project-ref=<confirmed-staging-project-ref> \
  --output=docs/staging-migration-ledger.json
```

The evidence contains migration versions only—never credentials, URLs, or customer data. Do not commit it unless the release owner explicitly requests an auditable ledger snapshot.

If the local Supabase CLI does not support JSON output, first capture a valid JSON migration-list export and provide it with `--input=<file>`. Then pass the resulting evidence file to the Phase 3 plan:

```bash
npm run mvp:phase3:plan -- --ledger=docs/staging-migration-ledger.json
```
