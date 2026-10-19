import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { packageReportQueryFingerprint } from '../../../api/knowledge-factory/package-report-recipes.js';
export const org = '00000000-0000-4000-8000-000000000001';
export const actor = '00000000-0000-4000-8000-000000000002';
export const approvalId = '00000000-0000-4000-8000-000000000003';
export async function accountingDatabase(environment = 'live') {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key);
    create table organisations(id uuid primary key);
    create table organisation_users(organisation_id uuid,user_id uuid,membership_status text,status text,workspace_role text);
    create table knowledge_factory_organisation_access(organisation_id uuid,enabled boolean,suspended_at timestamptz,allowed_operations text[]);
    create table knowledge_factory_user_permissions(organisation_id uuid,user_id uuid,revoked_at timestamptz,allowed_operations text[]);
    create table knowledge_factory_package_commercial_policies(organisation_id uuid primary key,allowed_product_ids text[],rollout_stage text check(rollout_stage in ('controlled_uat','pilot','suspended')),per_report_credit_cap integer,basic_report_credit_cap integer,full_report_credit_cap integer,monthly_credit_cap integer,monthly_report_cap integer,daily_report_cap_per_user integer);
    create table knowledge_factory_package_pilot_enrolments(organisation_id uuid,status text,pilot_ends_at timestamptz,allowed_user_ids uuid[],activated_at timestamptz,pilot_credit_cap integer,pilot_report_cap integer);
    create table knowledge_factory_report_products(organisation_id uuid,product_id text,status text,name text,description text,field_manifest jsonb,customer_price_cents integer,cost_validation_recipe_id text,report_sections jsonb,excluded_field_manifest jsonb,definition_version text);
    create table knowledge_factory_audit_log(id uuid primary key default gen_random_uuid(),organisation_id uuid,actor_id uuid,operation text,outcome text,created_at timestamptz default now(),request_purpose text,property_reference text,request_metadata jsonb,field_cost integer,type_cost integer,price_surcharge integer,credits_consumed integer,vendor_request_id text,error_code text);
    create table knowledge_factory_report_purchase_intents(id uuid primary key default gen_random_uuid(),organisation_id uuid,actor_id uuid,property_id bigint,product_id text,product_name text,included_fields jsonb,customer_price_cents integer,request_purpose text,boundary_snapshot jsonb,target_seller_lead_id uuid,status text,quote_expires_at timestamptz,quoted_supplier_credits integer,quoted_field_cost integer,quoted_type_cost integer,quoted_price_surcharge integer,confirmation_attested_at timestamptz,confirmed_at timestamptz,report_request_id uuid,executed_at timestamptz,created_at timestamptz default now(),updated_at timestamptz);
    create table knowledge_factory_report_requests(id uuid primary key default gen_random_uuid(),organisation_id uuid,actor_id uuid,property_id bigint,requested_report_types text[],request_purpose text,status text,confirmed_at timestamptz,quote_expires_at timestamptz,field_cost integer,type_cost integer,price_surcharge integer,credits_consumed integer,vendor_request_id text,report_summary jsonb);
    create table knowledge_factory_report_results(id uuid primary key default gen_random_uuid(),organisation_id uuid,purchase_intent_id uuid unique,report_request_id uuid,actor_id uuid,product_id text,property_id bigint,report_data jsonb not null,report_snapshot_version text,report_definition_snapshot jsonb,cost_validation_snapshot jsonb,request_context_snapshot jsonb,opportunity_signals jsonb,field_cost integer,type_cost integer,price_surcharge integer,credits_consumed integer,vendor_request_id text,executed_at timestamptz default now());
    insert into auth.users values('${actor}'); insert into organisations values('${org}');
    insert into organisation_users values('${org}','${actor}','active','active','principal');
    insert into knowledge_factory_organisation_access values('${org}',true,null,array['property_report']);
    insert into knowledge_factory_user_permissions values('${org}','${actor}',null,array['property_report']);
    insert into knowledge_factory_package_commercial_policies values('${org}',array['basic_owner_lookup'],'controlled_uat',20000,20000,20000,20000,10,10);
    insert into knowledge_factory_report_products values('${org}','basic_owner_lookup','uat_validated','Basic owner report','Property and owner report','[]',500,'package_basic_v1','[]','[]','canvassing-v1');
    insert into knowledge_factory_audit_log(id,organisation_id) values('00000000-0000-4000-8000-000000000004','${org}');
  `);
  await db.exec('grant usage on schema auth to service_role; grant select on auth.users to service_role; grant select,insert,update on all tables in schema public to service_role;');
  await db.exec(await readFile(new URL('../../../../supabase/migrations/20261018083318_knowledge_factory_report_cost_approval_and_credit_ledger.sql', import.meta.url), 'utf8'));
  await db.query(`update knowledge_factory_package_commercial_policies set rollout_stage=$1`, [environment === 'live' ? 'production' : 'controlled_uat']);
  await db.query(`insert into knowledge_factory_report_cost_approvals(id,organisation_id,product_id,supplier_environment,supplier_query_sha256,schedule_version,maximum_credits,evidence_audit_id,supplier_reference,review_note,reviewed_by,expires_at)
    values($1,$2,'basic_owner_lookup',$3,$4,'kf-v1-2026-09-22',12000,'00000000-0000-4000-8000-000000000004','supplier-confirmation','Reviewed complete supplier evidence',$5,now()+interval '7 days')`,[approvalId,org,environment,packageReportQueryFingerprint('basic_owner_lookup'),actor]);
  return db;
}

// A small Supabase-compatible adapter over real PostgreSQL. It exercises the
// actual handler and migration together, without network or remote data.
export function accountingClient(db) {
  return { auth: { getUser: async () => ({ data: { user: { id: actor } } }) },
    rpc: async (name, args) => {
      try { const values = Object.values(args).map(v => v && typeof v === 'object' ? JSON.stringify(v) : v);
        const query = `select public.${name}(${Object.keys(args).map((key,i)=>`${key} => $${i+1}`).join(',')}) as data`;
        return { data: (await db.query(query, values)).rows[0].data, error: null };
      } catch(error) { return { data: null, error }; }
    },
    from(table) {
      let filters=[],values=[],sort='',limit='',fields='*',single=false,count=false,head=false,mutation=null,payload;
      const param = value => { values.push(value && typeof value === 'object' ? JSON.stringify(value) : value); return '$'+values.length; };
      const builder = {
        select(value='*',options={}) { fields=value;count=Boolean(options.count);head=Boolean(options.head);return this; },
        eq(key,value) { filters.push(`${key}=${param(value)}`);return this; },
        gte(key,value) { filters.push(`${key}>=${param(value)}`);return this; },
        gt(key,value) { filters.push(`${key}>${param(value)}`);return this; },
        contains(key,value) { filters.push(`${key} @> ${param(value)}`);return this; },
        is(key,value) { if(value!==null) throw new Error('Only null filters are used'); filters.push(`${key} is null`);return this; },
        order(key,options={}) { sort=` order by ${key} ${options.ascending === false ? 'desc' : 'asc'}`;return this; },
        limit(n) { limit=` limit ${Number(n)}`;return this; },
        single() { single=true;return this; },maybeSingle() { single=true;return this; },
        insert(value) { mutation='insert';payload=value;return this; },update(value) { mutation='update';payload=value;return this; },
        async then(resolve) {
          try {
            let query;const where=filters.length?' where '+filters.join(' and '):'';
            if(mutation==='insert') query=`insert into ${table}(${Object.keys(payload).join(',')}) values(${Object.values(payload).map(param).join(',')}) returning ${fields}`;
            else if(mutation==='update') query=`update ${table} set ${Object.entries(payload).map(([k,v])=>`${k}=${param(v)}`).join(',')}${where} returning ${fields}`;
            else query=`select ${count?'count(*) as count':fields} from ${table}${where}${sort}${limit}`;
            const result=await db.query(query,values);
            resolve({data:head?null:single?result.rows[0]||null:result.rows,error:null,count:count?Number(result.rows[0]?.count):null});
          } catch(error) { resolve({data:null,error,count:null}); }
        }
      };return builder;
    }
  };
}
