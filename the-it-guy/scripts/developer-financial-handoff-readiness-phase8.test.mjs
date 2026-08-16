import { readFile } from 'node:fs/promises'
import assert from 'node:assert/strict'

const developmentDetail = await readFile(new URL('../src/pages/DevelopmentDetail.jsx', import.meta.url), 'utf8')
const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const phase8Doc = await readFile(new URL('../docs/developer-module-phase8-financial-handoff-readiness.md', import.meta.url), 'utf8')

assert.equal(
  packageJson.scripts?.['test:developer-module-phase8'],
  'node scripts/developer-financial-handoff-readiness-phase8.test.mjs',
)
assert.match(
  packageJson.scripts?.['verify:developer-module'] || '',
  /test:developer-module-phase8/,
  'developer module verification should include the Phase 8 handoff readiness contract',
)

assert(
  developmentDetail.includes('missingAmountCount') &&
    developmentDetail.includes('missingTreatmentCount') &&
    developmentDetail.includes('missingPayableToCount') &&
    developmentDetail.includes('criticalControlCount') &&
    developmentDetail.includes('warningControlCount'),
  'DevelopmentDetail should calculate handoff readiness control gaps for reservation and alteration finance data',
)

assert(
  developmentDetail.includes('Reservation amount missing') &&
    developmentDetail.includes('Reservation treatment missing') &&
    developmentDetail.includes('Deposit recipient missing') &&
    developmentDetail.includes('Alteration amount missing') &&
    developmentDetail.includes('Alteration treatment defaulted'),
  'handoff readiness should flag missing reservation and alteration allocation data',
)

assert(
  developmentDetail.includes("'Control Review'") &&
    developmentDetail.includes('developerFinancialRollup.controlItems.forEach') &&
    developmentDetail.includes("item.severity === 'critical' ? 'Needs cleanup' : 'Follow-up'"),
  'reconciliation export should include control review rows for the handoff diagnostic',
)

assert(
  developmentDetail.includes('Handoff Readiness') &&
    developmentDetail.includes('Ready for handoff') &&
    developmentDetail.includes('Ready with follow-up') &&
    developmentDetail.includes('Needs cleanup') &&
    developmentDetail.includes('No reconciliation gaps detected from the current reservation and alteration data.'),
  'commercial dashboard should expose a practical handoff readiness panel',
)

assert(
  phase8Doc.includes('Developer Module Phase 8 Financial Handoff Readiness') &&
    phase8Doc.includes('Ready for handoff') &&
    phase8Doc.includes('Ready with follow-up') &&
    phase8Doc.includes('Needs cleanup') &&
    phase8Doc.includes('Control Review') &&
    phase8Doc.includes('npm run test:developer-module-phase8') &&
    !/client_portal_token|seller_portal_token|signing_token|access_token|service_role/i.test(phase8Doc),
  'Phase 8 runbook should document handoff readiness without credential material',
)

console.log('Developer financial handoff readiness Phase 8 contract passed.')
