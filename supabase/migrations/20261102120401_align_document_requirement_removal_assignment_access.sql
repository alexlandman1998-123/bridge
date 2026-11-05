begin;

-- The lane permission helper accepts an assigned firm's pending and active
-- matters. The removal guard's duplicate membership check must accept the same
-- assignment states or authorised firm principals are rejected before work is
-- activated.
do $patch$
declare
  body text;
  marker text := E'              where a.transaction_id=r.transaction_id and coalesce(a.assignment_status,a.status)=''active''\n              and coalesce(m.professional_role,m.role) in (''firm_admin'',''director_partner'',''attorney_conveyancer'',''transfer_attorney'',''bond_attorney'',''cancellation_attorney'')) then';
  replacement text := E'              where a.transaction_id=r.transaction_id and coalesce(a.assignment_status,a.status) in (''pending'',''active'')\n              and coalesce(m.professional_role,m.role) in (''firm_admin'',''director_partner'',''attorney_conveyancer'',''transfer_attorney'',''bond_attorney'',''cancellation_attorney'')) then';
begin
  select pg_get_functiondef(
    'document_requirement_private.execute_command(uuid,text,text,uuid,uuid,bigint,jsonb)'::regprocedure
  ) into body;
  if position(marker in body)=0 then
    raise exception 'Unexpected document requirement removal guard; review the function before applying this migration.';
  end if;
  execute replace(body,marker,replacement);
end;
$patch$;

commit;
