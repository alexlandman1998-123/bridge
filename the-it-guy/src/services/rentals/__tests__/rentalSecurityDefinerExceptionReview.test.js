import assert from 'node:assert/strict'
import { assessRentalSecurityDefinerExceptionReview } from '../rentalSecurityDefinerExceptionReview.js'

const triggerSql = "create function public.rental_vacancy_record_status_history() returns trigger language plpgsql security definer set search_path = '' as $$ begin return new; end; $$; revoke execute on function public.rental_vacancy_record_status_history() from public, anon, authenticated; create trigger x after insert on y for each row execute function public.rental_vacancy_record_status_history();"
const rpcSql = "create function public.rental_decide_application(uuid, integer, text, text, jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$ begin if auth.uid() is null then raise exception 'Authentication'; end if; perform public.rental_branch_access(null, null); return '{}'::jsonb; end; $$; revoke execute on function public.rental_decide_application(uuid, integer, text, text, jsonb) from public, anon; grant execute on function public.rental_decide_application(uuid, integer, text, text, jsonb) to authenticated;"
const exception = { source: 'sql/20260829_rental_vacancy_foundation.sql', signature: 'public.rental_vacancy_record_status_history()', kind: 'trigger_history_writer', approved: true, approvalReference: 'SEC-1', approvedAt: '2026-09-05T13:00:00.000Z' }
const result = assessRentalSecurityDefinerExceptionReview({ exceptions: [exception], sources: [{ path: exception.source, sql: triggerSql }] })
assert.equal(result.checks[0].controlsPass, true)
assert.equal(result.checks[0].approvalPass, true)
assert.equal(result.ready, false, 'all six expected exceptions must be present')
assert.equal(assessRentalSecurityDefinerExceptionReview({ exceptions: [{ ...exception, approved: false }], sources: [{ path: exception.source, sql: triggerSql }, { path: 'sql/20260829_rental_application_decisions.sql', sql: rpcSql }] }).checks[0].approvalPass, false)

console.log('Rental SECURITY DEFINER exception-review Phase 4 contract passed.')
