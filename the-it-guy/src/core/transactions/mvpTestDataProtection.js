export const MVP_TEST_DATA_PROTECTION_VERSION = 'arch9_mvp_test_data_protection_v1'
export const MVP_TEST_DATA_MARKER = 'TEST — DO NOT ACTION'
export const MVP_TEST_DATA_PROTECTION_ERROR = 'MVP_TEST_DATA_PROTECTION_VIOLATION'

function text(value) {
  return String(value || '').trim()
}

function testMarker(value) {
  const normalized = text(value).toLowerCase()
  return normalized.includes('test — do not action') || normalized.includes('test - do not action')
}

function invalidEmail(value) {
  return text(value).toLowerCase().endsWith('.invalid')
}

function record(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function hasTestMarker(value, depth = 0) {
  if (depth > 3 || value === null || value === undefined) return false
  if (typeof value === 'string') return testMarker(value) || invalidEmail(value)
  if (Array.isArray(value)) return value.some((item) => hasTestMarker(item, depth + 1))
  if (typeof value !== 'object') return false
  return Object.values(value).some((item) => hasTestMarker(item, depth + 1))
}

/** Classifies synthetic pilot data without relying on an individual screen's conventions. */
export function assessMvpTestDataProtection({ payload = {}, transaction = {}, listing = {}, lead = {}, metadata = {} } = {}) {
  const payloadRecord = record(payload)
  const transactionRecord = record(transaction)
  const metadataRecord = record(metadata)
  const routingProfile = record(transactionRecord.routingProfile || transactionRecord.routing_profile_json)
  const persisted = record(routingProfile.testDataProtection || routingProfile.test_data_protection)
  const metadataProtection = record(metadataRecord.testDataProtection || metadataRecord.test_data_protection)
  const explicitTestMode = payloadRecord.testMode === true || payloadRecord.test_mode === true ||
    transactionRecord.testMode === true || transactionRecord.test_mode === true ||
    metadataRecord.testMode === true || metadataRecord.test_mode === true ||
    persisted.isTestData === true || persisted.is_test_data === true ||
    metadataProtection.isTestData === true || metadataProtection.is_test_data === true
  const controlledTestRoleSet = text(
    payloadRecord.controlledTestRoleSet || payloadRecord.controlled_test_role_set ||
    metadataRecord.controlledTestRoleSet || metadataRecord.controlled_test_role_set ||
    persisted.controlledTestRoleSet || persisted.controlled_test_role_set ||
    metadataProtection.controlledTestRoleSet || metadataProtection.controlled_test_role_set,
  )
  const marked = hasTestMarker([payloadRecord, transactionRecord, record(listing), record(lead), metadataRecord])
  const isTestData = explicitTestMode || Boolean(controlledTestRoleSet) || marked
  const reasons = [
    ...(explicitTestMode ? ['explicit_test_mode'] : []),
    ...(controlledTestRoleSet ? ['controlled_test_role_set'] : []),
    ...(marked ? ['test_marker_or_invalid_contact'] : []),
  ]
  return {
    version: MVP_TEST_DATA_PROTECTION_VERSION,
    isTestData,
    protected: isTestData,
    externalDeliveryAllowed: !isTestData,
    marker: isTestData ? MVP_TEST_DATA_MARKER : '',
    controlledTestRoleSet: controlledTestRoleSet || null,
    reasons,
  }
}

/** Refuses labelled synthetic data unless it enters through the explicit controlled-pilot path. */
export function assertMvpTestDataProtection(assessment = {}, { testMode = false, controlledTestRoleSet = '' } = {}) {
  if (!assessment?.isTestData) return assessment
  if (testMode === true && text(controlledTestRoleSet) === 'mvp_pilot_v1') return assessment
  const error = new Error('TEST — DO NOT ACTION data may only be created through controlled test mode with the mvp_pilot_v1 role set.')
  error.code = MVP_TEST_DATA_PROTECTION_ERROR
  error.assessment = assessment
  throw error
}
