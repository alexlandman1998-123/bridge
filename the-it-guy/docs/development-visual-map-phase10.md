# Development visualiser — Phase 10

Phase 10 automates repetitive visual-map setup with deterministic, reviewable suggestions. It does not generate imagery, publish changes, or introduce another scene model.

## Suggestion engine

`buildDevelopmentVisualSuggestions` reads the canonical visual map, current inventory, development structure, and approved Phase 8 assets. It proposes:

- missing phase, block, and floor scene hierarchies;
- editable elevation rows based on known floors;
- copied mappings where floors contain the same unit-type pattern;
- shared unit-type floor-plan scenes from approved associated assets;
- likely unit-detail or filtered-inventory actions for dead-end scenes.

Suggestions are derived at runtime and are not persisted as a competing workflow. Stable suggestion IDs let an administrator reject individual proposals for the current editing session.

## Review and application

The Phase 9 guided builder displays each suggestion with a plain-language explanation. Administrators can accept or reject one suggestion, accept all as drafts, or reject all.

Accepted suggestions use the same canonical operations as manual setup:

- scenes are created with `addVisualMapChildScene`;
- links use Phase 7 hotspot destinations;
- elevation rows and copied floor polygons use the existing hotspot collection;
- approved assets remain referenced by their existing URLs.

All generated scenes, polygons, associations, labels, and destinations remain editable in Advanced Mapping. Accepting a suggestion moves the visual map back to draft. The normal save, audit, preview, and publication controls still apply, so suggestions never become public without explicit approval.

## Guardrails

- Hierarchy suggestions skip structure already represented by scene names.
- Elevation grids are proposed only for empty elevation scenes.
- Floor mappings are copied only when source and target unit counts and unit-type patterns match.
- Unit-type floor-plan suggestions require an approved, ready asset with an explicit unit-type association.
- Likely-next actions are proposed only for scenes without existing click behavior.
- Phase 10 contains no generative AI or automatic publication.
