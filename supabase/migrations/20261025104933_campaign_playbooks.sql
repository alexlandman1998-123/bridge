begin;

-- A playbook is an editable plan, never an executable delivery schedule.
create function public.marketing_campaign_playbook_valid(doc jsonb, channels text[])
returns boolean language plpgsql immutable security invoker set search_path='' as $$
declare item jsonb; all_ids text[]:='{}'; action_id text; r jsonb;
begin
 if doc is null then return true; end if;
 if jsonb_typeof(doc)<>'object' or octet_length(doc::text)>60000 or jsonb_typeof(doc->'version') is distinct from 'number' or doc->>'version' is distinct from '1'
   or jsonb_typeof(doc->'steps') is distinct from 'array' or jsonb_typeof(doc->'followUp') is distinct from 'array'
   or jsonb_typeof(doc->'response') is distinct from 'object' then return false; end if;
 if exists(select 1 from jsonb_object_keys(doc) k where k not in ('version','sourceRevision','response','steps','followUp')) then return false; end if;
 if jsonb_typeof(doc->'sourceRevision') is distinct from 'number' or coalesce(doc->>'sourceRevision','') !~ '^\d{1,10}$' then return false; end if;
 if (doc->>'sourceRevision')::bigint>2147483647 then return false; end if;
 if jsonb_array_length(doc->'steps') not between 1 and 12 or jsonb_array_length(doc->'followUp')>5 then return false; end if;
 r:=doc->'response';
 if exists(select 1 from jsonb_object_keys(r) k where k not in ('kind','label','value'))
   or r->>'kind' is null or r->>'kind' not in ('reply','url','email','whatsapp')
   or jsonb_typeof(r->'label') is distinct from 'string' or length(btrim(r->>'label')) not between 1 and 80
   or jsonb_typeof(r->'value') is distinct from 'string' or length(r->>'value')>2048 then return false; end if;
 if r->>'kind'='reply' and r->>'value'<>'' then return false; end if;
 if r->>'kind'='email' and (r->>'value' !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or r->>'value' ~ '[?#]') then return false; end if;
 if r->>'kind'='whatsapp' and r->>'value' !~ '^\+[1-9][0-9]{7,14}$' then return false; end if;
 if r->>'kind'='url' and (r->>'value' !~ '^https://[^[:space:]/?#@]+([/?#][^[:space:]]*)?$' or position(chr(92) in r->>'value')>0) then return false; end if;
 for item in select value from jsonb_array_elements(doc->'steps') loop
  if jsonb_typeof(item)<>'object' then return false; end if;
  if exists(select 1 from jsonb_object_keys(item) k where k not in ('id','channel','day','title','body'))
   or not coalesce(item->>'channel'=any(channels),false)
   or jsonb_typeof(item->'day') is distinct from 'number' or coalesce(item->>'day','') !~ '^\d{1,3}$'
   or jsonb_typeof(item->'title') is distinct from 'string' or length(btrim(item->>'title')) not between 1 and 240
   or jsonb_typeof(item->'body') is distinct from 'string' or length(btrim(item->>'body')) not between 1 and 12000 then return false; end if;
  if (item->>'day')::integer>365 then return false; end if;
  action_id:=item->>'id';
  if action_id is null or action_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' or action_id=any(all_ids) then return false; end if;
  all_ids:=array_append(all_ids,action_id);
 end loop;
 for item in select value from jsonb_array_elements(doc->'followUp') loop
  if jsonb_typeof(item)<>'object' then return false; end if;
  if exists(select 1 from jsonb_object_keys(item) k where k not in ('id','title','days'))
   or jsonb_typeof(item->'days') is distinct from 'number' or coalesce(item->>'days','') !~ '^\d{1,3}$'
   or jsonb_typeof(item->'title') is distinct from 'string' or length(btrim(item->>'title')) not between 1 and 180 then return false; end if;
  if (item->>'days')::integer>365 then return false; end if;
  action_id:=item->>'id';
  if action_id is null or action_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' or action_id=any(all_ids) then return false; end if;
  all_ids:=array_append(all_ids,action_id);
 end loop;
 return true;
end; $$;
revoke all on function public.marketing_campaign_playbook_valid(jsonb,text[]) from public,anon;
grant execute on function public.marketing_campaign_playbook_valid(jsonb,text[]) to authenticated,service_role;
alter table public.marketing_campaigns add column playbook jsonb;
alter table public.marketing_campaigns add constraint marketing_campaign_playbook_valid check(public.marketing_campaign_playbook_valid(playbook,planned_channels));
alter table public.marketing_campaign_templates add column playbook jsonb;
alter table public.marketing_campaign_templates add constraint marketing_template_playbook_valid check(public.marketing_campaign_playbook_valid(playbook,planned_channels));
grant insert(playbook),update(playbook) on public.marketing_campaigns,public.marketing_campaign_templates to authenticated;
-- Existing RLS, immutable ownership and optimistic revisions govern the new fields.
notify pgrst,'reload schema';
commit;
