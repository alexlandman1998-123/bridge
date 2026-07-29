# Phase 2 Guided Vertical Slice

## Purpose

Phase 2 introduces the first buyer-facing guided bond application experience behind `guided_bond_application_v2`.

The slice proves that the buyer application can:

- Hydrate from the Phase 1 clean application state.
- Render a guided shell for the first four journey stages.
- Save through the Phase 1 legacy adapter.
- Resume from persisted guided metadata.
- Hand unsupported or incomplete paths back to the existing full application.

Phase 2 does not replace the legacy application globally.

## Feature Flag

The existing `guided_bond_application_v2` flag remains default-disabled.

The flag is resolved centrally by the Phase 0 resolver and then evaluated by:

`shouldUseGuidedBondApplicationV2()`

When the flag is false, the current application tab renders the existing legacy application.

The guided branch only runs inside the application tab. Offers and grant do not consult the guided questionnaire.

## Eligibility

Phase 2 eligible applications are:

- Application tab requests.
- Flag-enabled contexts.
- Editable drafts.
- Sole applicant applications.
- Empty drafts that can ask applicant structure and employment type.
- Permanent employee applications.

Ineligible reason codes include:

- `feature_disabled`
- `not_application_tab`
- `submitted_application`
- `phase2_handoff_completed`
- `joint_application`
- `surety_application`
- `unsupported_employment`

Submitted applications and applications with completed Phase 2 handoff metadata stay on the existing application.

## Component Structure

Guided UI lives under:

`src/modules/bond/application/guided/`

Main files:

- `GuidedBondApplication.jsx`: shell, header, progress, stepper, summary rail, screens, footer.
- `hooks/useGuidedBondApplication.js`: hydration, field updates, navigation, save state, auto-save, retry, save-and-exit, handoff.
- `phase2GuidedFlow.js`: stable step/screen keys, metadata helpers, progress model.
- `phase2Eligibility.js`: central feature flag and eligibility resolver.
- `phase2Validation.js`: screen-level validation.
- `guidedBondApplicationSaveController.js`: latest-request-wins stale save protection.

## Data Flow

Hydration:

`portal -> buildBondApplicationState() -> clean state -> guided UI`

Save:

`clean state -> toLegacyBondApplication() -> guided metadata -> buildLegacyBondApplicationPersistencePayload() -> saveClientPortalOnboardingDraft()`

Buyer answers still save under:

`onboarding_form_data.form_data.bond_application`

No new answer API or table was added.

## Guided Metadata

Metadata is additive and stored in the legacy bond application JSON:

```json
{
  "_meta": {
    "guided_bond_application_v2": {
      "flow_version": "phase-2-v1",
      "current_step_key": "employment_income",
      "current_screen_key": "employment_details",
      "completed_screen_keys": [
        "application_confirmation",
        "applicant_structure"
      ],
      "started_at": "2026-07-28T08:00:00.000Z",
      "last_saved_at": "2026-07-28T08:10:00.000Z",
      "legacy_handoff_at": null,
      "legacy_handoff_reason": null
    }
  }
}
```

The adapter preserves this metadata as compatibility passthrough. It is not rendered as an application answer and is ignored by existing view-model consumers.

## Supported Screens

Implemented Phase 2 screen order:

| Step key | Screen key | Required fields | Continue destination |
| --- | --- | --- | --- |
| `your_application` | `application_confirmation` | Purchase price, requested bond amount | `applicant_structure` |
| `applicants` | `applicant_structure` | Applicant structure | `about_you_confirmation` for sole, transition for joint/surety |
| `about_you` | `about_you_confirmation` | Prefilled name, contact basics | `employment_type` |
| `about_you` | `about_you_edit` | Name, email, phone | `about_you_confirmation` |
| `employment_income` | `employment_type` | Main income type | `employment_details` for permanent employee, transition for unsupported paths |
| `employment_income` | `employment_details` | Employer, occupation, gross monthly income | `employment_additional_details` |
| `employment_income` | `employment_additional_details` | Duration, works in South Africa | transition |
| `employment_income` | `phase2_completion_handoff` | None | Existing full application |

Future stages are visible in the stepper but are not clickable and do not have placeholder pages.

## Unsupported Paths

Unsupported applicant structures and employment types are saved first, then shown a neutral transition screen.

The buyer-facing copy does not mention legacy forms or phase numbers.

The handoff section is:

`income_deductions_expenses`

This is the first remaining section after Phase 2 employment basics.

## Auto-Save

Guided auto-save uses an 850 ms debounce after field changes.

Immediate saves happen on:

- Continue.
- Save and exit.
- Retry.
- Unsupported-path handoff.
- Phase 2 completion handoff.

Save states:

- `dirty`
- `saving`
- `saved`
- `error`
- `retrying`

The UI does not show saved state before the API request succeeds.

## Stale Save Protection

`createGuidedBondApplicationSaveController()` assigns a monotonic sequence to each save.

If an older request resolves after a newer request, it is marked stale and cannot become the latest saved state.

Continue, save-and-exit and handoff wait for their required save before moving on.

## Save Failure

On save failure:

- In-memory answers are kept.
- A visible error is shown.
- Retry is available.
- Continue and handoff do not advance.
- Save and exit does not navigate.

No applicant answers, portal tokens or financial payloads are logged.

## Refresh And Resume

On reload, the guided hook rebuilds clean state from the latest saved legacy application and reads `_meta.guided_bond_application_v2`.

Valid saved screen keys resume directly.

Missing or invalid metadata falls back to `application_confirmation`.

Applications with `legacy_handoff_at` are ineligible for guided rendering and open the existing application.

## Layout

Desktop:

- Header with back to portal, save status, save and exit.
- Intro and full eight-stage progress area.
- Focused question card.
- Right-side purchase/status summary rail.
- Sticky footer with Back and Continue.

Mobile/tablet:

- Single-column layout.
- Summary rail moves inline.
- Stepper wraps into compact grid.
- Sticky footer uses safe-area padding.
- Inputs keep mobile-friendly minimum heights.

## Accessibility

Phase 2 includes:

- Logical headings.
- Focus move to the screen heading after navigation.
- `aria-live` save status.
- Field-level error associations.
- Keyboard-selectable option cards using radio semantics.
- `aria-current` on the active step.
- Visible focus rings.

## Security

Phase 2 does not:

- Store answers in localStorage or sessionStorage.
- Put answers in URLs.
- Add analytics payloads.
- Send data to new third parties.
- Log application state or applicant answers.

The existing token-authorized client portal API path remains in use.

## Known Limitations

- Only the sole permanent employee path is guided end to end.
- Joint, surety and unsupported employment paths hand off to the existing application.
- Monthly commitments remain in the existing application.
- Bank accounts and debts remain in the existing application.
- Assets and liabilities remain in the existing application.
- Documents remain in the existing application.
- Review and signing remain in the existing application.
- Co-applicants do not have separate access.
- Sureties are not full participants.
- Typed signatures remain.
- No immutable submission snapshot exists.
- No OOBA export adapter exists.

## Deferred To Phase 3

- Full declarative flow contract.
- `visibleWhen`.
- `requiredWhen`.
- All employment types.
- Monthly commitments.
- Repeatable debts.
- Repeatable accounts.
- Repeatable assets.
- Existing properties.
- Credit declarations.
- Full sole-applicant journey.
- Progress based on applicable visible required questions.
- Removal of the temporary Phase 2 handoff for fully supported sole-applicant cases.

## Explicit Non-Changes

Phase 2 introduced no:

- Database migration.
- Table, column, trigger or RLS policy.
- Dynamic document rules.
- `transaction_required_documents` change.
- Signing integration.
- Immutable snapshot.
- Bank workflow change.
- Originator workflow change.
- Offer redesign.
- Grant redesign.
