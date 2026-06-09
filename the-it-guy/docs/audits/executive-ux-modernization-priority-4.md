# Priority 4 Executive UX Refactor & Enterprise Workspace Modernization

Date: 2026-06-09  
Scope: Presentation, hierarchy, workflow ergonomics, and information architecture only.

## Final Direction

Priority 4 should proceed as a wave-based UX modernization program, not a backend redesign.

The platform already has strong enterprise architecture in security, ownership, lifecycle certification, transaction spine, branch operations, bond operations, and canonical documents. The UI now needs to expose that sophistication through command-centre workspaces, sharper hierarchy, denser but calmer dashboards, and role-specific next actions.

Non-negotiable guardrails:

- Do not change RLS, ownership, permissions, lifecycle triggers, or data models as part of this sprint.
- Use existing services, selectors, lifecycle states, and document/readiness engines.
- Improve layout, hierarchy, state labelling, action grouping, and workspace navigation.
- Preserve current workflows and routes.
- Keep Bridge/Harcourts visual language: navy, blue, white, slate, subtle enterprise surfaces.

## Current UI Inventory

Already strong or partially implemented:

- Seller Lead Workspace already includes a premium acquisition header, seller actions, journey rail, readiness row, workspace tabs, document centre, mandate workspace, property preview, and activity workspace.
- Branch Command Centre exists and can become the pattern for branch manager operations.
- Bond HQ / organisation command-centre components exist for originator executive workflows.
- Transaction workspace components exist around roleplayers, finance command centre, documents, and workflow panels.
- Canonical document workspaces exist and should become the common document-centre surface.

Primary modernization gaps:

- Buyer Lead Workspace still reads like a lead record with progress cards, not a buyer acquisition command centre.
- Principal/Agency pages need consistent executive intelligence hierarchy across branches, agents, governance, performance, and activity.
- Agent workspace needs a productivity-first home built around blockers and next actions.
- Listing and transaction surfaces need stronger health/readiness framing.
- Design system tokens are present informally, but page-level implementation is inconsistent.

## Execution Waves

### Wave 1: Highest User Impact

1. Seller Acquisition Workspace
   - Preserve current seller lifecycle logic.
   - Continue refining header, action/readiness row, journey, tabs, document centre, and activity.
   - Use seller readiness and journey services as the source of truth.

2. Buyer Journey Workspace
   - Convert buyer detail from CRM record to acquisition command centre.
   - Lead with buyer identity, finance readiness, property match state, offer/transaction state, next best action, and blockers.
   - Use existing lead requirements, matching, appointments, offers, transaction handoff, and canonical document data.

3. Transaction Mission Control
   - Keep transaction spine intact.
   - Reorganize around registration progress, roleplayer readiness, document readiness, finance, deadlines, and tasks.

### Wave 2: Management Adoption

1. Principal Command Centre
   - Agency pages become executive network workspaces.
   - Show branch rankings, branch health, pipeline concentration, agent productivity, risk flags, and attention-required cards.

2. Branch Command Centre
   - Branch managers see team performance, branch pipeline, stuck assets, unassigned leads, delayed transactions, and agent workload.
   - Keep branch isolation enforced by existing backend/RLS.

3. Agent Productivity Workspace
   - Agent home answers: what needs attention, what is moving, what is blocked, and what am I waiting for?
   - Prioritize next best actions, missing documents, upcoming appointments, stalled deals, and priority leads.

### Wave 3: Partner Adoption

1. Originator Finance Workspace
   - Bond applications become finance workspaces with banks, quotes, documents, approval status, and pipeline health.
   - Prepare boardroom-ready Ooba/BetterBond workflows without changing routing logic.

2. Attorney Matter Workspace
   - Matter pages become premium legal workspaces with parties, documents, financials, deadlines, and registration progress.

### Wave 4: Boardroom Impact

1. Executive Dashboard
   - Build a high-density executive view for network performance, branch performance, transactions, market intelligence, operational health, AI insights, and regional trends.

2. Design System Consolidation
   - Standardize cards, page headers, tabs, tables, action bars, status chips, progress indicators, empty states, and workspace navigation.

3. Demo Mode
   - Create enterprise demo datasets for national agency, national originator, attorney firm, and developer network scenarios.

## Workspace Pattern

Every enterprise workspace should answer three questions above the fold:

1. What is this object?
2. What is blocking progress?
3. What should I do next?

Recommended page architecture:

```text
Workspace Header
  Identity
  Operational status grid
  Primary and secondary actions

Action & Readiness Row
  Next Best Action
  Readiness / Health Score
  Context Preview

Journey / Progress Rail
  Completed
  Current
  Upcoming

Sticky Workspace Tabs
  Overview
  Core domain tab
  Documents
  Activity

Tab Content
  Dense operational cards
  No duplicate status blocks
```

## Role-Specific UX Intent

| Role | UX Question | Primary Surface |
| --- | --- | --- |
| Principal | Where should I intervene? | Executive command centres |
| Branch Manager | What needs operational management in my branch? | Branch command centre |
| Agent | What do I need to do next? | Productivity workspace |
| Assistant | What can I support today? | Assigned work queue |
| Originator | Which applications need movement? | Finance workspace |
| Attorney | Which matters are blocked before registration? | Matter workspace |

## Wave 1 Implementation Slice

The first implementation slice should modernize the Buyer Lead Workspace because Seller is already materially closer to the target.

Implementation target:

- Redesign buyer header into a buyer journey command header.
- Add compact status blocks for assigned agent, current stage, finance readiness, property match, offer state, and transaction state.
- Add a buyer action/readiness row with:
  - Next Best Action
  - Finance / Document Readiness
  - Property Requirement Preview
- Preserve existing outreach, matching, appointment, offer, task, and transaction functions.
- Do not add backend fields.

## Definition of Done

Priority 4 is successful when the app no longer feels like a collection of records and tables. It should feel like a set of role-aware operating workspaces where users immediately understand:

- what happened,
- what is happening,
- what is blocked,
- who owns it,
- what should happen next.

