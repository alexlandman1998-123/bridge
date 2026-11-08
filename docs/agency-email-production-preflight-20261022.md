# Agency self-service email: production preflight, 22 October 2026

Status: **deployed and enabled, with provider limitations**. This report retains
the original preflight below; the release result in this section supersedes its
earlier blocked/not-applied observations.

The user explicitly authorised an exception to the backup-restore test for this
release only. Restore proof remains absent; the recovery evidence was not changed.
The existing Free Resend plan was retained, with no purchase or upgrade.

Applied exactly `20261022081153_agency_self_service_email.sql`, after the guard
and isolated dry run listed that migration alone (no seeds, roles or Vault
changes). Verified the ledger, reservation RLS, sender RPC access and revoked
browser writes to sender/policy tables. All seven scoped functions are ACTIVE:
send-email 186, resend-webhook 51, email-campaign-test 27,
email-campaign-worker 32, email-sender-verification 27,
email-sending-domain-create 25 and email-sending-domain-verify 26. JWT settings
and production credential wrappers were preserved.

Vercel deployment `dpl_7KJ3NxZKEBwhLzDULqeMyyqKkN1V` passed the production
build and was promoted. The live `https://app.arch9.co.za` response returned 200
with release marker `d1d83b8727b0798209a13a769de3a826d760517b`. The release
candidate came from the prior live source plus only the three app files for this
feature, preserving unrelated working-tree changes and production fixes.

Verification: 56 focused tests and isolated database checks passed again;
candidate UI/service tests (9), service baseline, lint and focused changed Edge
module type checks passed. All seven live unauthenticated POST probes returned
401, including invalid webhook signatures. Security advisor counts remain one
INFO and two WARN. The campaign worker schedule remains enabled with successful
recent cron invocations. These checks do not prove actual email delivery.

Remaining limitations: all three Resend domain slots are occupied; the provider
allows 100 emails/day shared and 3,000/month. Home Seekers DNS is failed at Resend.
Chrome closed during webhook configuration and its connection became unavailable,
so no provider setting was changed: the five missing events below remain pending.
Domain verification still works through the setup screen's polling/manual checks;
automatic provider domain notifications and open/click reporting need those event
subscriptions. Authenticated production setup acceptance and actual delivery were
not completed. No emails were sent by this release verification.

Detailed execution receipt and logs: `output/agency-email-production-20261022/`.

## Webhook and delivery follow-up, 22 October 2026

The user authorised completing the webhook setup and a controlled live send on
this plan. Added `email.opened`, `email.clicked`, `domain.created`,
`domain.updated` and `domain.deleted`, preserving the original four events.
Resend saved nine events and the endpoint remains Enabled; its signing secret
and subscription plan were unchanged.

A single controlled `legacy_test` request to the production `send-email`
function returned 200 with provider ID `01a1632f-3745-7612-98b4-fd16cdbf9f76`.
Resend shows Delivered from `no-reply@arch9.co.za` to the requester's Gmail at
12:36 SAST. The signed `email.delivered` callback
`msg_3L2wK7J2PFvYYXkoiInWnmRoI1P` returned HTTP 200 on its first attempt.
The matching database webhook audit row exists. Its status is correctly
`ignored`: this standalone test has no campaign/notification record to update.
An earlier request was rejected with 401 before sending due to conflicting API
key headers; using the supported modern server-key header succeeded.

The authenticated production agency settings screen loaded successfully. No
agency configuration or customer campaign was created or sent. This verifies
production shared sending, provider delivery and signed callback receipt. It
does not prove agency self-service sending end to end: the sole connected agency
domain, HomeSeekers, still has failed DNS at Resend and there are no spare domain
slots. DNS must be corrected before that agency's actual sender test can run.
Open/click/domain-change event delivery was not generated in this test.
Screenshots and the controlled-send result are retained with the release receipt.

## Original preflight observations (before the authorised exception)

## Confirmed targets and scope

- Database: Arch9 SaaS, `isdowlnollckzvltkasn`, `eu-west-1`, ACTIVE_HEALTHY.
- Primary application: Vercel `bridge`, project
  `prj_rbfXykMU6mU1eECbc0lJS9sPspmp`, team `team_ezJ5RCE7qwTf14fw215IhPs5`.
- Existing production deployment resolved through `app.arch9.co.za`:
  `dpl_KSqthbaiY3taF8VUPsdtyuzwCbBm`, READY. It was not replaced.
- The live ledger has 1,549 versions. Comparing every local version with the
  ledger finds exactly one pending local migration:
  `20261022081153_agency_self_service_email.sql`.
- Eleven already-applied remote versions are absent from this checkout. The
  normal linked `db push --dry-run --skip-vault` refuses that history mismatch.
  No ledger repair or unrelated migration was attempted. A read-only fetch of
  actual remote migration history into a private temporary directory resolved
  the checkout mismatch for the scoped audit. The subsequent isolated linked
  `db push --dry-run --skip-vault` passed and listed exactly the agency-email
  migration, with empty seed and role lists. Existing checkout migrations were
  not altered. The same scope independently matches the read-only ledger
  comparison.
- The existing approval trigger, operator RPC, subscription initialiser and
  sender guard required by the migration are present. The new quota table,
  sender-save RPC and migration version are absent.
- Planned runtime scope: primary app plus `email-sending-domain-create`,
  `email-sending-domain-verify`, `email-sender-verification`, `email-campaign-test`,
  `email-campaign-worker`, `resend-webhook`, `send-email`, and their changed
  shared helpers. Preserve the deployed credential wrappers and newer production
  fixes when constructing the isolated release candidate.

## Read-only shared email checks

- Supabase metadata confirms `RESEND_API_KEY`, `ARCH9_RESEND_FROM_EMAIL`,
  `RESEND_WEBHOOK_SECRET`, `EMAIL_CAMPAIGN_WORKER_SECRET` and
  `EMAIL_CAMPAIGN_CRON_KEY_SHA256` are configured. Presence does not prove provider
  validity. No credential values are recorded in this report.
- The enabled `arch9-email-campaign-worker` job runs every minute. Its last
  completed cron invocations succeeded. This proves scheduler execution, not
  email acceptance or delivery.
- The live webhook returned HTTP 401 for an unsigned request, before storage.
- `RESEND_BILLING_CONFIRMED` is absent; billing readiness was not asserted.
- Correct-account follow-up: the requester switched the browser to
  `alexlandman1998`. The Home Seekers provider domain ID now matches production
  (`09e62a37-803b-490f-b349-c6514d16d435`), confirming the central account.
  `arch9.co.za` and `updates.arch9.co.za` are Verified; `homeseekers.co.za` is
  Failed at Resend, although Arch9's last saved state was pending.
- The central account's Usage and Billing screens show the Free transactional
  plan: 3,000 emails monthly, 100 emails daily, and all 3 of 3 domain slots used.
  At inspection it showed 30 monthly emails and 4 daily emails used. The
  application's planned 500-per-agency cap does not override this shared
  provider cap. More provider domain capacity and sending allowance are needed
  before general agency onboarding. No plan purchase or upgrade was made.
- The production webhook is Enabled and recent delivery notifications show
  successful HTTP 200 callbacks. Its selected events are `email.bounced`,
  `email.complained`, `email.delivered` and `email.suppressed`. It is missing
  `email.opened`, `email.clicked`, `domain.created`, `domain.updated` and
  `domain.deleted` for the complete new flow. The edit form was inspected and
  dismissed without saving. Signing-secret plaintext was never revealed or
  copied; a byte-for-byte comparison was not performed.
- Production currently has one pending agency sending domain, zero active
  verified agency senders, zero sending-policy rows and zero queued campaigns.
- Existing security-advisor baseline: three findings (one INFO, two WARN),
  none attached to email objects. These existing findings were not cleared.

## Blocking recovery gate

`npm run supabase:guard` passed: no duplicate local migration timestamps and all
critical onboarding migrations present. `npm run supabase:push:lock-recovery`
returned **RECOVERY_LOCK_BLOCKED**, with:

- `recovery_test_not_recorded`
- `backup_restore_not_proven`

The live check confirms eight available physical backups and PITR disabled.
The earlier exercise cloned the live database; the 21 October coverage correction
explicitly records that it did not restore an identified backup. That evidence
was not changed to claim success. The direct-production runbook requires a stop
on failed recovery checks, independently of the temporary staging exception.

To unblock: perform and record a genuine identified-backup restore into an
isolated environment, with external jobs prevented from operating against live
systems, then rerun the recovery check. Do not restore over production or staging.
The central Resend account and platform domains are now identified. Increase
provider capacity, fix the failed agency domain DNS, and complete the required
webhook subscriptions and readiness check before release. No new paid
project, recovery service or provider plan has been purchased or provisioned.

## Retained evidence

Read-only logs, migration comparison, webhook response, configured-secret names
and scoped source hashes are under `output/agency-email-production-20261022/`.
The phase-one local verification remains the existing full app check, 56 focused
tests, isolated database checks and desktop/mobile browser checks. No new source
change was needed during this preflight, and no live delivery is claimed.
