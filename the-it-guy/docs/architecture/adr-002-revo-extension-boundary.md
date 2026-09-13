# ADR-002: Revo extension boundary

- Status: Accepted for phased implementation
- Date: 2026-09-13
- Owners: Platform maintainers and Revo delivery team
- Scope: Revo Property Site workspace customisation in the primary Arch9 application

## Context

Revo Property Site needs bespoke workflows, screens, integrations, and automation while continuing to receive every safe fix and improvement made to Ultron. A permanent customer Git branch would isolate custom work, but it would also require repeated merges from the main product branch and could leave Revo behind on global fixes.

The existing product already supports organisation-scoped membership, permissions, and records. Revo is an active organisation with ID `322c3853-2d82-4413-97e6-b4cd8bc32a7c`. Phase 0 records the boundary that later implementation phases must preserve. It does not change production data, application behaviour, deployment configuration, or Supabase schema.

## Decision

Revo customisation is implemented as an **organisation-scoped extension layer in the main Arch9 codebase**. It is not implemented as a permanent fork or long-lived production branch.

Core Ultron code is released to every eligible organisation, including Revo. Revo extension code is released with the core but remains unavailable unless the active organisation has the `revo` extension enabled. A Revo-specific feature may use shared core capabilities, but core capabilities may not depend on Revo-specific code.

```text
Main Arch9 release
├── Core Ultron capabilities       → all eligible organisations, including Revo
└── Revo extension capabilities    → Revo only, when explicitly enabled
```

## Request classification

Every requested change must be classified before implementation.

| Classification | Use when | Implementation location | Release result |
| --- | --- | --- | --- |
| Core | The behaviour should be standard for Arch9 customers. | Core product module. | All eligible organisations receive it, including Revo. |
| Revo extension | The behaviour is specific to Revo's operating model, integration, or user experience. | Dedicated Revo extension module, behind the Revo extension gate. | Only Revo can see or invoke it. |
| Candidate for core | It starts as a Revo need but may benefit other customers. | Start as a Revo extension; promote only through an explicit core decision. | Revo receives it first; broader release is intentional. |

If a request cannot be classified safely, it remains Revo-only until a product owner explicitly approves a core change.

## Architecture and security rules

- Revo-specific source must live in one dedicated extension area; it must not be spread through unrelated core modules.
- Core modules must not import or require Revo modules.
- Revo modules may use published core contracts only; they may not replace global default behaviour by side effect.
- Revo-only routes, actions, server endpoints, and integrations must check the enabled extension and the active organisation. Hiding a control in the UI is not an authorisation boundary.
- Any future Revo data must be organisation-scoped and protected by database policies. Revo users must not gain access to other organisations, and other organisations must not gain access to Revo data.
- A global defect fix is made once in the core and is released to Revo with the normal product release.
- A Revo-only defect fix is made once in the Revo extension and cannot change core behaviour for other organisations.
- New Revo capabilities must be independently enableable so they can be tested with Revo before they are used in live operations.

## Delivery rules

- Use short-lived feature branches for all work. Merge approved core and Revo extension changes into the main codebase.
- Do not create a permanent Revo production branch as the primary delivery model.
- Each Revo feature requires a focused automated check proving both of these outcomes: Revo can use it when enabled; a non-Revo organisation cannot see or invoke it.
- Revo integrations use dedicated credentials and configuration. Secrets remain server-side and are never placed in frontend code or committed environment files.
- Before creating a shared schema object, confirm that it is additive and safe for all tenants. Schema changes and production data changes require the normal explicit production approval.

## Promotion to core

A Revo extension may be promoted to core only when a product owner deliberately confirms that its workflow, terminology, permission model, and support commitment are appropriate for other organisations. Promotion is a new core change: it must not silently broaden access or alter the default workflow.

## Future extraction trigger

Revo remains on the shared platform initially. Reassess a dedicated deployment and Supabase project when its transaction volume, data-model divergence, integration requirements, or service expectations make isolated operations justified. The extension boundary is designed to make that future extraction deliberate and contained rather than a rewrite.

## Consequences

Revo can receive bespoke work quickly without losing the benefits of one maintained Ultron release line. The trade-off is discipline: Revo-specific behaviour must stay behind the extension boundary, and developers must classify changes before coding rather than adding one-off organisation checks to shared product logic.

## Phase 0 exit criteria

Phase 0 is complete when this decision is the governing rule for Revo work. Phase 1 may introduce the extension registry and enforcement mechanisms; it must not weaken the boundary defined here.
