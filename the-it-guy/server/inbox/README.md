# Inbox mail worker

This is the primary transaction workspace's receiving and sending process. Run it as one
long-lived Node 22+ service with outbound HTTPS and secure IMAP (TCP 993). It does
not run in a browser, Vercel request handler, or Supabase Edge Function. One process
handles one mailbox at a time; database leases also prevent overlap between
replicas. Start with one replica and a region near the database.

## Local checks

```sh
npm --prefix the-it-guy/server/inbox ci --ignore-scripts --no-audit --no-fund
npm --prefix the-it-guy/server/inbox test
npm --prefix the-it-guy run test:shared-inbox-access
```

Tests use local provider/database fixtures and do not contact any mailbox.

## Runtime configuration and release

Apply `20261025185107_shared_inbox_mail_receiving.sql` after the earlier mailbox
foundation/settings migrations. Deploy the updated Microsoft/Google OAuth,
`revo-inbox-sync` and `revo-inbox-connection-lifecycle` functions plus the new
`revo-imap-inbox` and `revo-inbox-attachment` functions before releasing the UI.
Deploying functions or applying migrations requires explicit approval and the
repository's database release guard/runbook. No deployment is performed by the
implementation or the tests.

Provide runtime secrets through the hosting service's secret manager:

- `SUPABASE_URL` and `SUPABASE_SECRET_KEYS` (JSON key map, preferably `default`),
  or the server-only `SUPABASE_SERVICE_ROLE_KEY` compatibility alias.
- `REVO_GOOGLE_CLIENT_ID`, `REVO_GOOGLE_CLIENT_SECRET` for Google refreshes.
- `REVO_MICROSOFT_CLIENT_ID`, `REVO_MICROSOFT_CLIENT_SECRET`, optional
  `REVO_MICROSOFT_TENANT_ID` (defaults to `organizations`).

Use the same OAuth applications as the Edge connectors. Never use `VITE_` names
for these secrets or include them in a container image. Mailbox OAuth/IMAP
credentials are read from Vault, not environment variables. The process never
logs provider exceptions, credentials, addresses, or message content.

Start with `npm --prefix the-it-guy/server/inbox start`. `node worker.mjs --once`
from this directory processes at most one outgoing job and one receiving batch (and **does access the
configured database/mailbox**, unlike tests). SIGTERM/SIGINT finishes the current
bounded batch before stopping; allow a 180-second shutdown grace period. A hard
stop leaves a lease that another worker can reclaim after 180 seconds. Keep the
host's clock synchronized. Run without public ingress and with a normal service
restart policy. Queue status remains visible in settings if the worker is offline.

After an approved release, use dedicated Google, Microsoft individual/shared,
and IMAP test accounts to verify OAuth identity, private/selected/workspace
permissions, real MIME bodies and files, history pagination, a worker restart,
one failed mailbox alongside a healthy one, and disconnect/revocation. Review
worker safe-code logs and connection/sync-run metadata. These live checks remain
outstanding until hosting, credentials and release are approved.

## Receiving behavior and limits

- INBOX only, every mailbox independently; 15-minute schedule by default and
  manual queued sync/check. Default initial history is 30 days. Settings can
  request 7/30/90 days or all available history. Applying a changed window rescans
  without deleting existing messages; provider/RFC IDs prevent duplicates.
- Gmail full MIME messages and history cursors; Graph full bodies and inbox delta
  links. Expired provider cursors trigger safe replay. Existing preview imports
  are hydrated when the chosen history window includes them.
- IMAP uses implicit TLS on port 993, verified certificates and read-only INBOX
  locks. Public DNS answers are checked and an approved IP is pinned while TLS
  verifies the original hostname. Private/local/mapped/mixed DNS targets are
  rejected. UIDVALIDITY changes reset the UID scan; RFC Message-ID avoids replay
  duplicates. This first version imports new UIDs; it does not mirror later
  IMAP read-flag changes or remote folder/deletion changes.
- Each durable checkpoint includes the unfinished page. Message, thread aliases,
  file metadata and cursor commit in one transaction after file upload. Failed
  writes retain the current message. Lease fencing checks current manager access
  and rejects late writes/credential rotation after disconnect or reconfiguration.
- Native provider threads take precedence; RFC references thread IMAP replies,
  including replies received before their parent. Mailboxes never share threads
  or deduplication keys. Backfill preserves newer previews and read timestamps.
- Bodies are capped at 512 KiB per text/HTML representation and shown as limited
  when truncated. Provider HTTP payloads have a 32 MiB ceiling. Each file is
  capped at 10 MiB and each message at 20 MiB of stored files, with at most 100
  attachments. Oversized or unsupported cloud/item attachments appear explicitly
  in the reader and can be opened in the original mailbox. Limits prevent
  unbounded allocation; repeatedly malformed/oversized provider payloads report
  a mailbox error and retain their position for investigation.
- Files live in a private bucket. Downloads recheck mailbox membership through an
  authenticated Edge endpoint on every request; browser roles cannot directly
  read objects or mint durable signed URLs. Files download as attachments with
  `nosniff`; formatted bodies have no remote images, styles or tracking resources.
  Uploads use deterministic content paths, so retries reuse existing bytes. A
  disconnect/crash between upload and SQL commit can leave an unreferenced file;
  future retention cleanup should compare storage paths to live metadata before
  deleting anything. There is no automatic destructive cleanup in this release.
- The reader fetches 20 messages at a time and supports older-message loading.
  Conversation metadata loads in batches, with an explicit older-conversations
  action; search/counts apply to the conversations currently loaded.

POP, remote deletion, folder management and attachment preview are separate
work. Outgoing email and signatures are described below. Google is connected per
account and shared through Arch9 permissions; this flow does not claim support
for Google domain-wide/delegated mailbox authorization.

## Outgoing email

The same service now processes one outgoing email and one receiving batch per
iteration. The two queues have separate error boundaries. They share a connection
lease so OAuth token refresh and mailbox access cannot race between the two
workers. `--once` processes at most one outgoing job and one receiving batch.

Apply `20261025191848_shared_inbox_email_sending.sql` after the receiving migration.
Deploy `shared-inbox-send`, `shared-inbox-upload` and `shared-inbox-smtp`, then the
updated Node worker and UI. New migrations and function deployment still require
explicit approval. The Dockerfile includes the sender and explicitly pins
Nodemailer in the worker package/lockfile. No new browser dependency is required.

Users with mailbox send permission can create email or reply from that mailbox,
edit To/Cc/Bcc, add files, and review the mailbox signature. New-message and reply
signature defaults remain independent. The server renders the shared structured
signature and stores the final body once at queue time. A changed signature
revision rejects a stale preview. Replies stay on their original mailbox and use
provider Reply-To (falling back to From/contact), In-Reply-To and References. The
reply message identity is captured when the composer opens. Changing a reply's
subject omits an incompatible Gmail thread ID; RFC reply headers remain intact.

Microsoft and Google use the existing OAuth applications and sending scopes.
Every job verifies the provider account/mailbox before submission. Other email
mailboxes use independent Vault-backed SMTP credentials, configured by a mailbox
manager after IMAP receiving connects. Ports 465 (implicit TLS) and 587 (required
STARTTLS) are supported with certificate verification and pinned public DNS.
Plaintext transport, port 25, internal/private destinations and certificate
bypasses are unavailable. Saving settings does not claim a live connection test;
authentication is checked before a queued email is submitted. Disconnect wipes
both the IMAP/OAuth and independent SMTP credential. Reconfiguring IMAP preserves
SMTP credentials but pauses sending until receiving reconnects.

Attachment uploads require current send permission and are private. The queue
transaction binds each file to its uploader, organisation, mailbox and one job.
Up to 10 files are allowed, 10 MiB each and 20 MiB combined. This direct Microsoft
MIME sender limits combined files to 2 MiB and checks the final encoded request
before submission (large draft/upload-session sending is separate work). Other
provider message-size limits can reject a message explicitly. The worker builds
MIME with in-memory bytes and disables local-file and URL attachment loading.
Bcc is sent in the SMTP envelope and is omitted from SMTP message headers;
Gmail/Graph consume Bcc in submitted MIME. Ordinary conversation recipient lists
contain To/Cc, with no Bcc disclosure. Files use the existing authenticated download
endpoint and are not made publicly readable.

### Acceptance, retry and recovery

- Each composer request has one persistent idempotency key. Duplicate requests
  return the existing job, and changed content cannot reuse its key. If the
  browser loses the response, it freezes that intent and can check queue status
  or retry the exact same request. Closing an unconfirmed composer should be
  followed by checking **Outgoing email** before composing another email.
- Jobs move through queued, preparing and submitting. Before submission, the
  worker rechecks current send/manager access, pause/disconnect state and lease.
  Expired preparing leases can be reclaimed safely because no message has been
  submitted. A queued job can be cancelled; a definitive failed job can be
  retried unchanged. SMTP authentication and explicit provider rejection are
  failures, not fabricated successful sends.
- After submission starts, a dropped connection, timeout, malformed acknowledgement
  or server error becomes **confirmation unavailable**. Expired submitting jobs
  also become uncertain. There is no automatic resend and no retry button for
  these jobs: check the provider's Sent folder first. SMTP operations have a
  60-second absolute deadline as well as connection/socket timeouts. A partial
  SMTP recipient acceptance is accepted with the rejected addresses shown to the
  original sender or mailbox manager; the
  whole email must not be resent automatically.
- A known provider receipt is persisted without resubmitting. Late receipts can
  still be recorded after disconnect/lease expiry, and repeated receipt writes
  are idempotent. If persistence remains unavailable, the job eventually requires
  review rather than risking duplicate mail. Logs contain only job IDs, safe
  state/error codes and receipt-recording state.
- **Accepted by provider** is not confirmed recipient delivery. Microsoft 202 has
  no returned provider message ID. Gmail records its returned message/thread IDs.
  SMTP stores the accepted email in Arch9; copying it into the provider's IMAP
  Sent folder is not implemented. Inbox sending has no delivery/bounce webhook.

Before an approved live release, verify all three transports using dedicated
mailboxes and recipients: correct From and Reply-To, non-disclosed Bcc, signature
selection, attachments, shared Microsoft mailbox sending rights, provider Sent
copies, explicit rejection, partial acceptance, a worker restart before/after
submission, disconnect and permission revocation. Local fixtures do not establish
provider acceptance or delivery. Browser drafts and internal notes remain private
and do not send themselves. POP and remote folder/deletion management remain
separate work.

## Phase 5: verification and release approval packet

Local verification completed on 25 October 2026 for the primary app and its shared
Inbox backend. **Release approval is pending.** No remote migration, deployment,
mailbox connection or email submission was performed. This packet describes the
candidate; it is not evidence of a successful hosted release.

The existing `test:shared-inbox-access` command now also runs
`src/modules/sharedInbox/__tests__/mailboxJourney.test.mjs`. It executes the actual
Inbox migrations, SQL commands and RLS together: a selected team mailbox and a
private mailbox receive identical provider/RFC identifiers, retain different
conversations, reply with their own From/signature, and queue each request once.
It then disconnects/reconnects one mailbox while a send is preparing, rejects
stale sending/receiving work, accepts the healthy peer's fixture receipt, replays
receiving without duplication and revokes the responder's read/send access.
Vault and Storage are fixtures; these are database acceptance checks, not live
transport tests or a complete replay of the repository's migration chain.

### Local evidence

Run the following serially from the repository root. None of these commands
connects to real providers or a configured remote database.

```sh
npm --prefix the-it-guy run test:shared-inbox-access
npm --prefix the-it-guy/server/inbox test
deno test --config supabase/functions/shared-inbox-send/deno.json supabase/functions/_shared/inboxSendingHandlers.test.ts supabase/functions/_shared/inboxReceivingHandlers.test.ts supabase/functions/_shared/sharedInboxAccess.test.ts
./the-it-guy/node_modules/.bin/vitest run --root the-it-guy src/components/inbox/__tests__/InboxEmailActions.test.jsx src/components/inbox/__tests__/EmailMailboxSettings.test.jsx src/pages/revo/__tests__/RevoSharedInboxPage.test.jsx src/components/inbox/__tests__/InboxThreadMessages.test.jsx src/pages/revo/__tests__/RevoSharedInboxSettingsPage.test.jsx src/components/marketing/__tests__/EmailCampaignSettings.test.jsx src/modules/revo/sharedInbox/__tests__/receivingQueries.test.js --maxWorkers=1 --minWorkers=1
npm --prefix the-it-guy run test:revo-shared-inbox-foundation
npm --prefix the-it-guy run test:revo-shared-inbox-operations
npm --prefix the-it-guy run test:revo-inbox-connection-core
```

| Area | Evidence | Result |
| --- | --- | --- |
| Two inboxes together | New database journey above, existing mailbox/receiving/sending SQL checks | Passed |
| Permissions and agencies | Viewer/responder/manager/owner, suspended membership, cross-agency denial, private files and Bcc | Passed in database and handler fixtures |
| Sending and receiving | 26 worker tests: MIME, attachments, cursors, identity, TLS/DNS, token refresh, rejection/partial/unknown acceptance | Passed |
| Authenticated endpoints | 14 Deno tests: actor binding, mailbox access, safe signature, upload bounds and private download | Passed |
| Settings and Inbox | 63 Vitest tests across seven files: mailbox selection, signatures, reply identity, drafts/notes, queue recovery and reader | Passed |
| Existing Inbox behavior | Foundation, operations and connection-core commands above | Passed |
| Static validation | Scoped ESLint, Deno checks of all nine connector/command entry points, worker syntax and whitespace | Passed |
| Desktop/mobile browser | Phase 4 fixture preview checked composer, signature, SMTP setup, queue/cancel and widths 375/1280 | Previously passed; not rerun in Phase 5 |
| Production build/container | Not run locally under limited-memory/disk constraints | Outstanding in release build environment |
| Hosted database/provider behavior | Real Vault/Storage/RLS, OAuth grants, TCP connectivity, provider acceptance and recipient delivery | Outstanding after approved release |

Node's existing module-type warning and the existing test Tailwind content warning
do not fail these checks. No dependency or runtime changes are required by Phase 5.

### Candidate scope and rollout order

The working tree contains unrelated product changes. Select and review the Inbox
source explicitly when preparing the release revision; do not deploy the entire
working tree or every locally pending migration by default. Record the chosen
source revision, target project identity and current app/function/worker artifacts
before the release. Use `docs/database-release-runbook.md` and the current
production pilot policy for target/recovery guards and the exact dry-run review.
This phase does not run a remote dry-run or claim that the target is reconciled.

The candidate's Inbox migrations, in order, are:

1. `20261025063000_shared_inbox_all_workspaces.sql`
2. `20261025181115_shared_inbox_mailbox_foundation.sql`
3. `20261025182409_shared_inbox_email_settings.sql`
4. `20261025185107_shared_inbox_mail_receiving.sql`
5. `20261025191848_shared_inbox_email_sending.sql`

They depend on the existing September Revo Inbox schema/functions and canonical
organisation membership helpers. Inspect the target's effective objects and
migration history; apply only missing, reviewed migrations after the guard and
recovery checks pass. **There is no new Phase 5 migration.** Never modify the old
migration files or replay recorded migrations to reconcile drift.

After explicit release approval:

1. Run the target/recovery guards and inspect the exact migration dry-run using
   the database runbook. Stop on unexpected scope. Capture the existing deployed
   artifacts and recovery evidence before applying the approved migration set.
2. Deploy all updated entry points with their shared modules and import maps:
   `revo-google-workspace-inbox`, `revo-microsoft-inbox`,
   `revo-inbox-connection-lifecycle`, `revo-inbox-sync`, `revo-imap-inbox`,
   `revo-inbox-attachment`, `shared-inbox-send`, `shared-inbox-upload`, and
   `shared-inbox-smtp`. Keep manual JWT/mailbox authorization and the matching
   `supabase/config.toml` entries. Verify unauthorized requests are denied.
3. Build the worker image from `the-it-guy/server/inbox` with its own lockfile;
   supply secrets through the host, check Node 22+, outbound HTTPS/993/465/587,
   trusted certificates and shutdown grace. Keep the worker stopped until its
   test-mailbox scope is ready: starting it processes eligible queued work.
4. Build/release the primary app with its normal public Supabase configuration.
   Verify `/inbox`, `/inbox/settings`, Email settings and existing WhatsApp flow.
   Confirm server credentials are absent from the browser bundle.
5. Prepare dedicated test mailboxes/recipients and inspect existing queues before
   starting one worker replica. Complete the hosted acceptance matrix below;
   widen use only after recording its result. Accepted mail cannot be undone.

### Hosted acceptance still required

Use at least one selected team mailbox, one private mailbox, and two agencies.
Repeat transport cases for Google, Microsoft individual, Microsoft shared and
IMAP/SMTP; obtain provider-specific sending rights and OAuth consent as needed.
Record timestamps, opaque job/run IDs, expected/actual results and reviewer
without copying credentials or message content into the release record.

| Case | Expected observable result |
| --- | --- |
| Connect/reconnect each transport | Correct provider identity; receiving connects; last sync advances; SMTP is configured separately and authenticates when sending |
| Same incoming mail in two inboxes | Separate conversations, correct receiving address, independent unread state/cursor and private attachments |
| Viewer/responder/manager and second agency | Only permitted inboxes/actions visible; direct command and download requests denied after revocation |
| New message/reply and changing From | Permitted From, original reply mailbox/Reply-To, correct signature defaults and no duplicate signature |
| Cc/Bcc, Unicode and files | Dedicated recipients receive expected MIME and files; To/Cc recipients cannot see Bcc; verify provider Sent behavior where supported |
| One mailbox fails | Other mailbox continues receiving/sending; failed mailbox shows safe error/backoff and recovers after reconnect |
| Restart before submission | Preparing work resumes once after lease expiry; no duplicate received message or outgoing job |
| Interrupt after submission | Outcome stays uncertain unless a known receipt is saved; no automatic resend; reconcile against provider Sent/logs before any new message |
| Disconnect/revoke during queued work | No new submission with stale access/lease; previously accepted receipts remain truthful; disconnected credentials are cleared |
| Provider acceptance and delivery | Queue says accepted only after provider acceptance; verify actual dedicated-recipient receipt separately; Microsoft 202 alone is insufficient delivery evidence |

Do not induce real timeouts, revoke active production accounts or deliberately
resubmit an uncertain message as a test. Use dedicated accounts and controlled
faults; fixture results cover failures that cannot safely be reproduced live.

### Recovery and release decision

If validation fails, stop the Inbox worker first so it cannot claim more jobs;
allow an in-flight bounded operation to finish and preserve its safe-code logs.
Disable the candidate UI/command exposure by restoring the captured app/function
artifacts as appropriate. Review queued/preparing/submitting/uncertain jobs before
restarting anything. Disconnect only the affected dedicated mailbox when needed;
this clears credentials and requires reconnection. Do not delete messages,
attachments, Vault mappings, queue evidence or migration history as a rollback.
Keep the additive schema and obtain approval for any forward database repair.
A known accepted receipt may still arrive after disconnect and must be preserved.

Local acceptance is complete. Production sign-off remains pending the release
build/container, target-specific guards/migration review, approved deployment and
hosted matrix. POP, remote folders/deletion, delivery webhooks, SMTP Sent copies
and large Microsoft attachment upload sessions remain separate work.
