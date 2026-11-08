-- Preparing an invitation must not count as confirmed email delivery. Preserve
-- the existing security, revision checks, expiry and non-deferred behavior.
do $delivery_state$
declare
  definition text;
begin
  definition := pg_get_functiondef('seller_save_private.prepare_link(uuid,text,timestamp with time zone,jsonb,text,text,text,uuid)'::regprocedure);
  if position('coalesce(o.status,''not_started'')' in definition) > 0 then return; end if;
  if position('coalesce(o.status,''sent'')' in definition) = 0
     or position('deferStatusTransition' in definition) = 0 then
    raise exception 'Seller preparation definition changed; review the deferred delivery-state correction before release.';
  end if;
  execute replace(definition, 'coalesce(o.status,''sent'')', 'coalesce(o.status,''not_started'')');
end
$delivery_state$;
