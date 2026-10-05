import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const migration = name => readFileSync(new URL(`../../../supabase/migrations/${name}.sql`, import.meta.url), 'utf8')
const uuid = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const definition = (sql, name) => {
  const replaceStart = sql.indexOf(`create or replace function ${name}(`)
  const start = replaceStart >= 0 ? replaceStart : sql.indexOf(`create function ${name}(`)
  assert.ok(start >= 0, name)
  const end = sql.indexOf('\n$$;', start)
  assert.ok(end > start, name)
  return sql.slice(start, end + 4)
}

export async function verifyAttorneyInternalAccess(PGlite) {
  const db = new PGlite()
  const matter = uuid(100), otherMatter = uuid(101)
  const actors = { transfer: uuid(1), bond: uuid(2), cancellation: uuid(3), agent: uuid(4), buyer: uuid(5), seller: uuid(6),
    outsider: uuid(7), secretary: uuid(8), unallocated: uuid(9), principal: uuid(10), replacement: uuid(11) }
  const firms = { transfer: uuid(21), bond: uuid(22), cancellation: uuid(23), replacement: uuid(24) }
  const lanes = ['transfer', 'bond', 'cancellation']
  const privateId = lane => uuid(200 + lanes.indexOf(lane))
  const as = async (actor, query, args = []) => {
    await db.exec('reset role')
    await db.query("select set_config('test.actor',$1,false),set_config('test.portal',$2,false)",
      [actors[actor] || '', actor])
    await db.exec(actor === 'anonymous' ? 'set role anon' : 'set role authenticated')
    try { return (await db.query(query, args)).rows } finally { await db.exec('reset role') }
  }
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create schema auth; create schema storage; create schema document_security; create schema journey_private;
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.actor',true),'')::uuid$$;
      create table auth.users(id uuid primary key);
      create table attorney_firms(id uuid primary key);
      create table profiles(id uuid primary key,role text,email text);
      create table transactions(id uuid primary key,listing_id uuid);
      create table attorney_firm_members(firm_id uuid,user_id uuid,status text,role text,professional_role text);
      create table attorney_matter_team_members(transaction_id uuid,firm_id uuid,user_id uuid,removed_at timestamptz);
      create table transaction_attorney_assignments(transaction_id uuid,attorney_firm_id uuid,firm_id uuid,
        attorney_role text,assignment_type text,matter_type text,assignment_status text,status text,
        can_update_workflow_lane boolean,can_manage_documents boolean,can_add_internal_notes boolean,can_add_shared_updates boolean);
      create table attorney_lane_delegations(transaction_id uuid,attorney_role text,responsible_firm_id uuid,
        delegate_user_id uuid,status text,starts_at timestamptz,expires_at timestamptz,capabilities text[]);
      create table transaction_subprocesses(id uuid primary key,transaction_id uuid,process_type text);
      create table documents(id uuid primary key default gen_random_uuid(),transaction_id uuid,visibility_scope text,
        client_recipient_role text,uploaded_by_user_id uuid,source text,file_bucket text,file_path text,lane_key text,attorney_role text);
      create table document_requests(id uuid,transaction_id uuid);
      create table document_requirement_instances(id uuid,transaction_id uuid);
      create table storage.objects(bucket_id text,name text,owner_id text);
      create table transaction_attorney_lane_updates(id uuid primary key default gen_random_uuid(),transaction_id uuid,subprocess_id uuid,
        lane_key text,attorney_role text,update_type text,visibility text,message text,created_by uuid,client_recipients jsonb,metadata jsonb);
      create table transaction_attorney_lane_history(id uuid primary key default gen_random_uuid(),transaction_id uuid,
        lane_key text,attorney_role text,visibility text,changed_by uuid,note text);
      create table transaction_sync_command_receipts(id uuid primary key default gen_random_uuid(),transaction_id uuid,
        source_table text,source_record_id text,actor_id uuid,actor_role text,visibility text,canonical_event_id uuid,
        idempotency_key text,transaction_version bigint,status text,outputs_json jsonb,audience_json jsonb);
      create table transaction_events(id uuid primary key default gen_random_uuid(),transaction_id uuid,event_data jsonb,
        created_by uuid,created_by_role text,visibility_scope text);
      create table transaction_activity_projections(id uuid primary key default gen_random_uuid(),transaction_id uuid,command_receipt_id uuid,
        visibility text,lane_key text,audience_json jsonb,canonical_event_type text);
      create table journey_private.task_catalog(lane_key text,step_key text,definition jsonb);
      create function bridge_can_access_transaction_spine(t uuid) returns boolean language sql stable security definer set search_path='' as $$
        select t='${matter}'::uuid and exists(select 1 from public.profiles where id=auth.uid() and role<>'outsider')$$;
      create function journey_private.can_read_professional_journey(t uuid) returns boolean language sql stable security definer set search_path='' as $$
        select public.bridge_can_access_transaction_spine(t) and exists(select 1 from public.profiles where id=auth.uid() and role not in ('buyer','seller'))$$;
      create function bridge_transaction_scope_is_internal_user() returns boolean language sql as $$select false$$;
      create function bridge_has_external_workspace_transaction_access(uuid) returns boolean language sql as $$select false$$;
      create function bridge_external_workspace_role() returns text language sql as $$select null::text$$;
      create function bridge_developer_document_portal_active_link() returns table(transaction_id uuid,id uuid) language sql as $$select null::uuid,null::uuid where false$$;
      create function bridge_has_client_portal_token_transaction_access(t uuid) returns boolean language sql as $$select t='${matter}'::uuid and current_setting('test.portal',true)='buyer'$$;
      create function bridge_has_onboarding_token_transaction_access(uuid) returns boolean language sql as $$select false$$;
      create function bridge_storage_seller_portal_listing_id() returns uuid language sql as $$select case when current_setting('test.portal',true)='seller' then '${matter}'::uuid end$$;
      create function bridge_bond_wet_ink_storage_access(text,boolean) returns boolean language sql as $$select current_setting('test.portal',true)='buyer'$$;
      -- Existing atomic adapters are exercised with a local propagation sink.
      -- The separate canonical propagation suite verifies the full ledger/rollup.
      create function bridge_commit_transaction_sync_command_phase2(t uuid,action text,key text,source text,record text,
        visibility text,audience jsonb,title text,description text,client_title text,client_description text,payload jsonb)
      returns jsonb language plpgsql security definer set search_path='' as $$
      declare e uuid:=gen_random_uuid(); r uuid:=gen_random_uuid(); lane text:=case when action like 'BOND_%' then 'bond' when action like 'CANCELLATION_%' then 'cancellation' else 'transfer' end;
      begin
        insert into public.transaction_events values(e,t,payload,auth.uid(),lane||'_attorney',visibility);
        insert into public.transaction_sync_command_receipts(id,transaction_id,source_table,source_record_id,actor_id,actor_role,visibility,canonical_event_id,idempotency_key,audience_json)
          values(r,t,source,record,auth.uid(),lane||'_attorney',visibility,e,key,audience);
        insert into public.transaction_activity_projections(transaction_id,command_receipt_id,visibility,lane_key,audience_json,canonical_event_type)
          values(t,r,visibility,lane,audience,action);
        return jsonb_build_object('receiptId',r);
      end; $$;
    `)
    const pending = migration('20260927074804_attorney_pending_firm_workflow_access')
    await db.exec(definition(pending, 'public.bridge_attorney_matter_team_access'))
    await db.exec(definition(pending, 'public.bridge_can_mutate_attorney_lane'))
    await db.exec("create function document_security.can_upload(t uuid) returns boolean language sql as $$select public.bridge_can_mutate_attorney_lane(t,'transfer_attorney','documents') or public.bridge_can_mutate_attorney_lane(t,'bond_attorney','documents') or public.bridge_can_mutate_attorney_lane(t,'cancellation_attorney','documents')$$;")
    await db.exec(definition(migration('20260829105514_transaction_sync_phase3_module_adapters'), 'public.bridge_add_attorney_comment_and_sync_phase3'))
    const storage = migration('20260911081342_document_storage_audience_boundary')
    await db.exec(definition(storage, 'document_security.can_read'))
    await db.exec(definition(storage, 'document_security.object_allowed'))
    const storagePolicies = storage.slice(storage.indexOf('drop policy if exists documents_audience_boundary'), storage.indexOf('-- These definer projections'))
    await db.exec(storagePolicies)
    for (const [actor, id] of Object.entries(actors)) {
      await db.query('insert into auth.users values($1)', [id])
      await db.query('insert into profiles(id,role) values($1,$2)', [id, ['agent','buyer','seller','outsider'].includes(actor) ? actor : 'attorney'])
    }
    for (const id of Object.values(firms)) await db.query('insert into attorney_firms values($1)', [id])
    await db.query('insert into transactions values($1,$1),($2,$2)', [matter, otherMatter])
    for (const lane of [...lanes, 'replacement']) {
      const role = lane === 'replacement' ? 'transfer' : lane
      await db.query("insert into attorney_firm_members values($1,$2,'active','attorney_conveyancer','attorney_conveyancer')", [firms[lane], actors[lane]])
      await db.query("insert into transaction_attorney_assignments values($1,$2,$2,$3,$4,$4,'active','active',true,true,true,true)", [matter, firms[lane], `${role}_attorney`, role])
      await db.query('insert into attorney_matter_team_members values($1,$2,$3,null)', [matter, firms[lane], actors[lane]])
    }
    for (const actor of ['secretary','unallocated','principal']) {
      const role = actor === 'principal' ? 'director_partner' : 'conveyancing_secretary'
      await db.query("insert into attorney_firm_members values($1,$2,'active',$3,$3)", [firms.transfer, actors[actor], role])
    }
    await db.query('insert into attorney_matter_team_members values($1,$2,$3,null)', [matter, firms.transfer, actors.secretary])
    // Old permissive policies deliberately grant broad reads. Restrictive guards
    // must still deny another firm's internal records through every surface.
    for (const table of ['documents','storage.objects','transaction_attorney_lane_updates','transaction_attorney_lane_history',
      'transaction_sync_command_receipts','transaction_events','transaction_activity_projections']) {
      await db.exec(`alter table ${table} enable row level security; grant select on ${table} to anon,authenticated;
        create policy old_broad_read on ${table} for select to anon,authenticated using(true);`)
    }
    await db.exec(`grant usage on schema auth,document_security,storage to anon,authenticated;
      grant select on profiles,transaction_subprocesses to authenticated;
      grant insert,update on transaction_attorney_lane_updates,documents to authenticated;
      create policy legal_note_write on transaction_attorney_lane_updates for insert to authenticated
        with check(bridge_can_mutate_attorney_lane(transaction_id,attorney_role,'internal_notes'));
      create policy document_write on documents for update to authenticated
        using(bridge_can_mutate_attorney_lane(transaction_id,attorney_role,'documents'))
        with check(bridge_can_mutate_attorney_lane(transaction_id,attorney_role,'documents'));
      insert into journey_private.task_catalog values('transfer','buyer_fica_review','{"clientVisibleAllowed":false,"client":{"title":"PRIVATE FICA"}}');`)
    await db.exec(definition(migration('20261003173649_attorney_document_persistence'), 'public.bridge_save_attorney_document'))
    const version = migration('20261003183115_attorney_document_versions')
    const versionStart = version.indexOf('create function public.bridge_save_attorney_document_version(')
    await db.exec(version.slice(versionStart,version.indexOf('\n$$;',versionStart)+4))
    await db.exec(migration('20261004102741_attorney_internal_workspace_boundaries'))
    for (const lane of lanes) {
      const id = privateId(lane), path = `transaction-${matter}/${lane}-draft.docx`
      await db.query('insert into transaction_subprocesses values($1,$2,$3)', [id, matter, lane])
      await db.query("insert into documents(id,transaction_id,visibility_scope,uploaded_by_user_id,file_bucket,file_path,lane_key,attorney_role,internal_firm_id) values($1,$2,'internal',$3,'documents',$4,$5,$6,$7)",
        [id, matter, actors[lane], path, lane, `${lane}_attorney`, firms.replacement])
      await db.query("insert into storage.objects(bucket_id,name) values('documents',$1)", [path])
      const result = await as(lane, 'select bridge_add_attorney_comment_and_sync_phase3($1,$2,$3,$4) result',
        [matter, lane, `${lane} PRIVATE NOTE`, `internal-note-${lane}-0001`])
      const update = (await db.query('select * from transaction_attorney_lane_updates where id=$1', [result[0].result.updateId])).rows[0]
      assert.equal(update.internal_firm_id, firms[lane], 'owner is stamped by the server')
      await db.query("insert into transaction_attorney_lane_history(transaction_id,lane_key,attorney_role,visibility,changed_by,note) values($1,$2,$3,'internal',$4,$5)",
        [matter, lane, `${lane}_attorney`, actors[lane], 'PRIVATE STAGE NOTE'])
      assert.equal((await db.query('select internal_firm_id from documents where id=$1', [id])).rows[0].internal_firm_id, firms[lane], 'forged ownership is ignored')
    }
    const visible = async actor => Object.fromEntries(await Promise.all([
      'documents','storage.objects','transaction_attorney_lane_updates','transaction_attorney_lane_history','transaction_activity_projections','transaction_sync_command_receipts','transaction_events',
    ].map(async table => [table, Number((await as(actor, `select count(*)::int n from ${table}`))[0].n)])))
    for (const actor of lanes) {
      const counts = await visible(actor)
      assert.ok(Object.values(counts).every(count => count === 1), `${actor} sees only its private lane: ${JSON.stringify(counts)}`)
      const audiences = await as(actor, 'select audience_json from transaction_activity_projections')
      assert.deepEqual(audiences[0].audience_json, [`${actor}_attorney`], 'new private audiences stay in their lane')
    }
    for (const actor of ['secretary','principal']) assert.ok(Object.values(await visible(actor)).every(n => n === 1), `${actor} sees allocated firm work`)
    for (const actor of ['agent','buyer','seller','outsider','anonymous','unallocated','replacement'])
      assert.ok(Object.values(await visible(actor)).every(n => n === 0), `${actor} cannot read private records`)
    const uploading = `transaction-${matter}/upload-waiting-for-save.docx`
    await db.query("insert into storage.objects values('documents',$1,$2)",[uploading,actors.transfer])
    assert.equal((await as('transfer','select name from storage.objects where name=$1',[uploading])).length,1,'uploader can recover an unfinished save')
    assert.equal((await as('bond','select name from storage.objects where name=$1',[uploading])).length,0,'another document writer cannot read an unfinished private upload')
    assert.equal((await as('bond',"select document_security.object_allowed('documents',$1,true) ok",[`transaction-${matter}/new-bond-file.docx`]))[0].ok,true,'upload-before-metadata remains available to actual writers')
    await db.query('delete from storage.objects where name=$1',[uploading])
    await db.query("insert into attorney_lane_delegations values($1,'transfer_attorney',$2,$3,'active',now()-interval '1 day',now()+interval '1 day',array['documents','internal_notes'])", [matter, firms.transfer, actors.bond])
    assert.ok(Object.values(await visible('bond')).every(n => n === 2), 'an explicit delegate can read delegated private work')
    await db.exec("update attorney_lane_delegations set capabilities=array['documents']")
    const documentOnly = await visible('bond')
    assert.equal(documentOnly.documents, 2)
    assert.equal(documentOnly.transaction_attorney_lane_updates, 1, 'document delegation does not grant private notes')
    await db.exec("update attorney_lane_delegations set expires_at=now()-interval '1 second'")
    assert.ok(Object.values(await visible('bond')).every(n => n === 1), 'expired delegation loses private reads')
    await db.query('update attorney_matter_team_members set removed_at=now() where user_id=$1', [actors.secretary])
    assert.ok(Object.values(await visible('secretary')).every(n => n === 0), 'removed team member loses private reads')
    await db.query("update attorney_firm_members set status='removed' where user_id=$1", [actors.transfer])
    assert.ok(Object.values(await visible('transfer')).every(n => n === 0), 'being the uploader does not bypass a removed membership')
    await db.query("update attorney_firm_members set status='active' where user_id=$1", [actors.transfer])
    await assert.rejects(as('transfer','update documents set internal_firm_id=$1 where id=$2', [firms.replacement, privateId('transfer')]), /owning firm/)
    // Shared audiences and dedicated signed-original access remain unchanged.
    for (const [scope, recipient, id] of [['professional_shared',null,uuid(301)],['client_visible','buyer',uuid(302)],['client_visible','seller',uuid(303)]]) {
      await db.query('insert into documents(id,transaction_id,visibility_scope,client_recipient_role,uploaded_by_user_id,file_bucket,file_path,lane_key) values($1,$2,$3,$4,$5,$6,$7,$8)',
        [id,matter,scope,recipient,actors.transfer,'documents',`${scope}-${recipient}.pdf`,'transfer'])
      for (const actor of [...lanes,'agent','buyer','seller']) {
        const actual = (await as(actor,'select id from documents where id=$1',[id])).length > 0
        assert.equal(actual, !['buyer','seller'].includes(actor) || (scope==='client_visible' && actor===recipient), `${actor} ${scope} ${recipient}`)
      }
    }
    assert.equal((await as('buyer',"select document_security.can_read(jsonb_populate_record(null::documents,$1)) ok", [{transaction_id:matter,file_bucket:'bond-signed-applications',file_path:'signed.pdf'}]))[0].ok,true)
    assert.equal((await as('transfer',"select document_security.can_read(jsonb_populate_record(null::documents,$1)) ok", [{transaction_id:matter,file_bucket:'bond-signed-applications',file_path:'signed.pdf'}]))[0].ok,false)
    assert.equal((await as('transfer',"select document_security.can_read(jsonb_populate_record(null::documents,$1)) ok", [{transaction_id:otherMatter,visibility_scope:'internal',lane_key:'transfer',uploaded_by_user_id:actors.transfer,internal_firm_id:firms.transfer}]))[0].ok,false)
    // Same bytes linked to private and shared records must retain the tighter ACL.
    await db.query("insert into documents(transaction_id,visibility_scope,uploaded_by_user_id,file_bucket,file_path,lane_key) values($1,'professional_shared',$2,'documents',$3,'transfer')",
      [matter,actors.transfer,`transaction-${matter}/transfer-draft.docx`])
    assert.equal((await as('bond', "select count(*)::int n from storage.objects where name=$1", [`transaction-${matter}/transfer-draft.docx`]))[0].n,0)
    const acl = (await db.query(`select has_function_privilege('anon','document_security.internal_firm(uuid,text,uuid,boolean)','execute') resolver,
      has_function_privilege('authenticated','document_security.stamp_internal_firm()','execute') trigger,
      has_function_privilege('anon','document_security.can_read_internal_event(uuid,text,uuid,text,text)','execute') event_helper`)).rows[0]
    assert.deepEqual(acl,{resolver:false,trigger:false,event_helper:false})
    assert.equal((await db.query("select definition->'client' client from journey_private.task_catalog")).rows[0].client,null)
    const legacy = { transaction_id:matter,visibility_scope:'internal',lane_key:'transfer',uploaded_by_user_id:actors.transfer }
    assert.equal((await as('transfer','select document_security.can_read(jsonb_populate_record(null::documents,$1)) ok',[legacy]))[0].ok,true,'unambiguous legacy files remain available to their team')
    assert.equal((await as('replacement','select document_security.can_read(jsonb_populate_record(null::documents,$1)) ok',[legacy]))[0].ok,false,'legacy files are not exposed to another firm in the same lane')
    await db.query("update transaction_attorney_assignments set assignment_status='paused' where attorney_firm_id=$1",[firms.transfer])
    assert.equal((await as('secretary','select document_security.can_read(jsonb_populate_record(null::documents,$1)) ok',[legacy]))[0].ok,false,'removed staff stay denied on a paused matter')
    assert.equal((await as('principal','select document_security.can_read(jsonb_populate_record(null::documents,$1)) ok',[legacy]))[0].ok,true,'paused matters retain team read access')
    await db.query("update transaction_attorney_assignments set assignment_status='removed',status='removed' where attorney_firm_id=$1",[firms.transfer])
    await db.query("insert into attorney_firm_members values($1,$2,'active','attorney_conveyancer','attorney_conveyancer')",[firms.replacement,actors.transfer])
    await db.query('insert into attorney_matter_team_members values($1,$2,$3,null)',[matter,firms.replacement,actors.transfer])
    const replacementId = uuid(401)
    await db.query("insert into documents(id,transaction_id,visibility_scope,uploaded_by_user_id,lane_key,file_bucket,file_path) values($1,$2,'internal',$3,'transfer','documents','replacement.docx')",[replacementId,matter,actors.transfer])
    assert.equal((await db.query('select internal_firm_id from documents where id=$1',[replacementId])).rows[0].internal_firm_id,firms.replacement,'new records use the current firm after an appointment changes')
    assert.equal((await as('replacement','select id from documents where id=$1',[privateId('transfer')])).length,0,'new appointment cannot read the previous firm draft')
    assert.equal((await as('transfer','select id from documents where id=$1',[privateId('transfer')])).length,0,'author cannot bypass the previous firm boundary after moving teams')
    assert.equal((await as('replacement','select id from documents where id=$1',[replacementId])).length,1,'new firm can read its own newly created record')
    console.log('Attorney private access PASS: three firms, staff allocation, delegation expiry/capabilities, seven read surfaces, shared recipients and signed originals')
  } finally { await db.close() }
}
