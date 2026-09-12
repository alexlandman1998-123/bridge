begin;

-- A missing heartbeat is a failed release condition, not an unknown release
-- condition. Keep the snapshot boolean so release automation can safely gate
-- on it before the first live dispatcher run.
do $$
declare
  v_definition text;
  v_expected text := 'v_last_live_at >= now() - interval ''2 hours''';
  v_replacement text := 'coalesce(v_last_live_at >= now() - interval ''2 hours'', false)';
begin
  select pg_get_functiondef(
    'public.bridge_seller_document_release_snapshot_p1_10(uuid,uuid)'::regprocedure
  ) into v_definition;

  if position(v_expected in v_definition) = 0 then
    raise exception 'Expected seller-document heartbeat release condition was not found.';
  end if;

  execute replace(v_definition, v_expected, v_replacement);
end;
$$;

commit;
