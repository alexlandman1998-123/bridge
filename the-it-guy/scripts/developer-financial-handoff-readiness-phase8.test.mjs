import { readFile } from 'node:fs/promises'
import assert from 'node:assert/strict'

const developmentDetail = await readFile(new URL('../src/pages/DevelopmentDetail.jsx', import.meta.url), 'utf8')

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

console.log('Developer financial handoff readiness Phase 8 contract passed.')
