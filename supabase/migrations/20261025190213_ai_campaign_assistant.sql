begin;
-- AI accounting is independent from delivery billing. Operator provisioning only.
create table public.ai_campaign_models (
 model text primary key, provider text not null check(provider='anthropic'),
 input_usd_per_million numeric not null check(input_usd_per_million>=0),
 output_usd_per_million numeric not null check(output_usd_per_million>=0), enabled boolean not null default false
);
insert into public.ai_campaign_models values('claude-haiku-5-5','anthropic',0.10,0.50,false);
create table public.ai_campaign_budgets (
 organisation_id uuid primary key references public.organisations(id),
 monthly_limit_usd numeric not null default 0 check(monthly_limit_usd>=0),
 model text not null references public.ai_campaign_models(model),
 writing_preferences text not null default '' check(length(writing_preferences)<=1500)
);
create table public.ai_campaign_usage (
 id uuid primary key, organisation_id uuid not null references public.organisations(id),
 user_id uuid not null references auth.users(id), campaign_id uuid not null references public.email_campaigns(id),
 feature text not null default 'email_campaign', funding_mode text not null default 'managed' check(funding_mode='managed'),
 provider text not null, model text not null, fingerprint text not null,
 reserved_usd numeric not null check(reserved_usd>=0), cost_usd numeric not null check(cost_usd>=0),
 input_tokens integer, output_tokens integer, status text not null check(status in('reserved','succeeded','failed')),
 result jsonb, created_at timestamptz not null default now(), completed_at timestamptz
);
create index ai_campaign_usage_org_month on public.ai_campaign_usage(organisation_id,created_at);
alter table public.ai_campaign_models enable row level security;
alter table public.ai_campaign_budgets enable row level security;
alter table public.ai_campaign_usage enable row level security;
revoke all on public.ai_campaign_models,public.ai_campaign_budgets,public.ai_campaign_usage from public,anon,authenticated;
grant select on public.ai_campaign_usage to authenticated;
grant all on public.ai_campaign_models,public.ai_campaign_budgets,public.ai_campaign_usage to service_role;
create policy ai_campaign_usage_read on public.ai_campaign_usage for select to authenticated using (
 public.bridge_has_organisation_membership(organisation_id) and (user_id=auth.uid() or public.email_campaign_can_send(organisation_id))
);
-- Lock before summing reservations. Uncertain failures retain the allowance.
create function public.ai_campaign_reserve(p_id uuid,p_org uuid,p_actor uuid,p_campaign uuid,p_fingerprint text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare b public.ai_campaign_budgets; m public.ai_campaign_models; u public.ai_campaign_usage; allowance numeric;
begin
 select * into b from public.ai_campaign_budgets where organisation_id=p_org for update;
 if b.organisation_id is null then raise exception 'AI is not enabled for this agency'; end if;
 select * into u from public.ai_campaign_usage where id=p_id;
 if found then
  if u.organisation_id<>p_org or u.user_id<>p_actor or u.campaign_id<>p_campaign or u.fingerprint<>p_fingerprint then raise exception 'Request conflict'; end if;
  return to_jsonb(u)||jsonb_build_object('claimed',false);
 end if;
 select * into m from public.ai_campaign_models where model=b.model and enabled;
 if m.model is null then raise exception 'AI model is unavailable'; end if;
 -- Two calls: <=24,000 input bytes plus protocol headroom, <=1,200 output tokens.
 allowance := 2*(32000*m.input_usd_per_million+1200*m.output_usd_per_million)/1000000;
 if (select coalesce(sum(cost_usd),0) from public.ai_campaign_usage where organisation_id=p_org and created_at>=date_trunc('month',now() at time zone 'UTC') at time zone 'UTC')+allowance>b.monthly_limit_usd then raise exception 'Agency AI spending limit reached'; end if;
 insert into public.ai_campaign_usage(id,organisation_id,user_id,campaign_id,provider,model,fingerprint,reserved_usd,cost_usd,status)
 values(p_id,p_org,p_actor,p_campaign,m.provider,m.model,p_fingerprint,allowance,allowance,'reserved') returning * into u;
 return to_jsonb(u)||jsonb_build_object('claimed',true,'input_rate',m.input_usd_per_million,'output_rate',m.output_usd_per_million,'writing_preferences',b.writing_preferences);
end $$;
create function public.ai_campaign_settle(p_id uuid,p_input integer,p_output integer,p_cost numeric,p_success boolean,p_result jsonb)
returns void language plpgsql security definer set search_path='' as $$
begin
 if p_input<0 or p_output<0 or p_cost<0 then raise exception 'Invalid accounting'; end if;
 update public.ai_campaign_usage set input_tokens=p_input,output_tokens=p_output,
 cost_usd=case when p_cost is null then reserved_usd else p_cost end,
 status=case when p_success then 'succeeded' else 'failed' end,result=case when p_success then p_result else null end,completed_at=now()
 where id=p_id and status='reserved';
 if not found then raise exception 'Reservation unavailable'; end if;
end $$;
revoke all on function public.ai_campaign_reserve(uuid,uuid,uuid,uuid,text),public.ai_campaign_settle(uuid,integer,integer,numeric,boolean,jsonb) from public,anon,authenticated;
grant execute on function public.ai_campaign_reserve(uuid,uuid,uuid,uuid,text),public.ai_campaign_settle(uuid,integer,integer,numeric,boolean,jsonb) to service_role;
-- Invoker joins retain listing, lead and contact RLS. Unprovable requirements excluded.
create function public.ai_campaign_match_buyers(p_listing uuid) returns jsonb
language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('contact_ids',coalesce(jsonb_agg(distinct e.id),'[]'::jsonb),'explanation','Active buyer requirements matched against saved location, budget, property type, bedrooms and bathrooms. Unverified special requirements are excluded; email consent and suppression are checked separately.')
 from public.private_listings l
 join public.lead_requirements q on q.organisation_id=l.organisation_id and q.status='active' and q.intent_type='buy' and q.consent_to_receive_matches
 join public.leads d on d.lead_id=q.lead_id and d.organisation_id=l.organisation_id
 join public.contacts c on c.contact_id=d.contact_id and c.organisation_id=l.organisation_id
 join public.email_marketing_contacts e on e.organisation_id=l.organisation_id and e.email=lower(btrim(c.email))
 where l.id=p_listing and l.is_active and l.listing_status not in ('sold','withdrawn','archived','expired')
 and l.asking_price>0 and (q.budget_min is null or l.asking_price>=q.budget_min) and (q.budget_max is null or l.asking_price<=q.budget_max)
 and (q.bedrooms_min is null or l.bedrooms>=q.bedrooms_min) and (q.bathrooms_min is null or l.bathrooms>=q.bathrooms_min)
 and (q.property_category is null or q.property_category=l.property_category)
 and (coalesce(cardinality(q.property_types),0)=0 or l.property_type=any(q.property_types))
 and (coalesce(cardinality(q.suburbs),0)=0 or l.suburb=any(q.suburbs))
 and (coalesce(cardinality(q.areas),0)=0 or l.suburb=any(q.areas) or l.city=any(q.areas))
 and (q.city is null or lower(q.city)=lower(l.city)) and (q.province is null or lower(q.province)=lower(l.province))
 and q.garages_min is null and q.parking_min is null and q.erf_size_min is null and q.floor_size_min is null
 and coalesce(cardinality(q.must_haves),0)=0 and coalesce(cardinality(q.deal_breakers),0)=0
$$;
revoke all on function public.ai_campaign_match_buyers(uuid) from public,anon;
grant execute on function public.ai_campaign_match_buyers(uuid) to authenticated;
-- Review binds saved content, sender, audience, quote and time. All existing
-- provider idempotency, recipient claims and suppression rechecks remain in use.
create function public.ai_campaign_review(p_campaign uuid,p_send_at timestamptz)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare c public.email_campaigns; sender jsonb; n integer; quote jsonb; token text; rules jsonb;
begin
 select * into c from public.email_campaigns where id=p_campaign;
 if c.id is null or c.status<>'draft' or not public.email_campaign_can_send(c.organisation_id) then raise exception 'Ask an agency principal or administrator to review and approve sending'; end if;
 select to_jsonb(i) into sender from public.email_sender_identities i where id=c.sender_identity_id and organisation_id=c.organisation_id;
 n:=public.email_campaign_preview_audience(c.organisation_id,c.subscription_type_id,c.audience_filter);
 rules:=public.email_campaign_resolve_audience_rules(c.organisation_id,c.audience_filter);
 quote:=public.email_campaign_quote_usage(c.id,n);
 token:=md5(jsonb_build_array(to_jsonb(c),sender,n,rules,quote,p_send_at)::text);
 return jsonb_build_object('token',token,'recipients',n,'quote',quote,'send_at',p_send_at,'sender',sender->>'from_email');
end $$;
create function public.ai_campaign_approve_send(p_campaign uuid,p_send_at timestamptz,p_token text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare c public.email_campaigns; r jsonb; result jsonb;
begin
 select * into c from public.email_campaigns where id=p_campaign for update;
 if p_send_at is null or p_send_at<=now() then raise exception 'Choose a future send time and review again'; end if;
 r:=public.ai_campaign_review(p_campaign,p_send_at);
 if p_token is null or p_token is distinct from r->>'token' then raise exception 'Campaign, sender, audience or charges changed. Review again'; end if;
 perform set_config('arch9.ai_campaign_approval',c.id::text||':'||md5(to_jsonb(c)::text),true);
 result:=public.email_campaign_prepare_dispatch(p_campaign,p_send_at);
 return result;
end $$;
create function public.ai_campaign_require_approval() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if old.status='draft' and new.status in ('scheduled','sending') and old.content_json ? 'ai_campaign' then
  if current_setting('arch9.ai_campaign_approval',true) is distinct from old.id::text||':'||md5(to_jsonb(old)::text) then raise exception 'Review this AI campaign version before approving sending'; end if;
 end if;
 return new;
end $$;
create trigger ai_campaign_approval before update on public.email_campaigns for each row execute function public.ai_campaign_require_approval();
revoke all on function public.ai_campaign_review(uuid,timestamptz),public.ai_campaign_approve_send(uuid,timestamptz,text),public.ai_campaign_require_approval() from public,anon;
grant execute on function public.ai_campaign_review(uuid,timestamptz),public.ai_campaign_approve_send(uuid,timestamptz,text) to authenticated;
commit;
