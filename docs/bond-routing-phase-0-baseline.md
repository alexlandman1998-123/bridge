# Bond Routing Phase 0 Baseline

## Scope model
- Keep partner connections at organisation level only.
- `organisation_partners` is the network contract: company-to-company.
- Bond-originated file work ownership is separate and happens through routing rules.

## Roles and permission baseline
- Agency-side configuration is reserved for org-admin level roles.
- Bond-side consultant assignment happens inside bond workspace hierarchy using existing scope model (`workspace_hq`, `region`, `branch`, `team`, `assigned`).

## Routing precedence (Phase 0)
1. Manual override
2. Development-level rule
3. Agent-level rule
4. Branch/team-level rule
5. Organisation default
6. Fallback queue

## Source of truth
- Shared contract lives in
  - [bondRoutingContract.js](/Users/alexanderlandman/the-it-guy/the-it-guy/src/constants/bondRoutingContract.js)
  - Decisions should follow this file until changed by an explicit migration and release.

