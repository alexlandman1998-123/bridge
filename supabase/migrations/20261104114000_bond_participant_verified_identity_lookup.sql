-- Policy helpers run as the caller. Read verified JWT identity, not auth.users,
-- and qualify the matter argument so it cannot resolve to the row's own column.
create or replace function public.bridge_has_bond_transaction_participant_access(transaction_id uuid)
returns boolean language sql stable set search_path='' as $function$
 select auth.uid() is not null and exists(
   select 1 from public.transaction_participants tp
   where tp.transaction_id=$1 and coalesce(tp.status,'active')='active' and tp.removed_at is null
     and (tp.user_id=auth.uid() or (nullif(auth.jwt()->>'email','') is not null
       and lower(coalesce(tp.participant_email,''))=lower(auth.jwt()->>'email')))
 );
$function$;
create or replace function public.bridge_has_bond_transaction_role_player_access(transaction_id uuid)
returns boolean language sql stable set search_path='' as $function$
 select auth.uid() is not null and exists(
   select 1 from public.transaction_role_players trp
   where trp.transaction_id=$1 and lower(coalesce(trp.status,'selected')) in ('selected','active','accepted','assigned','current')
     and lower(coalesce(trp.assignment_status,'active')) not in ('inactive','removed','revoked','cancelled')
     and (trp.user_id=auth.uid() or (nullif(auth.jwt()->>'email','') is not null
       and lower(coalesce(trp.email_address,''))=lower(auth.jwt()->>'email')))
     and (lower(coalesce(trp.role_type,'')) in ('bond_originator','consultant')
       or lower(coalesce(trp.legal_role,'')) in ('bond_originator','consultant'))
 );
$function$;
