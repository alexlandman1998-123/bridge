# WhatsApp inbox, automations and bulk campaign diagnostic

8 November 2026 · Primary Arch9 workspace (`the-it-guy/`) and shared Supabase functions.

## Decision

Local repairs and focused automated checks pass. **Full live end-to-end acceptance remains outstanding.** No deployment, remote data modification, fresh Meta login, actual provider send, or automation activation was performed in this diagnostic. The existing production deployment already contains several handlers missing from the local working copy; the local defects must not be described as proven current production failures.

The working tree contains substantial pre-existing changes. The repairs preserve the current combined inbox reader, compact composer, chat import, Templates navigation, Facebook work and API credential compatibility. A release must isolate the reviewed WhatsApp changes from unrelated work.

## Findings and repairs

| Area | Finding in current local source | Repair / expected behavior |
| --- | --- | --- |
| Backend routing | Existing inbox pagination, rich messaging, CRM linking, automations, audience and reply-routing handlers had been disconnected from the main endpoint. | Reconnected existing handlers, including actor-scoped database authorization. |
| Connection ownership | Connection setup had become administrator-only and omitted owner/ownership metadata. | Agents can connect their own number; management can connect agency or agent numbers. Personal numbers remain inbox-only. |
| Phone app connection | Signup no longer retained the server-side phone-app mode, multiple-number selection, initial sync, or ownership-safe completion. | Reconnected atomic completion and phone-app sync; retained newer SDK load timeout and duplicate callback protection. Mode follows the authorization intent. |
| Inbox access | Older direct service-client reads bypassed established per-conversation assignment checks. | Restored actor-scoped access RPCs for history, messages, media and conversation actions. |
| Attachments | Runtime upload callback and bounded attachment request reader were missing. | Restored upload callback, binary hashing and request parsing limits. |
| Campaign processing | Prepare called the older preparation routine; the browser attempted synchronous dispatch. Closing the browser could strand delivery. | Prepare enqueues background work. Browser controls resume/pause/cancel rather than sending individual messages. |
| Campaign permissions | Actor context, audience plans and agency-only sender checks had been dropped. | Restored actor visibility, audience plan validation, approved template checks and the agency sender boundary. |
| Scheduling | Schedule fields and associated controls had been removed. | Restored future schedule validation, background delivery and result controls. |
| Webhooks | Inbox STOP handling, campaign reply attribution and phone-app event capture were disconnected. | Restored opt-out persistence, reply attribution, history/echo/mutation capture and edit/revoke handling. |
| Closed reply window | Compact composer hid template tools after the 24-hour reply window closed. | Approved template tools remain accessible; free-text sends remain blocked. Consent and explicit send review still apply. |
| Provider errors | Campaign provider errors could echo an access token supplied in a provider error string. | Redact the active token before returning/persisting the error. |
| Verification | Some existing tests still exercised older API names, browser dispatch and a schema without ownership/messaging migrations. | Updated those fixtures and assertions to exercise the current protected API and background behavior. |

## Meta requirements reviewed

Reviewed the official [WhatsApp Business Messaging Policy](https://business.whatsapp.com/policy), last updated 23 September 2026, and [Meta's explanation of business messaging controls](https://about.fb.com/news/2025/04/ways-to-manage-your-businesses-chats-on-whatsapp/).

- Business-initiated messages require an approved template used for its designated purpose. Templates can subsequently be paused or rejected.
- Free-text replies are allowed during the 24-hour service window following a customer message. An approved template is needed outside it.
- The recipient must have supplied their number and agreed to subsequent communications. Opt-out requests must be respected. Importing a CRM contact or phone-app history does not grant permission.
- Existing checks retain approval/category/language/parameter validation and recheck consent when claiming each queued recipient.
- Automated sends recheck current rule state, sender ownership, contact/lead state, permission and customer replies before dispatch. Existing automation schedules retain sending days, time zones and hours.
- Meta can still reject or limit compliant marketing messages based on account quality, recipient limits or other provider rules. A promise of zero provider errors is not possible. Accepted, delivered and read are separate states; uncertain sends must not be blindly retried.

Meta developer implementation pages returned HTTP 429 during this review; those pages were not treated as verified evidence. Supabase changelog and current Edge Function authorization documentation were also checked.

## Read-only production observations

Project verified as **Arch9 SaaS**, `isdowlnollckzvltkasn`; staging was not changed.

- One connected agency phone-app/coexistence sender has a stored credential; one disconnected Cloud API sender has none. Credential values were not selected or displayed. This does not establish token validity with Meta.
- All seven relevant WhatsApp/Meta Edge functions are active. The deployed Meta bundle contains inbox messaging, automation, phone-app onboarding and own-number connection handlers.
- Three existing campaign performance records show **sent**, with no queued or uncertain recipients in the inspected campaigns. Two have completed background jobs; the older campaign has no background-job row. Raw campaign status alone is not the user-facing result.
- No automation rules or automation runs exist. A live automation cannot be certified from production history.
- All three worker cron schedules are active every five minutes. In the inspected 24-hour window, automation had 287 successful scheduler runs / 1 connection failure; phone-app sync 284 / 4; campaigns 286 / 2. Later scheduler runs succeeded. These are scheduler results, not delivery receipts.
- The database scheduler functions gate provider worker invocation on queued work. Low/no worker invocation logs when no work is queued are therefore expected.
- All inspected WhatsApp base tables and authorization storage have RLS enabled. Private inbox, automation, sync and authorization tables deny direct authenticated reads/updates, with operations exposed through authorized server paths. Tenant/ownership behavior was additionally tested locally; this is not a claim that every database policy in the repository was audited.
- The project-wide security advisor has broader notices outside this review. No unrelated policy changes were made.

## Verification

Checks ran serially, with one Vitest worker and file parallelism disabled.

| Check | Result |
| --- | --- |
| Existing Meta integration, campaign, chat-import and personal-number assignment Node/PostgreSQL checks | 23 passed |
| Added route/webhook/automation worker checks | 5 passed |
| Twelve focused UI/service test files | 103 passed |
| Additional closed-window template accessibility regression | 1 passed |
| Provider credential redaction test | 1 passed |
| Deno checks: Meta integration and campaign entry points | Passed |
| Scoped ESLint: settings, campaign screen, composer and signup service | 0 errors; 2 existing campaign warnings (icon variable and render-time clock) |
| Scoped whitespace/diff checks | Passed |

**133 distinct tests passed.** Provider calls in automated tests are simulated. Database checks use local PostgreSQL-compatible PGlite, not writes to production. Full production build and authenticated browser/provider acceptance were not run; the machine's memory limits were respected.

Commands: `node --test --test-concurrency=1 scripts/meta-integrations.test.mjs scripts/whatsapp-campaigns.test.mjs scripts/whatsapp-chat-import.test.mjs src/services/whatsappPersonalAssignmentDatabase.test.js`; `node --test scripts/whatsapp-system-diagnostic.test.mjs` (from the primary package). Run the twelve focused Vitest files with `--maxWorkers=1 --no-file-parallelism`. Provider redaction uses `deno test --no-lock --allow-env=WHATSAPP_GRAPH_VERSION supabase/functions/_shared/whatsappCampaignMeta.test.ts` from the root.

## Remaining live acceptance

1. Prepare an isolated release of the reviewed source and verify it in the deployment environment. Repository instructions require explicit approval before deployment or remote changes.
2. With the business account owner, complete a fresh embedded signup for the intended agency or personal number; verify Meta app permissions, number registration, token validity, webhook subscription and phone-app eligibility where applicable. Do not disconnect the existing production number as a diagnostic shortcut.
3. Using an explicitly approved test recipient and recorded permission, send a reviewed template, receive its delivery webhook, receive a customer reply and reply from the inbox. Confirm closed-window template messaging, attachments and assignment visibility with the appropriate staff roles.
4. Run a small, explicitly approved campaign, close the browser after confirmation, and verify worker completion and actual recipient receipts. Check scheduled delivery and pause/cancel with separately approved test intents. Do not use customer audiences for smoke tests.
5. Create and deliberately enable a test automation only with approval; verify trigger, sending hours, permission, stop-on-reply and recorded outcome. Disable the test rule afterward with approval as part of the same controlled test scope.

No bulk customer send, Meta account setting change, rule activation or production release is authorized by the local review alone. These live checks remain prerequisites for claiming the requested end-to-end outcome.
