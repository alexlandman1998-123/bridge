# Agent scale readiness — Phase 0 baseline

Phase 0 locks the locally passing Agent module before authenticated staging and scale work begins. It does not approve a production release and does not change the API architecture.

## Frozen evidence

- Source commit at capture: `e4c81870b57778c8f781fffb7eb6655da5bec702`.
- Browser report digest: `2974cbeee067dcd31fa93b9accfbdff3d4b8bf345da0698f8c958537000a48a4`.
- Twelve Agent-role screens reached ready state with no unexpected console errors, failed requests, root overflow, unnamed controls or keyboard-focus failures.
- Calendar was the slowest local screen at 2,569 ms core-ready. The maximum first-feedback time was 331 ms.
- The complete machine-readable record and release ceilings are in `config/agent-scale-phase0-baseline.json`.

The browser run used local development auth bypass. Expected unauthenticated 401 noise was classified separately, so this evidence cannot be used to claim that RLS or tenant isolation is correct.

## Bundle baseline

| Asset | Captured gzip size | Phase 0 ceiling |
| --- | ---: | ---: |
| Entry JavaScript | 121,647 bytes | 133,120 bytes |
| Global CSS | 146,923 bytes | 153,600 bytes |
| Legacy API | 318,922 bytes | 332,800 bytes |

The Clients route does not statically load the legacy API chunk. API decomposition remains a separate brief.

## Release gate

Run:

```sh
npm run verify:agent-scale-phase0
```

This runs the cumulative Agent Phase 0–7 contracts, scoped lint, production build, enforced bundle budgets and baseline integrity checks. Any failure blocks progression to Phase 1.

Credentialed Agent, principal and branch-manager browser runs remain separate release evidence because CI cannot safely manufacture authenticated tenant proof.

## Exit status

Phase 0 is complete when the gate passes. Scale release remains **HOLD** until authenticated staging RLS evidence and deployed performance sampling are complete.
