import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = process.cwd()
const functionSource = await readFile(resolve(root, 'supabase/functions/knowledge-factory-graphql/index.ts'), 'utf8')
const mapService = await readFile(resolve(root, 'the-it-guy/src/services/propertyIntelligence/knowledgeFactoryMapService.js'), 'utf8')
const mapComponent = await readFile(resolve(root, 'the-it-guy/src/components/canvassing/KnowledgeFactoryParcelMap.jsx'), 'utf8')
const workspace = await readFile(resolve(root, 'the-it-guy/src/components/canvassing/PropertySearchWorkspace.jsx'), 'utf8')
const pilotRunbook = await readFile(resolve(root, 'docs/knowledge-factory-phase1-5-uat-pilot.md'), 'utf8')

function expect(condition, message) {
  if (!condition) throw new Error(message)
}

expect(functionSource.includes('operationName: "MapProperties"'), 'Map requests must use a named, fixed GraphQL operation.')
expect(functionSource.includes('first: 25'), 'Map requests must retain the 25-parcel cap.')
expect(functionSource.includes('GraphQL-Cost": "report"'), 'Executed map requests must capture supplier query cost.')
expect(functionSource.includes('assertMapRateLimit'), 'Map requests must be rate-limited.')
expect(functionSource.includes('parseWktPolygon'), 'The gateway must transform vendor WKT before returning it.')
expect(!functionSource.includes('query: text(body.query'), 'The browser must not be able to submit arbitrary supplier GraphQL.')
expect(mapService.includes("invokeEdgeFunction('knowledge-factory-graphql'"), 'The browser must use the secured Edge Function.')
expect(!mapService.includes('propinfoapi.co.za'), 'The browser must not contain the supplier endpoint.')
expect(mapComponent.includes('VITE_GOOGLE_MAPS_API_KEY'), 'Map browser key must remain configurable and separate from supplier credentials.')
expect(workspace.includes('VITE_KNOWLEDGE_FACTORY_MAP_ENABLED'), 'Live map must require an explicit frontend rollout flag.')
expect(workspace.includes('Business purpose for this lookup'), 'Each map search must collect a business purpose.')
expect(pilotRunbook.includes('/live/uat/graphql/'), 'The pilot must start on the supplier UAT endpoint.')
expect(pilotRunbook.includes('/live/v0_1/graphql/'), 'Production must use the pinned explicit supplier version.')

console.log('Knowledge Factory Phase 1 map checks passed.')
