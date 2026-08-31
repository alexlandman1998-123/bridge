-- Phase 82: governance check-ins for the controlled Rentals pilot.
-- Reviews are evidence records, never release switches or operational commands.
create table public.rental_pilot_reviews (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  idempotency_key text not null,
  recommendation text not null check (recommendation in ('continue', 'needs_attention', 'pause', 'close')),
  risk_level text not null check (risk_level in ('low', 'medium', 'high')),
  summary text not null check (length(btrim(summary)) >= 12),
  next_review_on date,
  recorded_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (organisation_id, idempotency_key)
);

create index rental_pilot_reviews_org_created_idx
  on public.rental_pilot_reviews (organisation_id, created_at desc);

alter table public.rental_pilot_reviews enable row level security;

create policy "rental_pilot_reviews_manager_read"
  on public.rental_pilot_reviews for select to authenticated
  using (public.rental_financial_manager_authorized(organisation_id));

revoke all on table public.rental_pilot_reviews from anon, authenticated;
grant select on table public.rental_pilot_reviews to authenticated;

create or replace function public.rental_record_pilot_review(
  p_org uuid,
  p_recommendation text,
  p_risk_level text,
  p_summary text,
  p_next_review_on date,
  p_idempotency_key text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing public.rental_pilot_reviews;
  v_gate jsonb;
  v_id uuid;
begin
  if auth.uid() is null
    or not public.rental_financial_manager_authorized(p_org)
    or p_recommendation not in ('continue', 'needs_attention', 'pause', 'close')
    or p_risk_level not in ('low', 'medium', 'high')
    or length(btrim(coalesce(p_summary, ''))) < 12
    or p_next_review_on is not null and p_next_review_on < current_date
    or length(btrim(coalesce(p_idempotency_key, ''))) < 8
  then
    raise exception 'Invalid pilot review';
  end if;

  perform pg_advisory_xact_lock(hashtext('rental-pilot-review:' || p_org::text));
  select * into v_existing from public.rental_pilot_reviews
  where organisation_id = p_org and idempotency_key = btrim(p_idempotency_key);
  if found then
    return jsonb_build_object('review_id', v_existing.id, 'recommendation', v_existing.recommendation, 'idempotent', true, 'action_taken', false);
  end if;

  v_gate := public.rental_get_pilot_launch_gate(p_org);
  if p_recommendation = 'continue' and not coalesce((v_gate ->> 'eligible')::boolean, false) then
    raise exception 'An ineligible pilot cannot be marked continue';
  end if;

  insert into public.rental_pilot_reviews (
    organisation_id, idempotency_key, recommendation, risk_level,
    summary, next_review_on, recorded_by
  ) values (
    p_org, btrim(p_idempotency_key), p_recommendation, p_risk_level,
    btrim(p_summary), p_next_review_on, auth.uid()
  ) returning id into v_id;

  insert into public.rental_privileged_audit_events (
    organisation_id, event_key, subject_type, subject_id, actor_id, metadata
  ) values (
    p_org, 'rental_pilot_review_recorded', 'pilot_review', v_id, auth.uid(),
    jsonb_build_object('recommendation', p_recommendation, 'risk_level', p_risk_level, 'next_review_on', p_next_review_on, 'action_taken', false)
  );

  return jsonb_build_object('review_id', v_id, 'recommendation', p_recommendation, 'idempotent', false, 'action_taken', false, 'gate', v_gate);
end;
$$;

create or replace function public.rental_get_pilot_reviews(p_org uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.rental_financial_manager_authorized(p_org) then
    raise exception 'Not authorized';
  end if;

  return jsonb_build_object(
    'gate', public.rental_get_pilot_launch_gate(p_org),
    'reviews', coalesce((
      select jsonb_agg(to_jsonb(review) order by review.created_at desc)
      from (
        select id, recommendation, risk_level, summary, next_review_on, created_at
        from public.rental_pilot_reviews
        where organisation_id = p_org
        order by created_at desc
        limit 50
      ) review
    ), '[]'::jsonb),
    'guardrail', 'Reviews record management judgement only. They cannot activate, pause, close, or otherwise change the Rentals pilot or any Sales workflow.'
  );
end;
$$;

revoke all on function public.rental_record_pilot_review(uuid, text, text, text, date, text) from public, anon;
revoke all on function public.rental_get_pilot_reviews(uuid) from public, anon;
grant execute on function public.rental_record_pilot_review(uuid, text, text, text, date, text) to authenticated;
grant execute on function public.rental_get_pilot_reviews(uuid) to authenticated;
