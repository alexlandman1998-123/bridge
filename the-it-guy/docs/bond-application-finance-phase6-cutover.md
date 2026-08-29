# Bond application Finance — Phase 6 cutover

Cutover target: linked Supabase project `isdowlnollckzvltkasn`  
Cutover date: 28 August 2026

## Applied database contracts

- `bridge_agent_bond_application_identity(uuid, uuid)`
- `bridge_agent_bond_application_workspace_view(uuid, uuid)`
- Explicit `anon` execute revocation for both RPCs

Both RPCs are stable, security-definer read models with an explicit search path, transaction-spine authorization, and execute grants limited to authenticated and service roles.

## Verification evidence

- All referenced canonical application, originator, finance, guarantee, and workflow relations exist.
- The transaction-spine access guard exists.
- Service-role smoke returned `agent-bond-application-workspace-v1` and the safe empty-state contract.
- Supabase's performance advisor returned no findings tied to either RPC.
- Supabase's security advisor reports the expected `authenticated_security_definer_function_executable` warning for both RPCs. This is an intentional API surface: each function rejects callers without transaction-spine access, exposes a constrained read-only JSON contract, and is not executable by `anon` or `public`.
- The linked project currently has no non-cancelled canonical bond applications, so a populated live-application smoke remains an operational follow-up rather than a cutover blocker.
- Phase 6 local checks assert RPC names, frontend plumbing, ACLs, search-path hardening, and release-gate completion.

Compatibility fallback remains available in the agent workspace if a future RPC availability fault occurs.
