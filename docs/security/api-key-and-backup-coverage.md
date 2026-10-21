# API key restrictions and backup coverage

Reviewed 21 October 2026. Ownership: shared Supabase recovery operations and the Google Maps browser integration used by the primary app, admin and Kingdom website. MFA remains deferred at the owner's request. No application permissions, customer sign-in flow or production data were changed by this review.

## API keys: observed enforcement and remaining access

The configured browser Maps keys in the primary app, admin and Kingdom project have the same SHA-256 fingerprint (`5ea542b9b5c7`; this is not the key). Provider requests used the key in memory, with a synthetic public place query; customer addresses and credentials were not logged.

| Google Places request | Observed result |
| --- | --- |
| No website referrer | 403, `API_KEY_HTTP_REFERRER_BLOCKED` |
| `https://security-review.example.invalid/` | 403, `API_KEY_HTTP_REFERRER_BLOCKED` |
| `https://app.arch9.co.za/` | 200, autocomplete predictions |
| `https://admin.arch9.co.za/` | 200, autocomplete predictions |
| `https://kingdomrealestate.co.za/` | 200, autocomplete predictions |

This proves the tested website restriction is enforced and the three normal origins can still search. It does not disclose Google's entire configured domain/API allowlist, quotas or past key usage. Unrelated Generative Language and Translation API probes were denied with `SERVICE_DISABLED`; disabled services do **not** prove an API-specific key allowlist exists. HTTP referrers can be forged outside a browser, so this key must never authorize private application data. Its principal residual risk is provider usage/charges.

No authenticated Google Cloud management credential is configured locally. Native browser control was interrupted by another active browser workflow; the in-app browser could not attach to this session. Consequently no Google key settings were changed, and full provider configuration remains unverified. With console access, inspect the existing key's application/API restrictions and usage before making changes:

1. Retain working production hostnames, including the `www` Kingdom domain and any verified live aliases that actually use this key. Do not replace the allowlist with only the three sampled origins or permit arbitrary `*.vercel.app` sites.
2. Authorize Maps JavaScript API, Places API (New), and any legacy Places/Geocoding service confirmed in current usage. Remove unrelated API permissions only after checking the live consumers. Separate app-specific keys can then be migrated one consumer at a time if useful.
3. Repeat both permitted-origin and denied-origin probes, then test address selection and the canvassing map in the real app. Roll back the restriction change if a previously supported consumer fails; do not remove restrictions wholesale.
4. Keep Supabase secret/service credentials server-side. Do not apply browser-referrer checks as a replacement for RLS or token authorization. Existing exposed legacy keys remain retired; do not re-enable them for a backup tool.

References: [Google key restrictions](https://docs.cloud.google.com/api-keys/docs/add-restrictions-api-keys), [Maps usage and migration guidance](https://developers.google.com/maps/api-security-best-practices).

## Recovery: what exists and what it does not cover

| Layer | Verified state | Remaining gap |
| --- | --- | --- |
| Database | Eight completed daily physical backups, 14–21 October. Latest backup `2024466958`, `2026-10-21T03:10:55.758Z` (05:10 SAST). | An identified-backup restore has not been proven by the recorded exercise. |
| Point-in-time recovery | Disabled. | Recovery between daily backups requires a separately approved paid add-on; daily recovery can lose changes after the latest backup. |
| Uploaded files | 5,514 Storage objects; 5,877,106,235 bytes total. The private documents bucket alone contains 1,944 objects / 3,338,580,479 bytes. | Database backups contain object metadata, **not file contents**. No independent file-backup destination/credential was found in the inspected configuration. |
| Recorded July recovery exercise | An isolated branch copied the live database and answered aggregate smoke queries. | A live copy does not demonstrate restoration from a saved backup. The evidence has been corrected; historical facts remain preserved. |
| Functions, provider configuration and secrets | Source and hosting release identities are recorded separately. | A complete recovery needs a matching source release, Auth settings, bucket settings/policies and safely escrowed current secrets. Do not restore revoked keys from an old database or environment backup. |

The recovery gate now requires a recorded restore method, identified source backup, matching source project, isolated target and successful smoke checks. A failed live provider check or absence of completed recoverable backups blocks it. It explicitly reports database-only scope and excludes Storage bytes. The current corrected evidence is blocked until a real backup restore passes; this does not affect the running app.

[Supabase backup coverage](https://supabase.com/docs/guides/platform/backups) and [restore-to-new-project coverage](https://supabase.com/docs/guides/platform/clone-project) confirm these distinctions.

## Prepared file-backup option — not yet enabled

Use a company-owned private Backblaze B2 bucket in its EU region, separate from Supabase and production app credentials, with client-side encryption through rclone crypt. First provision the account/bucket under the company owner's control. Do not upload customer files or sign up for billing before the owner approves that destination and any costs. This is an implementation recommendation, not a configured service.

Published [B2 pricing](https://www.backblaze.com/cloud-storage/pricing) includes the first 10 GB of storage free and prices additional storage at $6.95/TB/month. A single current 5.88 GB copy should fit that storage allowance, but history, changes and other account usage can exceed it. Source-provider egress, recovery traffic and any EU-specific quote must be checked separately. Set billing alerts/caps before activation; a cap that stops backups must surface as a failure, not a healthy backup.

### Credentials and retention

- Keep the bucket private. Give the backup worker a bucket-scoped list/read/write application key without account administration, lifecycle changes or permanent-delete permissions. Keep lifecycle/retention administration with the owner, separate from the app. Test required capabilities; do not widen to an account-wide master key to resolve a tool error.
- Retain previous object versions and deleted-source files for at least a proposed 30-day recovery window. Confirm the owner accepts the window before enabling automatic expiration. No cleanup, prune, sync, purge or delete command is part of the backup run.
- Store independent random encryption password and salt in a company password manager with owner-held recovery access. Rclone's `obscure` output is reversible and must be protected like the original password. Do not commit it or put it in command arguments/logs. A machine-only key without owner recovery is insufficient.
- Load rclone credentials and encryption settings from a protected runner secret store or macOS Keychain into process environment, with `RCLONE_CONFIG=/dev/null`; do not save them in repository `.env` files. Rclone crypt must encrypt both contents and names (`filename_encryption=standard`, `directory_name_encryption=true`).
- For Supabase S3, use dedicated server-only S3 credentials. They bypass RLS and permit writes, so isolate them from the app and restrict operational use to source list/read. Supabase's documented session-token mode currently needs the legacy anon key and does not support a modern publishable key. **Do not re-enable the retired legacy API/signing keys to use it.** A short-lived, RLS-scoped modern alternative needs separate implementation/testing before substituting it.

### Backup, verification and recovery commands

The following names are operator-configured remotes, not supplied credentials: `arch9source:` is the production S3 source; `arch9crypt:` is the encrypted private backup bucket/prefix. Confirm both identities before use. The source must never be a copy destination. Full verification streams objects and can incur provider egress; run on a controlled host with enough capacity for an isolated restore.

```sh
# Copy retains destination-only objects; do not substitute sync.
rclone copy arch9source: arch9crypt: --retries 3
# Required: catches missing objects, a wrong encryption key and mismatched bytes.
rclone cryptcheck arch9source: arch9crypt: --one-way
```

A backup is successful only when **both** commands succeed and the encrypted run inventory matches the expected source bucket/object counts. Capture a timestamped integrity manifest (object versions, source modification times, lengths and SHA-256 digests) inside the encrypted backup; capture source bucket visibility and metadata in that encrypted manifest too. Reconcile changing objects or fail the run; do not label a concurrently changing collection an atomic database/file snapshot. Keep only redacted aggregate status in CI logs. File names and raw provider error bodies can contain private information.

For recovery, select a successful backup run and compatible database backup. Reconstruct the historical B2 view with its retained version timestamp, not just today's latest encrypted files. Restore into a new, mode-0700 directory on a controlled recovery host and compare every restored object with the saved manifest. Rclone's `--b2-version-at` supports historical, read-only views. Use `rclone check --download` against the matching source/manifest as an additional verification when available. Merely returning exit 0 or producing an empty directory is not sufficient proof. Never test by overwriting/deleting a customer file.

Schedule daily incremental copies and failure alerts only after the destination, retention, credential custody and first complete verification are configured. Prove recovery of a deleted file and an overwritten earlier version, private bucket access denials and public listing images in an isolated restore project. A server-side upload can change Storage ownership/metadata; reconcile it against the database backup and test user access rather than declaring a successful S3 copy a full application restore.

### Test performed locally

A synthetic fixture using rclone 1.75.1 encrypted file contents and paths, restored PDF/image bytes exactly, checked ciphertext integrity and retained a file after source deletion. Wrong-password coverage verification and tampered-ciphertext recovery failed as expected. Rclone `copy` alone can return success while skipping names it cannot decrypt; the mandatory coverage/hash verification detects this. No customer file was copied and no cloud backup was initialized. This proves the local encryption/recovery mechanism only; remote retention, credentials, full coverage and scheduling remain pending.

## Required actual database restore

Use Supabase's **Restore to a New Project** flow for an identified completed backup (for example `2024466958`), in the same company organisation and region. Review the actual displayed price before creating the temporary target; compute is billed hourly and cloning mirrors resource settings. Never call the production in-place restore endpoint for a rehearsal, and never restore over active staging.

Keep outbound workers/email, cron, provider access and customer traffic disabled in the isolated target. Check aggregate counts, constraints, Auth/RLS boundaries and a controlled app smoke test. Coordinate Storage versions to the chosen recovery time, reconfigure Auth/functions/settings from the release record, and supply current replacement secrets. Inspect restored cron/Vault configuration before enabling outbound access; an old backup may contain revoked credentials. Record the source backup ID, isolated target ref, timestamps and results. Securely decommission the copied-data target after the owner accepts the evidence.

No new project, paid PITR, account subscription or production restore was started. Those steps require owner-controlled account access and an accepted provider quote. MFA remains deferred.
