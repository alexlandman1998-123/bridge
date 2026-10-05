# Bond Application Portal — Phase 0 boundary audit

## Outcome

The Bond Application Portal will become a standalone, application-scoped buyer experience. The general buyer portal will retain only a status summary and an entry link.

Phase 0 is a discovery and freeze gate. It makes no database, access-token, notification, or application-state changes.

## Current-state diagnosis

| Concern | Current implementation | Phase 0 decision |
| --- | --- | --- |
| Buyer route | The route was originally registered in `src/App.jsx` but rendered `ClientPortal`. | Phase 1 replaces that embedded route target with `BondApplicationPortal`. |
| Buyer screen | Bond application state, UI, and handlers live in `src/pages/ClientPortal.jsx`. | Do not add new application steps, reminder actions, or originator controls here. |
| Draft persistence | Bond draft fields are saved through `saveClientPortalOnboardingDraft`. | Keep it authoritative until Phase 3 moves application editing behind a dedicated API. |
| Application read/submission | `fetchClientPortalNormalizedBondApplication`, document reconciliation, and submission APIs are already separated in `src/lib/api.js`. | Reuse these domain operations; do not create a second bond-application model. |
| Buyer entry link | `src/lib/buyerBondApplicationLink.js` resolves the buyer's bond URL. | Keep it as the single navigation seam for the future standalone route. |
| Originator operations | The bond module and originator workspaces already exist separately. | Phase 4 adds buyer-completion actions there; originators must never need buyer-portal access. |
| Documents | Bond document reconciliation connects to the canonical document path. | Preserve exact canonical document linking and role-scoped access throughout extraction. |

## Authoritative boundaries during extraction

| Domain | Current authority | Future authority |
| --- | --- | --- |
| Application model and validation | `src/modules/bond/application/` | Same domain module |
| Application persistence and submission | Client-portal API functions in `src/lib/api.js` | Token-scoped Bond Application Portal API facade |
| Buyer access | Client portal token | Revocable, expiry-controlled application access token |
| Buyer navigation | `buyerBondApplicationLink.js` | Same resolver, redirected to standalone module |
| Originator actions | Bond-originator workspace | Originator action centre with explicit application permissions |
| Documents | Canonical requirement/document lifecycle | Same canonical lifecycle; never legacy-only finance documents |

## Freeze rules

Until the standalone portal is live:

1. Do not add application fields, submission paths, reminder buttons, or originator actions directly to `ClientPortal.jsx`.
2. Do not create a duplicate `bond_applications` data model or duplicate document checklist.
3. Do not use a client portal token as a broad originator credential.
4. Do not add automatic bank submission or scheduled reminders as part of the extraction.
5. Any new buyer entry link must go through `resolveBuyerBondApplicationLink`.

## Extraction inventory

The Phase 0 contract preserves these baseline seams:

- `/client/:token/bond-application` has a dedicated portal route target; the legacy dependencies remain recorded below.
- `ClientPortal` invokes onboarding draft persistence, canonical document reconciliation, and bond-submission preparation.
- `src/lib/api.js` exports the isolated application read, reconciliation, and submission operations required by the standalone module.
- `src/modules/bond/application/` remains the domain implementation.

## Exit gate

Phase 1 may start only when `npm run test:bond-application-portal-phase0` passes. The gate demonstrates that the legacy dependency map is still explicit and that the future boundary has one documented owner for navigation, application domain logic, persistence, documents, and originator operations.

## Buyer redesign foundation review — 3 October 2026

The shared application owner remains `src/modules/bond/application/`, including
`GuidedBondApplication`, the canonical state, conditional flow rules, document
requirements and submission readiness. Keep the existing embedded buyer route
until the standalone route has equivalent service adapters; do not create a
second form or redirect buyers into a partially connected editor.

| Capability | Embedded buyer portal | Standalone access-token portal |
| --- | --- | --- |
| Prefill and draft | Existing portal draft adapter; preserves other onboarding data | Application-scoped draft adapter with revision checks |
| Applicant structures | Guided eligibility gate with legacy fallback | Shared guided module; preserve supported structure rules |
| Documents | Canonical checklist, reconciliation, upload and refresh callbacks | Continuity projection exists; upload callbacks are not connected |
| Signatures and submission | Preparation, refresh and cancellation callbacks | These callbacks are not connected |

Foundation corrections make review cards respect purchaser type, either ID or
passport, optional deposit, and property details without a development/unit.
Hidden fields retain their saved values. Canonical submission readiness remains
independent of prefill confirmation. Missing upload, prepare or cancellation
adapters now fail explicitly instead of reporting a successful action.

The next design pass can reorganise the existing form around application details,
documents, review and submission. Standalone document/signing parity is required
in the subsequent wiring phase before switching the buyer entry route. Cash
buyers remain outside the bond application entry; existing originator-managed
bond/hybrid visibility and guided-to-legacy fallback stay in place.

Foundation verification: prefill checks 6/7; guided draft round-trip, conditional
sole applicant, dynamic documents and review/signing checks 2–5; participant/entity
completeness; standalone boundary/editing contracts; and three hook regressions
for absent upload, prepare and cancellation services pass. The draft round-trip
expectation now includes the adapter's existing null signature metadata slot.
Only Realty's local demo shows the individual summary ready to confirm, with no
browser console errors. No remote records or deployments were changed.

## Buyer application runtime wiring — 3 October 2026

`ConnectedBuyerBondApplication` now connects the shared guided editor to scoped
runtime operations for both buyer-token and application-access-token routes.
The API reuses the existing state adapter, conditional document rules, canonical
upload RPC, declaration contract and submission snapshot. The legacy review
button now saves and enters review/signing rather than assigning a Submitted
label. Demo submission is explicitly a preview; it does not send an application.

The new migration `20261003182500_buyer_bond_application_runtime.sql` saves the
compatibility draft and primary/shared normalized sections in one transaction,
checks the application revision, and preserves unrelated onboarding answers,
other participants' sections and the originator's pre-approval section.
Normalized answers take precedence when loading an older compatibility draft.
Autosaves are queued; document refreshes retain the editor's initial seed so
in-flight navigation and answers are not reset.

Canonical requirement instances are linked before upload. Application-token
uploads use the existing buyer atomic upload operation with its credential kept
inside SQL, never returned to the browser. Only this application's object prefix
is writable. Cleanup cannot delete linked evidence. Requirement reconciliation
preserves originator requests, deactivates only owned stale requirements and
retains optional requirements as optional. Multiple visible files for a canonical
requirement remain available after refresh.

Signing records an immutable, versioned snapshot and locks answer editing.
Required declarations are checked against the current versioned wording;
reviewed answers, signer identity and document references are checked against
saved data. Duplicate submission retries return the same receipt. Signing does
not submit to a bank: supporting uploads remain available afterwards, and the
originator's existing bank-submission readiness gate remains authoritative.
Joint/surety applications retain the existing participant route; this adapter
cannot submit on behalf of another participant. Pending cancellation is limited
to the application's active unsigned submission.

Verification: the focused runtime and UI suites pass (15 tests), including SQL
execution in PGlite, revoked access, stale writes, canonical uploads, immutable
submission retries, later uploads, normalized reads, queued saves and stable
editor state. The SQL fixture substitutes the digest primitive; production
SHA256 itself is covered by the existing snapshot domain checks rather than
claimed as a live database verification. Guided checks 2–5 and standalone
contracts 1–3 pass. Primary-app lint and baseline service tests pass; the build
passes. Existing repository lint warnings remain. The Only Realty demo was
checked on desktop and a 433px mobile viewport without overflow or console errors.

Release boundary: the migration has NOT been applied to a remote database and
no deployment or real signed application was submitted. The new runtime endpoints
require this migration before a frontend release. A real Only Realty buyer-link
walkthrough, originator intake/late-document verification and release approval
remain for the next verification/release phase.

## Buyer application handoff verification — 3 October 2026

The current on-page signing flow can now generate the final originator download
when bank-submission readiness passes. A captured-signature submission must have
the server's HTML signing method, one primary signer/participant and a confirmed
PNG signature. The archive verifies the immutable snapshot hash, includes the
captured PNG and unchanged application data, and describes the PDF as a rendering
of that confirmation. Packet-based submissions still require their original
signed PDF. A signature rendering failure aborts a final download.

Canonical document matching now counts all files for the exact requirement
instance, including uploads using a custom request key. Evidence for a different
canonical request cannot satisfy the requirement by sharing its type alias.
Rejected evidence remains outstanding. Bank-readiness regression coverage proves
that the last required late upload removes the blocker without changing signed
answers; changed answers still require a fresh signed version.

Submitted receipts refresh every 30 seconds while visible and on window focus.
Refresh failures retain the current receipt and upload controls. Saves and
refreshes share a queue so a delayed read cannot rewind the next save's revision.
Changing secure links creates a fresh workspace immediately. Cancelled
applications have a separate message instead of claiming to be with the team.

Local verification includes captured-signature and original-PDF archive tests,
PDF rendering and hash checks, canonical late-upload readiness, SQL bank-readiness
and handoff tests (review/replacement, correction re-signing, assignment scope),
and the runtime/UI suites. The runtime migration remains unapplied. These local
checks do not certify live storage policies, actual consultant intake or delivery.
Before production release, apply the scoped runtime migration with the repository
release guard and approved target, then verify a real Only Realty buyer link,
late supporting uploads, consultant review/readiness and final download. No real
application signature, bank submission, email, migration or deployment was
performed during this verification pass.

Final local results: 18 runtime/UI tests passed; guided document/signing and
standalone editing contracts passed; final-download, bank-readiness and handoff
checks passed. `npm run check:app` completed successfully (lint: zero errors,
565 existing warnings; nine baseline service checks; production build). Focused
lint on the changed runtime component passed without warnings. `git diff --check`
passed. Full check output: `tmp/buyer-bond-phase4-app-check.log`.
