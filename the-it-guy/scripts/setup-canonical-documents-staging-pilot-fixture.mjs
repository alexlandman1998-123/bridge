import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const STAGING_PROJECT_REF = 'isdowlnollckzvltkasn'
const WRITE_ENV_FLAG = 'CANONICAL_STAGING_PILOT_FIXTURE_WRITE'
const DEFAULT_EMAIL = 'qa.attorney+canonical@bridgenine.co.za'
const DEFAULT_SOURCE_TRANSACTION_ID = '9cb5076e-894e-4874-8671-f5bc65b01523'
const FIXTURE_REFERENCE = 'CANONICAL-DOC-TEST-001'
const FIXTURE_TITLE = 'CANONICAL DOC TEST - SAFE TO DELETE'
const FIXTURE_CLIENT_TOKEN = 'clpcanonicaldoctest'
const FIXTURE_SOURCE_SYSTEM = 'staging_pilot_fixture'
const FIXTURE_RESOLVER_VERSION = 'staging-pilot-fixture-v1'
const LOCAL_ENV_FILE = '.env.staging.local'

function hasArg(name) {
  return process.argv.includes(name)
}

function getArgValue(name, fallback = '') {
  const prefix = `${name}=`
  const arg = process.argv.find((item) => item.startsWith(prefix))
  return arg ? arg.slice(prefix.length).trim() : fallback
}

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {}
  return Object.fromEntries(
    fs.readFileSync(filePath, 'utf8')
      .split(/\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'))
      .map((line) => {
        const index = line.indexOf('=')
        if (index === -1) return [line, '']
        return [line.slice(0, index), line.slice(index + 1)]
      }),
  )
}

function loadEnv() {
  return {
    ...parseEnvFile('.env'),
    ...parseEnvFile(LOCAL_ENV_FILE),
    ...process.env,
  }
}

function appendLocalEnv(values = {}) {
  const existing = parseEnvFile(LOCAL_ENV_FILE)
  const additions = Object.entries(values)
    .filter(([key, value]) => !existing[key] && value)
    .map(([key, value]) => `${key}=${value}`)
  if (!additions.length) return false
  const prefix = fs.existsSync(LOCAL_ENV_FILE) && fs.readFileSync(LOCAL_ENV_FILE, 'utf8').trim() ? '\n' : ''
  fs.appendFileSync(LOCAL_ENV_FILE, `${prefix}${additions.join('\n')}\n`)
  return true
}

function createPassword() {
  return `${crypto.randomBytes(24).toString('base64url')}Aa1!`
}

function sqlLiteral(value) {
  if (value === null || value === undefined) return 'null'
  return `'${String(value).replaceAll("'", "''")}'`
}

function safeJson(value) {
  return JSON.stringify(value, null, 2)
}

function assertStagingEnvironment(env) {
  const supabaseUrl = String(env.VITE_SUPABASE_URL || '')
  if (!supabaseUrl.includes(STAGING_PROJECT_REF)) {
    throw new Error(`Refusing to run: VITE_SUPABASE_URL must point at staging project ${STAGING_PROJECT_REF}.`)
  }
}

function runLinkedQuery(sql) {
  const result = spawnSync('npx', ['supabase', 'db', 'query', '--linked', sql], {
    cwd: process.cwd(),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || 'Supabase linked query failed.')
  }

  return `${result.stdout || ''}${result.stderr || ''}`.trim()
}

function buildSql({ write, email, password, sourceTransactionId }) {
  const mode = write ? 'write' : 'dry_run'
  const escapedEmail = sqlLiteral(email)
  const escapedPassword = sqlLiteral(password || '')
  const escapedSourceTransactionId = sqlLiteral(sourceTransactionId)

  if (!write) {
    return `
with source_transaction as (
  select id, transaction_reference, title, development_id, unit_id, buyer_id
  from public.transactions
  where id = ${escapedSourceTransactionId}::uuid
),
existing_fixture as (
  select id, transaction_reference, title
  from public.transactions
  where transaction_reference = ${sqlLiteral(FIXTURE_REFERENCE)}
  limit 1
)
select jsonb_build_object(
  'mode', ${sqlLiteral(mode)},
  'wouldMutate', false,
  'sourceTransaction', coalesce((select to_jsonb(source_transaction) from source_transaction), null),
  'existingFixtureTransaction', coalesce((select to_jsonb(existing_fixture) from existing_fixture), null),
  'qaUserExists', exists(select 1 from auth.users where lower(email) = lower(${escapedEmail})),
  'sourceCanonicalRequirementCount', (
    select count(*) from public.document_requirement_instances where transaction_id = ${escapedSourceTransactionId}::uuid
  ),
  'sourceLegacyProjectionCount', (
    select count(*) from public.transaction_required_documents where transaction_id = ${escapedSourceTransactionId}::uuid
  ),
  'writeCommand', ${sqlLiteral(`${WRITE_ENV_FLAG}=true npm run setup:canonical-documents:staging-pilot-fixture -- --write --confirm-staging`)}
) as staging_pilot_fixture_plan;
`
  }

  return `
do $fixture$
declare
  v_email text := lower(${escapedEmail});
  v_password text := ${escapedPassword};
  v_source_transaction_id uuid := ${escapedSourceTransactionId}::uuid;
  v_user_id uuid;
  v_identity_id uuid;
  v_firm_id uuid;
  v_department_id uuid;
  v_workspace_id uuid;
  v_fixture_transaction_id uuid;
  v_requirement record;
  v_new_requirement_id uuid;
  v_legacy record;
  v_existing_requirement_id uuid;
  v_client_link_id uuid;
begin
  if v_password is null or length(v_password) < 12 then
    raise exception 'A staging QA password is required.';
  end if;

  select id into v_firm_id
  from public.attorney_firms
  where is_demo_data is true and lower(name) = 'tuckers inc'
  order by created_at
  limit 1;

  if v_firm_id is null then
    select id into v_firm_id
    from public.attorney_firms
    where is_demo_data is true and is_active is true
    order by created_at
    limit 1;
  end if;

  if v_firm_id is null then
    raise exception 'No demo attorney firm found for staging QA fixture.';
  end if;

  v_workspace_id := v_firm_id;

  insert into public.organisations (
    id,
    name,
    type,
    status,
    created_by,
    settings_json,
    is_demo_data,
    created_at,
    updated_at
  )
  values (
    v_workspace_id,
    'Canonical QA Attorney Workspace',
    'attorney_firm',
    'active',
    v_user_id,
    jsonb_build_object('fixture', 'canonical_document_pre_pilot'),
    true,
    now(),
    now()
  )
  on conflict (id) do update
    set name = coalesce(public.organisations.name, excluded.name),
        type = 'attorney_firm',
        status = 'active',
        settings_json = coalesce(public.organisations.settings_json, '{}'::jsonb) || jsonb_build_object('fixture', 'canonical_document_pre_pilot'),
        updated_at = now();

  select id into v_department_id
  from public.attorney_firm_departments
  where firm_id = v_firm_id and is_active is true
  order by case department_type when 'transfer' then 0 when 'management' then 1 else 2 end, created_at
  limit 1;

  select id into v_user_id
  from auth.users
  where lower(email) = v_email
  limit 1;

  if v_user_id is null then
    v_user_id := gen_random_uuid();
    insert into auth.users (
      id,
      instance_id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      confirmation_sent_at,
      confirmation_token,
      recovery_token,
      email_change,
      email_change_token_new,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at,
      is_sso_user,
      is_anonymous
    )
    values (
      v_user_id,
      '00000000-0000-0000-0000-000000000000',
      'authenticated',
      'authenticated',
      v_email,
      crypt(v_password, gen_salt('bf', 10)),
      now(),
      now(),
      '',
      '',
      '',
      '',
      jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
      jsonb_build_object(
        'sub', v_user_id::text,
        'email', v_email,
        'email_verified', true,
        'phone_verified', false,
        'full_name', 'Canonical QA Attorney',
        'staging_fixture', true,
        'fixture', 'canonical_document_pre_pilot'
      ),
      now(),
      now(),
      false,
      false
    )
    returning id into v_user_id;
  else
    update auth.users
    set encrypted_password = crypt(v_password, gen_salt('bf', 10)),
        email_confirmed_at = coalesce(email_confirmed_at, now()),
        confirmation_sent_at = coalesce(confirmation_sent_at, created_at, now()),
        confirmation_token = coalesce(confirmation_token, ''),
        recovery_token = coalesce(recovery_token, ''),
        email_change = coalesce(email_change, ''),
        email_change_token_new = coalesce(email_change_token_new, ''),
        raw_app_meta_data = jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
        raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object(
          'sub', v_user_id::text,
          'email', v_email,
          'email_verified', true,
          'phone_verified', false,
          'full_name', 'Canonical QA Attorney',
          'staging_fixture', true,
          'fixture', 'canonical_document_pre_pilot'
        ),
        updated_at = now()
    where id = v_user_id;
  end if;

  select id into v_identity_id
  from auth.identities
  where provider = 'email' and user_id = v_user_id
  limit 1;

  if v_identity_id is null then
    insert into auth.identities (
      id,
      user_id,
      provider_id,
      identity_data,
      provider,
      last_sign_in_at,
      created_at,
      updated_at
    )
    values (
      gen_random_uuid(),
      v_user_id,
      v_user_id::text,
      jsonb_build_object('sub', v_user_id::text, 'email', v_email, 'email_verified', true, 'phone_verified', false),
      'email',
      now(),
      now(),
      now()
    );
  else
    update auth.identities
    set provider_id = v_user_id::text,
        identity_data = jsonb_build_object('sub', v_user_id::text, 'email', v_email, 'email_verified', true, 'phone_verified', false),
        updated_at = now()
    where id = v_identity_id;
  end if;

  insert into public.profiles (
    id,
    email,
    full_name,
    first_name,
    last_name,
    role,
    onboarding_completed,
    firm_id,
    firm_role,
    primary_attorney_firm_id,
    attorney_role,
    system_role,
    created_at,
    updated_at
  )
  values (
    v_user_id,
    v_email,
    'Canonical QA Attorney',
    'Canonical QA',
    'Attorney',
    'attorney',
    true,
    null,
    'attorney',
    v_firm_id,
    'firm_admin',
    'professional',
    now(),
    now()
  )
  on conflict (id) do update
    set email = excluded.email,
        full_name = excluded.full_name,
        first_name = excluded.first_name,
        last_name = excluded.last_name,
        role = excluded.role,
        onboarding_completed = true,
        firm_id = excluded.firm_id,
        firm_role = excluded.firm_role,
        primary_attorney_firm_id = excluded.primary_attorney_firm_id,
        attorney_role = excluded.attorney_role,
        system_role = excluded.system_role,
        updated_at = now();

  insert into public.attorney_firm_members (
    firm_id,
    user_id,
    department_id,
    role,
    status,
    invited_by,
    joined_at,
    created_at,
    updated_at
  )
  values (
    v_firm_id,
    v_user_id,
    v_department_id,
    'firm_admin',
    'active',
    v_user_id,
    now(),
    now(),
    now()
  )
  on conflict (firm_id, user_id) do update
    set department_id = excluded.department_id,
        role = 'firm_admin',
        status = 'active',
        joined_at = coalesce(public.attorney_firm_members.joined_at, now()),
        updated_at = now();

  update public.organisation_users
  set status = 'removed',
      updated_at = now()
  where lower(email) = v_email
    and coalesce(is_demo_data, false) is true
    and organisation_id <> v_workspace_id;

  insert into public.organisation_users (
    organisation_id,
    user_id,
    first_name,
    last_name,
    email,
    role,
    status,
    permissions_json,
    invited_at,
    accepted_at,
    last_active_at,
    created_at,
    updated_at,
    is_demo_data,
    app_role,
    workspace_type,
    organisation_role,
    workspace_role,
    created_by,
    joined_at
  )
  values (
    v_workspace_id,
    v_user_id,
    'Canonical QA',
    'Attorney',
    v_email,
    'attorney',
    'active',
    '{}'::jsonb,
    now(),
    now(),
    now(),
    now(),
    now(),
    true,
    'attorney',
    'attorney_firm',
    'attorney',
    'attorney',
    v_user_id,
    now()
  )
  on conflict (organisation_id, email) do update
    set user_id = excluded.user_id,
        first_name = excluded.first_name,
        last_name = excluded.last_name,
        role = excluded.role,
        status = 'active',
        app_role = excluded.app_role,
        workspace_type = excluded.workspace_type,
        organisation_role = excluded.organisation_role,
        workspace_role = excluded.workspace_role,
        accepted_at = coalesce(public.organisation_users.accepted_at, now()),
        joined_at = coalesce(public.organisation_users.joined_at, now()),
        last_active_at = now(),
        updated_at = now();

  insert into public.user_workspace_preferences (
    user_id,
    active_workspace_id,
    active_workspace_source,
    updated_at
  )
  values (
    v_user_id,
    v_workspace_id,
    'auth_boot',
    now()
  )
  on conflict (user_id) do update
    set active_workspace_id = excluded.active_workspace_id,
        active_workspace_source = excluded.active_workspace_source,
        updated_at = now();

  select id into v_fixture_transaction_id
  from public.transactions
  where transaction_reference = ${sqlLiteral(FIXTURE_REFERENCE)}
  limit 1;

  if v_fixture_transaction_id is null then
    v_fixture_transaction_id := gen_random_uuid();

    insert into public.transactions
    select (jsonb_populate_record(
      null::public.transactions,
      to_jsonb(source_tx) || jsonb_build_object(
        'id', v_fixture_transaction_id,
        'transaction_reference', ${sqlLiteral(FIXTURE_REFERENCE)},
        'matter_number', ${sqlLiteral(FIXTURE_REFERENCE)},
        'unit_id', null,
        'listing_id', null,
        'title', ${sqlLiteral(FIXTURE_TITLE)},
        'property_description', ${sqlLiteral(FIXTURE_TITLE)},
        'seller_name', 'Canonical QA Seller',
        'seller_email', 'qa.seller+canonical@bridgenine.co.za',
        'seller_phone', '+27000000000',
        'assigned_attorney_email', v_email,
        'attorney', 'Canonical QA Attorney',
        'current_sub_stage_summary', 'Canonical document pre-pilot write-test fixture',
        'next_action', 'Canonical document browser lifecycle verification',
        'is_demo_data', true,
        'is_active', true,
        'created_at', now(),
        'updated_at', now(),
        'last_meaningful_activity_at', now()
      )
    )).*
    from public.transactions source_tx
    where source_tx.id = v_source_transaction_id;

    if not found then
      raise exception 'Source transaction % not found.', v_source_transaction_id;
    end if;
  else
    update public.transactions
    set transaction_reference = ${sqlLiteral(FIXTURE_REFERENCE)},
        matter_number = ${sqlLiteral(FIXTURE_REFERENCE)},
        unit_id = null,
        listing_id = null,
        title = ${sqlLiteral(FIXTURE_TITLE)},
        property_description = coalesce(property_description, ${sqlLiteral(FIXTURE_TITLE)}),
        current_sub_stage_summary = 'Canonical document pre-pilot write-test fixture',
        next_action = 'Canonical document browser lifecycle verification',
        assigned_attorney_email = v_email,
        attorney = 'Canonical QA Attorney',
        is_demo_data = true,
        is_active = true,
        updated_at = now()
    where id = v_fixture_transaction_id;
  end if;

  if not exists (
    select 1
    from public.transaction_attorney_assignments
    where transaction_id = v_fixture_transaction_id
      and assignment_type = 'transfer'
      and coalesce(status, assignment_status, '') = 'active'
  ) then
    insert into public.transaction_attorney_assignments (
      transaction_id,
      firm_id,
      assignment_type,
      department_id,
      primary_attorney_id,
      status,
      assigned_by,
      assigned_at,
      attorney_firm_id,
      attorney_user_id,
      attorney_department_id,
      attorney_role,
      assignment_status,
      is_primary,
      visibility_scope,
      can_edit,
      can_manage_documents,
      can_manage_signing,
      can_add_internal_notes,
      can_add_shared_updates,
      can_update_workflow_lane,
      is_demo_data
    )
    values (
      v_fixture_transaction_id,
      v_firm_id,
      'transfer',
      v_department_id,
      v_user_id,
      'active',
      v_user_id,
      now(),
      v_firm_id,
      v_user_id,
      v_department_id,
      'transfer_attorney',
      'active',
      true,
      'assigned_matter',
      true,
      true,
      true,
      true,
      true,
      true,
      true
    );
  else
    update public.transaction_attorney_assignments
    set firm_id = v_firm_id,
        attorney_firm_id = v_firm_id,
        department_id = v_department_id,
        attorney_department_id = v_department_id,
        primary_attorney_id = v_user_id,
        attorney_user_id = v_user_id,
        attorney_role = 'transfer_attorney',
        assignment_status = 'active',
        status = 'active',
        is_primary = true,
        can_edit = true,
        can_manage_documents = true,
        can_manage_signing = true,
        can_update_workflow_lane = true,
        is_demo_data = true
    where transaction_id = v_fixture_transaction_id
      and assignment_type = 'transfer'
      and coalesce(status, assignment_status, '') = 'active';
  end if;

  for v_requirement in
    select *
    from public.document_requirement_instances
    where transaction_id = v_source_transaction_id
      and status <> 'not_applicable'
    order by pack_key, document_definition_key, created_at
  loop
    select id into v_existing_requirement_id
    from public.document_requirement_instances
    where transaction_id = v_fixture_transaction_id
      and document_definition_key = v_requirement.document_definition_key
      and coalesce(requested_from_role, '') = coalesce(v_requirement.requested_from_role, '')
      and coalesce(requested_from_contact_id::text, '') = coalesce(v_requirement.requested_from_contact_id::text, '')
      and status <> 'not_applicable'
    limit 1;

    if v_existing_requirement_id is null then
      v_new_requirement_id := gen_random_uuid();
      insert into public.document_requirement_instances
      select (jsonb_populate_record(
        null::public.document_requirement_instances,
        to_jsonb(v_requirement) || jsonb_build_object(
          'id', v_new_requirement_id,
          'context_type', 'transaction',
          'context_id', v_fixture_transaction_id,
          'transaction_id', v_fixture_transaction_id,
          'listing_id', null,
          'status', 'pending',
          'satisfied_by_document_id', null,
          'satisfied_by_packet_id', null,
          'satisfied_by_packet_version_id', null,
          'rejection_reason', null,
          'waiver_reason', null,
          'expiry_date', null,
          'source_system', ${sqlLiteral(FIXTURE_SOURCE_SYSTEM)},
          'resolver_version', ${sqlLiteral(FIXTURE_RESOLVER_VERSION)},
          'created_at', now(),
          'updated_at', now()
        )
      )).*;

      insert into public.document_requirement_events (
        requirement_instance_id,
        event_type,
        actor_role,
        actor_user_id,
        message,
        metadata_json,
        created_at
      )
      values (
        v_new_requirement_id,
        'created',
        'system',
        v_user_id,
        'Canonical staging pilot fixture requirement created.',
        jsonb_build_object(
          'source_system', ${sqlLiteral(FIXTURE_SOURCE_SYSTEM)},
          'resolver_version', ${sqlLiteral(FIXTURE_RESOLVER_VERSION)},
          'source_requirement_instance_id', v_requirement.id,
          'fixture_reference', ${sqlLiteral(FIXTURE_REFERENCE)}
        ),
        now()
      );
    else
      update public.document_requirement_instances
      set source_system = ${sqlLiteral(FIXTURE_SOURCE_SYSTEM)},
          resolver_version = coalesce(resolver_version, ${sqlLiteral(FIXTURE_RESOLVER_VERSION)}),
          updated_at = now()
      where id = v_existing_requirement_id;
    end if;
  end loop;

  for v_legacy in
    select trd.*, source_req.document_definition_key
    from public.transaction_required_documents trd
    left join public.document_requirement_instances source_req
      on source_req.id = trd.canonical_requirement_instance_id
    where trd.transaction_id = v_source_transaction_id
    order by trd.sort_order, trd.document_key
  loop
    if not exists (
      select 1
      from public.transaction_required_documents
      where transaction_id = v_fixture_transaction_id
        and document_key = v_legacy.document_key
    ) then
      select id into v_new_requirement_id
      from public.document_requirement_instances
      where transaction_id = v_fixture_transaction_id
        and document_definition_key = v_legacy.document_definition_key
      order by created_at
      limit 1;

      insert into public.transaction_required_documents
      select (jsonb_populate_record(
        null::public.transaction_required_documents,
        to_jsonb(v_legacy) || jsonb_build_object(
          'id', gen_random_uuid(),
          'transaction_id', v_fixture_transaction_id,
          'is_uploaded', false,
          'uploaded_document_id', null,
          'status', 'missing',
          'uploaded_at', null,
          'verified_at', null,
          'rejected_at', null,
          'submitted_at', null,
          'reviewed_at', null,
          'approved_at', null,
          'rejected_note', null,
          'canonical_requirement_instance_id', v_new_requirement_id,
          'created_at', now(),
          'updated_at', now()
        )
      )).*;
    else
      update public.transaction_required_documents existing
      set canonical_requirement_instance_id = coalesce(existing.canonical_requirement_instance_id, linked_req.id),
          updated_at = now()
      from public.document_requirement_instances linked_req
      where existing.transaction_id = v_fixture_transaction_id
        and existing.document_key = v_legacy.document_key
        and linked_req.transaction_id = v_fixture_transaction_id
        and linked_req.document_definition_key = v_legacy.document_definition_key;
    end if;
  end loop;

  select id into v_client_link_id
  from public.client_portal_links
  where transaction_id = v_fixture_transaction_id
    and is_active is true
  order by created_at desc
  limit 1;

  if v_client_link_id is null then
    insert into public.client_portal_links (
      development_id,
      unit_id,
      transaction_id,
      buyer_id,
      token,
      is_active,
      created_at,
      updated_at
    )
    select
      development_id,
      unit_id,
      id,
      buyer_id,
      ${sqlLiteral(FIXTURE_CLIENT_TOKEN)},
      true,
      now(),
      now()
    from public.transactions
    where id = v_fixture_transaction_id
    on conflict (token) do update
      set transaction_id = excluded.transaction_id,
          development_id = excluded.development_id,
          unit_id = excluded.unit_id,
          buyer_id = excluded.buyer_id,
          is_active = true,
          updated_at = now()
    returning id into v_client_link_id;
  end if;
end;
$fixture$;

select jsonb_build_object(
  'mode', ${sqlLiteral(mode)},
  'mutatedData', true,
  'rolloutModeChanged', false,
  'canonicalPrimaryEnabled', false,
  'canonicalOnlyEnabled', false,
  'hardWorkflowBlocksEnabled', false,
  'externalRemindersEnabled', false,
  'qaUser', (
    select jsonb_build_object(
      'email', u.email,
      'id', u.id,
      'profileRole', p.role,
      'attorneyRole', p.attorney_role,
      'firmId', p.primary_attorney_firm_id,
      'workspaceId', (select active_workspace_id from public.user_workspace_preferences where user_id = u.id)
    )
    from auth.users u
    left join public.profiles p on p.id = u.id
    where lower(u.email) = lower(${escapedEmail})
    limit 1
  ),
  'fixtureTransaction', (
    select jsonb_build_object(
      'id', t.id,
      'transactionReference', t.transaction_reference,
      'title', t.title,
      'isDemoData', t.is_demo_data,
      'transactionUrl', '/transactions/' || t.id,
      'attorneyMatterUrl', '/transactions/' || t.id
    )
    from public.transactions t
    where t.transaction_reference = ${sqlLiteral(FIXTURE_REFERENCE)}
    limit 1
  ),
  'clientPortal', (
    select jsonb_build_object(
      'token', cpl.token,
      'path', '/client/' || cpl.token || '/documents',
      'transactionId', cpl.transaction_id
    )
    from public.client_portal_links cpl
    join public.transactions t on t.id = cpl.transaction_id
    where t.transaction_reference = ${sqlLiteral(FIXTURE_REFERENCE)}
      and cpl.is_active is true
    order by cpl.created_at desc
    limit 1
  ),
  'canonicalRequirementCount', (
    select count(*)
    from public.document_requirement_instances dri
    join public.transactions t on t.id = dri.transaction_id
    where t.transaction_reference = ${sqlLiteral(FIXTURE_REFERENCE)}
      and dri.status <> 'not_applicable'
  ),
  'legacyProjectionCount', (
    select count(*)
    from public.transaction_required_documents trd
    join public.transactions t on t.id = trd.transaction_id
    where t.transaction_reference = ${sqlLiteral(FIXTURE_REFERENCE)}
  ),
  'uploadableRequirement', (
    select jsonb_build_object(
      'id', dri.id,
      'documentDefinitionKey', dri.document_definition_key,
      'status', dri.status,
      'packKey', dri.pack_key,
      'reviewerRole', dri.reviewer_role,
      'uploadableByRoles', dri.uploadable_by_roles
    )
    from public.document_requirement_instances dri
    join public.transactions t on t.id = dri.transaction_id
    where t.transaction_reference = ${sqlLiteral(FIXTURE_REFERENCE)}
      and dri.status in ('pending', 'requested', 'rejected', 'expired')
      and array_length(dri.uploadable_by_roles, 1) is not null
    order by case when dri.reviewer_role is not null then 0 else 1 end, dri.created_at
    limit 1
  ),
  'manualReviewItemsExcluded', jsonb_build_array('internal_note documents', 'final_signed_packet documents without transaction context'),
  'credentialStorage', ${sqlLiteral(LOCAL_ENV_FILE)}
) as staging_pilot_fixture;
`
}

async function main() {
  const write = hasArg('--write')
  const confirmed = hasArg('--confirm-staging') && process.env[WRITE_ENV_FLAG] === 'true'
  const env = loadEnv()
  assertStagingEnvironment(env)

  if (write && !confirmed) {
    throw new Error(`Write mode requires --confirm-staging and ${WRITE_ENV_FLAG}=true.`)
  }

  const email = getArgValue('--email', env.STAGING_INTERNAL_EMAIL || DEFAULT_EMAIL).toLowerCase()
  const sourceTransactionId = getArgValue('--source-transaction-id', DEFAULT_SOURCE_TRANSACTION_ID)
  let password = env.STAGING_INTERNAL_PASSWORD || ''
  let wroteCredentials = false

  if (write && !password) {
    password = createPassword()
    wroteCredentials = appendLocalEnv({
      STAGING_INTERNAL_EMAIL: email,
      STAGING_INTERNAL_PASSWORD: password,
    })
  } else if (write) {
    appendLocalEnv({ STAGING_INTERNAL_EMAIL: email })
  }

  const output = runLinkedQuery(buildSql({ write, email, password, sourceTransactionId }))

  console.log(safeJson({
    mode: write ? 'write' : 'dry_run',
    stagingProjectRef: STAGING_PROJECT_REF,
    qaEmail: email,
    credentialsWrittenToLocalIgnoredEnv: wroteCredentials,
    passwordPrinted: false,
    sourceTransactionId,
    fixtureReference: FIXTURE_REFERENCE,
    rolloutModeChanged: false,
    canonicalPrimaryEnabled: false,
    canonicalOnlyEnabled: false,
    hardWorkflowBlocksEnabled: false,
    externalRemindersEnabled: false,
    output,
  }))
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
