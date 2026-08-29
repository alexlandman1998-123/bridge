import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const pipeline = readFileSync(resolve(root, 'src/pages/agency/AgencyPipelinePage.jsx'), 'utf8')
const service = readFileSync(resolve(root, 'src/services/buyerJourneyAlignmentService.js'), 'utf8')
const packageJson = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))

assert.match(pipeline, /const selectedLeadBuyerJourneyModel = useMemo\(\(\) => \{[\s\S]*return buildBuyerJourneyAlignmentModel\(\{/)
assert.match(pipeline, /const selectedLeadBuyerJourneyStages = selectedLeadBuyerJourneyModel\.stages/)
assert.match(pipeline, /selectedLeadBuyerJourneyModel\.currentStage\?\.label/)
assert.match(pipeline, /const journeyAction = selectedLeadBuyerJourneyModel\.nextAction/)
assert.match(pipeline, /selectedLeadBuyerJourneyModel\.nextAction\.title/)
assert.doesNotMatch(pipeline, /const buyerJourneyWhatsNext = !buyerOverviewQualification\.hasContacted/)
assert.doesNotMatch(pipeline, /const offerComplete =[^\n]*stageKey\.includes\('offer'\)/)
assert.match(service, /const DEFAULT_STAGE_ORDER/)
assert.match(service, /const IN_PERSON_STAGE_ORDER/)
assert.match(service, /const furthestCompletedIndex/)
assert.match(service, /nextAction: nextActionForStage/)
assert.match(packageJson.scripts['verify:buyer-leads-performance'], /test:buyer-leads-journey-alignment-phase7(?: && |$)/)

console.log('buyer leads Phase 7 journey alignment checks passed')
