# Attorney Sign-Up Module Refactor & Stabilisation (May 11, 2026)

## Scope completed
- Stabilised attorney onboarding error handling with user-friendly messaging.
- Added onboarding compatibility migration for attorney onboarding dependencies.
- Refactored firm website handling to accept protocol-less domains and normalize to `https://`.
- Replaced branding URL input with upload-first logo flow (PNG/JPG/SVG) + preview + remove.
- Improved departments card layout hierarchy and interaction quality.
- Improved team invite role labels and onboarding guidance copy.
- Added progress indicator and save-draft support in onboarding flow.
- Added final success screen with next actions.

## Files changed
- `supabase/migrations/202605110001_attorney_onboarding_stabilization.sql`
- `the-it-guy/sql/20260511_attorney_onboarding_stabilization.sql`
- `the-it-guy/src/pages/AttorneyOnboardingPage.jsx`
- `the-it-guy/src/services/attorneyFirms.js`
- `the-it-guy/src/services/attorneyFirmServiceShared.js`
- `the-it-guy/src/services/attorneyFirmInvitations.js`
- `the-it-guy/src/components/attorney/onboarding/BrandingStep.jsx`
- `the-it-guy/src/components/attorney/onboarding/FirmInfoStep.jsx`
- `the-it-guy/src/components/attorney/onboarding/DepartmentsStep.jsx`
- `the-it-guy/src/components/attorney/onboarding/TeamInvitesStep.jsx`
- `the-it-guy/src/components/attorney/onboarding/ReviewConfirmStep.jsx`
- `the-it-guy/src/components/attorney/onboarding/AttorneyOnboardingLayout.jsx`
- `the-it-guy/src/components/attorney/onboarding/teamInviteUtils.js`

## Data and migration notes
- Added `attorney_firm_branding` table with RLS + firm sync triggers.
- Added compatibility views:
  - `attorney_team_members` (mapped from `attorney_firm_members`)
  - `attorney_invites` (mapped from `attorney_firm_invitations`)

## Build and lint
- Targeted lint: pass
- `npm run build`: pass
- Known existing build warning retained: CSS minify warning from generated CSS stream (`Expected identifier but found "-"`).

## Remaining follow-ups
- Run the new migration on the same linked Supabase project before testing attorney onboarding in production/staging.
- If invite email template redesign is required beyond copy/UX state handling, update `supabase/functions/send-email` invite content in a dedicated pass.
