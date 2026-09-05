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
