# Development visual map — Phase 3 hierarchy

Phase 3 adds practical multi-level and multi-storey navigation to the existing canonical visual map and the single Phase 2 public renderer.

## Hierarchy workflow

In Visual Mapping Studio an administrator can:

1. Open any existing scene.
2. Add a child phase, building, elevation, floor plan, or parking plan.
3. Supply that child scene's plan or image URL.
4. Position the automatically-created navigation marker on the parent plan.
5. Open the child scene and map its units using the existing polygon tools.
6. Repeat the process for deeper levels, then save and publish through the existing draft/publication workflow.

Deleting a scene removes its complete descendant subtree and the parent navigation link. The default scene cannot be deleted.

## Public experience

- Navigation hotspots open their linked child scene in the same visualiser.
- Breadcrumbs allow direct movement back through masterplan, phase, building, and floor levels.
- The residence rail is scoped to units in the current scene and its descendants.
- Parent hotspots summarise descendant availability and show their residence count.
- Scene selection is included in shareable URLs.
- Pan and zoom reset when moving between plans while filters remain active.

## Runtime ownership

No new map renderer, table, or persistence service was introduced. Scene hierarchy continues to live in `mediaLibrary.visualMap.scenes`, is edited in `DevelopmentVisualMappingStudio`, and is rendered by `PublicDevelopmentVisualExplorer` on desktop and mobile.
