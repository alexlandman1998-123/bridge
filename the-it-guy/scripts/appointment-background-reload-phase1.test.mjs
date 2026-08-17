import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const sourcePath = path.resolve('src/pages/agency/AgencyPipelinePage.jsx')
const source = fs.readFileSync(sourcePath, 'utf8')

function extractFunctionBlock(functionName) {
  const declaration = `async function ${functionName}`
  const start = source.indexOf(declaration)
  assert.notEqual(start, -1, `${functionName} should exist`)
  const openBrace = source.indexOf('{', start)
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

function assertBackgroundReload(functionName) {
  const block = extractFunctionBlock(functionName)
  assert.doesNotMatch(
    block,
    /await\s+reloadRecords\(organisationId\)/,
    `${functionName} should not block the save on a full records reload`,
  )
  assert.match(
    block,
    /scheduleRecordsReload\(organisationId,\s*850\)/,
    `${functionName} should schedule a background records reload`,
  )
}

const appointmentSaveHandlers = [
  'handleCreateAlreadyRsvpdViewingAppointments',
  'handleCreateSellerFirstViewingRequests',
  'handleCompleteKingstonsValuationPresentationFromJourney',
  'handleSaveAppointmentDetail',
  'handleCompleteLeadViewing',
  'handleCancelLeadViewing',
  'handleCancelAppointment',
  'handleMarkAppointmentComplete',
  'handleResendAppointmentInvite',
]

for (const functionName of appointmentSaveHandlers) {
  assertBackgroundReload(functionName)
}

assert.match(
  source,
  /const upsertAppointmentRecords = useCallback/,
  'created appointments should have a local upsert helper',
)
assert.match(
  extractFunctionBlock('handleCreateAlreadyRsvpdViewingAppointments'),
  /upsertAppointmentRecords\(createdAppointments\.map/,
  'confirmed viewing creation should optimistically add created appointments',
)
assert.match(
  extractFunctionBlock('handleCreateSellerFirstViewingRequests'),
  /upsertAppointmentRecords\(createdRequests\.map/,
  'seller RSVP requests should optimistically add created appointments',
)
assert.match(
  extractFunctionBlock('handleSaveAppointmentDetail'),
  /patchAppointmentRecord\(selectedAppointmentId/,
  'appointment updates should patch the local appointment row before reloading',
)
assert.match(
  extractFunctionBlock('handleResendAppointmentInvite'),
  /patchAppointmentRecord\(selectedAppointmentId/,
  'invite resends should patch the local appointment row before reloading',
)
assert.match(
  extractFunctionBlock('handleCompleteLeadViewing'),
  /patchAppointmentRecord\(targetAppointment\.appointmentId/,
  'lead viewing completion should patch the local appointment row before reloading',
)
assert.match(
  source,
  /reloadRecords\(orgId\)\.catch/,
  'scheduled reloads should handle reload failures',
)

console.log('appointment background reload phase 1 checks passed')
