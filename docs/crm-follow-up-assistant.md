# CRM follow-up assistant

The primary Arch9 workspace now includes **Follow-up studio** in a saved agency
lead’s **Activity** tab. Load the saved brief to see visible pending/overdue tasks,
the latest recorded activity date and the existing activity source link. These
facts use database records and SAST dates; no model is used for the brief or next
action.

The outreach draft works manually. Optional English/Afrikaans AI generation
produces a proposal; **Apply**, **Keep my wording** and **Undo** leave the agent in
control. **Copy outreach** and **Open follow-up task draft** recheck the saved
source. Opening a task fills the existing task composer with editable wording and
an empty due date. Its ordinary date, owner, priority and Save controls remain the
only way to create the task. Existing activity/task drafts are protected from
replacement. The assistant never sends, creates tasks or changes lead stages.

## Access and privacy

The authenticated API uses the caller’s Supabase client and existing lead/task/
activity RLS, agency membership and `bridge_can_access_assignment` permissions.
Closed/archived leads and non-agency legal leads are excluded. Every source query
includes both agency and lead identity. No contacts table, personal notes,
activity notes, task descriptions/titles, uploads, identity or banking fields are
read by this feature.

Only whitelisted lead category/stage, bounded area text and aggregate visible
task/activity counts reach the model. Free-form prompts, saved outreach wording
and agency writing preferences are excluded. Saved task dates, record identities,
lead revisions and activity dates are rendered deterministically outside the
model. Counts and recorded activity are not evidence of communication permission
or contact; the agent must check their conversation and permission before using
the draft.

Saved lead revision plus a fingerprint of the selected lead/task/activity facts
are checked before generation, after generation and before copying or opening a
task draft. Late responses cannot overwrite newer manual wording. Source-read
failures block proposal use. Paid provider output is still accounted for when its
source becomes stale.

## Configuration and release boundary

This implementation is local. No live AI request, migration, task creation or
message delivery was performed.

The new additive migration
`supabase/migrations/20261025210653_crm_lead_follow_up_ai.sql` depends on the
existing campaign AI ledger and business AI migration. It adds a nullable CRM
lead foreign key with exactly one email/business/lead context per usage row,
matching feature checks and service-only reservation functions. Existing email
and business RPC signatures remain compatible. All features share the existing
locked agency monthly cap and configured managed provider; no second payer,
fallback model, default pricing or newly enabled model is introduced.

Activation requires an approved migration release, a supported server-side
provider key, a verified enabled model/rate entry and an explicit agency AI
budget. ChatGPT browser sign-in is not an API credential. With no AI configuration,
the saved brief and manual draft remain usable.

## Focused checks

From `the-it-guy/`, run these serially on the limited-memory machine:

```sh
NODE_OPTIONS=--max-old-space-size=768 node --test --test-concurrency=1 server/services/aiCrmFollowUpApi.test.js scripts/crm-follow-up-ai-database.test.mjs
NODE_OPTIONS=--max-old-space-size=768 ./node_modules/.bin/vitest run src/services/__tests__/crmFollowUpAiModel.test.js src/components/lead-activity/__tests__/CrmFollowUpAssistant.test.jsx --maxWorkers=1 --no-file-parallelism
```

The SQL test installs the real ledger and additive migration into isolated
PGlite and checks access, monthly cap sharing, cross-feature replay conflicts,
source identity/feature constraints and existing wrapper compatibility. Provider
calls are mocked; there is no external spend or remote database access.
