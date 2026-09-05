# Development visualiser — Phase 9

Phase 9 places a guided journey builder over the existing Mapping Studio. It changes how administrators configure the experience, not how scenes or destinations are stored and rendered.

## Guided setup

Mapping Studio now opens in Guided Setup. Administrators work with buyer-facing questions and labels:

1. Choose a starting template.
2. Add the next visual view.
3. Choose what the buyer clicks.
4. Choose whether that click opens another view, property details, or a filtered property group.

The existing polygon and marker editor remains available under Advanced Mapping. Both modes edit the same in-memory canonical `visualMap` draft and use the existing save action.

## Templates

The deterministic templates cover:

- single home: aerial → exterior → property details;
- apartment building: aerial → elevation → floor plan → residence;
- multi-block estate: masterplan → block view → floor plan → residence.

Templates are disabled after the journey has been configured, preventing accidental replacement of existing work. Approved Phase 8 assets are matched to template scene types where available.

## Journey outline and preview

The builder derives its outline from canonical scenes and hotspot destinations. It does not persist a second outline. Administrators can:

- see scene order and outgoing click behavior;
- move scenes up and down without changing their stable IDs;
- preview any scene with its automatic parent breadcrumbs;
- add a view using an approved visual asset;
- add a clickable action and fine-tune its geometry in Advanced Mapping.

## Safe removal

Deleting a step requires an explicit relinking decision. When a replacement is selected, inbound clicks are redirected and downstream links are inherited by that replacement. With no replacement, the existing canonical cascade removal is used so unreachable child scenes cannot remain behind.

Phase 9 introduces no new renderer, persistence service, or scene graph. The public explorer continues to consume the same published visual map built in Phases 0–8.
