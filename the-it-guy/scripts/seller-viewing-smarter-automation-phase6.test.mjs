import assert from 'node:assert/strict'
import fs from 'node:fs/promises'

const appRoot = new URL('../', import.meta.url)

async function readAppFile(path) {
  return fs.readFile(new URL(path, appRoot), 'utf8')
}

const agencyPipelinePage = await readAppFile('src/pages/agency/AgencyPipelinePage.jsx')

for (const contract of [
  /VIEWING_WEEKDAY_LABELS/,
  /getViewingAvailabilityWeekdays/,
  /getViewingAvailabilityTimeRanges/,
  /buildViewingAvailabilityCompatibility/,
  /buildViewingPlannerSmartAutomation/,
]) {
  assert.match(agencyPipelinePage, contract, `smart automation helper should include ${contract}`)
}

for (const contract of [
  /apply_buyer_response/,
  /request_seller_access/,
  /apply_seller_response/,
  /book_viewing/,
  /send_buyer_request/,
  /handleRunViewingPlannerAutomation/,
]) {
  assert.match(agencyPipelinePage, contract, `smart automation action routing should include ${contract}`)
}

for (const contract of [
  /Smart next action|Smart/,
  /Suggested windows/,
  /Suggested overlap/,
  /viewingPlannerSmartAutomation\.actionLabel/,
  /Book viewing appointments/,
  /book-viewing/,
]) {
  assert.match(agencyPipelinePage, contract, `planner UI should expose ${contract}`)
}

for (const contract of [
  /Suggested viewing windows:/,
  /bookingCompatibility\.suggestions/,
  /buyerCompatibility\.suggestions/,
]) {
  assert.match(agencyPipelinePage, contract, `automation notes and tasks should include ${contract}`)
}

console.log('seller viewing smarter automation phase 6 contract tests passed')
