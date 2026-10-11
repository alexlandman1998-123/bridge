import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'

// Shared, synthetic PostgreSQL setup for the access tests and isolated browser journey.
// It installs the repository migration SQL; it never connects to a hosted database.
const migration = readFileSync(new URL('../../../supabase/migrations/20261001092739_seller_onboarding_access_enforcement.sql', import.meta.url), 'utf8')
const completionMigration = readFileSync(new URL('../../../supabase/migrations/20260906163555_corrective_seller_onboarding_receipt.sql', import.meta.url), 'utf8')
const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const listingA = uuid(1), listingB = uuid(2), agentA = uuid(11), agentB = uuid(12), adminA = uuid(13), outsider = uuid(14)

async function fixture() {
  const db = new PGlite()
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth; create schema extensions;
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid$$;
    grant usage on schema auth to anon, authenticated;
    create function extensions.digest(text, text) returns bytea language sql immutable as $$select sha256(convert_to($1, 'UTF8'))$$;
    create table private_listings (
      id uuid primary key, organisation_id uuid, assigned_agent_id uuid,
      listing_status text default 'seller_lead', seller_onboarding_status text default 'not_started',
      seller_type text, seller_canonical_facts_json jsonb default '{}', seller_canonical_fact_readiness_json jsonb default '{}',
      seller_canonical_facts_updated_at timestamptz, updated_at timestamptz,
      originating_crm_lead_id uuid, seller_lead_id uuid
    );
    create table private_listing_seller_onboarding (
      id uuid primary key default gen_random_uuid(), private_listing_id uuid not null references private_listings(id),
      token text unique not null, token_expires_at timestamptz, seller_portal_token text,
      seller_portal_password_hash text, seller_portal_access_token_hash text,
      seller_portal_recovery_token_hash text, seller_portal_invite_token_hash text,
      seller_portal_invite_consumed_at timestamptz, seller_portal_invite_expires_at timestamptz,
      seller_portal_access_token_expires_at timestamptz, seller_portal_link_expires_at timestamptz,
      seller_portal_link_active boolean default true, status text default 'not_started',
      form_data jsonb default '{}', seller_type text, ownership_structure text, marital_regime text,
      canonical_facts_json jsonb default '{}', canonical_fact_readiness_json jsonb default '{}',
      canonical_facts_updated_at timestamptz, updated_at timestamptz, submitted_at timestamptz
    );
    -- This fixture supplies the existing listing permission contract; the
    -- migration under test must not replace or broaden that helper.
    create function bridge_can_access_private_listing(target_listing_id uuid) returns boolean
    language sql stable security definer set search_path = '' as $$
      select coalesce((select assigned_agent_id = auth.uid() or
        (organisation_id = '${uuid(21)}' and auth.uid() = '${adminA}')
        from public.private_listings where id = target_listing_id), false)
    $$;
    create function bridge_private_listing_seller_portal_link_is_active(o jsonb, l jsonb) returns boolean
    language sql stable as $$select coalesce((o->>'seller_portal_link_active')::boolean,true)
      and (o->>'seller_portal_link_expires_at' is null or (o->>'seller_portal_link_expires_at')::timestamptz > now())$$;
    grant all on private_listing_seller_onboarding to anon, authenticated;
    alter table private_listing_seller_onboarding enable row level security;
    create policy private_listing_seller_onboarding_mutate_member on private_listing_seller_onboarding for all to authenticated using (true) with check (true);
    create policy private_listing_seller_onboarding_select_token on private_listing_seller_onboarding for select to anon using (token is not null);
    create policy unexpected_historical_allow on private_listing_seller_onboarding for all to public using (true) with check (true);
    insert into private_listings(id, organisation_id, assigned_agent_id) values
      ('${listingA}','${uuid(21)}','${agentA}'), ('${listingB}','${uuid(22)}','${agentB}');
    insert into private_listing_seller_onboarding(id,private_listing_id,token,seller_portal_token,form_data,
      seller_portal_password_hash,seller_portal_access_token_hash,seller_portal_invite_token_hash,seller_portal_recovery_token_hash) values
      ('${uuid(31)}','${listingA}','token-a','stable-a','{"sellerName":"Owner A","currentStep":2}', 'password-secret','access-secret','invite-secret','recovery-secret'),
      ('${uuid(32)}','${listingB}','token-b','stable-b','{"sellerName":"Owner B"}', null,null,null,null);
    insert into private_listing_seller_onboarding(id,private_listing_id,token,token_expires_at,seller_portal_token) values
      ('${uuid(33)}','${listingB}','expired',now()-interval '1 second','stable-expired-legacy');
  `)
  await db.exec(completionMigration)
  await db.exec(migration)
  return db
}
async function actor(db, role, id = '') {
  await db.exec('reset role')
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id])
  await db.exec(`set role ${role}`)
}
async function rpc(db, name, token, data = undefined) {
  const args = data === undefined ? [token] : [token, JSON.stringify(data)]
  const sqlArgs = data === undefined ? '$1' : '$1, p_form_data := $2::jsonb'
  return (await db.query(`select public.${name}(${sqlArgs}) result`, args)).rows[0].result
}


async function installCanonicalSave(db) {
    await db.exec(`
      alter table private_listings add column address_line_1 text, add column asking_price numeric, add column mandate_type text;
      create table private_listing_activity (id uuid default gen_random_uuid(), private_listing_id uuid, activity_type text, activity_title text,
        activity_description text, performed_by uuid, visibility text, metadata jsonb);
      create function extensions.gen_random_bytes(integer) returns bytea language sql as $$select decode(repeat('ab', $1), 'hex')$$;
      grant usage on schema extensions to authenticated;
      grant select, update on private_listings to authenticated;
      grant select, insert on private_listing_activity to authenticated;
      alter table private_listings enable row level security;
      create policy listing_member on private_listings for all to authenticated using (bridge_can_access_private_listing(id)) with check (bridge_can_access_private_listing(id));
    `)
    await db.exec(readFileSync(new URL('../../../supabase/migrations/20260924151653_listing_seller_canonical_update_phase2.sql', import.meta.url), 'utf8'))
}


async function guardedFixture() {
  const db = await fixture()
  await installCanonicalSave(db)
  await db.exec(readFileSync(new URL('../../../supabase/migrations/20261006095510_seller_save_non_retryable_conflict.sql', import.meta.url), 'utf8'))
  await db.exec(readFileSync(new URL('../../../supabase/migrations/20261010215549_seller_save_concurrency_guards.sql', import.meta.url), 'utf8'))
  await db.exec(readFileSync(new URL('../../../supabase/migrations/20261010225607_seller_canonical_revision_scope.sql', import.meta.url), 'utf8'))
  return db
}

async function transactionSellerFixture({ multi = false, linked = true } = {}) {
  const db = await guardedFixture()
  await db.exec(`reset role;
    delete from private_listing_seller_onboarding where id='${uuid(33)}';
    create unique index seller_capture_listing_unique on private_listing_seller_onboarding(private_listing_id);
    create table public.transactions(id uuid primary key, listing_id uuid, organisation_id uuid, purchaser_type text default 'individual',seller_type text default 'individual', seller_name text,seller_email text,seller_phone text,updated_at timestamptz default clock_timestamp());
    create table public.transaction_participants(id uuid primary key,transaction_id uuid references transactions(id),role_type text,removed_at timestamptz,participant_name text,participant_email text,participant_phone text,updated_at timestamptz default clock_timestamp());
    create table public.onboarding_form_data(id uuid primary key default gen_random_uuid(),transaction_id uuid unique references transactions(id),purchaser_type text,form_data jsonb default '{}',updated_at timestamptz default clock_timestamp());
    create function public.bridge_can_access_transaction_spine(uuid) returns boolean language sql stable as $$select auth.uid()='${agentA}'::uuid$$;
    create function public.bridge_has_transaction_permission(uuid,text) returns boolean language sql stable as $$select auth.uid()='${agentA}'::uuid and $2='edit_core_transaction'$$;
    create table public.organisation_users(organisation_id uuid,user_id uuid,status text,workspace_role text,organisation_role text,organization_role text,role text);
    insert into organisation_users(organisation_id,user_id,status,workspace_role) values('${uuid(21)}','${agentA}','active','agent');
    update private_listing_seller_onboarding set form_data='{"sellerName":"Owner A","email":"old@example.com","phone":"old-phone","otherSavedFact":"keep"}',ownership_structure='individual',canonical_facts_json='{"seller":{"name":"Owner A","contact":{"name":"Owner A","email":"old@example.com","phone":"old-phone"}}}' where id='${uuid(31)}';
    insert into transactions(id,listing_id,organisation_id,seller_name,seller_email,seller_phone) values('${uuid(801)}',${linked ? `'${listingA}'` : 'null'},'${uuid(21)}','Owner A','old@example.com','old-phone');
    insert into transaction_participants(id,transaction_id,role_type,participant_name,participant_email,participant_phone) values('${uuid(802)}','${uuid(801)}','seller','Owner A','old@example.com','old-phone');
    ${multi ? `insert into transaction_participants(id,transaction_id,role_type,participant_name,participant_email,participant_phone) values('${uuid(803)}','${uuid(801)}','seller','Other Owner','other@example.com','other-phone');` : ''}
    insert into onboarding_form_data(transaction_id,purchaser_type,form_data) values('${uuid(801)}','individual','${JSON.stringify({ unrelated: 'preserve', __bridge_transaction_parties: { version: 'transaction_party_profile_v1', buyer: { people: [{ id: uuid(804), name: 'Buyer' }] }, seller: { name: 'Owner A', entityType: 'individual', people: [{ id: uuid(802), name: 'Owner A', email: 'old@example.com', phone: 'old-phone', primaryContact: true, identityNumber: 'saved-id' }, ...(multi ? [{ id: uuid(803), name: 'Other Owner', email: 'other@example.com', phone: 'other-phone', primaryContact: false }] : [])] } } })}');
    grant all on transactions,transaction_participants,onboarding_form_data to authenticated;
  `)
  const permissions = readFileSync(new URL('../../../supabase/migrations/20260924160026_listing_seller_collaboration_permissions_phase8.sql', import.meta.url), 'utf8')
  const permissionStart = permissions.indexOf('create or replace function public.bridge_listing_seller_actor_permission(')
  await db.exec(permissions.slice(permissionStart, permissions.indexOf('$$;', permissionStart) + 3))
  await db.exec(readFileSync(new URL('../../../supabase/migrations/20260829195657_seller_onboarding_link_fast_prepare.sql', import.meta.url), 'utf8'))
  await db.exec(readFileSync(new URL('../../../supabase/migrations/20261011065947_transaction_seller_atomic_saves.sql', import.meta.url), 'utf8'))
  await db.exec(readFileSync(new URL('../../../supabase/migrations/20261011073408_seller_current_profile_alignment.sql', import.meta.url), 'utf8'))
  await actor(db, 'authenticated', agentA)
  return db
}

export { uuid, listingA, listingB, agentA, agentB, adminA, outsider, fixture, actor, rpc, installCanonicalSave, guardedFixture, transactionSellerFixture }
