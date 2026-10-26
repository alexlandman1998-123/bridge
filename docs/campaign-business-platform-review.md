# Business promotion in Arch9 — review, 26 October 2026

The subsequent combined source catch-up is recorded in [the October 25–26 main review](october-25-26-main-catch-up.md). Its source and deployment evidence supersede the earlier Campaigns-only candidate identifiers below.

The primary Arch9 workspace now contains a wider agent marketing workflow. It
starts with the agent's business goal and connects saved content, audiences,
channel review, attributed enquiries and CRM follow-up. An isolated release
candidate passed the Vercel production build and 17 hosted asset/API checks.
The Campaigns database and Edge changes have not been activated in production.

## What agents can review locally

| Agent outcome | Implemented behaviour |
| --- | --- |
| Win seller instructions | Valuation and seller campaign plans, reviewed public contacts, branded assets, response links and seller enquiries |
| Attract buyers | Buyer acquisition and demand campaigns, saved audience selection and buyer response attribution |
| Build a local reputation | Agent profile, local expertise, market update, approved testimonial and handover campaign families |
| Keep relationships | Client check-ins, review requests and referrals alongside property promotion; 19 campaign families in total |
| Produce coordinated content | Editable Social, Email and WhatsApp content, branded square/story artwork, downloadable packs and saved playbooks |
| Use AI within campaigns | Optional bounded business copy refinement of saved, reviewed campaigns; apply, reject and undo without replacing intervening edits |
| Use AI in daily CRM work | Lead Activity Follow-up studio with a factual source brief, optional editable outreach suggestion, copy and existing task composer handoff |
| Capture campaign responses | Explicitly created/revocable links through existing public intake forms; accepted responses atomically record attribution and owned follow-up work |
| Publish to Facebook | Saved business campaign text/link preview, a separate Publish now action and actual provider result history |
| Review outcomes | Recorded responders, contact activity, overdue/unassigned work and current CRM stages; unknown measurements remain unavailable |

Quick AI Email campaigns are linked to a parent campaign through a checked atomic
database operation. Lost responses, retries, agency changes, opening a different
draft and edits made during a save are covered by the focused checks. Existing
Email/WhatsApp editors and channel permissions remain part of the workflow.

Campaign-only public-contact overrides require explicit review against the exact
current agency/agent source. Changed or removed source values invalidate that
review. Old campaigns remain readable; asset/draft/AI preparation asks for refresh
and confirmation instead of silently using stale details. Already prepared channel
drafts remain separate reviewable documents.

AI calls remain server-side and budgeted. OpenAI Responses and the existing
Anthropic adapter use operator-configured model records. Requests are bounded,
structured and source-scoped. The CRM suggestion excludes private contact data,
notes and documents from its model input. No model, token price or agency budget
has been silently enabled. No paid model request was made during verification.

## Verification and visual evidence

- 458 Vitest tests passed across 43 focused files, with one worker.
- 106 serial Node tests passed across 14 focused files, including actual additive
  migrations in isolated PostgreSQL and mocked provider boundaries.
- The final builder wording and workspace integration checks also passed after
  the small presentation changes. These repeat checks are not added to the total.
- Scoped lint passed with zero errors and one pre-existing unused-prop warning.
- The feature bundle built successfully. A complete isolated application/API
  candidate also passed Vercel's production build in the cloud. That build uses
  the exact currently serving source plus the reviewed Campaigns changes;
  `check:app` on the broad local working tree remains unverified.
- The final hosted candidate is bound to source `8a7a8b3eeda8b19127c9e8f1f4cd38fd11c4e66c`.
  All 17 HTTP checks passed: release identity, compiled assets, method/auth guards
  and a missing public-intake lookup. They did not use an application session,
  exercise the pending schema or call an AI provider.
- Isolated release checks also passed 50 UI cases, 44 API/provenance cases,
  11 Meta cases and 116 Email delivery/source cases. These overlap the original
  focused checks and are not added to that original total. Full Meta/Email Deno
  entrypoint comparisons have identical existing production diagnostics; no new
  diagnostic appeared, but strict type checking is not clean.
- Desktop and phone browser checks used the actual components and pure models
  with explicitly synthetic service adapters. They are local UI evidence, not
  proof of hosted integration or production writes.
- An actual generated campaign ZIP contained 14 entries, including square
  1080×1080 and story 1080×1920 PNG assets and text. Artwork was opened visually.

The focused commands, logs, release manifest and task-only source patch are in
`output/campaign-business-20261025/`. Browser evidence and its synthetic review
fixture are in `output/playwright/campaign-business-20261025/`. The local review
server is `http://127.0.0.1:4194`; `/review/crm` shows the CRM Follow-up studio.

## Activation work and verified account state

Read-only checks identified production as `isdowlnollckzvltkasn` (Arch9 SaaS).
The migration guard passed. A production CLI dry run against an isolated release
directory selected exactly 14 Campaigns migrations and dependencies and excluded
six unrelated pending migrations. No migration was applied. Exact filenames and
SHA-256 hashes are in `output/campaign-business-20261025/release-scope.json`.

The live recovery check found eight completed physical backups and no PITR. It
returned `RECOVERY_LOCK_BLOCKED`: a tested restore from an identified backup is
not recorded/proven. This is a repository release requirement. Its reports were
written only into the review folder; existing recovery evidence was preserved.

The user approved the exact fourteen migrations and matching runtime release,
then chose **“Prepare everything; leave paid recovery pending”** when Supabase
quoted US$10/month for an isolated recovery project. No paid project was created.
The restore requirement still blocks activation. Current build attempts, isolated
application/Edge source attestations and release gates are recorded in
`output/campaign-production-release-20261026/release-review.md`.

Before a production release:

1. Complete and record the required isolated backup restore verification. Follow
   the [database release runbook](database-release-runbook.md).
2. Preserve the exact approved production scope. Recheck target identity, hashes,
   dry-run scope and recovery at release time; exclude unrelated changes in the
   active working tree. Paid recovery remains pending the owner's decision.
3. Apply the reviewed database changes before dependent runtime code. Deploy the
   matching primary API and isolated Meta and three Email Edge candidates, then
   promote the verified primary UI built with
   `VITE_FEATURE_CAMPAIGN_WORKSPACE=true`. Do not deploy Edge source from the app
   candidate or the broad local working tree.
4. Configure the server AI provider key, enable a reviewed model/rates record and
   an agency budget before enabling AI. Vercel's production environment names
   did not include `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` at the time checked.
   ChatGPT browser sign-in does not configure those server credentials.
5. Verify agency public setup, the responsible active agent, public intake forms,
   and each selected channel. The production aggregate showed zero verified
   Email senders and two Meta connection records; a connection record alone does
   not prove a usable token or posting permission.
6. Recheck Meta App Review and Page capabilities. The signed-in Meta console
   showed Review in progress when inspected; approval is external to Arch9.
7. Verify hosted access controls, save/reopen, one authorised test enquiry and
   CRM ownership/task/consent, sender checks, AI budget enforcement and exact
   Facebook preview. Actual sends/public posts require intentional approval.

No production data, external campaign, advertising spend, customer email or
Facebook post was created by this work. No deployment was promoted.

## Product boundaries that still matter

Playbook days are plans; they do not schedule or autonomously execute outreach.
Native business publishing supports immediate organic Facebook text/link posts.
Native Instagram, photos, paid ad buying, timed social publishing and imported
social engagement reporting remain future work. Existing manual asset export is
available. The response flow reuses existing intake forms, rather than providing
a new landing-page CMS. Outcomes show recorded activity and CRM progress, not
inferred revenue, complete cross-channel attribution or ROAS.

Detailed contracts and verification are in [business response links](campaign-business-responses.md),
[Facebook publishing](campaign-facebook-posts.md), [CRM follow-up](crm-follow-up-assistant.md)
and [the existing AI Email guide](ai-campaign-assistant.md).
