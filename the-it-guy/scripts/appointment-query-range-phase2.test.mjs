import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

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
  /from: resolvedAppointmentRange\?\.from \|\| null,[\s\S]*to: resolvedAppointmentRange\?\.to \|\| null,/,
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
