# Backer Technical Roadmap - 2026-08-04

## Purpose

This document is for the backer meeting on Tuesday, 4 August 2026. It explains the current technical work as a release sequence, not as a loose task list.

The key message: Arch9 is not blocked by one missing feature. It is in the final stage of turning a broad product build into a controlled, evidence-backed pilot. The work now has four parallel responsibilities:

1. Finish the user-facing pilot journey.
2. Protect the data and production database.
3. Prove the product in staging with real operational scenarios.
4. Run the first pilot in small batches with support and rollback controls.

## Plain-English Status

The platform already has substantial product capability:

- Agency CRM, leads, listings, offers, and transaction conversion.
- Buyer and seller onboarding.
- Attorney, bond, legal-document, and transaction workflow surfaces.
- Notification and email infrastructure.
- Public listing and intake paths.
- Pilot controls, runbooks, and readiness checks.

The hard part now is not "can we build screens". The hard part is making sure a real pilot transaction can move from lead to offer to transaction without duplicate records, missing participants, missing documents, wrong notifications, or unsafe database changes.

## Meeting Framing

Use this opening:

"The product is past prototype work. We are now in controlled release work. That means every feature has to pass three gates before I can responsibly expose it: does it work for the user, does it persist correctly, and can we prove it in staging and recover if something goes wrong."

Then explain the work in this order:

1. What must be true for a controlled pilot.
2. What is still incomplete.
3. What we are doing daily.
4. What decisions or support are needed from the backer.

## Current Priority Order

### Priority 1: Pilot Transaction Spine

Goal: one accepted offer reliably becomes one transaction with the right participants, documents, workflows, and next action.

Why it matters: this is the core business journey. If this is unstable, everything downstream becomes unreliable.

Done means:

- Transaction creation is idempotent, so retries do not create duplicates.
- Buyer, seller, agent, attorney, bond, and other role requirements are created correctly.
- Required documents are generated from the transaction type, finance type, and entity type.
- The workflow control board shows stage, blockers, next action, and owner.
- The same truth is visible internally and in the client-facing portal.

### Priority 2: Notification And Email Reliability

Goal: the right person receives the right message at the right time, with tenant branding and audit logging.

Why it matters: the product is operationally useless if leads, clients, agents, attorneys, or bond originators are not notified correctly.

Done means:

- First-class notifications exist for new enquiries, assignments, SLA reminders, document requests, public demo enquiries, and key transaction actions.
- Branded templates are consistent.
- Plain-text fallbacks exist.
- Notification events are logged with stable automation keys and delivery status.
- Pilot emails can be enabled for a controlled organisation and rolled back quickly.

### Priority 3: Staging And Supabase Release Safety

Goal: no broad database push, no unclear migration history, no production change without evidence.

Why it matters: the database is the business record. A bad production migration can corrupt real transactions, clients, documents, or workflows.

Current reality:

- The Phase 0 database-write freeze is still active.
- Freeze retirement is blocked until the migration train has staging evidence, production promotion evidence, and live ledger closeout.
- Production closeout currently has incomplete production evidence rows.

Done means:

- A real non-production staging target is used.
- The pending migration train is applied and evidenced one row at a time.
- Production is promoted one row at a time after reviewed staging evidence.
- The closeout report says the freeze can be retired through a separate reviewed change.

### Priority 4: Pilot Operations

Goal: expose only a tiny controlled batch, then observe and decide.

Why it matters: the first pilot is not a marketing launch. It is a controlled proof that the workflow can handle real work safely.

Done means:

- A named pilot lead owns each batch.
- Each batch has at most 2 new transactions.
- Every transaction has a post-deploy check.
- Notification delivery is reviewed.
- Support issues are logged and resolved before the next batch.

## What Is Frozen For Now

To protect the timeline, the following should not expand until the pilot journey is proven:

- New CRM expansion beyond the pilot needs.
- AI automation.
- Advanced analytics.
- Calendar expansion.
- Commercial expansion.
- Enterprise workspace expansion.
- Custom workflow builders.
- Billing and payments.

This does not mean those items are unimportant. It means they are not allowed to consume the critical path before the pilot can run safely.

## Daily Breakdown

### Tuesday, 4 August 2026 - Backer Alignment And Scope Lock

Outcome: backer understands the release path and agrees what is in or out of the next sprint.

Work:

- Present this roadmap.
- Confirm the controlled pilot definition: small batch, evidence-backed, not full launch.
- Confirm which organisation or pilot users matter first.
- Freeze non-MVP expansion unless explicitly approved.
- Agree on the reporting cadence: daily internal status, weekly backer summary.

Backer decision needed:

- Approve the pilot-first focus.
- Accept that some attractive features must wait.
- Confirm whether the immediate goal is "controlled pilot" or "public launch". The plans are different.

### Wednesday, 5 August 2026 - Current Work Closeout And Backlog Triage

Outcome: active notification/email work is either completed, parked, or cut from the pilot path.

Work:

- Finish the current email notification branding and lead operations changes.
- Separate pilot-critical notifications from nice-to-have notifications.
- Make sure public demo enquiries and additional document requests have dedicated templates or a clear temporary fallback.
- Run focused notification tests.
- Produce a short remaining-blockers list.

### Thursday, 6 August 2026 - Staging Readiness And Release Gate

Outcome: staging path is clear enough to prove the pilot without touching production unsafely.

Work:

- Confirm the staging Supabase target.
- Confirm required environment variables and secrets are present outside source control.
- Run launch readiness and release guard checks.
- Identify which migrations or functions are required for the pilot path.
- Produce a go/no-go list for staging deployment.

### Friday, 7 August 2026 - Staging Deployment And Smoke Checks

Outcome: the exact staging build can run the pilot journey.

Work:

- Deploy or update the staging app and required Supabase functions.
- Run the deployment contract check.
- Smoke test login, lead capture, accepted offer, transaction conversion, onboarding, notifications, and client portal visibility.
- Log all blockers with owner, severity, and expected fix path.

### Monday, 10 August 2026 - Scenario Proof

Outcome: staging proves the main transaction combinations.

Work:

- Run the four required pilot scenarios:
  - cash individual
  - bond company
  - hybrid trust
  - development company
- For each scenario, verify accepted-offer conversion, participants, documents, workflows, health panel, and notification delivery.
- Save evidence without PII, secrets, or document contents.

### Tuesday, 11 August 2026 - Blocker Fix Day

Outcome: the staging run is either clean or honestly blocked.

Work:

- Fix issues found in Monday's scenario proof.
- Re-run only the affected checks first.
- Re-run the full readiness gate after fixes.
- Prepare a clear risk list for the backer.

### Wednesday, 12 August 2026 - Pilot Go/No-Go Packet

Outcome: a backer-readable decision packet exists.

Work:

- Summarise readiness, open risks, and pilot support plan.
- Confirm batch size, pilot users, support owner, and pause rules.
- Run final go/no-go checks.
- Decide whether Thursday starts the pilot or continues staging hardening.

### Thursday, 13 August 2026 - Controlled Pilot Batch 1

Outcome: first live pilot batch starts only if gates pass.

Work:

- Create at most 2 new pilot transactions.
- Review the health panel immediately after each conversion.
- Run post-deploy transaction checks.
- Confirm notifications were prepared/sent correctly.
- Pause immediately if a duplicate, missing workflow, wrong role, or wrong notification appears.

### Friday, 14 August 2026 - Pilot Observation

Outcome: decide whether the first batch can continue.

Work:

- Review support issues, notification delivery, workflow blockers, and user confusion.
- Close the batch only if audit and metrics pass.
- Decide whether to continue, extend observation, or pause.

### Monday, 17 August 2026 - Backer Review

Outcome: weekly decision on expansion.

Work:

- Present evidence from staging and pilot batch 1.
- Report what passed, what failed, and what changed.
- Decide one of:
  - continue pilot at the same batch size;
  - extend observation;
  - pause and fix blockers;
  - prepare a slightly larger pilot batch.

## Weekly Breakdown

### Week 1: 4-9 August - Scope Lock And Staging Readiness

Target: finish the current active work, lock the pilot boundary, prepare staging, and stop scope drift.

Backer-readable outcome:

"We know exactly what needs to work for the pilot, and we have removed anything that does not directly support that path."

### Week 2: 10-16 August - Scenario Proof And First Pilot Batch

Target: prove the four main scenarios in staging, then run one tiny pilot batch only if the gates pass.

Backer-readable outcome:

"The product has been proven against the core transaction combinations, and the first pilot batch either passed or produced a contained blocker list."

### Week 3: 17-23 August - Stabilise And Repeat

Target: fix pilot feedback, improve notification coverage, repeat small batches, and strengthen support operations.

Backer-readable outcome:

"We are no longer guessing. We are running controlled batches, measuring failures, and improving the operating model."

### Week 4: 24-30 August - Expansion Decision

Target: decide whether to expand the pilot, continue the same limits, or keep hardening.

Backer-readable outcome:

"We can make a responsible expansion decision based on evidence, not pressure."

## How To Explain The Complexity

Use this comparison:

"Building the screen is only one part. For every transaction we also need the database record, the role players, the document checklist, the workflow gates, the notification trail, the client portal, the recovery path, and the audit evidence to agree with each other. If one of those disagrees, the business process breaks."

Avoid saying:

- "It is almost done."
- "It just needs testing."
- "We can launch and fix later."

Say instead:

- "The build is advanced, but release safety is the current bottleneck."
- "We can expose this safely in small batches once staging evidence passes."
- "The responsible launch path is controlled pilot, not broad rollout."

## What The Backer Should Understand

The remaining work is not random delay. It is the work that prevents:

- duplicate transactions;
- missing buyer, seller, attorney, or bond participants;
- wrong or missing documents;
- clients receiving the wrong email;
- pilot users seeing broken workflow states;
- production database drift;
- unsafe database migrations;
- no clear rollback path.

## Backer Asks

Ask for these decisions explicitly:

1. Confirm pilot-first scope.
2. Confirm the first pilot organisation or user cohort.
3. Confirm that non-MVP expansion is paused unless approved.
4. Confirm that the daily report should show:
   - completed today;
   - blocked today;
   - planned tomorrow;
   - risk to pilot date;
   - decision needed.
5. Confirm whether the backer wants weekly evidence packs or only summary reporting.

## Daily Report Template

Use this every day:

```text
Date:

Today completed:
- 

Today blocked:
- 

Tomorrow:
- 

Pilot risk:
- Green / Amber / Red

Decision needed:
- 
```

## Weekly Backer Summary Template

Use this every week:

```text
Week:

Goal for the week:

What passed:
- 

What failed or remains open:
- 

What changed in the plan:
- 

Current pilot readiness:
- Green / Amber / Red

Next week's target:

Decision needed from backer:
- 
```

## Recommended Statement For Tomorrow

"The work ahead is heavy because we are compressing product completion, data safety, release evidence, and pilot operations into the same window. I can give daily and weekly structure, but the honest plan is gate-based: if staging evidence fails, we fix before exposing users; if pilot evidence passes, we expand carefully. That is how we avoid turning the first pilot into a production incident."
