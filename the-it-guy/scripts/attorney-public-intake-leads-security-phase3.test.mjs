import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import {
  ATTORNEY_LEAD_ROLE_ACCESS,
  ATTORNEY_LEAD_SERVICE_TYPE_VALUES,
} from '../src/core/leads/attorneyLeadContract.js'

const migrationUrl = new URL(
  '../../supabase/migrations/202607160002_attorney_public_intake_leads_security_phase3.sql',
  import.meta.url,
)
const migration = await readFile(migrationUrl, 'utf8')
const migrationPath = fileURLToPath(migrationUrl)

function test(name, fn) {
  try {
    fn()
    console.log(`ok - ${name}`)
  } catch (error) {
    console.error(`not ok - ${name}`)
    throw error
  }
}

function functionBody(name) {
  const match = migration.match(
    new RegExp(`create or replace function public\\.${name}\\([\\s\\S]*?\\n\\$\\$;`, 'i'),
  )
  assert.ok(match, `${name} function is missing`)
  return match[0]
}

test('migration is transactional and avoids destructive data operations', () => {
  assert.match(migration, /^begin;/)
  assert.match(migration, /commit;\s*$/)
  assert.doesNotMatch(migration, /drop\s+table/i)
  assert.doesNotMatch(migration, /truncate\s+/i)
  assert.doesNotMatch(migration, /delete\s+from\s+/i)
})

test('Attorney access helper covers every Phase 1 role and capability', () => {
  const helper = functionBody('bridge_attorney_lead_can_access')
  for (const role of Object.keys(ATTORNEY_LEAD_ROLE_ACCESS)) {
    assert.match(helper, new RegExp(`'${role}'`), `SQL access map is missing ${role}`)
  }
  for (const action of ['view', 'create', 'edit', 'assign', 'archive', 'view_link', 'manage_link']) {
    assert.match(helper, new RegExp(`'${action}'`), `SQL access map is missing ${action}`)
  }
  assert.match(helper, /organisation\.type = 'attorney_firm'/)
  assert.match(helper, /target_branch = v_branch/)
  assert.match(helper, /target_assigned_user = auth\.uid\(\)/)
})

test('legacy permissive Lead policies explicitly exclude Attorney rows', () => {
  for (const policy of [
    'leads_agency_select',
    'leads_agency_write',
    'leads_support_role_select',
    'leads_support_role_update',
  ]) {
    const policyMatch = migration.match(
      new RegExp(`create policy ${policy}[\\s\\S]*?(?=\\ndrop policy|\\n-- )`, 'i'),
    )
    assert.ok(policyMatch, `${policy} was not recreated`)
    assert.match(policyMatch[0], /coalesce\(lead_domain, 'agency'\) <> 'attorney'/)
  }
})

test('Attorney Lead rows have select, insert, and update policies but no delete policy', () => {
  assert.match(migration, /create policy attorney_leads_select/)
  assert.match(migration, /create policy attorney_leads_insert/)
  assert.match(migration, /create policy attorney_leads_update/)
  assert.doesNotMatch(migration, /create policy attorney_leads_delete/)
  assert.match(migration, /lead_domain = 'attorney'/)
})

test('assignment and archive capabilities are enforced from OLD and NEW values', () => {
  const trigger = functionBody('bridge_enforce_attorney_lead_update_scope')
  assert.match(trigger, /new\.assigned_user_id is distinct from old\.assigned_user_id/)
  assert.match(trigger, /new\.branch_id is distinct from old\.branch_id/)
  assert.match(trigger, /'assign'/)
  assert.match(trigger, /new\.status = 'archived'/)
  assert.match(trigger, /old\.status = 'archived'/)
  assert.match(trigger, /'archive'/)
  assert.match(trigger, /new\.lead_domain <> 'attorney'/)
  assert.match(migration, /before update on public\.leads/)
})

test('related tables derive tenant access from the parent Attorney Lead', () => {
  for (const policy of [
    'attorney_lead_contacts_select',
    'attorney_lead_contacts_update',
    'attorney_lead_activities_select',
    'attorney_lead_activities_insert',
    'attorney_lead_details_select',
    'attorney_lead_details_insert',
    'attorney_lead_details_update',
    'attorney_lead_assignment_history_select',
    'attorney_lead_assignment_history_insert',
  ]) {
    assert.match(migration, new RegExp(`create policy ${policy}`))
  }
  assert.doesNotMatch(migration, /create policy attorney_lead_assignment_history_update/)
})

test('legacy contact write policy cannot delete an Attorney-linked contact', () => {
  const policyMatch = migration.match(
    /create policy contacts_agency_write[\s\S]*?(?=\ndrop policy|\n-- )/i,
  )
  assert.ok(policyMatch, 'contacts_agency_write was not recreated')
  assert.match(policyMatch[0], /not exists \([\s\S]*lead\.lead_domain = 'attorney'/)
  assert.match(migration, /create policy attorney_lead_contacts_update/)
  assert.doesNotMatch(migration, /create policy attorney_lead_contacts_delete/)
})

test('anonymous users receive no direct table privileges', () => {
  assert.doesNotMatch(migration, /grant\s+(?:select|insert|update|delete|all)[^;]*\s+to\s+anon/i)
  assert.doesNotMatch(migration, /create policy[^;]+to anon/i)
  assert.match(migration, /grant execute on function public\.resolve_attorney_public_intake\(text\) to anon, authenticated/)
})

test('public resolver returns a fixed safe shape without internal identifiers', () => {
  const resolver = functionBody('resolve_attorney_public_intake')
  for (const safeField of [
    'service_types',
    'firm_name',
    'logo_url',
    'primary_colour',
    'website',
    'contact_email',
    'contact_phone',
  ]) {
    assert.match(resolver, new RegExp(`\\b${safeField}\\b`))
  }
  assert.doesNotMatch(resolver.match(/returns table \([\s\S]*?\n\)/i)?.[0] ?? '', /\b(?:organisation_id|firm_id|user_id|member_id|settings_json)\b/)
  assert.match(resolver, /link\.status = 'active'/)
  assert.match(resolver, /organisation\.status = 'active'/)
})

test('submission command is service-role only and tenant is resolved from slug', () => {
  const submit = functionBody('submit_attorney_public_intake')
  const signature = submit.match(/submit_attorney_public_intake\([\s\S]*?\)\nreturns/i)?.[0] ?? ''
  assert.doesNotMatch(signature, /organisation_id|attorney_firm_id|intake_link_id/)
  assert.match(submit, /auth\.role\(\) <> 'service_role'/)
  assert.match(submit, /lower\(link\.slug\) = lower\(trim\(p_slug\)\)/)
  assert.match(migration, /revoke all on function public\.submit_attorney_public_intake[\s\S]*from public, anon, authenticated/)
  assert.match(migration, /grant execute on function public\.submit_attorney_public_intake[\s\S]*to service_role/)
})

test('submission is idempotent and creates the complete Lead aggregate atomically', () => {
  const submit = functionBody('submit_attorney_public_intake')
  assert.match(submit, /on conflict \(intake_link_id, idempotency_key\) do nothing/)
  assert.match(submit, /pg_advisory_xact_lock/)
  assert.match(submit, /insert into public\.contacts/)
  assert.match(submit, /insert into public\.leads/)
  assert.match(submit, /'attorney'/)
  assert.match(submit, /insert into public\.attorney_lead_details/)
  assert.match(submit, /insert into public\.lead_activities/)
  assert.match(submit, /status = 'processed'/)
  assert.match(submit, /'duplicate', true/)
})

test('contact reuse is exact, tenant-scoped, and never name-based', () => {
  const submit = functionBody('submit_attorney_public_intake')
  const contactMatch = submit.match(/select contact\.contact_id[\s\S]*?limit 1;/i)?.[0] ?? ''
  assert.match(contactMatch, /contact\.organisation_id = v_link\.organisation_id/)
  assert.match(contactMatch, /lower\(trim\(contact\.email\)\) = v_email/)
  assert.match(contactMatch, /regexp_replace\(coalesce\(contact\.phone/)
  assert.doesNotMatch(contactMatch, /first_name|last_name/)
  assert.match(submit, /A matched contact still receives a new Lead/)
})

test('service, consent, payload, identity, and metadata inputs are bounded', () => {
  const submit = functionBody('submit_attorney_public_intake')
  for (const serviceType of ATTORNEY_LEAD_SERVICE_TYPE_VALUES) {
    assert.match(submit, new RegExp(`'${serviceType}'`))
  }
  assert.match(submit, /octet_length\(p_payload::text\) > 65536/)
  assert.match(submit, /Privacy consent is required/)
  assert.match(submit, /Email or phone is required/)
  assert.match(submit, /char_length\(p_idempotency_key\) not between 16 and 128/)
  assert.match(submit, /v_link\.service_config_json \? v_service_type/)
})

console.log(`attorney public intake Leads Phase 3 security test passed: ${migrationPath}`)
