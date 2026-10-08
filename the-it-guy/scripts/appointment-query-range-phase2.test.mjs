import { appointmentStartIso, sastDateKey, sastDayStart, sastWeekStart, sastMonthStart, addCalendarDays as addSastDays } from '../src/core/appointments/attorneyCalendarModel.js'
import { resolveAppointmentSchedule } from '../src/core/appointments/appointmentTime.js'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'

const pagePath = path.resolve('src/pages/agency/AgencyPipelinePage.jsx')
const servicePath = path.resolve('src/lib/agencyPipelineService.js')
const pageSource = fs.readFileSync(pagePath, 'utf8')
const serviceSource = fs.readFileSync(servicePath, 'utf8')

function extractFunctionBlock(source, functionName) {
  const declaration = `function ${functionName}`
  const start = source.indexOf(declaration)
  assert.notEqual(start, -1, `${functionName} should exist`)
  const openParen = source.indexOf('(', start)
  assert.notEqual(openParen, -1, `${functionName} should have parameters`)
  let parenDepth = 0
  let closeParen = -1
  for (let index = openParen; index < source.length; index += 1) {
    const char = source[index]
    if (char === '(') parenDepth += 1
    if (char === ')') parenDepth -= 1
    if (parenDepth === 0) {
      closeParen = index
      break
    }
  }
  assert.notEqual(closeParen, -1, `${functionName} parameters should be closed`)
  const openBrace = source.indexOf('{', closeParen)
  assert.notEqual(openBrace, -1, `${functionName} should have a function body`)

  let depth = 0
  for (let index = openBrace; index < source.length; index += 1) {
    const char = source[index]
    if (char === '{') depth += 1
    if (char === '}') depth -= 1
    if (depth === 0) return source.slice(start, index + 1)
  }

  throw new Error(`${functionName} body was not closed`)
}

assert.match(
  pageSource,
  /const PIPELINE_APPOINTMENT_ROLLING_PAST_DAYS = 45/,
  'pipeline reloads should use a bounded rolling appointment history window',
)
assert.match(
  pageSource,
  /const PIPELINE_APPOINTMENT_ROLLING_FUTURE_DAYS = 180/,
  'pipeline reloads should use a bounded rolling appointment future window',
)
assert.match(
  pageSource,
  /const PIPELINE_CALENDAR_RANGE_PADDING_DAYS = 7/,
  'calendar reloads should pad the visible range instead of loading all appointment history',
)
assert.match(
  extractFunctionBlock(pageSource, 'buildAppointmentReloadRange'),
  /getVisibleCalendarDateRange\(calendarView, calendarCursorDate\)/,
  'calendar mode should derive the appointment query range from the visible calendar period',
)
assert.match(
  pageSource,
  /appointmentReloadWindowRef\.current = buildAppointmentReloadRange/,
  'calendar state changes should keep the appointment reload window ref fresh',
)
assert.match(
  pageSource,
  /from: appointmentRange\.from, to: appointmentRange\.to,/,
  'pipeline appointment reloads should pass from/to to listAppointmentsAsync',
)
assert.match(
  pageSource,
  /mergeAppointmentRowsForReload\(previous\.appointments, scopedAppointments/,
  'bounded appointment reloads should preserve appointment rows outside the refreshed range',
)
assert.match(
  pageSource,
  /calendarCursorDate, calendarView, isCalendarMode, organisationId, scheduleRecordsReload/,
  'calendar navigation should trigger a reload for the newly visible appointment window',
)
assert.match(
  serviceSource,
  /query = query\.gte\('date_time', from\)/,
  'direct Supabase appointment fallback should apply a lower date_time bound',
)
assert.match(
  serviceSource,
  /query = query\.lt\('date_time', to\)/,
  'direct Supabase appointment fallback should apply an upper date_time bound',
)
assert.match(
  serviceSource,
  /APPOINTMENT_PARTICIPANT_FETCH_BATCH_SIZE = 100/,
  'participant detail lookups should be batched to avoid oversized IN queries',
)
assert.match(
  serviceSource,
  /appointmentIds\.length; index \+= APPOINTMENT_PARTICIPANT_FETCH_BATCH_SIZE/,
  'participant detail lookups should iterate appointment IDs in batches',
)

console.log('appointment query range phase 2 checks passed')

// Exercise the actual calendar helpers for the reported far-future date.
const context = vm.createContext({ Date, resolveAppointmentSchedule, appointmentStartIso, sastDateKey, sastDayStart, sastWeekStart, sastMonthStart, addSastDays, normalizeText: value => String(value || '').trim() })
vm.runInContext(`
const PIPELINE_APPOINTMENT_ROLLING_PAST_DAYS = 45;
const PIPELINE_APPOINTMENT_ROLLING_FUTURE_DAYS = 180;
const PIPELINE_CALENDAR_RANGE_PADDING_DAYS = 7;
${['toDateOnlyIso', 'addCalendarDays', 'getStartOfLocalDay', 'getEndExclusiveOfLocalDay', 'getStartOfWeek', 'getMonthGridDays', 'getWeekDays', 'getCalendarRangeDays', 'getVisibleCalendarDateRange', 'buildAppointmentReloadRange', 'parseAppointmentDate', 'isAppointmentWithinReloadRange', 'mergeAppointmentRowsForReload', 'formatCalendarPeriodLabel', 'formatAppointmentTimeRange'].map(name => extractFunctionBlock(pageSource, name)).join('\n')}
`, context)
const range = vm.runInContext("buildAppointmentReloadRange({ isCalendarMode: true, calendarView: 'month', calendarCursorDate: new Date(2027, 9, 1) })", context)
for (const view of ['day', 'week', 'three_day', 'month']) {
  const visible = context.buildAppointmentReloadRange({ isCalendarMode: true, calendarView: view, calendarCursorDate: new Date(2027, 9, 1) })
  assert.equal(context.isAppointmentWithinReloadRange({ date: '2027-10-01', startTime: '11:40' }, visible), true)
  assert.equal(context.isAppointmentWithinReloadRange({ dateTime: visible.to }, visible), false, 'upper calendar bound must remain exclusive')
}
const future = { appointmentId: 'future', organisationId: 'agency', date: '2027-10-01', startTime: '11:40' }
assert.equal(context.isAppointmentWithinReloadRange(future, range), true, 'October 1, 2027 must be included in the navigated calendar range')
const retained = context.mergeAppointmentRowsForReload([
  future, { appointmentId: 'past', organisationId: 'agency', date: '2025-10-01', startTime: '11:40' },
  { appointmentId: 'other-org', organisationId: 'other', date: '2025-10-01', startTime: '11:40' },
], [], { range, organisationId: 'agency' })
assert.deepEqual(Array.from(retained, row => row.appointmentId), ['past'], 'a verified empty range removes deleted rows but retains history only in this organisation')
console.log('future date navigation and scoped merge checks passed')

// The actual calendar grid follows SAST midnight in either process timezone.
assert.equal(context.toDateOnlyIso(context.parseAppointmentDate({ dateTime: '2027-09-30T22:30Z' })), '2027-10-01')
const sastDay = context.getVisibleCalendarDateRange('day', new Date('2027-09-30T22:30Z'))
assert.equal(sastDay.from.toISOString(), '2027-09-30T22:00:00.000Z')
assert.equal(sastDay.to.toISOString(), '2027-10-01T22:00:00.000Z')
assert.equal(context.toDateOnlyIso(context.getMonthGridDays(new Date('2027-10-01T10:00Z'))[0]), '2027-09-27')
console.log('SAST calendar grid and exclusive day bounds passed')

assert.match(context.formatCalendarPeriodLabel('day', new Date('2027-09-30T22:30Z')), /01.*Oct.*2027/)
const overseas = { date: '2027-10-01', startTime: '23:30', endTime: '23:50', timezone: 'America/New_York' }
assert.equal(context.toDateOnlyIso(context.parseAppointmentDate(overseas)), '2027-10-02')
assert.equal(context.formatAppointmentTimeRange(overseas), '05:30 - 05:50')
console.log('calendar labels and overseas appointments remain in the workspace timezone')
