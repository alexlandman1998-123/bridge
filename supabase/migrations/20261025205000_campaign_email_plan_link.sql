begin;

-- Join quick AI emails to the same campaign workspace used by Studio. The email
-- row lock makes an interrupted or simultaneous first link retry-safe. Invoker
-- privileges retain the caller's channel, plan, listing and membership policies.
create function public.marketing_campaign_ensure_email_plan(p_email uuid, p_expected_updated_at timestamptz)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  e public.email_campaigns;
  c public.marketing_campaigns;
  a public.marketing_campaign_activities;
  ref jsonb;
  objective text;
begin
  if auth.uid() is null then raise exception 'Sign in to link your campaign.' using errcode='42501'; end if;
  select * into e from public.email_campaigns where id=p_email for update;
  if e.id is null or not public.bridge_is_active_member(e.organisation_id)
    or (e.created_by is distinct from auth.uid() and not public.email_campaign_can_send(e.organisation_id)) then
    raise exception 'This email is unavailable to your account.' using errcode='42501';
  end if;
  if e.status<>'draft' or p_expected_updated_at is null or e.updated_at is distinct from p_expected_updated_at then
    raise exception 'This email changed. Reload it before linking.' using errcode='40001';
  end if;
  select * into a from public.marketing_campaign_activities where email_campaign_id=e.id;
  if a.id is not null then
    select * into c from public.marketing_campaigns where id=a.campaign_id and organisation_id=e.organisation_id;
    if c.id is null then raise exception 'The linked campaign is unavailable.' using errcode='42501'; end if;
    if e.content_json ? 'arch9_campaign' and e.content_json->'arch9_campaign'->>'id' is distinct from c.id::text then
      raise exception 'The saved email reference differs from its campaign link. Reopen it for review.' using errcode='22023';
    end if;
  elsif e.content_json ? 'arch9_campaign' then
    -- A prepared channel draft already names its parent. Never make another one.
    select * into c from public.marketing_campaigns
      where id=(e.content_json->'arch9_campaign'->>'id')::uuid and organisation_id=e.organisation_id for update;
    if c.id is null or (c.created_by is distinct from auth.uid() and not public.email_campaign_can_send(c.organisation_id))
      or not ('email'=any(c.planned_channels)) then
      raise exception 'The referenced campaign is unavailable or cannot be edited.' using errcode='42501';
    end if;
  else
    if jsonb_typeof(e.content_json->'ai_campaign') is distinct from 'object'
      or coalesce(e.content_json->'ai_campaign'->>'objective','') not in ('new_listing','price_reduction','show_day') then
      raise exception 'Only a supported property email can create its own campaign.' using errcode='22023';
    end if;
    if not exists(select 1 from public.private_listings l
      where l.id=(e.content_json->'ai_campaign'->>'listing_id')::uuid and l.organisation_id=e.organisation_id) then
      raise exception 'The source listing is unavailable.' using errcode='42501';
    end if;
    objective:=case e.content_json->'ai_campaign'->>'objective'
      when 'price_reduction' then 'Promote a reviewed property price change'
      when 'show_day' then 'Invite buyers to a confirmed show day'
      else 'Introduce a property to eligible buyers' end;
    -- Distinct table IDs may safely share a UUID. Refuse any unrelated collision.
    if exists(select 1 from public.marketing_campaigns where id=e.id) then
      raise exception 'This campaign identity is already in use. Reopen the saved campaign.' using errcode='23505';
    end if;
    insert into public.marketing_campaigns(id,organisation_id,name,goal,objective,audience,planned_channels)
      values(e.id,e.organisation_id,left(e.name,120),'promote_listing',objective,
        'Review the eligible audience in the linked email draft.',array['email']) returning * into c;
  end if;
  if a.id is null then
    insert into public.marketing_campaign_activities(organisation_id,campaign_id,channel,email_campaign_id)
      values(e.organisation_id,c.id,'email',e.id);
  end if;
  ref:=coalesce(e.content_json->'arch9_campaign',jsonb_build_object('revision',c.revision))||jsonb_build_object('id',c.id);
  if e.content_json->'arch9_campaign' is distinct from ref then
    update public.email_campaigns set content_json=jsonb_set(content_json,'{arch9_campaign}',ref),updated_by=auth.uid()
      where id=e.id returning * into e;
  end if;
  return jsonb_build_object('campaign_id',c.id,'revision',c.revision,'email_updated_at',e.updated_at,'reference',ref);
end $$;
revoke all on function public.marketing_campaign_ensure_email_plan(uuid,timestamptz) from public,anon;
grant execute on function public.marketing_campaign_ensure_email_plan(uuid,timestamptz) to authenticated;
notify pgrst,'reload schema';
commit;
