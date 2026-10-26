begin;
-- Preserve the earlier immutable contract for existing saved campaigns.
alter function public.marketing_general_builder_valid(jsonb) rename to marketing_general_builder_phase6_valid;
create function public.marketing_general_builder_valid(value jsonb)
returns boolean language plpgsql immutable security invoker set search_path='' as $$
declare family text; field text; item jsonb; details jsonb; proxy jsonb; allowed text[];
begin
 if value is null then return true; end if;
 family:=value->>'template';
 if family is null or family not in ('key-handover','review-request','referral-request') then return public.marketing_general_builder_phase6_valid(value); end if;
 if jsonb_typeof(value->'details') is distinct from 'object' or jsonb_typeof(value->'source') is distinct from 'object' or octet_length(value::text)>40000 then return false; end if;
 proxy:=jsonb_set(jsonb_set(value,'{template}','"buyers"'),'{details}',jsonb_build_object('area',value#>>'{details,area}'));
 if family='review-request' then proxy:=jsonb_set(proxy,'{source}',(value->'source')-'reviewUrl'); end if;
 if public.marketing_general_builder_phase6_valid(proxy) is distinct from true then return false; end if;
 details:=value->'details';
 allowed:=case family when 'key-handover' then array['area','transactionId','variant','publicName','imageId'] when 'review-request' then array['area','reviewUrl'] else array['area'] end;
 for field,item in select * from jsonb_each(details) loop
   if not(field=any(allowed)) or jsonb_typeof(item)<>'string' or length(item#>>'{}')>(case field when 'area' then 120 when 'transactionId' then 36 when 'variant' then 6 when 'publicName' then 120 when 'reviewUrl' then 240 else 2048 end) then return false; end if;
 end loop;
 if family='key-handover' then
   if value->'permission' is distinct from 'true'::jsonb or coalesce(details->>'transactionId','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' or coalesce(details->>'variant','') not in ('buyer','seller') then return false; end if;
 elsif family='review-request' then
   if coalesce(details->>'reviewUrl','') !~ '^https://[^/@?#[:space:]]+([/?#][^[:space:]]*)?$' then return false; end if;
   if value->'source' ? 'reviewUrl' and (jsonb_typeof(value#>'{source,reviewUrl}')<>'string' or length(value#>>'{source,reviewUrl}')>240 or (value#>>'{source,reviewUrl}'<>'' and value#>>'{source,reviewUrl}' !~ '^https://[^/@?#[:space:]]+([/?#][^[:space:]]*)?$')) then return false; end if;
 end if;
 return true;
end $$;
revoke all on function public.marketing_general_builder_valid(jsonb) from public,anon;
grant execute on function public.marketing_general_builder_valid(jsonb) to authenticated,service_role;
alter table public.marketing_campaigns drop constraint marketing_general_builder_valid;
alter table public.marketing_campaigns add constraint marketing_general_builder_valid check (
 public.marketing_general_builder_valid(campaign_builder) and (campaign_builder is null or (
 listing_builder is null and status='draft'
 and (campaign_builder->>'template'<>'review-request' or (planned_channels <@ array['email','whatsapp']::text[] and planned_channels @> array['email','whatsapp']::text[] and not(channel_content ? 'social')))
 and goal=case
 when campaign_builder->>'template' in ('sellers','thinking-of-selling','buyer-demand') then 'seller_leads'
 when campaign_builder->>'template' in ('buyers','first-time-buyer') then 'buyer_leads'
 when campaign_builder->>'template' in ('key-handover','review-request','referral-request') then 'reengage' else 'custom' end))
);
-- Read only projection: RLS still applies and no client/address/financial fields leave the database.
create function public.marketing_handover_choices(p_organisation_id uuid,p_offset integer default 0)
returns table(id uuid,reference text,area text,listing_id uuid)
language sql stable security invoker set search_path='' as $$
 select t.id, coalesce(nullif(j->>'transaction_reference',''),'Completed transaction'),
 concat_ws(', ',nullif(j->>'suburb',''),nullif(j->>'city','')), nullif(j->>'listing_id','')::uuid
 from public.transactions t cross join lateral (select to_jsonb(t) j) projection
 where t.organisation_id=p_organisation_id and (select auth.uid()) is not null
 and public.bridge_is_active_member(p_organisation_id)
 and (public.email_campaign_can_send(p_organisation_id) or (select auth.uid())::text in (j->>'assigned_agent_id',j->>'assigned_user_id',j->>'owner_user_id'))
 and (lower(j->>'lifecycle_state')='completed' or upper(j->>'current_main_stage')='COMPLETE' or lower(j->>'stage')='completed')
 and coalesce(j->>'deleted_at','')='' and coalesce(j->>'cancelled_at','')=''
 and coalesce(lower(j->>'lifecycle_state'),'') not in ('cancelled','deleted','archived')
 and coalesce(lower(j->>'stage'),'') not in ('cancelled','deleted','archived')
 order by t.id limit 200 offset greatest(p_offset,0)
$$;
revoke all on function public.marketing_handover_choices(uuid,integer) from public,anon;
grant execute on function public.marketing_handover_choices(uuid,integer) to authenticated;
create function public.marketing_relationship_builder_scope()
returns trigger language plpgsql security invoker set search_path='' as $$
declare found_transaction boolean;
begin
 if new.campaign_builder->>'template'='key-handover' then
   -- Reuse the scoped projection, with a direct ID filter and no pagination truncation.
   select exists(select 1 from public.transactions t where t.id=(new.campaign_builder#>>'{details,transactionId}')::uuid
     and t.organisation_id=new.organisation_id
     and (public.email_campaign_can_send(new.organisation_id) or (select auth.uid())::text in (to_jsonb(t)->>'assigned_agent_id',to_jsonb(t)->>'assigned_user_id',to_jsonb(t)->>'owner_user_id'))
     and (lower(to_jsonb(t)->>'lifecycle_state')='completed' or upper(to_jsonb(t)->>'current_main_stage')='COMPLETE' or lower(to_jsonb(t)->>'stage')='completed')
     and coalesce(to_jsonb(t)->>'deleted_at','')='' and coalesce(to_jsonb(t)->>'cancelled_at','')=''
     and coalesce(lower(to_jsonb(t)->>'lifecycle_state'),'') not in ('cancelled','deleted','archived')
     and coalesce(lower(to_jsonb(t)->>'stage'),'') not in ('cancelled','deleted','archived')) into found_transaction;
   if not found_transaction then raise exception 'Choose a permitted completed transaction.' using errcode='42501'; end if;
 end if;
 return new;
end $$;
revoke all on function public.marketing_relationship_builder_scope() from public,anon;
grant execute on function public.marketing_relationship_builder_scope() to authenticated,service_role;
create trigger marketing_relationship_builder_scope before insert or update on public.marketing_campaigns for each row execute function public.marketing_relationship_builder_scope();
notify pgrst,'reload schema';
commit;
