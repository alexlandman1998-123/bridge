# Phase 5 - Portal Action Alignment

## Purpose

Phase 5 aligns buyer portal action surfaces with the Phase 4 buyer email contract. When the buyer is asked to complete the online bond application, in-app notifications, next actions and activity feed actions use the same destination and buyer-facing CTA.

## Contract

The buyer-facing completion action uses:

- Route key: `bond_application`
- Portal path: `/client/:token/bond-application`
- CTA: `Complete Bond Application`

## Covered Surfaces

- Client portal notification defaults for `bond_application_required`.
- Client portal activity feed actions for `bond_application_required` and `bond_application_attention_required`.
- Buyer next actions for not-started, in-progress and attention-required bond application states.
- Client portal route helpers that translate `bond_application` into the bond application modal route.

## Boundary

Submitted or under-review bond application updates remain informational and may still use view-style labels. This phase only aligns action-required buyer completion prompts.
