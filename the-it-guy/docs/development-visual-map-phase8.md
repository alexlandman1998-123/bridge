# Development visualiser — Phase 8

Phase 8 adds one visual asset intake and classification workspace to the existing Mapping Studio. It does not create a separate media library, renderer, or AI generation path.

## Asset record

Assets are stored in `mediaLibrary.visualMap.assets` alongside the canonical scenes. Each normalized record contains:

- display name and URL;
- type: aerial, site plan, exterior, elevation, floor plan, interior, parking plan, brochure, or other;
- association: development, phase, block, floor, unit, or unit type;
- public or internal visibility;
- draft or approved status;
- source and upload date;
- ready, processing, missing, or failed processing state.

The visual-map schema is version 3. Existing maps normalize with an empty `assets` collection, so there is no parallel persistence format or destructive migration.

## Intake workflow

Agents can drag multiple images or PDFs into Mapping Studio or use the native file picker. Files use the existing development-document upload service. The returned file records are then classified into the canonical visual map draft.

Classification uses deterministic filename and inventory matching. For example, `Block A Exterior Render.jpg` is suggested as an exterior associated with Block A. The agent can correct the type, association, name, visibility, and approval state before saving.

Approved imagery can be applied directly to the currently selected scene. This reuses `scene.background.url`; it does not copy the file or create another renderer.

## Safety and fallback handling

- Repeated URL/name pairs are skipped during intake and detected during audit.
- Missing and failed public assets block publication; internal assets raise warnings.
- Incomplete structural associations raise warnings.
- Failed uploads remain visible as failed draft records so the administrator can remove or retry them.
- AI generation is intentionally deferred. Phase 8 creates the structured, approved source library that later interpretation or rendering tools can safely consume.
