# Developer Module Phase 9 Live Acceptance Smoke

Phase 9 records the live acceptance smoke for the developer module. It starts
after the Phase 4 to Phase 8 release chain is green and proves that the actual
browser journey works in a controlled environment.

This phase does not itself send buyer onboarding links, create live production
transactions, upload OTPs, download private client files, change partner
settings, deploy, or mutate production data. It validates a redacted observation
from an authorised browser smoke run.

## Command

For local contract validation:

```bash
npm run test:developer-module-phase9
```

For the guarded acceptance gate after the browser run has been completed:

```bash
npm run verify:developer-module:acceptance -- --observation=private-evidence/developer-module-phase9-live-acceptance-smoke.json
```

## Observation Rules

Start from:

```text
docs/developer-module-phase9-live-acceptance-smoke.template.json
```

The observation must be redacted. It must not contain emails, names, phone
numbers, URLs, property addresses, buyer onboarding tokens, client portal
tokens, signed URLs, OTP files, document contents, credentials, provider logs,
raw buyer profile facts, or client details.

The operator confirmation phrase must be exactly:

```text
DEVELOPER_MODULE_PHASE9_LIVE_ACCEPTANCE_COMPLETE
```

## Required Browser Proof

The observation must prove:

- the change window was approved before the smoke;
- the developer overview opened in the controlled environment;
- an existing or controlled development transaction was opened;
- workspace clicks did not refresh the page;
- the top workspace menu and contrast container order was visually checked;
- no seller onboarding blocker appeared for the new development workflow;
- buyer onboarding remained visible as the buyer-side prerequisite;
- signed OTP remained a manual upload gate before finance;
- reservation deposit appeared before OTP when enabled;
- reservation deposit stayed hidden or not required when disabled;
- buyer onboarding link send or copy was controlled and observed;
- bond originator handoff was observed after buyer onboarding send or copy;
- setup warnings surfaced without breaking the transaction shell;
- required document RLS setup did not block the workspace;
- transaction subprocess RLS setup did not block the workspace;
- transaction status link or onboarding RLS setup did not block the workspace;
- financial reconciliation download was observed;
- handoff readiness status was visible;
- support monitoring was clear after the smoke;
- rollback was ready and unused.

## Stop Conditions

The observation must be `failed` or `aborted` if:

- the browser repeatedly refreshes or reloads on workspace clicks;
- buyer onboarding cannot be sent or copied for a policy-ready record;
- seller onboarding appears as a development blocker;
- signed OTP can be bypassed before finance;
- reservation deposit ordering is wrong for enabled transactions;
- reservation deposit appears as required when disabled;
- RLS errors block required documents, subprocesses, status links, or onboarding;
- setup warnings are hidden from the user;
- the reconciliation export is missing or downloads a malformed file;
- handoff readiness is missing;
- private client data or token material appears in evidence;
- rollback readiness is missing.

Phase 9 is an acceptance observation gate only. It does not approve wider
production cutover beyond the explicitly controlled smoke scope.
