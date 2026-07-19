# Arch9 MVP migration ledger classification

After capturing the real staging ledger, classify the release branch without changing it:

```bash
npm run mvp:staging-ledger:classify -- \
  --ledger=docs/staging-migration-ledger.json --json
```

The report separates:

- Versions already applied remotely
- Local-only versions
- Remote-only versions
- Local files sharing one migration timestamp

A collision at a remotely applied version is especially sensitive: do not rename, delete, or rewrite any migration at that timestamp. Record a reviewed forward-only reconciliation plan instead. The classification report itself is read-only and exits non-zero while reconciliation is required.
