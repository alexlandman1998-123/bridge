const EXPECTED_EXCEPTIONS = Object.freeze([
  ['sql/20260829_rental_vacancy_foundation.sql', 'public.rental_vacancy_record_status_history()', 'trigger_history_writer'],
  ['sql/20260829_rental_internal_marketing_operations.sql', 'public.rental_vacancy_marketing_record_status_history()', 'trigger_history_writer'],
  ['sql/20260829_rental_application_screening.sql', 'public.rental_application_screening_record_history()', 'trigger_history_writer'],
  ['sql/20260829_rental_application_decisions.sql', 'public.rental_decide_application(uuid, integer, text, text, jsonb)', 'authorised_transaction_command'],
  ['sql/20260829_rental_application_decisions.sql', 'public.rental_retry_application_notification(uuid)', 'authorised_transaction_command'],
  ['sql/20260829_rental_application_tenancy_conversion.sql', 'public.rental_convert_application_to_tenancy(uuid, integer)', 'authorised_transaction_command'],
].map(([source, signature, kind]) => ({ source, signature, kind })))

function text(value) {
  return String(value ?? '').trim()
}

function timestamp(value) {
  return Boolean(text(value)) && !Number.isNaN(Date.parse(value))
}

function sourceHasRequiredControls(sql, exception) {
  const normalized = text(sql)
  const functionName = exception.signature.slice(0, exception.signature.indexOf('('))
  const functionStart = normalized.indexOf(`function ${functionName}(`)
  if (functionStart < 0) return false
  const functionBody = normalized.slice(functionStart, normalized.indexOf('$$;', functionStart) + 3)
  const secured = /security\s+definer\s+set\s+search_path\s*=\s*''/i.test(functionBody)
  const revoked = new RegExp(`revoke execute on function ${exception.signature.replace(/[().,+]/g, '\\$&')} from public, anon`, 'i').test(normalized)
  const authenticatedGrant = new RegExp(`grant execute on function ${exception.signature.replace(/[().,+]/g, '\\$&')} to authenticated`, 'i').test(normalized)
  const triggerBound = exception.kind === 'trigger_history_writer'
    ? new RegExp(`execute function ${exception.signature.replace(/[().,+]/g, '\\$&')}`, 'i').test(normalized)
    : /if auth\.uid\(\) is null then raise exception/i.test(functionBody) && /rental_branch_access/i.test(functionBody)
  return secured && revoked && (exception.kind === 'trigger_history_writer' || authenticatedGrant) && triggerBound
}

export function assessRentalSecurityDefinerExceptionReview({ exceptions = [], sources = [] } = {}) {
  const sourceMap = new Map((Array.isArray(sources) ? sources : []).map((source) => [source.path, source.sql]))
  const configured = Array.isArray(exceptions) ? exceptions : []
  const checks = EXPECTED_EXCEPTIONS.map((expected) => {
    const record = configured.find((candidate) => candidate?.source === expected.source && candidate?.signature === expected.signature)
    const controlsPass = record?.kind === expected.kind && sourceHasRequiredControls(sourceMap.get(expected.source), expected)
    const approvalPass = record?.approved === true && text(record?.approvalReference) && timestamp(record?.approvedAt)
    return { signature: expected.signature, source: expected.source, controlsPass, approvalPass, pass: controlsPass && approvalPass }
  })
  const unexpected = configured.filter((candidate) => !EXPECTED_EXCEPTIONS.some((expected) => expected.source === candidate?.source && expected.signature === candidate?.signature))
  return {
    version: 'arch9_rental_security_definer_exception_review_phase4_v1',
    ready: checks.every((check) => check.pass) && unexpected.length === 0,
    checks,
    unexpectedExceptions: unexpected.map((exception) => exception?.signature || null),
    nextAction: checks.every((check) => check.pass) && unexpected.length === 0
      ? 'Least-privilege exceptions are verified; retain them with the source lock for managed migration review.'
      : 'Obtain a reviewed approval reference for each verified exception; do not weaken RLS or grant direct table writes.',
  }
}
