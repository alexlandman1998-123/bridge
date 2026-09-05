begin;

create or replace function public.bridge_bond_application_portal_draft()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_link public.bond_application_portal_access_links%rowtype;
  v_application public.bond_applications%rowtype;
begin
  select * into v_link from public.bridge_bond_application_portal_active_link();
  if v_link.id is null then raise exception 'Bond application access link is invalid, expired, or revoked.' using errcode = '42501'; end if;
  select * into v_application from public.bond_applications where id = v_link.bond_application_id;
  if not found then raise exception 'Bond application is unavailable.' using errcode = 'P0002'; end if;
  return jsonb_build_object(
    'applicationId', v_application.id,
    'revision', v_application.revision,
    'draft', coalesce(v_application.metadata -> 'phase3_portal_draft', '{}'::jsonb)
  );
end;
$$;

create or replace function public.bridge_save_bond_application_portal_draft(
  p_draft jsonb,
  p_expected_revision integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_link public.bond_application_portal_access_links%rowtype;
  v_application public.bond_applications%rowtype;
begin
  if jsonb_typeof(coalesce(p_draft, 'null'::jsonb)) <> 'object' then
    raise exception 'Bond application draft must be a JSON object.' using errcode = '22023';
  end if;
  select * into v_link from public.bridge_bond_application_portal_active_link();
  if v_link.id is null then raise exception 'Bond application access link is invalid, expired, or revoked.' using errcode = '42501'; end if;
  select * into v_application from public.bond_applications where id = v_link.bond_application_id for update;
  if not found then raise exception 'Bond application is unavailable.' using errcode = 'P0002'; end if;
  if coalesce(p_expected_revision, -1) <> v_application.revision then
    raise exception 'The application changed elsewhere. Refresh before saving.' using errcode = '40001';
  end if;
  if v_application.status in ('submitted', 'cancelled') then
    raise exception 'This application can no longer be edited.' using errcode = '23514';
  end if;

  update public.bond_applications
  set metadata = jsonb_set(coalesce(metadata, '{}'::jsonb), '{phase3_portal_draft}', p_draft, true),
      revision = revision + 1,
      updated_at = now()
  where id = v_application.id
  returning * into v_application;

  return jsonb_build_object('applicationId', v_application.id, 'revision', v_application.revision, 'updatedAt', v_application.updated_at);
end;
$$;

revoke all on function public.bridge_bond_application_portal_draft() from public;
revoke all on function public.bridge_save_bond_application_portal_draft(jsonb, integer) from public;
grant execute on function public.bridge_bond_application_portal_draft() to anon, authenticated;
grant execute on function public.bridge_save_bond_application_portal_draft(jsonb, integer) to anon, authenticated;

comment on function public.bridge_save_bond_application_portal_draft(jsonb, integer) is
  'Phase 3 token-scoped application draft save. Updates only the access-link application and rejects stale, submitted, or cancelled revisions.';

notify pgrst, 'reload schema';
commit;
