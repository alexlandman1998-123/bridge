import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const pageSource = await readFile(new URL('../src/pages/agency/AgencyPipelinePage.jsx', import.meta.url), 'utf8')
const packageSource = await readFile(new URL('../package.json', import.meta.url), 'utf8')

for (const marker of [
  'SHOW_DAY_SOURCE_LABEL',
  'SHOW_DAY_FOLLOW_UP_PROMPT',
  'buildShowDayFollowUpSummary',
  'isShowDayLead',
  'isShowDayFollowUpTask',
  'showDayFollowUpSummary',
  'selectedLeadShowDayContext',
  'selectedLeadIsShowDay',
  'selectedLeadShowDayQueueItem',
  'openShowDayFollowUpQueue',
  'openShowDayLead',
  'handleShowDayLogFollowUpCall',
]) {
  assert.ok(pageSource.includes(marker), `Phase 5 should include ${marker}.`)
}

for (const marker of [
  'Show Day Follow-Up Queue',
  'Open Show Day Queue',
  'Offer Ready',
  'Show Day Follow-Up',
  'Log Follow-Up Call',
  'Open Offer Centre',
  'This buyer has already viewed the property.',
  'Post-show-day calls, buyer feedback, and offer intent',
]) {
  assert.ok(pageSource.includes(marker), `Phase 5 UI should include "${marker}".`)
}

assert.match(
  pageSource,
  /setLeadFilter\(\(previous\) => \(\{\s*\.\.\.previous,\s*source: SHOW_DAY_SOURCE_LABEL,\s*stage: 'all',\s*sort: 'next_follow_up',/s,
  'Opening the show-day queue should filter to Show Day leads and sort by next follow-up.',
)

assert.match(
  pageSource,
  /buildShowDayFollowUpSummary\(\{\s*leads: showDayLeadScope,\s*tasks: records\.tasks,\s*appointments: records\.appointments,\s*deals: records\.deals,/s,
  'The show-day queue should be derived from leads, tasks, appointments, and deals.',
)

assert.match(
  pageSource,
  /buildShowDayFollowUpSummary\(\{\s*leads: selectedLead \? \[selectedLead\] : \[\],\s*tasks: selectedLeadTasks,\s*appointments: selectedLeadAppointments,\s*deals: records\.deals,/s,
  'The selected lead callout should use the same show-day summary contract.',
)

assert.match(
  pageSource,
  /navigate\(`\/pipeline\/leads\/\$\{encodeURIComponent\(leadId\)\}`\)/,
  'Opening a show-day queue row should deep-link to the lead workspace.',
)

assert.match(
  pageSource,
  /activityType: 'Call',\s*activityNote: normalizeText\(previous\.activityNote\) \|\| SHOW_DAY_FOLLOW_UP_PROMPT,\s*outcome: normalizeText\(previous\.outcome\) \|\| 'Needs follow-up'/s,
  'The show-day call action should prefill the follow-up call intent.',
)

assert.match(
  packageSource,
  /"test:show-day-phase5": "node scripts\/show-day-phase5\.test\.mjs"/,
  'package.json should expose the Phase 5 show-day workflow test.',
)

console.log('show-day phase 5 checks passed')
