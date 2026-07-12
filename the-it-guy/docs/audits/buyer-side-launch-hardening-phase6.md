# Buyer-Side Launch Hardening Phase 6

Implemented on 2026-07-11.

## Goal

Implement the buyer-side launch-candidate gate for the journey from buyer lead to registration.

Phase 6 consolidates the buyer local diagnostic and Phases 1 through 5 into one repeatable release-candidate command. It does not replace the individual phase gates. It proves that the full local evidence chain is callable from a single command, while keeping strict live staging evidence separate so final sign-off cannot be confused with local readiness.

## Commands

Local launch-candidate verification:

```bash
npm run verify:buyer-side-phase6-launch-candidate
```

Static-only preflight:

```bash
node scripts/buyer-side-phase6-launch-candidate-gate.mjs --static-only
```

Strict live staging evidence chain:

```bash
node scripts/buyer-side-phase6-launch-candidate-gate.mjs --require-live-evidence
```

## Launch Candidate Coverage

The local Phase 6 gate runs these contracts once:

| Coverage | Command |
| --- | --- |
| Phase 0 scope and fixture contract | `node scripts/buyer-side-phase0-scope-fixtures-gate.mjs` |
| Buyer local lead-to-registration diagnostic | `node scripts/buyer-side-lead-registration-diagnostic-gate.mjs` |
| Phase 1 staging transaction contract | `node scripts/buyer-side-phase1-live-staging-transaction-gate.mjs --skip-local-diagnostic` |
| Phase 2 RLS access contract | `node scripts/buyer-side-phase2-rls-access-probes.mjs --skip-prerequisites` |
| Phase 3 public offer-token contract | `node scripts/buyer-side-phase3-offer-token-browser-smoke.mjs --skip-prerequisites` |
| Phase 4 token delivery contract | `node scripts/buyer-side-phase4-token-delivery-invalid-handling.mjs --skip-prerequisites` |
| Phase 5 document privacy contract | `node scripts/buyer-side-phase5-document-privacy-verification.mjs --skip-prerequisites` |

The skip flags are intentional. Earlier phases already validate their prerequisites. Phase 6 consolidates evidence without recursively rerunning the same prerequisite chain inside every phase.

## Strict Live Evidence

Strict live mode runs:

| Live evidence | Command |
| --- | --- |
| Phase 1 live transaction continuity | `node scripts/buyer-side-phase1-live-staging-transaction-gate.mjs --live --confirm-staging --require-live --skip-local-diagnostic` |
| Phase 2 live RLS matrix | `node scripts/buyer-side-phase2-rls-access-probes.mjs --live --confirm-staging --require-live --skip-prerequisites` |
| Phase 3 live public-token browser evidence | `node scripts/buyer-side-phase3-offer-token-browser-smoke.mjs --live --confirm-staging --require-browser --skip-prerequisites` |
| Phase 4 live delivery and invalid-token evidence | `node scripts/buyer-side-phase4-token-delivery-invalid-handling.mjs --live --confirm-staging --require-live --skip-prerequisites` |
| Phase 5 live document privacy evidence | `node scripts/buyer-side-phase5-document-privacy-verification.mjs --live --confirm-staging --require-live --skip-prerequisites` |

Strict live mode is expected to remain blocked until the real staging IDs, tokens, delivery rows, document rows, and persona credentials documented in Phases 1 through 5 are supplied.

## Static Contracts

Phase 6 gates these contracts before executing the aggregate:

- Phase 0 through Phase 6 audit docs exist.
- The buyer lead-to-registration diagnostic audit exists.
- `package.json` exposes the Phase 6 command.
- Phase 0 records the Phase 6 local and strict-live commands.
- Phase 8 launch readiness links the Phase 6 audit and commands.
- Phase 6 script includes Phase 0, the local diagnostic, Phases 1 through 5, and strict live evidence commands.
- Phase 5 handoff records local readiness plus missing strict live document privacy fixtures.

## Acceptance

- [x] Phase 6 harness is implemented.
- [x] Phase 6 package command is exposed.
- [x] Phase 6 static audit, package, Phase 0, and Phase 8 contracts are gated.
- [x] Phase 6 local launch-candidate command includes Phase 0, the local diagnostic, and Buyer Phases 1 through 5.
- [x] Phase 6 strict live command can run Phase 1 through Phase 5 live evidence from one command.
- [ ] Strict live evidence passes with `READY_LIVE_CANDIDATE`.

## Current Result

2026-07-11 implementation result:

- Static preflight: `READY_STATIC_ONLY` with 7 static checks passing, 0 blocked, 7 command skips, and 5 live evidence items pending.
- Local launch candidate: `READY_LOCAL_CANDIDATE` with 7 static checks passing, 7 local commands passing, 0 command blockers, and 5 strict-live evidence items pending.
- Strict live staging evidence: `BLOCKED` with 7 static checks passing, 7 local commands passing, and 5 live evidence commands blocked.

Strict live blocker summary:

- Phase 1 live transaction evidence is missing the staging base URL, project ref, buyer lead, listing, offer, transaction, onboarding token, portal token, document request, and persona credential evidence.
- Phase 2 live RLS evidence is missing buyer lead, offer, transaction, document request, and persona credential evidence.
- Phase 3 live public-token browser evidence is missing staging base URL, project ref, valid offer token, offer session token, expired offer token, duplicate offer token/session token, and revised offer token evidence. It can generate an invalid-token fallback, but launch sign-off should use an explicit invalid token fixture.
- Phase 4 live token-delivery evidence is missing staging base URL, buyer transaction/lead/offer IDs, onboarding/portal/offer/session tokens, onboarding/portal/offer/SMS delivery IDs, already-submitted onboarding token, and inactive portal token evidence.
- Phase 5 live document privacy evidence is missing transaction/document request IDs, FICA/finance/upload/review/download document IDs, buyer document storage path, and buyer/agent/attorney/bond/unrelated persona credentials.

Strict live staging evidence is still required because the individual Phase 1 through Phase 5 live gates remain blocked until real staging fixture IDs, token states, delivery rows, document rows, and persona credentials are supplied.

## Phase 6 Decision

Decision: PHASE 6 HARNESS IMPLEMENTED; STRICT LIVE EVIDENCE REQUIRED BEFORE FINAL SIGN-OFF.
