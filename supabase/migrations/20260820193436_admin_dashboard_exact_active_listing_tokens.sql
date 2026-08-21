begin;

create or replace function public.arch9_admin_json_token_in(
  p_row jsonb,
  p_keys text[],
  p_tokens text[]
)
returns boolean
language sql
immutable
set search_path = public
as $$
  select exists (
    select 1
    from unnest(p_keys) as keys(key)
    where public.arch9_admin_normalize_token(p_row ->> key) = any(p_tokens)
  );
$$;

do $$
declare
  v_definition text;
  v_previous text;
  v_next text;
begin
  select pg_get_functiondef(to_regprocedure('public.arch9_admin_dashboard_snapshot(timestamptz,timestamptz)'))
  into v_definition;

  if v_definition is null then
    raise exception 'public.arch9_admin_dashboard_snapshot(timestamptz, timestamptz) does not exist';
  end if;

  v_previous := E'    v_listing_active :=\n      v_status ~ ''(mandate_signed|active|listing_active|in_progress|live|published|finalised|finalized|fully_signed|signed|signed_uploaded|uploaded_signed|under_offer|transaction_created|active_market|public)''\n      or public.arch9_admin_json_bool(v_row, array[''is_active''], false)\n      or v_listing_public;';

  v_next := E'    v_listing_active :=\n      public.arch9_admin_json_token_in(v_row, array[\n        ''listing_status'',\n        ''status'',\n        ''publication_status'',\n        ''marketing_status'',\n        ''listing_visibility'',\n        ''bridge_listing_status'',\n        ''property24_status'',\n        ''private_property_status'',\n        ''mandate_status'',\n        ''listing_source'',\n        ''stock_source''\n      ], array[\n        ''mandate_signed'',\n        ''active'',\n        ''listing_active'',\n        ''in_progress'',\n        ''live'',\n        ''published'',\n        ''finalised'',\n        ''finalized'',\n        ''fully_signed'',\n        ''signed'',\n        ''signed_uploaded'',\n        ''uploaded_signed'',\n        ''signed_external_pending_upload'',\n        ''under_offer'',\n        ''transaction_created'',\n        ''active_market'',\n        ''public'',\n        ''current_listing'',\n        ''current_listing_import'',\n        ''bulk_current_listing'',\n        ''imported_current_listing'',\n        ''imported_existing_listing''\n      ])\n      or public.arch9_admin_json_bool(v_row, array[''is_active''], false)\n      or v_listing_public;';

  if position('public.arch9_admin_json_token_in(v_row, array[' in v_definition) > 0 then
    raise notice 'arch9_admin_dashboard_snapshot already uses exact active listing tokens';
  elsif position(v_previous in v_definition) > 0 then
    v_definition := replace(v_definition, v_previous, v_next);
    execute v_definition;
  else
    raise exception 'Unable to patch admin dashboard function: active listing block not found';
  end if;
end $$;

alter function public.arch9_admin_dashboard_snapshot(timestamptz, timestamptz)
  security definer;

revoke all on function public.arch9_admin_dashboard_snapshot(timestamptz, timestamptz) from public, anon;
grant execute on function public.arch9_admin_json_token_in(jsonb, text[], text[]) to authenticated;
grant execute on function public.arch9_admin_dashboard_snapshot(timestamptz, timestamptz) to authenticated;

comment on function public.arch9_admin_dashboard_snapshot(timestamptz, timestamptz)
  is 'Admin portal dashboard contract with guarded platform-wide counts from Arch9 database tables only; active listings use exact status tokens so not_published is not counted as published.';

notify pgrst, 'reload schema';

commit;
