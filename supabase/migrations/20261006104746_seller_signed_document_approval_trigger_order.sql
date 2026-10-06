-- Link signed seller files before they are written, but complete requirements
-- only after approved evidence is visible to the existing assurance trigger.
-- The former BEFORE trigger attempted completion during the review UPDATE and
-- the listing-scoped evidence guard correctly rejected the still-uploaded row.
-- Preserve all review, version, evidence and authorization guards. No backfill.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '15s';

do $correction$
declare
  v_oid oid := to_regprocedure('public.bridge_link_signed_seller_document_requirement()');
  v_body text;
  v_definition text;
begin
  if v_oid is null then
    raise exception 'The reviewed signed seller document link function is missing.';
  end if;
  if not exists (
    select 1 from pg_catalog.pg_trigger
    where tgrelid = 'public.private_listing_documents'::regclass
      and tgname = 'trg_sync_private_listing_requirement_assurance_p0_4'
      and tgfoid = to_regprocedure('public.bridge_sync_private_listing_requirement_assurance_p0_4()')
      and tgenabled in ('O', 'A')
      and (tgtype::integer & 1) = 1
      and (tgtype::integer & 2) = 0
      and (tgtype::integer & 4) = 4
      and (tgtype::integer & 16) = 16
  ) then
    raise exception 'The signed seller document correction requires the active AFTER assurance trigger.';
  end if;

  select prosrc into v_body from pg_catalog.pg_proc where oid = v_oid;
  if pg_catalog.md5(v_body) = '52d9933aaf7021ae0177c865ffcf1ae5' then
    return;
  end if;
  if pg_catalog.md5(v_body) <> '022524ff1db1e3933a98597619d3da4c' then
    raise exception 'The signed seller document link function changed since review.';
  end if;

  v_definition := pg_catalog.pg_get_functiondef(v_oid);
  -- Newly created slots remain pending approval while this BEFORE trigger runs.
  -- A completed incoming file also avoids issuing a spurious missing-file request.
  v_definition := replace(v_definition,
    $old_status$case when lower(coalesce(new.status, '')) in ('completed', 'approved') then 'completed' else 'required' end$old_status$,
    $new_status$case when lower(coalesce(new.status, '')) in ('completed', 'approved') then 'uploaded' else 'required' end$new_status$
  );
  -- Existing requirement status belongs to the AFTER evidence projection.
  v_definition := replace(v_definition,
$completion_update$    status = case
      when lower(coalesce(new.status, '')) in ('completed', 'approved') then 'completed'
      else requirement.status
    end,
$completion_update$, '');
  execute v_definition;

  select prosrc into v_body from pg_catalog.pg_proc where oid = v_oid;
  if pg_catalog.md5(v_body) <> '52d9933aaf7021ae0177c865ffcf1ae5' then
    raise exception 'The signed seller document correction did not match its reviewed body.';
  end if;
end;
$correction$;

commit;
