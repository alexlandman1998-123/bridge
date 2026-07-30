# Git PR Creation - Phase 3

Generated: 2026-07-29  
Repository: `/Users/alexanderlandman/the-it-guy`

## Result

Created the missing public agency intake PR:

| PR | Branch | Base | Draft | Status |
| --- | --- | --- | --- | --- |
| [#7](https://github.com/alexlandman1998-123/bridge/pull/7) | `codex/agency-public-intake-pr` | `main` | yes | open |

## Why A Clean PR Branch Was Created

The original pushed branch, `codex/agency-public-intake-phase8`, contains the public-intake commits plus an unrelated middle commit:

| Commit | Subject | Scope |
| --- | --- | --- |
| `b6d1d3d8` | Implement public agency intake ecosystem | public intake |
| `3441fee1` | ag2g | unrelated mandate/document/buyer-lead UI work |
| `254a71b4` | Expose public intake settings entry | public intake |

Opening a PR directly from `codex/agency-public-intake-phase8` would have mixed unrelated changes into the public intake PR. To protect the merge queue, Phase 3 created a clean branch from `origin/main`:

```text
codex/agency-public-intake-pr
```

Only these commits were cherry-picked:

| New Commit | Original Commit | Subject |
| --- | --- | --- |
| `c98d5302` | `b6d1d3d8` | Implement public agency intake ecosystem |
| `19c9e85d` | `254a71b4` | Expose public intake settings entry |

## PR Scope

The clean PR branch includes:

- public intake link migrations
- public intake submission migrations
- public intake automation migration
- public intake API endpoint and server service
- public branded buyer/seller intake page
- listing-site enquiry integration
- Organisation/Branding settings controls
- Settings sidebar Public Intake entry
- focused service/API tests

The clean PR branch excludes:

- mandate-template global route scripts and reports
- document generation containment changes
- buyer lead workspace UI changes
- agency pipeline buyer UI changes

## Validation

Executed on `codex/agency-public-intake-pr`:

```bash
node server/tests/publicAgencyIntakeApi.test.js
node server/tests/publicListingsService.test.js
node src/services/__tests__/agencyPublicIntakeLinkService.test.js
git diff --check
```

All passed.

## Open PR Inventory After Phase 3

| PR | Branch | Draft | Title |
| --- | --- | --- | --- |
| [#7](https://github.com/alexlandman1998-123/bridge/pull/7) | `codex/agency-public-intake-pr` | yes | Implement public agency intake ecosystem |
| [#6](https://github.com/alexlandman1998-123/bridge/pull/6) | `agent/document-generation-cleanup-final-closure` | yes | Close document generation cleanup |
| [#2](https://github.com/alexlandman1998-123/bridge/pull/2) | `codex/simple-connected-attorney-dropdown` | yes | Simplify connected attorney selection |
| [#1](https://github.com/alexlandman1998-123/bridge/pull/1) | `codex/mvp-pilot-readiness` | yes | Prepare controlled Arch9 pilot release |

## Guardrail Update

For public agency intake, use PR #7 / `codex/agency-public-intake-pr` as the merge candidate.

Keep `codex/agency-public-intake-phase8` protected until Phase 6 because it contains unrelated work that must be classified before any deletion or branch cleanup.
