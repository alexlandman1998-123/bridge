import { readFile } from 'node:fs/promises'
import { createHomeSeekersLeadDatabase, HOME_SEEKERS_LEAD_FIXTURE } from './homeSeekersLeadDatabase.js'
export const EXTERNAL_FIXTURE = { ...HOME_SEEKERS_LEAD_FIXTURE, revo: '322c3853-2d82-4413-97e6-b4cd8bc32a7c', branch: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', otherBranch: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', development: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' }
export async function createExternalWebsiteDatabase() {
  const db = await createHomeSeekersLeadDatabase()
  try {
    await db.exec(`
      create schema auth; create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.user_id',true),'')::uuid$$;
      create function public.bridge_is_org_admin(uuid) returns boolean language sql stable as $$select auth.uid()='22222222-2222-4222-8222-222222222222'::uuid$$;
      create table organisations(id uuid primary key);
      create table organisation_branches(id uuid primary key,organisation_id uuid,name text,is_active boolean default true,email text,phone text);
      create table developments(id uuid primary key,organisation_id uuid,name text);
      alter table private_listings add column branch_id uuid,add column development_id uuid,add column listing_reference text,add column listing_visibility text,add column listing_status text,add column city text,add column updated_at timestamptz default now();
      alter table listing_publication_data add column description text,add column suburb text,add column province text,add column property_type text,add column bedrooms integer,add column bathrooms numeric,add column parking_bays integer,add column garages integer,add column floor_size numeric,add column erf_size numeric,add column created_at timestamptz default now(),add column updated_at timestamptz default now();
      create table listing_media(id uuid primary key default gen_random_uuid(),listing_id uuid,media_type text,file_url text,caption text,sort_order integer default 0,updated_at timestamptz default now());
      create table website_listing_media_assets(id uuid primary key default gen_random_uuid(),website_site_id uuid,listing_id uuid,source_media_id uuid,media_type text,public_url text,status text default 'active',updated_at timestamptz default now());
      alter table vault.decrypted_secrets add column id uuid primary key default gen_random_uuid();
      create function vault.create_secret(text,text,text) returns uuid language sql as $$insert into vault.decrypted_secrets(decrypted_secret,name) values($1,$2) returning id$$;
      create function vault.update_secret(uuid,text) returns void language sql as $$update vault.decrypted_secrets set decrypted_secret=$2 where id=$1$$;
      create table website_pilot_enrolments(organisation_id uuid,status text);
    `)
    for (const name of ['20260921115101_website_tenant_boundary_enforcement', '20260917065214_public_websites_multi_agency_production']) {
      const source = await readFile(new URL(`../../../../supabase/migrations/${name}.sql`, import.meta.url), 'utf8')
      const marker = name.includes('tenant') ? 'create or replace function public.website_assert_tenant_boundary()' : 'create or replace function public.website_require_active_pilot_for_lead()'
      const start = source.indexOf(marker)
      await db.exec(source.slice(start, source.indexOf('$$;', start) + 3))
    }
    await db.exec(`create trigger trg_website_lead_submissions_tenant_boundary before insert on website_lead_submissions for each row execute function website_assert_tenant_boundary();
      create trigger trg_website_leads_active_pilot before insert on website_lead_submissions for each row execute function website_require_active_pilot_for_lead();`)
    const f = EXTERNAL_FIXTURE
    await db.query('insert into auth.users values($1),($2)',[f.agent,f.principal])
    await db.query('insert into organisations values($1),($2)',[f.revo,f.org])
    await db.query("insert into organisation_branches(id,organisation_id,name) values($1,$3,'Cape Town'),($2,$3,'Gauteng')",[f.branch,f.otherBranch,f.revo])
    await db.query("insert into developments values($1,$2,'Revo test development')",[f.development,f.revo])
    await db.query("insert into organisation_users select $1,user_id,email,first_name,last_name,$2,status,role,is_primary_owner,updated_at from organisation_users where organisation_id=$3",[f.revo,f.branch,f.org])
    await db.query("update private_listings set organisation_id=$1,branch_id=$2,development_id=$3,listing_reference='TEST-REF',listing_visibility='active_market',listing_status='active',city='Cape Town'",[f.revo,f.branch,f.development])
    await db.exec("update listing_publication_data set suburb='Sea Point',province='Western Cape',property_type='Apartment',bedrooms=2,bathrooms=1,parking_bays=1,description='Public description';")
    await db.query("select set_config('test.user_id',$1,false)",[f.principal])
    await db.exec(await readFile(new URL('../../../../supabase/migrations/20261004154517_external_website_integrations.sql', import.meta.url),'utf8'))
    return db
  } catch (error) { await db.close(); throw new Error(`${error.code}: ${error.message} ${error.where || ""}`) }
}
export function databaseClient(db) {
  return { rpc: async (name, params = {}) => {
    const keys = Object.keys(params)
    try {
      const result = await db.query(`select public.${name}(${keys.map((key,index) => `${key} => $${index+1}`).join(',')}) as data`,Object.values(params))
      return { data: result.rows[0].data, error: null }
    } catch(error) { return { data: null, error } }
  } }
}
