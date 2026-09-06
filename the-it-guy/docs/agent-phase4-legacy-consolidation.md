# Agent module Phase 4 — legacy consolidation

Phase 4 establishes one owner for Agent directory and workspace navigation without changing the central API module.

## Canonical ownership

| Surface | Canonical route | Owner |
| --- | --- | --- |
| Agent directory | `/agency/agents` | `AgentsPage` |
| Agent workspace | `/agency/agents/:agentId` | `AgentWorkspacePage` |
| Agent reporting | `/dashboard` | Dashboard reporting sections |
| Commission configuration | `/agency/commission` | `SettingsCommissionStructuresPage` |

Principal Dashboard and Bridge Command Centre actions now navigate directly to the canonical Agent routes. They no longer create an extra redirect through `/agents`.

The old `/agents`, `/agents/directory`, `/agents/:agentId`, `/agent/agents/:agentId`, and `/agents/reporting` paths remain as inbound compatibility redirects for existing bookmarks. They do not render competing screens. The retired `AgentReportingPage` remains excluded from the application import graph while older non-UI contract tests are migrated separately.

## Verification

From `the-it-guy/` run:

```sh
npm run test:agent-phase4-legacy-consolidation
npm run verify:agent-phase4
```

The contract fails if an active Agent screen starts navigating to a legacy path, if compatibility URLs render a second implementation, or if the retired reporting page returns to the production graph.
