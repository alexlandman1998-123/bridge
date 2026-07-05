# Buyer Onboarding Mobile Phase 1 Audit

Date: 2026-07-05

## Goal

Prepare buyer onboarding for the same mobile-first treatment now applied to seller onboarding:

- Branded landing page from the email link.
- Buyer-only call to action, with no buyer/seller chooser.
- Short mobile panes instead of one long scrolling form.
- Existing buyer conditional logic, validation, draft saving, submit side effects, and notifications preserved.

## Route Decision

The real buyer intake route is:

- `src/App.jsx`
- `/client/onboarding/:token`
- Component: `src/pages/ClientOnboarding.jsx`

The route below should not be used as the real buyer intake target for this work:

- `/mobile/buyer-onboarding/:token`
- Component: `src/pages/mobile/MobileOnboardingPage.jsx`

That route is currently a mobile portal/dashboard style experience with mocked journey content. It is not the transactional buyer onboarding form.

## Current Link Sources

Buyer onboarding links already resolve to `/client/onboarding/:token` from multiple entry points:

- `src/lib/onboardingLinks.js`
  - `resolveTransactionOnboardingLink()`
  - Builds `${window.location.origin}/client/onboarding/${onboarding.token}`.
- `src/lib/api.js`
  - `getOrCreateTransactionOnboarding()`
  - Creates or reuses a `transaction_onboarding` record.
- `src/lib/transactionLifecycleService.js`
  - Local/demo transaction creation creates a `buyer-...` token and `/client/onboarding/:token` URL.
- `src/pages/UnitDetail.jsx`
  - Copies/opens `/client/onboarding/${record.token}`.
- `src/pages/AttorneyTransactionDetail.jsx`
  - Sends buyer onboarding through the `send-email` edge function with `type: 'client_onboarding'`.
- `src/pages/AgentLeadsPage.jsx`, `src/pages/agency/AgencyPipelinePage.jsx`, `src/components/NewTransactionWizard.jsx`, and `src/components/AgentNewDealWizard.jsx`
  - Trigger buyer onboarding after offer or transaction workflows.

Phase 2 should keep the route stable. The landing page should live inside `ClientOnboarding.jsx`, not behind a new route.

## Token Payload Shape

`src/lib/api.js` is the source for the token payload:

- `resolveOnboardingTokenContext(client, token)`
  - Reads `transaction_onboarding`.
  - Selected fields: `id`, `transaction_id`, `token`, `status`, `purchaser_type`, `submitted_at`, `is_active`, `created_at`, `updated_at`.
  - Invalid token error: `Onboarding link is invalid or inactive.`

- `fetchClientOnboardingByToken(token)`
  - Resolves the onboarding token.
  - Loads transaction context.
  - Loads existing `onboarding_form_data`.
  - Resolves buyer onboarding flow and visible steps.
  - Returns:
    - `onboarding`
    - `transaction`
    - `unit`
    - `buyer`
    - `purchaserType`
    - `purchaserTypeLabel`
    - `formConfig`
    - `stepDefinitions`
    - `formData`
    - `derivedConfiguration`
    - `requiredDocuments`
    - `summary`
    - `uploadedDocuments`
    - `fundingSources`
    - `onboardingFlow`
    - `rolePlayerPolicy`
    - `clientPortalLink`
    - `clientPortalPath`

## Branding Gap

Buyer onboarding does not currently receive the same branding depth as seller onboarding.

Current buyer context loads:

- Transaction fields from `transactions`, but not `organisation_id`.
- Unit fields from `units`.
- Development relation as `development:developments(id, name)`.
- Buyer fields as `id, name, phone, email`.

This means Phase 2 cannot reliably display the sending organisation logo without extending the token payload.

Recommended Phase 2 payload additions:

- Include `organisation_id`, `assigned_agent`, and `assigned_agent_email` in `resolveTransactionAndContext()`.
- Expand development select to include any available `logo_url` or branding fields if the schema supports them.
- Fetch `organisations(id, name, display_name, logo_url)` from `transaction.organisation_id` when present.
- Return a normalized `branding` object from `fetchClientOnboardingByToken()`, similar to seller onboarding:
  - `organisationName`
  - `agencyName` or `senderName`
  - `logoUrl`
  - `logoDarkUrl`
  - `logoLightUrl`
  - `primaryColour`
  - `secondaryColour`

Existing logo conventions elsewhere in the app use:

- `organisations.logo_url`
- `branding.logoDarkUrl`
- `branding.logoLightUrl`
- `branding.logoUrl`
- `logo_url`

## Existing Buyer Flow Logic To Preserve

The form logic in `src/pages/ClientOnboarding.jsx` is already branch-aware and should not be rewritten.

Keep these intact:

- `resolveBuyerOnboardingFlow()`
- `getOnboardingStepDefinitions()`
- `normalizeDetailsState()`
- `sanitizeClientFormData()`
- `validateOnboardingSubmission()`
- `validateDetailsStep()`
- `saveClientOnboardingDraft()`
- `submitClientOnboarding()`
- WhatsApp and email side effects after submit.
- Client portal redirect/link after submit.
- Bond originator policy behavior.

The high-level steps currently resolve to:

- `purchaser_entity`
- `finance_type`
- `details`

The long-scroll problem is concentrated inside `details`, not across many top-level steps.

## Current Mobile Pain Points

The current buyer onboarding is improved visually compared with an old raw form, but it is still not optimized enough for phone-first completion:

- The landing and intake are the same screen. There is no branded email-link landing page.
- Buyer sees the form immediately instead of a confidence-building welcome screen.
- The `details` step can become very long, especially for:
  - co-purchasing
  - married purchasers
  - bond or hybrid finance
  - company purchasers
  - trust purchasers
  - directors or trustees
- Mobile progress is based on top-level steps, so `details` feels like one large step even when it contains many decisions.
- The sticky footer supports mobile continuation, but it advances top-level steps only.
- There is no pane-level progress such as `2/8` within the current buyer detail branch.

## Recommended Pane Model

Phase 3 and Phase 4 should add a mobile pane layer around the existing render functions.

Suggested mobile panes:

- Buyer type
- Finance type
- Purchase mode: individual or co-purchasing
- Purchaser 1 personal details
- Purchaser 1 contact details
- Purchaser 1 residential address
- Purchaser 1 marital/legal status
- Purchaser 1 ownership split, if applicable
- Purchaser 1 employment and income, if applicable
- Purchaser 1 financial snapshot
- Purchaser 1 bond readiness declarations, if applicable
- Purchaser 2 panes, only for co-purchasing
- Company details, only for company purchasers
- Company directors / beneficial owners, only for company purchasers
- Trust details, only for trust purchasers
- Trustees, only for trust purchasers
- Finance purchase amount/source fields
- Bond application/readiness fields, only for bond or hybrid finance
- Bond originator nomination, only when allowed by `rolePlayerPolicy`
- Review and submit

Desktop and tablet should keep richer grouped sections.

## Validation Strategy

Do not require full-step validation on every small mobile pane unless it is already safe to do so.

Recommended approach:

- Keep existing top-level `validateCurrentStep()` behavior for final step transitions and submit.
- Add pane-level required-field checks only for fields visible in the active pane.
- If the buyer taps `Continue` and the active pane has missing required fields, show the existing error treatment on that pane.
- Before moving out of the full `details` step or submitting, run the current full `validateDetailsStep()` and `validateOnboardingSubmission()` unchanged.

This avoids breaking conditional branches while still making mobile feel guided.

## Acceptance Criteria For Later Phases

Phase 2:

- `/client/onboarding/:token` opens a buyer-only landing page first.
- Organisation/development/agency branding appears if payload contains branding.
- If no logo is available, use a clean text/initial fallback.
- CTA is `Start buyer onboarding` or `Resume buyer onboarding`.
- No buyer/seller selector appears.

Phase 3 and Phase 4:

- Mobile shows one pane/question group at a time.
- Desktop and tablet keep grouped layouts.
- Pane count changes when buyer type, finance type, co-purchasing, company, trust, or bond branches change.
- Sticky footer never covers the active fields.
- Existing draft save and submit behavior remains intact.

Phase 5:

- Buyer review screen summarizes buyer, property, finance, and document-next-step details.
- Edit actions return to the relevant pane.
- Submit success still routes to the client portal when `clientPortalPath` exists.

Phase 6:

- Focused lint passes for `ClientOnboarding.jsx`.
- Buyer flow contract tests pass.
- South African buyer scenario tests pass.
- Mobile browser smoke covers at least:
  - individual + cash
  - individual + bond
  - co-purchasing + hybrid
  - company purchaser
  - trust purchaser

## Implementation Boundaries

Only these files should be necessary for the core UX work:

- `src/pages/ClientOnboarding.jsx`
- `src/lib/api.js`
- Potentially a focused test or smoke script under `scripts/`

Avoid touching:

- Seller onboarding.
- Client portal dashboard routes.
- `/mobile/buyer-onboarding/:token` unless a separate portal refresh is explicitly requested.
- Transaction submission side effects beyond adding branding payload data.

## Phase 1 Outcome

Phase 1 is complete when this audit exists and the next phase can begin with these decisions:

- Keep `/client/onboarding/:token` as the real buyer onboarding route.
- Add the branded landing inside `ClientOnboarding.jsx`.
- Extend the token payload for organisation/development branding before rendering the landing.
- Split mobile UX with a pane layer around existing buyer conditional logic.
- Preserve all current buyer validation, save, submit, email, WhatsApp, role-player, and portal behavior.
