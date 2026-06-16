# Commercial Pipeline and Canvassing Phase 1 Audit

Phase 1 is the discovery and shape pass for bringing a pipeline option into the commercial platform.

## Current Commercial Shape

The commercial platform already has pieces of the right surface area:

- `src/modules/commercial/pages/CommercialDealsPipelinePage.jsx`
- `src/modules/commercial/pages/CommercialRequirementsPipelinePage.jsx`
- `src/modules/commercial/components/CommercialPipelineBoard.jsx`
- `src/modules/commercial/components/CommercialPipelineCard.jsx`
- `src/modules/commercial/components/CommercialPipelineColumn.jsx`
- `src/modules/commercial/components/CommercialPipelineFilters.jsx`
- `src/modules/commercial/components/CommercialPipelinePreview.jsx`

Commercial enablement also already exposes a pipeline feature flag:

- `commercialPipeline` is present in `src/modules/commercial/services/commercialApi.js`
- the enablement wizard already marks it as a first-class commercial feature

The route table, however, still treats `/commercial/pipeline` as a redirect back into leads:

- `src/App.jsx`
- `src/modules/commercial/commercialNavigation.js`

That means the commercial platform has pipeline ingredients, but not yet a canonical pipeline home.

## Residential Reference Model

The residential side already has the full pipeline and canvassing pattern we want to study:

- `src/pages/Pipeline.jsx`
- `src/pages/PipelineCanvassingPage.jsx`
- `src/lib/canvassingRepository.js`
- `src/lib/agencyPipelineService.js`
- `src/lib/agentDataService.js`

The residential canvassing model already covers:

- prospects
- activities
- follow-up status
- conversion
- local fallback persistence
- Supabase-backed persistence when the schema exists

That gives us a clear UI and workflow template to borrow from.

## Phase 1 Decision

Commercial canvassing should **reuse the workflow shape**, but not be forced into the residential storage model as-is.

Recommended direction:

- reuse the same interaction vocabulary: prospect, activity, status, conversion, follow-up
- reuse the same UX primitives: board, filters, detail drawer, empty states, activity log
- create a commercial-specific pipeline service layer and page shell
- map commercial records to commercial entities, not buyer/seller lead records

Why:

- commercial canvassing touches different entities
- commercial workflows are anchored around properties, vacancies, landlords, tenants, requirements, and deals
- the commercial data model needs room for broker assignment, property context, and transactional conversion paths
- copying the residential repository directly would blur those boundaries too early

## Commercial Entity Shape

The commercial pipeline should treat these as first-class objects:

- canvassing prospect
- contact
- company
- property
- vacancy
- requirement
- deal
- viewing

Recommended canvassing-to-conversion targets:

- canvassing prospect -> requirement
- canvassing prospect -> deal
- canvassing prospect -> property follow-up
- canvassing prospect -> contact follow-up

## Commercial Pipeline Scope

The commercial pipeline umbrella should eventually represent:

- canvassing
- requirements
- deals
- viewings
- follow-up work

That can still present as one commercial pipeline experience, but the data needs to remain modular underneath.

## Reusable Pieces

These parts look safe to reuse or mirror closely:

- pipeline board layout
- stage cards
- filters
- empty-state patterns
- row/detail drawer patterns
- activity timeline patterns
- stage normalization helpers

## New Plumbing Needed

These pieces likely need commercial-specific work:

- commercial canvassing repository or service layer
- commercial pipeline route and page shell
- commercial stage normalization for canvassing entities
- commercial conversion actions
- commercial navigation entry for pipeline
- any commercial storage tables or API endpoints if we do not reuse a generalized schema

## Phase 1 Output

Phase 1 is complete when we have:

1. a clear decision on shared workflow shape versus shared storage
2. an inventory of reusable residential pipeline primitives
3. a list of commercial entities and conversion paths
4. a routing plan for `/commercial/pipeline`
5. a plumbing list for the commercial-specific service layer

## Recommendation

The fastest safe path is:

1. copy the residential pipeline/canvassing interaction pattern
2. give commercial its own service and route layer
3. keep the data model commercial-native from the start
4. only share low-level UI primitives, not residential record assumptions

That keeps the implementation close enough to be fast, while avoiding a mismatch between residential leads and commercial brokerage reality.
