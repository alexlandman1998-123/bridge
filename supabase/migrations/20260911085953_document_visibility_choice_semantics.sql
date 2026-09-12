-- Legacy shared rows with an explicit client flag retain that audience.
-- shared + false means professional-only, matching the upload dropdown.
do $patch$
declare definition text;
begin
  select pg_get_functiondef('document_security.can_read(public.documents)'::regprocedure) into definition;
  if position('scope=''shared'' and not coalesce(d.is_client_visible,false)' in definition)=0 then
    if position('if scope in (''professional_shared'',''shared_role_players'') then return false; end if;' in definition)=0 then
      raise exception 'Document audience predicate changed; review patch';
    end if;
    definition := replace(definition,
      'if scope in (''professional_shared'',''shared_role_players'') then return false; end if;',
      'if scope in (''professional_shared'',''shared_role_players'') or (scope=''shared'' and not coalesce(d.is_client_visible,false)) then return false; end if;');
    execute definition;
  end if;
end;
$patch$;
